"""Ingestion endpoints — trigger pipeline + status."""
from __future__ import annotations

from threading import Thread
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.config import settings
from app.ingestion import kaggle_mcp, pipeline
from app.ingestion.file_registry import file_registry
from app.ingestion.pipeline import status_store

router = APIRouter()

SUPPORTED_EXTENSIONS = {".csv", ".tsv", ".xlsx", ".xls", ".json", ".parquet"}


class RunRequest(BaseModel):
    dataset: Literal["dataco", "fashion"] = "dataco"
    source: Literal["kaggle_mcp", "local", "auto"] = "auto"
    reset: bool = False
    custom_csv_path: str = ""


@router.get("/list-sources")
async def list_sources() -> dict:
    """List all supported files in data/source_dataset, with loaded status."""
    from pathlib import Path
    base = settings.resolve("./data/source_dataset")
    loaded = file_registry.all()
    items = []
    if base.exists():
        for p in sorted(base.rglob("*")):
            if p.is_file() and p.suffix.lower() in SUPPORTED_EXTENSIONS:
                rel = str(p.relative_to(base)).replace("\\", "/")
                info = loaded.get(rel)
                items.append({
                    "name": p.name,
                    "path": rel,
                    "ext": p.suffix.lower(),
                    "folder": str(p.parent.relative_to(base)).replace("\\", "/") if p.parent != base else "",
                    "size_mb": round(p.stat().st_size / 1_048_576, 2),
                    "loaded": info is not None,
                    "loaded_docs": info.get("docs", 0) if info else 0,
                    "loaded_rows": info.get("rows", 0) if info else 0,
                })
    return {"base": str(base), "files": items}


@router.get("/status")
async def status() -> dict:
    return pipeline.status_snapshot()


@router.get("/mcp-health")
async def mcp_health() -> dict:
    ok = kaggle_mcp.is_available()
    return {"mcp_available": ok}


@router.post("/run")
async def run(req: RunRequest) -> dict:
    current = status_store.get()
    if current.state == "running":
        raise HTTPException(status_code=409, detail="Pipeline already running")

    def _runner():
        pipeline.run_pipeline(
            dataset=req.dataset,
            source=req.source,
            reset=req.reset,
            custom_csv_path=req.custom_csv_path or None,
        )

    Thread(target=_runner, daemon=True).start()
    return {"started": True, "dataset": req.dataset, "source": req.source}


@router.post("/clear")
async def clear_vector_db() -> dict:
    import asyncio
    from app.retrieval.vector_store import VectorStore
    from app.retrieval.bm25_index import BM25Index

    def _do_clear():
        VectorStore().reset()
        BM25Index().build(ids=[], documents=[], metadatas=[])
        file_registry.clear_all()

    await asyncio.to_thread(_do_clear)
    status_store.set(pipeline.PipelineStatus(state="idle"))
    return {"cleared": True, "message": "ChromaDB collection, BM25 index, and file registry cleared"}
