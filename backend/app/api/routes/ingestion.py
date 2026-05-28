"""Ingestion endpoints — trigger pipeline + status."""
from __future__ import annotations

from threading import Thread
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.ingestion import kaggle_mcp, pipeline
from app.ingestion.pipeline import status_store

router = APIRouter()


class RunRequest(BaseModel):
    dataset: Literal["dataco", "fashion"] = "dataco"
    source: Literal["kaggle_mcp", "local", "auto"] = "auto"
    reset: bool = False


@router.get("/status")
async def status() -> dict:
    """Snapshot of the current pipeline run (or last one)."""
    return pipeline.status_snapshot()


@router.get("/mcp-health")
async def mcp_health() -> dict:
    """Quick liveness probe for the MCP server."""
    ok = kaggle_mcp.is_available()
    return {"mcp_available": ok}


@router.post("/run")
async def run(req: RunRequest) -> dict:
    """Kick off the pipeline in a background thread; returns immediately."""
    current = status_store.get()
    if current.state == "running":
        raise HTTPException(status_code=409, detail="Pipeline already running")

    def _runner():
        pipeline.run_pipeline(
            dataset=req.dataset,
            source=req.source,
            reset=req.reset,
        )

    Thread(target=_runner, daemon=True).start()
    return {"started": True, "dataset": req.dataset, "source": req.source}
