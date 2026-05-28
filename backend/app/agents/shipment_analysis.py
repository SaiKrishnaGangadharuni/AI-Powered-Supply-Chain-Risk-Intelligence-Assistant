"""Shipment Analysis agent — late-delivery risk, ship modes, transit delays."""
from __future__ import annotations

from langchain_core.messages import HumanMessage, SystemMessage

from app.agents._common import format_docs_for_prompt, node_span, retrieve
from app.core.llm_router import TaskType, router

SYSTEM = (
    "You are the Shipment Analysis Specialist. Focus on delivery timing, late-risk flags, "
    "ship modes, carriers, transit days, and route performance. Use only the retrieved "
    "incidents. Cite [Doc N] inline; quantify delays when possible."
)


def run(state: dict) -> dict:
    query = state.get("query", "")
    with node_span("shipment_analysis"):
        retrieved = retrieve(query)
        docs = retrieved["docs"]
        context = retrieved["context"]

        msgs = [
            SystemMessage(content=SYSTEM),
            HumanMessage(
                content=(
                    f"Query: {query}\n\n"
                    f"Retrieved incidents:\n{format_docs_for_prompt(docs)}\n\n"
                    "Produce a concise analysis (3-6 sentences) focused on shipment risk."
                )
            ),
        ]
        resp = router.invoke(TaskType.SUMMARIZATION, msgs)
        answer = getattr(resp, "content", "") or ""

    prior = state.get("agent_outputs", {}) or {}
    prior_docs = state.get("retrieved_docs", []) or []
    return {
        "retrieved_docs": prior_docs + docs,
        "agent_outputs": {
            **prior,
            "shipment_analysis": {
                "answer": answer, "context": context,
                "max_score": retrieved["max_score"], "doc_count": len(docs),
            },
        },
    }
