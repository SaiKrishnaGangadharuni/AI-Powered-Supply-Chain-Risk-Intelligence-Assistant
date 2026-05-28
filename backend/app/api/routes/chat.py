"""Chat endpoints — REST query + WebSocket streaming + HILT feedback."""
from __future__ import annotations

import json
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from langchain_core.messages import HumanMessage
from pydantic import BaseModel

from app.agents.graph import get_graph
from app.cache.semantic_cache import semantic_cache
from app.core.logging import logger
from app.guardrails.input_guard import validate_input
from app.models.schemas import ChatRequest, ChatResponse, FeedbackRequest, RetrievedDoc
from app.services.event_bus import current_session_id, event_bus
from app.services.feedback_store import feedback_store

router = APIRouter()


def _docs_for_response(docs: List[Dict[str, Any]], limit: int = 5) -> List[RetrievedDoc]:
    seen = set()
    out: List[RetrievedDoc] = []
    for d in docs:
        if d["id"] in seen:
            continue
        seen.add(d["id"])
        out.append(
            RetrievedDoc(
                id=d.get("id", ""),
                text=d.get("text", ""),
                score=float(d.get("rerank_score", d.get("score", 0.0))),
                metadata=d.get("metadata", {}),
            )
        )
        if len(out) >= limit:
            break
    return out


def _run_graph(query: str, session_id: str) -> Dict[str, Any]:
    graph = get_graph()
    config = {"configurable": {"thread_id": session_id}}
    init_state = {
        "query": query,
        "session_id": session_id,
        "messages": [HumanMessage(content=query)],
        "agent_outputs": {},
        "retrieved_docs": [],
        "needs_human": False,
    }
    final_state = graph.invoke(init_state, config=config)
    return final_state


# ---------------- REST ----------------
@router.post("/query", response_model=ChatResponse)
async def query(req: ChatRequest) -> ChatResponse:
    guard = validate_input(req.query)
    if not guard.ok:
        raise HTTPException(status_code=400, detail=guard.reason)

    session_id = req.session_id or str(uuid.uuid4())

    cached = semantic_cache.lookup(req.query)
    if cached:
        return ChatResponse(
            answer=cached.get("answer", ""),
            session_id=session_id,
            severity=cached.get("severity", "LOW"),
            docs=cached.get("docs", []),
            needs_human=cached.get("needs_human", False),
        )

    token = current_session_id.set(session_id)
    try:
        state = _run_graph(req.query, session_id)
    finally:
        current_session_id.reset(token)
        event_bus.clear(session_id)

    answer = state.get("final_answer") or ""
    severity = (state.get("severity") or "LOW").upper()
    docs = _docs_for_response(state.get("retrieved_docs", []))

    resp = ChatResponse(
        answer=answer,
        session_id=session_id,
        severity=severity,
        docs=docs,
        needs_human=bool(state.get("needs_human", False)),
    )

    semantic_cache.store(
        req.query,
        {
            "answer": resp.answer,
            "severity": resp.severity,
            "docs": [d.model_dump() for d in resp.docs],
            "needs_human": resp.needs_human,
        },
    )
    return resp


# ---------------- WebSocket streaming ----------------
async def _flush_events(ws: WebSocket, session_id: str) -> None:
    """Forward bus events to the WS. The inner event's `type` is preserved as
    `event_type` to avoid clashing with the outer envelope type."""
    events = event_bus.drain(session_id)
    for ev in events:
        inner = dict(ev)
        kind = inner.pop("type", "unknown")
        await ws.send_text(json.dumps({"type": "event", "event_type": kind, **inner}))


@router.websocket("/ws")
async def chat_ws(ws: WebSocket):
    await ws.accept()
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send_text(json.dumps({"type": "error", "detail": "invalid JSON"}))
                continue

            query_text = (msg.get("query") or "").strip()
            session_id = msg.get("session_id") or str(uuid.uuid4())
            if not query_text:
                await ws.send_text(json.dumps({"type": "error", "detail": "empty query"}))
                continue

            await ws.send_text(json.dumps({"type": "run_start", "session_id": session_id, "query": query_text}))

            token = current_session_id.set(session_id)
            try:
                guard = validate_input(query_text)
                await _flush_events(ws, session_id)
                if not guard.ok:
                    await ws.send_text(
                        json.dumps({"type": "guard_block", "detail": guard.reason, "severity": guard.severity})
                    )
                    continue

                cached = semantic_cache.lookup(query_text)
                if cached:
                    await ws.send_text(json.dumps({
                        "type": "cached", "session_id": session_id,
                        "answer": cached.get("answer", ""),
                        "severity": cached.get("severity", "LOW"),
                        "docs": cached.get("docs", []),
                        "needs_human": cached.get("needs_human", False),
                    }))
                    continue

                graph = get_graph()
                config = {"configurable": {"thread_id": session_id}}
                init_state = {
                    "query": query_text,
                    "session_id": session_id,
                    "messages": [HumanMessage(content=query_text)],
                    "agent_outputs": {},
                    "retrieved_docs": [],
                    "needs_human": False,
                }

                try:
                    for chunk in graph.stream(init_state, config=config, stream_mode="updates"):
                        # Forward LangGraph node update first
                        for node_name, update in chunk.items():
                            await ws.send_text(json.dumps({
                                "type": "node_update",
                                "node": node_name,
                                "severity": (update or {}).get("severity"),
                                "intent": (update or {}).get("intent"),
                            }))
                        # Then flush rich events collected during the chunk
                        await _flush_events(ws, session_id)
                except Exception as e:  # noqa: BLE001
                    logger.exception("graph.stream failed")
                    await ws.send_text(json.dumps({"type": "error", "detail": repr(e)}))
                    continue

                # Final flush of any trailing events
                await _flush_events(ws, session_id)

                final_state = graph.get_state(config).values
                answer = final_state.get("final_answer") or ""
                severity = (final_state.get("severity") or "LOW").upper()
                docs = [d.model_dump() for d in _docs_for_response(final_state.get("retrieved_docs", []))]

                payload = {
                    "type": "final",
                    "session_id": session_id,
                    "answer": answer,
                    "severity": severity,
                    "docs": docs,
                    "needs_human": bool(final_state.get("needs_human", False)),
                }
                await ws.send_text(json.dumps(payload))
                semantic_cache.store(
                    query_text,
                    {
                        "answer": answer, "severity": severity,
                        "docs": docs, "needs_human": payload["needs_human"],
                    },
                )
            finally:
                current_session_id.reset(token)
                event_bus.clear(session_id)

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:  # noqa: BLE001
        logger.exception("WebSocket loop error")
        try:
            await ws.send_text(json.dumps({"type": "error", "detail": repr(e)}))
        except Exception:
            pass


# ---------------- HILT feedback ----------------
@router.post("/feedback")
async def feedback(req: FeedbackRequest) -> dict:
    feedback_store.add(
        session_id=req.session_id,
        message_id=req.message_id,
        rating=req.rating,
        note=req.note,
    )
    return {"ok": True}


@router.get("/feedback")
async def list_feedback(limit: int = 50) -> dict:
    items = feedback_store.list(limit=limit)
    return {"items": items, "count": len(items)}
