"""Recommendation agent — synthesizes specialist outputs into a final answer."""
from __future__ import annotations

from typing import Dict

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents._common import node_span
from app.core.llm_router import TaskType, router
from app.guardrails.output_guard import validate_output
from app.services.event_bus import event_bus

SYSTEM = """\
You are a Senior Supply-Chain Risk Intelligence Analyst. Answer the user's question \
directly and intelligently — adapt your format to the nature of the question.

## FORMAT RULES (choose the right one):

**For factual / listing questions** ("what products do we have?", "list departments", \
"show suppliers", "how many orders?"):
→ Answer directly with a clean, structured list or table. No risk template needed.
→ Use emojis as category icons (📦 products, 🏭 suppliers, 🚚 shipments, 🏪 departments).
→ 3-8 bullet points max. Be concise.

**For analytical / risk questions** ("what are the risks?", "supplier performance", \
"why are shipments delayed?", "revenue at risk"):
→ Use this structure:
  🔍 **Summary** — 2-3 sentences with specific metrics/names from the data.
  ⚠️ **Key Findings** — 3-5 bullets with concrete values (delay %, supplier names, SKUs).
  ✅ **Recommended Actions** — 3-4 prioritized steps with clear rationale.
  🎯 **Risk Level: LOW / MEDIUM / HIGH** — one-line justification.

**For conversational / open questions** ("can you help me?", "explain X"):
→ Answer in 2-4 natural paragraphs. Be helpful and conversational.

## ALWAYS:
- Cite sources inline as [Doc N].
- Use **bold** for key terms, metrics, and entity names.
- Be specific — name actual suppliers, SKUs, regions, percentages from the data.
- Do not pad with generic filler. Every sentence must come from the specialist analyses.
- Write in professional yet engaging business English.\
"""


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
            reason=guarded.notes.get("faithfulness", {}).get("reason", None),
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
