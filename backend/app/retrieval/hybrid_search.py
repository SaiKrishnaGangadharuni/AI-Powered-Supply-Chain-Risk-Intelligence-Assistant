"""Hybrid search: Dense (Chroma) ∥ Sparse (BM25) → RRF fusion → rerank → CRAG retry."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from threading import Lock
from typing import Any, Dict, List, Optional

from langchain_core.messages import HumanMessage, SystemMessage

from app.core.config import settings
from app.core.llm_router import TaskType, router
from app.core.logging import logger
from app.retrieval.bm25_index import BM25Index
from app.retrieval.embeddings import embed_query
from app.retrieval.reranker import rerank
from app.retrieval.vector_store import VectorStore
from app.services.event_bus import event_bus

# ── Singletons ────────────────────────────────────────────────
_vs:   Optional[VectorStore] = None
_bm25: Optional[BM25Index]   = None
_lock = Lock()


def _get_stores() -> tuple[VectorStore, BM25Index]:
    global _vs, _bm25
    if _vs is not None and _bm25 is not None:
        return _vs, _bm25
    with _lock:
        if _vs   is None: _vs   = VectorStore()
        if _bm25 is None: _bm25 = BM25Index()
    return _vs, _bm25


# ── RRF ───────────────────────────────────────────────────────
def reciprocal_rank_fusion(
    rankings: List[List[Dict[str, Any]]],
    k: Optional[int] = None,
) -> List[Dict[str, Any]]:
    rrf_k = k or settings.rrf_k
    scores:    Dict[str, float]         = {}
    canonical: Dict[str, Dict[str, Any]] = {}
    for ranking in rankings:
        for rank_idx, item in enumerate(ranking):
            doc_id = item["id"]
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (rrf_k + rank_idx + 1)
            if doc_id not in canonical:
                canonical[doc_id] = item
    fused = []
    for doc_id, s in sorted(scores.items(), key=lambda kv: kv[1], reverse=True):
        item = dict(canonical[doc_id])
        item["rrf_score"] = s
        fused.append(item)
    return fused


# ── Parallel dense + sparse retrieval ────────────────────────
def _retrieve_once(
    q: str,
    where: Optional[Dict[str, Any]] = None,
    dense_top_k: int = 0,
    sparse_top_k: int = 0,
    rerank_top_k: int = 0,
) -> List[Dict[str, Any]]:
    """Run ChromaDB and BM25 in parallel, then fuse + rerank."""
    vs, bm25 = _get_stores()
    dtk = dense_top_k  or settings.dense_top_k
    stk = sparse_top_k or settings.sparse_top_k
    rtk = rerank_top_k or settings.rerank_top_k

    # Embed query once (needed by dense retrieval)
    q_emb = embed_query(q)

    # ── Launch both retrievals concurrently ──
    dense_hits:  List[Dict[str, Any]] = []
    sparse_hits: List[Dict[str, Any]] = []

    with ThreadPoolExecutor(max_workers=2) as pool:
        fut_dense  = pool.submit(vs.query,   q_emb, dtk, where)
        fut_sparse = pool.submit(bm25.search, q,    stk)
        for fut in as_completed([fut_dense, fut_sparse]):
            if fut is fut_dense:
                dense_hits  = fut.result()
            else:
                sparse_hits = fut.result()

    fused    = reciprocal_rank_fusion([dense_hits, sparse_hits])
    reranked = rerank(q, fused, top_k=rtk)
    return reranked


# ── Main hybrid search ────────────────────────────────────────
def hybrid_search(
    query: str,
    where: Optional[Dict[str, Any]] = None,
    dense_top_k: Optional[int] = None,
    sparse_top_k: Optional[int] = None,
    rerank_top_k: Optional[int] = None,
    enable_crag: bool = True,
) -> Dict[str, Any]:
    """Returns {docs, max_score, reformulated_from}."""
    kw = dict(where=where, dense_top_k=dense_top_k or 0,
              sparse_top_k=sparse_top_k or 0, rerank_top_k=rerank_top_k or 0)

    docs      = _retrieve_once(query, **kw)
    max_score = max((d.get("rerank_score", 0.0) for d in docs), default=0.0)
    reformulated_from: Optional[str] = None

    if enable_crag and max_score < settings.crag_relevance_threshold:
        try:
            new_q = _reformulate_query(query)
            if new_q and new_q.lower() != query.lower():
                logger.info(f"CRAG retry: '{query}' → '{new_q}' (score={max_score:.3f})")
                event_bus.emit("crag_retry",
                    original_query=query, reformulated=new_q,
                    prev_max_score=max_score, threshold=settings.crag_relevance_threshold,
                )
                docs2      = _retrieve_once(new_q, **kw)
                max_score2 = max((d.get("rerank_score", 0.0) for d in docs2), default=0.0)
                if max_score2 > max_score:
                    docs, max_score, reformulated_from = docs2, max_score2, query
        except Exception as e:
            logger.warning(f"CRAG reformulate failed: {e!r}")

    return {"docs": docs, "max_score": max_score, "reformulated_from": reformulated_from}


# ── CRAG query reformulation ──────────────────────────────────
_REFORMULATE_SYSTEM = (
    "You rewrite supply-chain queries to improve retrieval. "
    "Output ONE alternative query using different but related terminology. "
    "Return only the rewritten query — no preamble, no quotes."
)

def _reformulate_query(query: str) -> str:
    msgs = [
        SystemMessage(content=_REFORMULATE_SYSTEM),
        HumanMessage(content=f"Original: {query}\nRewritten:"),
    ]
    resp = router.invoke(TaskType.ROUTING, msgs)
    return (getattr(resp, "content", "") or "").strip().strip('"').strip("'")
