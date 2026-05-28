"""Sentence-Transformer wrapper for bge-small-en-v1.5 (384-dim, free)."""
from __future__ import annotations

from threading import Lock
from typing import List, Optional

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
            from sentence_transformers import SentenceTransformer

            logger.info(f"Loading embedding model: {settings.embedding_model}")
            _model = SentenceTransformer(settings.embedding_model)
    return _model


def embed_texts(texts: List[str], batch_size: Optional[int] = None) -> List[List[float]]:
    """Embed a batch of texts; returns list-of-lists for ChromaDB compatibility."""
    if not texts:
        return []
    model = _get_model()
    bs = batch_size or settings.incident_doc_batch_size
    arr = model.encode(
        texts,
        batch_size=bs,
        normalize_embeddings=True,
        show_progress_bar=False,
        convert_to_numpy=True,
    )
    return arr.tolist()


def embed_query(text: str) -> List[float]:
    return embed_texts([text])[0]
