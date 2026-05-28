"""Evaluation endpoints — module hooks; runs are user-triggered later."""
from __future__ import annotations

from fastapi import APIRouter

router = APIRouter()


@router.get("/latest")
async def latest() -> dict:
    """Return the most recent evaluation snapshot (placeholder until runs are wired)."""
    return {"metrics": {}, "ran_at": None, "note": "evaluation runs to be enabled on request"}
