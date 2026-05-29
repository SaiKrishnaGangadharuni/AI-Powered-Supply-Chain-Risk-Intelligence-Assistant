"""Input guardrails: schema validation + domain relevance + prompt-injection detection."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List

from langchain_core.messages import HumanMessage, SystemMessage

from app.core.config import settings
from app.core.llm_router import TaskType, router
from app.core.logging import logger
from app.services.event_bus import event_bus


# ── Prompt injection patterns ──────────────────────────────────────────────
_INJECTION_PATTERNS = [
    r"ignore (all )?(previous|prior|above) (instructions|prompts)",
    r"disregard (all )?(previous|prior|above)",
    r"system prompt",
    r"reveal your (system )?prompt",
    r"you are now",
    r"act as (a )?(different|new)",
    r"jailbreak",
    r"developer mode",
    r"<\|.*?\|>",
]
_INJECTION_RE = re.compile("|".join(_INJECTION_PATTERNS), re.IGNORECASE)

# ── Fast-pass: greetings / small-talk → skip domain LLM call ──────────────
_GREETING_RE = re.compile(
    r"^(hi|hello|hey|howdy|greetings?|good\s?(morning|afternoon|evening|day)|"
    r"thanks?|thank\s?you|bye|goodbye|ok|okay|sure|yes|no|please|help|"
    r"what can you do|who are you|what are you)\b[\s!?.]*$",
    re.IGNORECASE,
)

# ── Fast-pass: obvious supply-chain keywords → skip domain LLM call ───────
_DOMAIN_KEYWORDS_RE = re.compile(
    r"\b(supplier|supply chain|shipment|shipping|inventory|warehouse|delivery|"
    r"freight|logistics|procurement|vendor|stockout|demand|order|customs|"
    r"disruption|risk|lead time|fulfilment|fulfillment|transit|cargo|sku|"
    r"late deliver|delay|anomal)\b",
    re.IGNORECASE,
)


@dataclass
class GuardResult:
    ok: bool
    reason: str = ""
    severity: str = "LOW"
    fast_reply: str = ""   # non-empty → return this text directly, skip pipeline


def _check_length(text: str) -> GuardResult:
    if not text or not text.strip():
        return GuardResult(False, "Empty query", "MEDIUM")
    if len(text) > 4000:
        return GuardResult(False, "Query exceeds 4000 characters", "MEDIUM")
    return GuardResult(True)


def _check_injection(text: str) -> GuardResult:
    if not settings.injection_detection_enabled:
        return GuardResult(True)
    m = _INJECTION_RE.search(text)
    if m:
        return GuardResult(False, f"Possible prompt injection: '{m.group(0)}'", "HIGH")
    return GuardResult(True)


def _check_greeting(text: str) -> GuardResult:
    """Return a fast reply for greetings — no LLM call needed."""
    if _GREETING_RE.match(text.strip()):
        return GuardResult(
            ok=True,
            fast_reply=(
                "Hello! I'm the Supply Chain Risk Intelligence Assistant. "
                "Ask me about supplier risks, shipment delays, inventory anomalies, "
                "or any supply chain disruption and I'll provide actionable insights."
            ),
        )
    return GuardResult(True)


_DOMAIN_SYSTEM = (
    "You are a strict classifier. Decide if the user query is about supply chain, "
    "logistics, shipments, suppliers, inventory, deliveries, procurement, or related "
    "operations/risk topics. Answer with a single token: YES or NO."
)


def _check_domain(text: str) -> GuardResult:
    """LLM domain check — only called when keyword fast-pass doesn't match."""
    # Fast keyword pass — no LLM needed
    if _DOMAIN_KEYWORDS_RE.search(text):
        return GuardResult(True)
    try:
        msgs = [SystemMessage(content=_DOMAIN_SYSTEM), HumanMessage(content=text)]
        resp = router.invoke(TaskType.ROUTING, msgs)
        verdict = (getattr(resp, "content", "") or "").strip().upper()
        if verdict.startswith("YES"):
            return GuardResult(True)
        return GuardResult(False, "Query appears off-topic for supply-chain risk intelligence.", "LOW")
    except Exception as e:
        logger.warning(f"Domain check skipped (LLM error): {e!r}")
        return GuardResult(True)  # fail-open


def validate_input(text: str, skip_domain: bool = False) -> GuardResult:
    """Run all input checks. First failure wins. Returns fast_reply if greeting."""
    for check in (_check_length, _check_injection, _check_greeting):
        r = check(text)
        if not r.ok:
            event_bus.emit("guardrail", stage="input", ok=False, reason=r.reason, severity=r.severity)
            return r
        if r.fast_reply:
            event_bus.emit("guardrail", stage="input", ok=True, fast_reply=True)
            return r
    if not skip_domain:
        r = _check_domain(text)
        if not r.ok:
            event_bus.emit("guardrail", stage="input", ok=False, reason=r.reason, severity=r.severity)
            return r
    event_bus.emit("guardrail", stage="input", ok=True)
    return GuardResult(True)
