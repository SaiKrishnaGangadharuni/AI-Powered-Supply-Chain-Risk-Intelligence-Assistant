"""BM25 sparse index with disk persistence (pickled).

Built over the same incident documents as the dense vector store, so hits
can be fused via RRF in `hybrid_search.py`.
"""
from __future__ import annotations

import pickle
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from rank_bm25 import BM25Okapi

from app.core.config import settings
from app.core.logging import logger

_TOKEN_RE = re.compile(r"[A-Za-z0-9]+")


def _tokenize(text: str) -> List[str]:
    return [t.lower() for t in _TOKEN_RE.findall(text or "")]


class BM25Index:
    def __init__(self, persist_path: Optional[str] = None) -> None:
        default_path = Path(settings.chroma_persist_dir).parent / "bm25" / "index.pkl"
        self.path = settings.resolve(persist_path or str(default_path))
        self.path.parent.mkdir(parents=True, exist_ok=True)

        self._bm25: Optional[BM25Okapi] = None
        self._ids: List[str] = []
        self._docs: List[str] = []
        self._metas: List[Dict[str, Any]] = []
        self._tokenized: List[List[str]] = []

        if self.path.exists():
            self._load()

    # ---------- persistence ----------
    def _load(self) -> None:
        with self.path.open("rb") as f:
            payload = pickle.load(f)
        self._ids = payload["ids"]
        self._docs = payload["docs"]
        self._metas = payload["metas"]
        self._tokenized = payload["tokenized"]
        if self._tokenized:
            self._bm25 = BM25Okapi(self._tokenized)
        logger.info(f"BM25 loaded: {len(self._ids):,} docs from {self.path}")

    def _save(self) -> None:
        with self.path.open("wb") as f:
            pickle.dump(
                {
                    "ids": self._ids,
                    "docs": self._docs,
                    "metas": self._metas,
                    "tokenized": self._tokenized,
                },
                f,
            )
        logger.info(f"BM25 saved: {len(self._ids):,} docs → {self.path}")

    # ---------- write ----------
    def build(
        self,
        ids: List[str],
        documents: List[str],
        metadatas: List[Dict[str, Any]],
    ) -> None:
        self._ids = list(ids)
        self._docs = list(documents)
        self._metas = list(metadatas)
        self._tokenized = [_tokenize(d) for d in documents]
        self._bm25 = BM25Okapi(self._tokenized) if self._tokenized else None
        self._save()

    # ---------- read ----------
    def search(self, query: str, top_k: Optional[int] = None) -> List[Dict[str, Any]]:
        if self._bm25 is None or not self._ids:
            return []
        k = top_k or settings.sparse_top_k
        scores = self._bm25.get_scores(_tokenize(query))
        if len(scores) == 0:
            return []
        # top-k indices
        ranked = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:k]
        out: List[Dict[str, Any]] = []
        for i in ranked:
            out.append(
                {
                    "id": self._ids[i],
                    "text": self._docs[i],
                    "metadata": self._metas[i],
                    "score": float(scores[i]),
                }
            )
        return out

    def count(self) -> int:
        return len(self._ids)
