"""Recommendation agent — synthesizes specialist outputs into a final answer."""
from __future__ import annotations

from typing import Dict

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents._common import node_span
from app.core.llm_router import TaskType, router
from app.guardrails.output_guard import validate_output
from app.services.event_bus import event_bus

SYSTEM = (
    "You are the Lead Supply-Chain Strategist. Synthesize the specialist analyses below "
    "into ONE clear answer for the user. Include: (1) a direct answer, (2) 2-4 concrete "
    "recommendations, (3) the inline [Doc N] citations used. Keep it under ~180 words."
)


def _format_specialists(outputs: Dict[str, dict]) -> str:
    parts = []
    for name, data in outputs.items():
        if name == "orchestrator":
            continue
        if isinstance(data, dict) and "answer" in data:
            parts.append(f"[{name}]\n{data['answer']}")
    return "\n\n".join(parts)


def run(state: dict) -> dict:
    query = state.get("query", "")
    outputs = state.get("agent_outputs", {}) or {}
    severity = (state.get("severity") or "LOW").upper()
    needs_human = severity == "HIGH"

    if needs_human:
        event_bus.emit("hilt_interrupt", severity=severity, reason="HIGH severity → human review")

    with node_span("recommendation"):
        specialists = _format_specialists(outputs)
        msgs = [
            SystemMessage(content=SYSTEM),
            HumanMessage(content=f"User query:\n{query}\n\nSpecialist analyses:\n{specialists}"),
        ]
        resp = router.invoke(TaskType.RECOMMENDATION, msgs)
        raw = getattr(resp, "content", "") or ""

        context_parts = []
        for name, data in outputs.items():
            if isinstance(data, dict) and "context" in data:
                context_parts.append(data["context"])
        context = "\n\n".join(context_parts)

        guarded = validate_output(raw, context=context, check_faithfulness=True)
        event_bus.emit(
            "faithfulness",
            faithful=guarded.faithful,
            pii_redacted=guarded.pii_redacted,
        )

    return {
        "final_answer": guarded.answer,
        "needs_human": needs_human,
        "agent_outputs": {
            **outputs,
            "recommendation": {
                "answer": guarded.answer,
                "faithful": guarded.faithful,
                "pii_redacted": guarded.pii_redacted,
                "notes": guarded.notes,
            },
        },
    }
