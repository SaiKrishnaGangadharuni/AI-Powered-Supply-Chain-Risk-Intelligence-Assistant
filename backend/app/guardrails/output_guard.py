"""Output guardrails: privacy filter + lightweight faithfulness check."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List

from langchain_core.messages import HumanMessage, SystemMessage

from app.core.config import settings
from app.core.llm_router import TaskType, router
from app.core.logging import logger


# ---------------- Privacy filter ----------------
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_PHONE_RE = re.compile(r"\b(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)?\d{3}[\s.-]?\d{4}\b")
_CC_RE = re.compile(r"\b(?:\d[ -]*?){13,16}\b")
_SSN_RE = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")


def _scrub_pii(text: str) -> tuple[str, List[str]]:
    """Mask emails/phones/cards/SSNs. Returns (clean_text, list_of_categories_redacted)."""
    found: List[str] = []
    if _EMAIL_RE.search(text):
        found.append("email")
        text = _EMAIL_RE.sub("[REDACTED_EMAIL]", text)
    if _SSN_RE.search(text):
        found.append("ssn")
        text = _SSN_RE.sub("[REDACTED_SSN]", text)
    if _CC_RE.search(text):
        found.append("card")
        text = _CC_RE.sub("[REDACTED_CARD]", text)
    if _PHONE_RE.search(text):
        found.append("phone")
        text = _PHONE_RE.sub("[REDACTED_PHONE]", text)
    return text, found


# ---------------- Faithfulness ----------------
_FAITHFULNESS_SYSTEM = (
    "You are a strict fact-checker. Given a CONTEXT and an ANSWER, decide if every "
    "factual claim in the ANSWER is grounded in the CONTEXT. Respond with JSON: "
    '{"faithful": true|false, "reason": "<short reason>"}.'
)


def _check_faithfulness(answer: str, context: str) -> Dict[str, Any]:
    if not context.strip():
        return {"faithful": True, "reason": "no-context-skip"}
    try:
        msgs = [
            SystemMessage(content=_FAITHFULNESS_SYSTEM),
            HumanMessage(content=f"CONTEXT:\n{context}\n\nANSWER:\n{answer}"),
        ]
        resp = router.invoke(TaskType.ROUTING, msgs)  # groq_small — fast YES/NO classification
        raw = (getattr(resp, "content", "") or "").strip()
        import json as _json

        try:
            return _json.loads(raw)
        except Exception:
            # Lenient parsing
            faithful = "true" in raw.lower().split("faithful")[1][:10] if "faithful" in raw.lower() else True
            return {"faithful": bool(faithful), "reason": raw[:200]}
    except Exception as e:  # noqa: BLE001
        logger.warning(f"Faithfulness check skipped: {e!r}")
        return {"faithful": True, "reason": f"check-skipped: {e!r}"}


# ---------------- public ----------------
@dataclass
class OutputGuardResult:
    answer: str
    faithful: bool = True
    pii_redacted: List[str] = field(default_factory=list)
    notes: Dict[str, Any] = field(default_factory=dict)


def validate_output(answer: str, context: str = "", check_faithfulness: bool = True) -> OutputGuardResult:
    text = answer
    pii: List[str] = []
    if settings.privacy_filter_enabled:
        text, pii = _scrub_pii(text)

    notes: Dict[str, Any] = {}
    faithful = True
    if check_faithfulness:
        verdict = _check_faithfulness(text, context)
        faithful = bool(verdict.get("faithful", True))
        notes["faithfulness"] = verdict

    return OutputGuardResult(answer=text, faithful=faithful, pii_redacted=pii, notes=notes)
