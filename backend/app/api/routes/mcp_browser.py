"""Admin-facing endpoints that wrap the Kaggle MCP tools for the UI browser."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.config import settings
from app.core.logging import logger
from app.ingestion import kaggle_mcp

router = APIRouter()


class DownloadRequest(BaseModel):
    slug: str
    dest_dir: Optional[str] = None


@router.get("/health")
async def health() -> dict:
    return {"mcp_available": kaggle_mcp.is_available()}


@router.get("/list-files")
async def list_files(slug: str) -> dict:
    try:
        files = kaggle_mcp.list_files(slug)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"MCP list-files failed: {e!r}")
        raise HTTPException(status_code=502, detail=f"MCP tool failed: {e!r}")
    return {"slug": slug, "files": files, "count": len(files)}


@router.post("/download")
async def download(req: DownloadRequest) -> dict:
    dest = req.dest_dir or str(settings.resolve(f"./data/kaggle_cache/{req.slug.split('/')[-1]}"))
    try:
        payload = kaggle_mcp.fetch_dataset(req.slug, dest)
    except Exception as e:  # noqa: BLE001
        logger.warning(f"MCP fetch_dataset failed: {e!r}")
        raise HTTPException(status_code=502, detail=f"MCP tool failed: {e!r}")
    return payload
