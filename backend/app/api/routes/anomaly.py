"""Anomaly correlation analysis endpoints."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.logging import logger

router = APIRouter()

# DataCo path relative to repo root
_REPO_ROOT = Path(__file__).resolve().parents[4]
_DATACO_PATH = (
    _REPO_ROOT
    / "data"
    / "source_dataset"
    / "DataCo SMART SUPPLY CHAIN FOR BIG DATA ANALYSIS"
    / "DataCoSupplyChainDataset.csv"
)
_FASHION_PATH = _REPO_ROOT / "data" / "source_dataset" / "supply_chain_data.csv"


def _resolve_csv() -> str:
    if _DATACO_PATH.exists():
        return str(_DATACO_PATH)
    if _FASHION_PATH.exists():
        logger.warning("[Anomaly] DataCo CSV not found; falling back to Fashion dataset")
        return str(_FASHION_PATH)
    raise FileNotFoundError(
        f"No dataset found. Expected: {_DATACO_PATH} or {_FASHION_PATH}"
    )


class AnomalyRequest(BaseModel):
    sample_n: int = Field(default=5000, ge=100, le=50000)
    category_filter: Optional[str] = Field(
        default=None,
        description="Optional category name to filter analysis (DataCo Category Name field)"
    )
    min_segment_orders: int = Field(
        default=50,
        description="Minimum orders in a segment to include in analysis"
    )


@router.post("/run")
async def run_anomaly_detection(request: AnomalyRequest) -> Dict[str, Any]:
    """
    Run the full anomaly correlation analysis on the DataCo dataset.

    Detects: late delivery spikes, shipping gap outliers, cancellation surges,
    fraud clusters, profit erosion, demand spikes. Correlates anomalies by segment.
    """
    try:
        csv_path = _resolve_csv()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    try:
        import pandas as pd
        from app.services.anomaly import AnomalyDetector, load_dataco

        logger.info(f"[Anomaly] Loading dataset from {csv_path}, sample_n={request.sample_n}")
        df = load_dataco(csv_path, sample_n=request.sample_n)

        if request.category_filter and "Category Name" in df.columns:
            df = df[df["Category Name"] == request.category_filter]
            if df.empty:
                raise HTTPException(
                    status_code=404,
                    detail=f"No data for Category Name='{request.category_filter}'"
                )

        custom_thresholds = {"min_segment_orders": request.min_segment_orders}
        detector = AnomalyDetector(df, thresholds=custom_thresholds)
        report = detector.run_all()

        if hasattr(report, "to_dict"):
            return report.to_dict()
        return report

    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[Anomaly] Detection failed: {exc}")
        raise HTTPException(status_code=500, detail=f"Anomaly detection failed: {exc}")


@router.get("/summary")
async def anomaly_summary(
    sample_n: int = Query(default=2000, ge=100, le=20000)
) -> Dict[str, Any]:
    """
    Quick anomaly summary — runs analysis and returns only HIGH severity anomalies + stats.
    Faster than /run (smaller sample).
    """
    try:
        csv_path = _resolve_csv()
    except FileNotFoundError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    try:
        from app.services.anomaly import AnomalyDetector, load_dataco

        df = load_dataco(csv_path, sample_n=sample_n)
        detector = AnomalyDetector(df)
        report = detector.run_all()

        full = report.to_dict() if hasattr(report, "to_dict") else report
        high_only = [a for a in full.get("anomalies", []) if a["severity"] == "HIGH"]

        return {
            "total_orders_analyzed": full.get("total_orders_analyzed"),
            "anomaly_count": full.get("anomaly_count"),
            "summary": full.get("summary"),
            "high_severity_anomalies": high_only,
            "correlated_risks": full.get("correlated_risks", []),
            "run_timestamp": full.get("run_timestamp"),
        }
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"[Anomaly] Summary failed: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/types")
async def anomaly_types() -> Dict[str, Any]:
    """Return supported anomaly types and their configured thresholds."""
    from app.services.anomaly import THRESHOLDS
    return {
        "anomaly_types": [
            "late_delivery_spike",
            "shipping_gap_outlier",
            "cancellation_surge",
            "fraud_cluster",
            "profit_erosion",
            "demand_spike",
        ],
        "thresholds": THRESHOLDS,
    }
