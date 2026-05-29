"""Context compression — token-count truncation (replaces LLMLingua; no torch required)."""
from __future__ import annotations

from typing import List, Optional

from app.core.config import settings
from app.core.logging import logger

_enc = None
_enc_loaded = False


def _get_enc():
    """Lazily load the tiktoken encoding. Returns None if unavailable
    (e.g. offline / restricted network) so callers fall back gracefully."""
    global _enc, _enc_loaded
    if not _enc_loaded:
        _enc_loaded = True
        try:
            import tiktoken

            _enc = tiktoken.get_encoding("cl100k_base")
        except Exception as e:  # network blocked, missing cache, etc.
            logger.warning(f"tiktoken unavailable, using word-count fallback: {e}")
            _enc = None
    return _enc


def _token_count(text: str) -> int:
    enc = _get_enc()
    if enc is not None:
        return len(enc.encode(text or ""))
    # Fallback: ~1.3 tokens per whitespace-delimited word
    return int(len((text or "").split()) * 1.3) + 1


def compress(
    contexts: List[str],
    target_ratio: Optional[float] = None,
    max_tokens: Optional[int] = None,
) -> str:
    """
    Join contexts and truncate to max_tokens if needed.

    Retains the most relevant context by keeping top chunks first (caller
    should pass them in ranked order) and hard-truncating at the token limit.
    """
    if not contexts:
        return ""

    cap = max_tokens or settings.max_context_tokens
    parts: List[str] = []
    used = 0

    for ctx in contexts:
        chunk_tokens = _token_count(ctx)
        if used + chunk_tokens > cap:
            # Partial fit: take as many tokens as remain
            remaining = cap - used
            if remaining > 50:  # only add if meaningfully non-empty
                enc = _get_enc()
                if enc is not None:
                    ids = enc.encode(ctx)
                    parts.append(enc.decode(ids[:remaining]))
                else:
                    # Fallback: approximate token->char ratio (~4 chars/token)
                    parts.append(ctx[: remaining * 4])
            break
        parts.append(ctx)
        used += chunk_tokens

    result = "\n\n".join(parts)
    if used > cap:
        logger.info(f"Context truncated: {used} -> {cap} tokens")
    return result
