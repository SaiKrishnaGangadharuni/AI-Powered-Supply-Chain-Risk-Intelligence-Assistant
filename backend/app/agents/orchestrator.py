"""Orchestrator / router agent — intent classification + severity tag."""
from __future__ import annotations

import json
from typing import Any, Dict

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents._common import node_span
from app.core.llm_router import TaskType, router
from app.core.logging import logger
from app.services.event_bus import event_bus


SYSTEM = (
    "You classify a supply-chain query into ONE intent and a preliminary severity tag. "
    "Intents: supplier_risk, shipment_analysis, inventory_intelligence, general. "
    "Severity: LOW, MEDIUM, HIGH (HIGH = stockout, broken SLA, supplier failure, fraud). "
    "Return strict JSON: "
    '{"intent": "...", "severity": "...", "rationale": "<one short sentence>"}'
)


def _parse(raw: str) -> Dict[str, Any]:
    try:
        return json.loads(raw)
    except Exception:
        i, j = raw.find("{"), raw.rfind("}")
        if 0 <= i < j:
            try:
                return json.loads(raw[i : j + 1])
            except Exception:
                pass
    return {"intent": "general", "severity": "LOW", "rationale": "parse-failed"}


def orchestrate(state: dict) -> dict:
    """Read state.query, set state.intent + state.severity, return updates only."""
    query = state.get("query", "")
    with node_span("orchestrator"):
        msgs = [SystemMessage(content=SYSTEM), HumanMessage(content=query)]
        resp = router.invoke(TaskType.ROUTING, msgs)
        raw = getattr(resp, "content", "") or ""
        parsed = _parse(raw)
        intent = parsed.get("intent", "general")
        severity = parsed.get("severity", "LOW").upper()
        if severity not in ("LOW", "MEDIUM", "HIGH"):
            severity = "LOW"
        event_bus.emit(
            "orchestrator_decision",
            intent=intent, severity=severity, rationale=parsed.get("rationale", ""),
        )
        logger.info(f"[orchestrator] intent={intent} severity={severity}")
    return {
        "intent": intent,
        "severity": severity,
        "agent_outputs": {"orchestrator": parsed},
    }
