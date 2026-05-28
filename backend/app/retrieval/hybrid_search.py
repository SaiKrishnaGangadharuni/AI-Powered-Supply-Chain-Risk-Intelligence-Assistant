"""Hybrid search: Dense (Chroma) + Sparse (BM25) → RRF fusion → cross-encoder rerank.

Also implements a minimal CRAG-style retry: if max rerank score < threshold,
ask the LLM to reformulate the query and retry once.
"""
from __future__ import annotations

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


# ---------------- module-level singletons (lazy) ----------------
_vs: Optional[VectorStore] = None
_bm25: Optional[BM25Index] = None
_lock = Lock()


def _get_stores() -> tuple[VectorStore, BM25Index]:
    global _vs, _bm25
    if _vs is not None and _bm25 is not None:
        return _vs, _bm25
    with _lock:
        if _vs is None:
            _vs = VectorStore()
        if _bm25 is None:
            _bm25 = BM25Index()
    return _vs, _bm25


# ---------------- RRF ----------------
def reciprocal_rank_fusion(
    rankings: List[List[Dict[str, Any]]],
    k: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Combine multiple rankings via Reciprocal Rank Fusion.

    Each ranking is a list of dicts with at least an `id` key.
    Returns a fused list sorted by RRF score desc.
    """
    rrf_k = k or settings.rrf_k
    scores: Dict[str, float] = {}
    canonical: Dict[str, Dict[str, Any]] = {}

    for ranking in rankings:
        for rank_idx, item in enumerate(ranking):
            doc_id = item["id"]
            scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (rrf_k + rank_idx + 1)
            if doc_id not in canonical:
                canonical[doc_id] = item

    fused: List[Dict[str, Any]] = []
    for doc_id, s in sorted(scores.items(), key=lambda kv: kv[1], reverse=True):
        item = dict(canonical[doc_id])
        item["rrf_score"] = s
        fused.append(item)
    return fused


# ---------------- hybrid search ----------------
def hybrid_search(
    query: str,
    where: Optional[Dict[str, Any]] = None,
    dense_top_k: Optional[int] = None,
    sparse_top_k: Optional[int] = None,
    rerank_top_k: Optional[int] = None,
    enable_crag: bool = True,
) -> Dict[str, Any]:
    """Run hybrid retrieval. Returns dict with `docs`, `max_score`, `reformulated_from`."""
    vs, bm25 = _get_stores()

    def _retrieve_once(q: str) -> List[Dict[str, Any]]:
        q_emb = embed_query(q)
        dense_hits = vs.query(
            q_emb,
            top_k=dense_top_k or settings.dense_top_k,
            where=where,
        )
        sparse_hits = bm25.search(q, top_k=sparse_top_k or settings.sparse_top_k)
        fused = reciprocal_rank_fusion([dense_hits, sparse_hits])
        reranked = rerank(q, fused, top_k=rerank_top_k or settings.rerank_top_k)
        return reranked

    docs = _retrieve_once(query)
    max_score = max((d.get("rerank_score", 0.0) for d in docs), default=0.0)
    reformulated_from: Optional[str] = None

    if enable_crag and max_score < settings.crag_relevance_threshold:
        try:
            new_q = _reformulate_query(query)
            if new_q and new_q.lower() != query.lower():
                logger.info(f"CRAG retry: '{query}' -> '{new_q}' (score={max_score:.3f})")
                event_bus.emit(
                    "crag_retry",
                    original_query=query, reformulated=new_q,
                    prev_max_score=max_score, threshold=settings.crag_relevance_threshold,
                )
                docs2 = _retrieve_once(new_q)
                max_score2 = max((d.get("rerank_score", 0.0) for d in docs2), default=0.0)
                if max_score2 > max_score:
                    docs = docs2
                    max_score = max_score2
                    reformulated_from = query
        except Exception as e:  # noqa: BLE001
            logger.warning(f"CRAG reformulate failed: {e!r}")

    return {
        "docs": docs,
        "max_score": max_score,
        "reformulated_from": reformulated_from,
    }


# ---------------- CRAG query reformulation ----------------
_REFORMULATE_SYSTEM = (
    "You rewrite supply-chain queries to improve retrieval. "
    "Output ONE alternative query that uses different but related terminology "
    "(synonyms, domain jargon, broader/narrower phrasing). "
    "Return only the rewritten query — no preamble, no quotes."
)


def _reformulate_query(query: str) -> str:
    msgs = [
        SystemMessage(content=_REFORMULATE_SYSTEM),
        HumanMessage(content=f"Original: {query}\nRewritten:"),
    ]
    resp = router.invoke(TaskType.ROUTING, msgs)
    text = getattr(resp, "content", "") or ""
    return text.strip().strip('"').strip("'")
