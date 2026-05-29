"""Cosine similarity reranker (replaces cross-encoder; no torch required)."""
from __future__ import annotations

from typing import Any, Dict, List, Optional

import numpy as np

from app.core.config import settings
from app.retrieval.embeddings import embed_query


def _cosine(a: List[float], b: List[float]) -> float:
    va, vb = np.asarray(a, dtype=np.float32), np.asarray(b, dtype=np.float32)
    na, nb = np.linalg.norm(va), np.linalg.norm(vb)
    return float(np.dot(va, vb) / (na * nb)) if na > 0 and nb > 0 else 0.0


def rerank(
    query: str,
    candidates: List[Dict[str, Any]],
    top_k: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """
    Rerank candidates by cosine similarity between query embedding and
    pre-computed document embeddings (from 'embedding' key) or re-embed
    document text on the fly.

    Adds 'rerank_score' to each candidate; preserves original 'score'.
    """
    if not candidates:
        return []

    q_emb = embed_query(query)
    for c in candidates:
        if "embedding" in c and c["embedding"]:
            c["rerank_score"] = _cosine(q_emb, c["embedding"])
        else:
            # Re-embed doc text if no cached embedding
            from app.retrieval.embeddings import embed_texts
            doc_emb = embed_texts([c.get("text", "")])[0]
            c["rerank_score"] = _cosine(q_emb, doc_emb)

    candidates.sort(key=lambda c: c.get("rerank_score", 0.0), reverse=True)
    k = top_k or settings.rerank_top_k
    return candidates[:k]
