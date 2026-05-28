"""LLMLingua context compression — triggered when context exceeds MAX_CONTEXT_TOKENS."""
from __future__ import annotations

from threading import Lock
from typing import List, Optional

import tiktoken

from app.core.config import settings
from app.core.logging import logger

_compressor = None
_lock = Lock()
_enc = tiktoken.get_encoding("cl100k_base")


def _token_count(text: str) -> int:
    return len(_enc.encode(text or ""))


def _get_compressor():
    global _compressor
    if _compressor is not None:
        return _compressor
    with _lock:
        if _compressor is None:
            from llmlingua import PromptCompressor

            logger.info("Loading LLMLingua compressor (this may take a moment)")
            _compressor = PromptCompressor(
                model_name="microsoft/llmlingua-2-xlm-roberta-large-meetingbank",
                use_llmlingua2=True,
            )
    return _compressor


def compress(
    contexts: List[str],
    target_ratio: Optional[float] = None,
    max_tokens: Optional[int] = None,
) -> str:
    """Compress a list of context strings if combined token count exceeds the cap.

    Returns the final context string (joined newlines).
    """
    if not contexts:
        return ""
    joined = "\n\n".join(contexts)
    cap = max_tokens or settings.max_context_tokens
    if _token_count(joined) <= cap:
        return joined

    try:
        compressor = _get_compressor()
        rate = target_ratio or settings.llmlingua_compression_ratio
        result = compressor.compress_prompt(
            joined,
            rate=rate,
            force_tokens=["\n", "."],
        )
        compressed = result.get("compressed_prompt", joined)
        logger.info(
            f"Compressed context: {_token_count(joined)} → {_token_count(compressed)} tokens"
        )
        return compressed
    except Exception as e:  # noqa: BLE001
        logger.warning(f"LLMLingua compression failed, truncating instead: {e!r}")
        # Hard truncate as a last resort
        ids = _enc.encode(joined)
        return _enc.decode(ids[:cap])
