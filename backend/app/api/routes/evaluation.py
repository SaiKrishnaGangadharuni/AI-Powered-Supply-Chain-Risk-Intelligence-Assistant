"""Evaluation endpoints — user-triggered DeepEval + RAGAS runs."""
from __future__ import annotations

import asyncio
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.logging import logger

router = APIRouter()

# ---------------------------------------------------------------------------
# In-memory result store (persists for the lifetime of the process)
# ---------------------------------------------------------------------------
_results_store: Dict[str, Any] = {}


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class EvalRequest(BaseModel):
    tool: Literal["deepeval", "ragas", "both"] = "both"
    max_samples: int = Field(default=10, ge=1, le=50)
    model: str = "gpt-4o-mini"
    category: Optional[Literal["supplier_risk", "shipment", "inventory"]] = None
    offline: bool = Field(
        default=True,
        description=(
            "True = offline mode (uses golden ground truth as answer; no live pipeline call). "
            "False = live mode (routes questions through the RAG pipeline)."
        ),
    )


class MetricDetail(BaseModel):
    mean_score: float
    min_score: float
    max_score: float
    pass_rate: float
    threshold: float


class EvalResponse(BaseModel):
    tool: str
    metrics: Dict[str, Any]
    ran_at: Optional[str]
    elapsed_seconds: Optional[float]
    overall_pass_rate: Optional[float] = None
    overall_mean_score: Optional[float] = None
    status: str = "completed"


# ---------------------------------------------------------------------------
# Background runner
# ---------------------------------------------------------------------------

def _run_deepeval(request: EvalRequest) -> Dict[str, Any]:
    from app.evaluation.deepeval_metrics import run_full_suite
    pipeline_fn = None if request.offline else _get_pipeline_fn()
    return run_full_suite(
        pipeline_fn=pipeline_fn,
        model=request.model,
        max_samples=request.max_samples,
        category=request.category,
    )


def _run_ragas(request: EvalRequest) -> Dict[str, Any]:
    from app.evaluation.ragas_metrics import run_full_suite
    pipeline_fn = None if request.offline else _get_pipeline_fn()
    return run_full_suite(
        pipeline_fn=pipeline_fn,
        model=request.model,
        max_samples=request.max_samples,
        category=request.category,
    )


def _get_pipeline_fn():
    """Return a callable that routes a question through the live RAG pipeline."""
    async def pipeline_fn(question: str) -> Dict[str, Any]:
        # Import here to avoid circular dependency
        from app.agents.orchestrator import run_pipeline  # noqa: F401
        # Placeholder: replace run_pipeline with actual graph invocation
        # Expected return: {"answer": str, "contexts": list[str]}
        raise NotImplementedError(
            "Live pipeline_fn not wired. Set offline=True or implement run_pipeline."
        )
    return pipeline_fn


def _background_eval(job_id: str, request: EvalRequest):
    """Run evaluation in a background thread and store results."""
    _results_store[job_id] = {"status": "running", "tool": request.tool}
    try:
        results = {}
        if request.tool in ("deepeval", "both"):
            logger.info(f"[EvalRoute] Starting DeepEval job {job_id}")
            results["deepeval"] = _run_deepeval(request)

        if request.tool in ("ragas", "both"):
            logger.info(f"[EvalRoute] Starting RAGAS job {job_id}")
            results["ragas"] = _run_ragas(request)

        _results_store[job_id] = {
            "status": "completed",
            "results": results,
            "tool": request.tool,
        }
        logger.info(f"[EvalRoute] Job {job_id} completed")
    except Exception as exc:
        logger.error(f"[EvalRoute] Job {job_id} failed: {exc}")
        _results_store[job_id] = {
            "status": "failed",
            "error": str(exc),
            "tool": request.tool,
        }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/latest")
async def latest() -> Dict[str, Any]:
    """Return the most recent completed evaluation result."""
    completed = {
        k: v for k, v in _results_store.items()
        if v.get("status") == "completed"
    }
    if not completed:
        return {
            "metrics": {},
            "ran_at": None,
            "status": "no_results",
            "note": "No evaluations run yet. POST /api/evaluation/run to trigger.",
        }
    latest_key = sorted(completed.keys())[-1]
    return completed[latest_key]


@router.post("/run")
async def run_evaluation(
    request: EvalRequest,
    background_tasks: BackgroundTasks,
) -> Dict[str, Any]:
    """
    Trigger a DeepEval and/or RAGAS evaluation run.

    Runs asynchronously in the background. Poll /status/{job_id} for progress.
    """
    import uuid
    job_id = str(uuid.uuid4())[:8]
    _results_store[job_id] = {"status": "queued", "tool": request.tool}

    background_tasks.add_task(_background_eval, job_id, request)

    logger.info(f"[EvalRoute] Queued eval job {job_id}: tool={request.tool}, samples={request.max_samples}")
    return {
        "job_id": job_id,
        "status": "queued",
        "tool": request.tool,
        "max_samples": request.max_samples,
        "offline": request.offline,
        "poll_url": f"/api/evaluation/status/{job_id}",
    }


@router.get("/status/{job_id}")
async def job_status(job_id: str) -> Dict[str, Any]:
    """Poll the status of a background evaluation job."""
    if job_id not in _results_store:
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return _results_store[job_id]


@router.get("/golden")
async def golden_dataset(
    limit: int = Query(default=10, ge=1, le=50),
    category: Optional[str] = Query(default=None),
) -> Dict[str, Any]:
    """Return a sample of the golden dataset for inspection."""
    from app.evaluation.deepeval_metrics import load_golden_dataset
    data = load_golden_dataset(category=category)[:limit]
    return {"count": len(data), "items": data}


@router.get("/metrics/config")
async def metrics_config() -> Dict[str, Any]:
    """Return configured metric thresholds."""
    from app.evaluation.deepeval_metrics import METRIC_THRESHOLDS as DE_THRESH
    from app.evaluation.ragas_metrics import METRIC_THRESHOLDS as RG_THRESH
    return {
        "deepeval": DE_THRESH,
        "ragas": RG_THRESH,
    }
