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


# Patterns that strongly suggest prompt injection / system override attempts
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


@dataclass
class GuardResult:
    ok: bool
    reason: str = ""
    severity: str = "LOW"  # LOW | MEDIUM | HIGH


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
        return GuardResult(
            False,
            f"Possible prompt injection detected: '{m.group(0)}'",
            "HIGH",
        )
    return GuardResult(True)


_DOMAIN_SYSTEM = (
    "You are a strict classifier. Decide if the user query is about supply chain, "
    "logistics, shipments, suppliers, inventory, deliveries, procurement, or related "
    "operations/risk topics. Answer with a single token: YES or NO."
)


def _check_domain(text: str) -> GuardResult:
    """Cheap on-topic check via the small/fast model."""
    try:
        msgs = [
            SystemMessage(content=_DOMAIN_SYSTEM),
            HumanMessage(content=text),
        ]
        resp = router.invoke(TaskType.ROUTING, msgs)
        verdict = (getattr(resp, "content", "") or "").strip().upper()
        if verdict.startswith("YES"):
            return GuardResult(True)
        return GuardResult(
            False,
            "Query appears off-topic for supply-chain risk intelligence.",
            "LOW",
        )
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Domain check skipped due to LLM error: {e!r}")
        # Fail-open on infra error so user isn't blocked
        return GuardResult(True)


def validate_input(text: str, skip_domain: bool = False) -> GuardResult:
    """Run all input checks in order. First failure wins."""
    for check in (_check_length, _check_injection):
        r = check(text)
        if not r.ok:
            event_bus.emit("guardrail", stage="input", ok=False, reason=r.reason, severity=r.severity)
            return r
    if not skip_domain:
        r = _check_domain(text)
        if not r.ok:
            event_bus.emit("guardrail", stage="input", ok=False, reason=r.reason, severity=r.severity)
            return r
    event_bus.emit("guardrail", stage="input", ok=True)
    return GuardResult(True)
