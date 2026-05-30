"""Embedding backends.

Two providers, selected by settings.embedding_provider:
  - "openai"    : text-embedding-3-small (1536-dim, API, default)
  - "fastembed" : BAAI/bge-small-en-v1.5 (384-dim, local ONNX, no torch, no API key)

A Chroma collection is locked to one vector dimension, so switching provider
requires re-ingesting into a fresh collection (clear CHROMA_PERSIST_DIR).
"""
from __future__ import annotations

from typing import List

from app.core.config import settings
from app.core.logging import logger

_openai_client = None
_fastembed_model = None


# ---------------------------------------------------------------------------
# OpenAI backend
# ---------------------------------------------------------------------------
def _get_openai():
    global _openai_client
    if _openai_client is None:
        from openai import OpenAI

        _openai_client = OpenAI(
            api_key=settings.openai_api_key,
            base_url=settings.openai_base_url or None,
        )
    return _openai_client


def _embed_openai(texts: List[str], batch_size: int) -> List[List[float]]:
    client = _get_openai()
    out: List[List[float]] = []
    for i in range(0, len(texts), batch_size):
        resp = client.embeddings.create(
            model=settings.embedding_model,
            input=texts[i : i + batch_size],
        )
        out.extend([d.embedding for d in resp.data])
    return out


# ---------------------------------------------------------------------------
# fastembed backend (local ONNX, no torch)
# ---------------------------------------------------------------------------
def _get_fastembed():
    global _fastembed_model
    if _fastembed_model is None:
        from fastembed import TextEmbedding

        logger.info(f"Loading fastembed model {settings.fastembed_model} (first run downloads it)")
        _fastembed_model = TextEmbedding(model_name=settings.fastembed_model)
    return _fastembed_model


def _embed_fastembed(texts: List[str]) -> List[List[float]]:
    model = _get_fastembed()
    # model.embed returns a generator of numpy arrays
    return [vec.tolist() for vec in model.embed(texts)]


# ---------------------------------------------------------------------------
# Public API (provider-agnostic)
# ---------------------------------------------------------------------------
def embed_texts(texts: List[str], batch_size: int = 100) -> List[List[float]]:
    if not texts:
        return []
    provider = (settings.embedding_provider or "openai").lower()
    if provider == "fastembed":
        results = _embed_fastembed(texts)
        logger.debug(f"Embedded {len(texts)} texts via fastembed/{settings.fastembed_model}")
    else:
        results = _embed_openai(texts, batch_size)
        logger.debug(f"Embedded {len(texts)} texts via openai/{settings.embedding_model}")
    return results


def embed_query(text: str) -> List[float]:
    return embed_texts([text])[0]
