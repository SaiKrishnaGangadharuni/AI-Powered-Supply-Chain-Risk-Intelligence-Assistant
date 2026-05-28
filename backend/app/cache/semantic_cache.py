"""Semantic cache — embed query, cosine match vs cached entries, return if >= threshold."""
from __future__ import annotations

import time
from collections import OrderedDict
from threading import Lock
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from app.core.config import settings
from app.core.logging import logger
from app.retrieval.embeddings import embed_query


def _cosine(a: List[float], b: List[float]) -> float:
    va = np.asarray(a, dtype=np.float32)
    vb = np.asarray(b, dtype=np.float32)
    na = np.linalg.norm(va)
    nb = np.linalg.norm(vb)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(va, vb) / (na * nb))


class SemanticCache:
    """LRU-ish semantic cache. Keys are embeddings of past queries."""

    def __init__(
        self,
        threshold: Optional[float] = None,
        max_items: Optional[int] = None,
    ) -> None:
        self.threshold = threshold or settings.semantic_cache_threshold
        self.max_items = max_items or settings.semantic_cache_max_items
        self._store: "OrderedDict[str, Tuple[List[float], Dict[str, Any], float]]" = (
            OrderedDict()
        )
        self._lock = Lock()

    def lookup(self, query: str) -> Optional[Dict[str, Any]]:
        if not self._store:
            return None
        q_emb = embed_query(query)
        with self._lock:
            best_key: Optional[str] = None
            best_sim = 0.0
            for k, (emb, _payload, _ts) in self._store.items():
                sim = _cosine(q_emb, emb)
                if sim > best_sim:
                    best_sim = sim
                    best_key = k
            if best_key and best_sim >= self.threshold:
                emb, payload, ts = self._store.pop(best_key)
                self._store[best_key] = (emb, payload, ts)  # move-to-end
                logger.info(f"[semantic-cache HIT] sim={best_sim:.3f} for: {query[:60]!r}")
                return {**payload, "cache_hit": True, "cache_similarity": best_sim}
        return None

    def store(self, query: str, payload: Dict[str, Any]) -> None:
        emb = embed_query(query)
        with self._lock:
            self._store[query] = (emb, payload, time.time())
            while len(self._store) > self.max_items:
                self._store.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    def size(self) -> int:
        return len(self._store)


# module-level singleton
semantic_cache = SemanticCache()
