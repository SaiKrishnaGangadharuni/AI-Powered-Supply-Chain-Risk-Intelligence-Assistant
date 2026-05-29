"""OpenAI text-embedding-3-small wrapper (1536-dim, replaces local BAAI model)."""
from __future__ import annotations

from typing import List

from openai import OpenAI

from app.core.config import settings
from app.core.logging import logger

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=settings.openai_api_key)
    return _client


def embed_texts(texts: List[str], batch_size: int = 100) -> List[List[float]]:
    """Embed texts using OpenAI text-embedding-3-small. Returns list-of-lists."""
    if not texts:
        return []
    client = _get_client()
    results: List[List[float]] = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        resp = client.embeddings.create(
            model=settings.embedding_model,
            input=batch,
        )
        results.extend([d.embedding for d in resp.data])
    logger.debug(f"Embedded {len(texts)} texts via {settings.embedding_model}")
    return results


def embed_query(text: str) -> List[float]:
    return embed_texts([text])[0]
