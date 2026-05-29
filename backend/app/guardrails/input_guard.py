"""Input guardrails: schema validation + domain relevance + prompt-injection detection."""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

from langchain_core.messages import HumanMessage, SystemMessage

from app.core.config import settings
from app.core.llm_router import TaskType, router
from app.core.logging import logger
from app.services.event_bus import event_bus

# ── Prompt injection patterns ──────────────────────────────────────────────
_INJECTION_PATTERNS = [
    r"ignore (all )?(previous|prior|above) (instructions|prompts)",
    r"disregard (all )?(previous|prior|above)",
    r"system prompt", r"reveal your (system )?prompt",
    r"you are now", r"act as (a )?(different|new)",
    r"jailbreak", r"developer mode", r"<\|.*?\|>",
]
_INJECTION_RE = re.compile("|".join(_INJECTION_PATTERNS), re.IGNORECASE)

# ── Greeting fast-path ─────────────────────────────────────────────────────
_GREETING_RE = re.compile(
    r"^(hi|hello|hey|howdy|greetings?|good\s?(morning|afternoon|evening|day)|"
    r"thanks?|thank\s?you|bye|goodbye|ok|okay|sure|yes|no|please|help|"
    r"what can you do|who are you|what are you)\b[\s!?.]*$",
    re.IGNORECASE,
)

# ── Supply-chain keyword fast-pass (skip LLM domain check) ────────────────
_DOMAIN_KEYWORDS_RE = re.compile(
    r"\b(supplier|supply chain|shipment|shipping|inventory|warehouse|delivery|"
    r"freight|logistics|procurement|vendor|stockout|demand|order|customs|"
    r"disruption|risk|lead time|fulfilment|fulfillment|transit|cargo|sku|"
    r"late deliver|delay|anomal)\b",
    re.IGNORECASE,
)

_DOMAIN_SYSTEM = (
    "You are a strict classifier. Decide if the user query is about supply chain, "
    "logistics, shipments, suppliers, inventory, deliveries, procurement, or related "
    "operations/risk topics. Answer with a single token: YES or NO."
)


@dataclass
class GuardResult:
    ok: bool
    reason: str = ""
    severity: str = "LOW"
    fast_reply: str = ""


# ── Instant checks (no I/O, no LLM) ───────────────────────────────────────
def validate_instant(text: str) -> GuardResult:
    """Length + injection + greeting — all in-process, zero latency."""
    if not text or not text.strip():
        r = GuardResult(False, "Empty query", "MEDIUM")
        event_bus.emit("guardrail", stage="instant", ok=False, reason=r.reason)
        return r
    if len(text) > 4000:
        r = GuardResult(False, "Query exceeds 4000 characters", "MEDIUM")
        event_bus.emit("guardrail", stage="instant", ok=False, reason=r.reason)
        return r
    if settings.injection_detection_enabled:
        m = _INJECTION_RE.search(text)
        if m:
            r = GuardResult(False, f"Possible prompt injection: '{m.group(0)}'", "HIGH")
            event_bus.emit("guardrail", stage="instant", ok=False, reason=r.reason)
            return r
    if _GREETING_RE.match(text.strip()):
        fast = (
            "Hello! I'm the Supply Chain Risk Intelligence Assistant. "
            "Ask me about supplier risks, shipment delays, inventory anomalies, "
            "or any supply chain disruption and I'll provide actionable insights."
        )
        event_bus.emit("guardrail", stage="instant", ok=True, fast_reply=True)
        return GuardResult(ok=True, fast_reply=fast)
    event_bus.emit("guardrail", stage="instant", ok=True)
    return GuardResult(True)


# ── Domain check (Groq LLM — only call when cache misses) ─────────────────
def validate_domain(text: str) -> GuardResult:
    """LLM-based on-topic check. Call ONLY after confirming cache miss."""
    if _DOMAIN_KEYWORDS_RE.search(text):
        return GuardResult(True)   # keyword fast-pass, no LLM needed
    try:
        msgs = [SystemMessage(content=_DOMAIN_SYSTEM), HumanMessage(content=text)]
        resp = router.invoke(TaskType.ROUTING, msgs)
        verdict = (getattr(resp, "content", "") or "").strip().upper()
        if verdict.startswith("YES"):
            return GuardResult(True)
        r = GuardResult(False, "Query appears off-topic for supply-chain risk intelligence.", "LOW")
        event_bus.emit("guardrail", stage="domain", ok=False, reason=r.reason)
        return r
    except Exception as e:
        logger.warning(f"Domain check failed (LLM error): {e!r}")
        return GuardResult(False, "Classification service unavailable — please try again.", "LOW")


# ── Combined (kept for backward compat / REST endpoint) ───────────────────
def validate_input(text: str, skip_domain: bool = False) -> GuardResult:
    r = validate_instant(text)
    if not r.ok or r.fast_reply:
        return r
    if not skip_domain:
        r = validate_domain(text)
    return r
