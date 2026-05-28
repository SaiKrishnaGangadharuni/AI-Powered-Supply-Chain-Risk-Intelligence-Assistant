"""Cross-encoder reranker (cross-encoder/ms-marco-MiniLM-L-6-v2, free)."""
from __future__ import annotations

from threading import Lock
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.core.logging import logger

_model = None
_lock = Lock()


def _get_model():
    global _model
    if _model is not None:
        return _model
    with _lock:
        if _model is None:
            from sentence_transformers import CrossEncoder

            logger.info(f"Loading reranker model: {settings.reranker_model}")
            _model = CrossEncoder(settings.reranker_model)
    return _model


def rerank(
    query: str,
    candidates: List[Dict[str, Any]],
    top_k: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Score (query, doc) pairs with the cross-encoder; return top-k sorted desc.

    Each candidate dict must have a `text` key. We add a `rerank_score` and
    preserve the original `score` from upstream retrieval.
    """
    if not candidates:
        return []
    model = _get_model()
    pairs = [(query, c.get("text", "")) for c in candidates]
    scores = model.predict(pairs, show_progress_bar=False)
    for c, s in zip(candidates, scores):
        c["rerank_score"] = float(s)
    candidates.sort(key=lambda c: c.get("rerank_score", 0.0), reverse=True)
    k = top_k or settings.rerank_top_k
    return candidates[:k]
