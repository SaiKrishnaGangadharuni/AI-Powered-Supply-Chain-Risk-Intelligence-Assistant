"""Chat endpoints — REST query + WebSocket streaming + HILT feedback."""
from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from langchain_core.messages import HumanMessage

from app.agents.graph import get_graph
from app.cache.semantic_cache import semantic_cache
from app.core.logging import logger
from app.guardrails.input_guard import validate_domain, validate_instant
from app.models.schemas import ChatRequest, ChatResponse, FeedbackRequest, RetrievedDoc
from app.services.event_bus import current_session_id, event_bus
from app.services.feedback_store import feedback_store

router = APIRouter()


def _docs_for_response(docs: List[Dict[str, Any]], limit: int = 5) -> List[RetrievedDoc]:
    seen, out = set(), []
    for d in docs:
        if d["id"] in seen:
            continue
        seen.add(d["id"])
        out.append(RetrievedDoc(
            id=d.get("id", ""), text=d.get("text", ""),
            score=float(d.get("rerank_score", d.get("score", 0.0))),
            metadata=d.get("metadata", {}),
        ))
        if len(out) >= limit:
            break
    return out


def _run_graph_sync(query: str, session_id: str) -> Dict[str, Any]:
    graph = get_graph()
    config = {"configurable": {"thread_id": session_id}}
    init_state = {
        "query": query, "session_id": session_id,
        "messages": [HumanMessage(content=query)],
        "agent_outputs": {}, "retrieved_docs": [], "needs_human": False,
    }
    return graph.invoke(init_state, config=config)


def _stream_graph_sync(query: str, session_id: str):
    graph = get_graph()
    config = {"configurable": {"thread_id": session_id}}
    init_state = {
        "query": query, "session_id": session_id,
        "messages": [HumanMessage(content=query)],
        "agent_outputs": {}, "retrieved_docs": [], "needs_human": False,
    }
    chunks = list(graph.stream(init_state, config=config, stream_mode="updates"))
    final_state = graph.get_state(config).values
    return chunks, final_state


async def _flush_events(ws: WebSocket, session_id: str) -> None:
    for ev in event_bus.drain(session_id):
        inner = dict(ev)
        kind = inner.pop("type", "unknown")
        await ws.send_text(json.dumps({"type": kind, **inner}))


# ── REST endpoint ──────────────────────────────────────────────────────────
@router.post("/query", response_model=ChatResponse)
async def query(req: ChatRequest) -> ChatResponse:
    # 1. Instant checks (no I/O)
    guard = validate_instant(req.query)
    if not guard.ok:
        raise HTTPException(status_code=400, detail=guard.reason)
    if guard.fast_reply:
        return ChatResponse(answer=guard.fast_reply, session_id=req.session_id or str(uuid.uuid4()))

    # 2. Cache lookup — before domain check
    session_id = req.session_id or str(uuid.uuid4())
    cached = semantic_cache.lookup(req.query)
    if cached:
        return ChatResponse(
            answer=cached.get("answer", ""), session_id=session_id,
            severity=cached.get("severity", "LOW"), docs=cached.get("docs", []),
            needs_human=cached.get("needs_human", False),
        )

    # 3. Domain check — only on cache miss
    domain = await asyncio.to_thread(validate_domain, req.query)
    if not domain.ok:
        raise HTTPException(status_code=400, detail=domain.reason)

    # 4. Pipeline
    token = current_session_id.set(session_id)
    try:
        state = await asyncio.to_thread(_run_graph_sync, req.query, session_id)
    finally:
        current_session_id.reset(token)
        event_bus.clear(session_id)

    answer   = state.get("final_answer") or ""
    severity = (state.get("severity") or "LOW").upper()
    docs     = _docs_for_response(state.get("retrieved_docs", []))
    resp = ChatResponse(answer=answer, session_id=session_id, severity=severity,
                        docs=docs, needs_human=bool(state.get("needs_human", False)))
    semantic_cache.store(req.query, {
        "answer": resp.answer, "severity": resp.severity,
        "docs": [d.model_dump() for d in resp.docs], "needs_human": resp.needs_human,
    })
    return resp


# ── WebSocket ──────────────────────────────────────────────────────────────
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

            await ws.send_text(json.dumps({"type": "run_start", "session_id": session_id}))

            token = current_session_id.set(session_id)
            try:
                # ── Step 1: Instant guard (zero latency) ──
                guard = validate_instant(query_text)
                await _flush_events(ws, session_id)

                if guard.fast_reply:
                    await ws.send_text(json.dumps({
                        "type": "final", "session_id": session_id,
                        "answer": guard.fast_reply, "severity": "LOW",
                        "docs": [], "needs_human": False,
                    }))
                    continue
                if not guard.ok:
                    await ws.send_text(json.dumps({
                        "type": "guard_block", "detail": guard.reason, "severity": guard.severity,
                    }))
                    continue

                # ── Step 2: Cache lookup — BEFORE domain check ──
                await ws.send_text(json.dumps({"type": "node_update", "node": "cache_lookup"}))
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

                # ── Step 3: Domain check — only on cache miss ──
                await ws.send_text(json.dumps({"type": "node_update", "node": "domain_check"}))
                domain = await asyncio.to_thread(validate_domain, query_text)
                await _flush_events(ws, session_id)
                if not domain.ok:
                    await ws.send_text(json.dumps({
                        "type": "guard_block", "detail": domain.reason, "severity": "LOW",
                    }))
                    continue

                # ── Step 4: Pipeline ──
                try:
                    chunks, final_state = await asyncio.to_thread(
                        _stream_graph_sync, query_text, session_id
                    )
                except Exception as e:
                    logger.exception("graph stream failed")
                    await ws.send_text(json.dumps({"type": "error", "detail": repr(e)}))
                    continue

                for chunk in chunks:
                    for node_name, update in chunk.items():
                        await ws.send_text(json.dumps({
                            "type": "node_update", "node": node_name,
                            "severity": (update or {}).get("severity"),
                            "intent":   (update or {}).get("intent"),
                        }))
                    await _flush_events(ws, session_id)

                await _flush_events(ws, session_id)

                answer   = final_state.get("final_answer") or ""
                severity = (final_state.get("severity") or "LOW").upper()
                docs     = [d.model_dump() for d in _docs_for_response(final_state.get("retrieved_docs", []))]
                payload  = {
                    "type": "final", "session_id": session_id,
                    "answer": answer, "severity": severity,
                    "docs": docs, "needs_human": bool(final_state.get("needs_human", False)),
                }
                await ws.send_text(json.dumps(payload))
                semantic_cache.store(query_text, {
                    "answer": answer, "severity": severity,
                    "docs": docs, "needs_human": payload["needs_human"],
                })

            finally:
                current_session_id.reset(token)
                event_bus.clear(session_id)

    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.exception("WebSocket loop error")
        try:
            await ws.send_text(json.dumps({"type": "error", "detail": repr(e)}))
        except Exception:
            pass


# ── HILT feedback ──────────────────────────────────────────────────────────
@router.post("/feedback")
async def feedback(req: FeedbackRequest) -> dict:
    feedback_store.add(session_id=req.session_id, message_id=req.message_id,
                       rating=req.rating, note=req.note)
    return {"ok": True}


@router.get("/feedback")
async def list_feedback(limit: int = 50) -> dict:
    items = feedback_store.list(limit=limit)
    return {"items": items, "count": len(items)}
