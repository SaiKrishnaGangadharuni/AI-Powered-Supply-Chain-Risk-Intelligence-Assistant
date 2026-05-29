"""Context compression — token-count truncation (replaces LLMLingua; no torch required)."""
from __future__ import annotations

from typing import List, Optional

import tiktoken

from app.core.config import settings
from app.core.logging import logger

_enc = tiktoken.get_encoding("cl100k_base")


def _token_count(text: str) -> int:
    return len(_enc.encode(text or ""))


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
                ids = _enc.encode(ctx)
                parts.append(_enc.decode(ids[:remaining]))
            break
        parts.append(ctx)
        used += chunk_tokens

    result = "\n\n".join(parts)
    if used > cap:
        logger.info(f"Context truncated: {used} → {cap} tokens")
    return result
