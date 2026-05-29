"""Analytics endpoints — pre-aggregated supply chain metrics for the dashboard."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter, HTTPException
from app.core.logging import logger

router = APIRouter()

_REPO_ROOT = Path(__file__).resolve().parents[4]
_DATACO_PATH = (
    _REPO_ROOT
    / "data" / "source_dataset"
    / "DataCo SMART SUPPLY CHAIN FOR BIG DATA ANALYSIS"
    / "DataCoSupplyChainDataset.csv"
)
_FASHION_PATH = _REPO_ROOT / "data" / "source_dataset" / "supply_chain_data.csv"


def _resolve_csv() -> str:
    if _DATACO_PATH.exists():
        return str(_DATACO_PATH)
    if _FASHION_PATH.exists():
        return str(_FASHION_PATH)
    raise FileNotFoundError("No dataset CSV found.")


def _load_df(sample_n: int = 10000):
    import pandas as pd
    path = _resolve_csv()
    df = pd.read_csv(path, encoding="latin-1", low_memory=False)
    if len(df) > sample_n:
        df = df.sample(n=sample_n, random_state=42)
    return df


@router.get("/summary")
async def analytics_summary() -> Dict[str, Any]:
    """Top-level KPIs for the dashboard header cards."""
    try:
        df = _load_df(10000)

        total_orders = len(df)

        late_col = "Late_delivery_risk"
        late_rate = round(df[late_col].mean() * 100, 1) if late_col in df.columns else 0.0

        fraud_col = "Order Status"
        fraud_rate = 0.0
        if fraud_col in df.columns:
            fraud_rate = round(
                (df[fraud_col].str.upper() == "SUSPECTED_FRAUD").mean() * 100, 2
            )

        cancel_rate = 0.0
        if fraud_col in df.columns:
            cancel_rate = round(
                (df[fraud_col].str.upper() == "CANCELED").mean() * 100, 1
            )

        profit_col = "Order Profit Per Order"
        avg_profit = 0.0
        if profit_col in df.columns:
            avg_profit = round(float(df[profit_col].mean()), 2)

        return {
            "total_orders": total_orders,
            "late_delivery_rate_pct": late_rate,
            "fraud_rate_pct": fraud_rate,
            "cancellation_rate_pct": cancel_rate,
            "avg_profit_per_order": avg_profit,
        }
    except Exception as e:
        logger.error(f"[Analytics] summary failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/late-delivery-by-market")
async def late_delivery_by_market() -> Dict[str, Any]:
    """Late delivery rate (%) broken down by Market."""
    try:
        df = _load_df(15000)
        if "Market" not in df.columns or "Late_delivery_risk" not in df.columns:
            return {"data": []}

        grp = (
            df.groupby("Market")["Late_delivery_risk"]
            .agg(["mean", "count"])
            .reset_index()
        )
        grp.columns = ["market", "late_rate", "order_count"]
        grp["late_rate"] = (grp["late_rate"] * 100).round(1)
        grp = grp.sort_values("late_rate", ascending=False)
        return {"data": grp.to_dict(orient="records")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/shipment-mode-breakdown")
async def shipment_mode_breakdown() -> Dict[str, Any]:
    """Order count and late rate by Shipping Mode."""
    try:
        df = _load_df(15000)
        if "Shipping Mode" not in df.columns:
            return {"data": []}

        grp = df.groupby("Shipping Mode").agg(
            order_count=("Shipping Mode", "count"),
            late_rate=("Late_delivery_risk", "mean"),
        ).reset_index()
        grp.columns = ["shipping_mode", "order_count", "late_rate"]
        grp["late_rate"] = (grp["late_rate"] * 100).round(1)
        grp = grp.sort_values("order_count", ascending=False)
        return {"data": grp.to_dict(orient="records")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/order-status-distribution")
async def order_status_distribution() -> Dict[str, Any]:
    """Count of orders by Order Status."""
    try:
        df = _load_df(15000)
        if "Order Status" not in df.columns:
            return {"data": []}

        grp = df["Order Status"].value_counts().reset_index()
        grp.columns = ["status", "count"]
        return {"data": grp.to_dict(orient="records")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/delivery-gap-by-region")
async def delivery_gap_by_region() -> Dict[str, Any]:
    """Average (real - scheduled) shipping day gap by Order Region."""
    try:
        df = _load_df(15000)
        real_col = "Days for shipping (real)"
        sched_col = "Days for shipment (scheduled)"
        region_col = "Order Region"

        if not all(c in df.columns for c in [real_col, sched_col, region_col]):
            return {"data": []}

        df["gap"] = df[real_col] - df[sched_col]
        grp = (
            df.groupby(region_col)["gap"]
            .agg(["mean", "count"])
            .reset_index()
        )
        grp.columns = ["region", "avg_gap_days", "order_count"]
        grp["avg_gap_days"] = grp["avg_gap_days"].round(2)
        grp = grp.sort_values("avg_gap_days", ascending=False).head(12)
        return {"data": grp.to_dict(orient="records")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fraud-by-market")
async def fraud_by_market() -> Dict[str, Any]:
    """Fraud order count and rate by Market."""
    try:
        df = _load_df(15000)
        if "Market" not in df.columns or "Order Status" not in df.columns:
            return {"data": []}

        df["is_fraud"] = (df["Order Status"].str.upper() == "SUSPECTED_FRAUD").astype(int)
        grp = df.groupby("Market").agg(
            fraud_count=("is_fraud", "sum"),
            total=("is_fraud", "count"),
        ).reset_index()
        grp["fraud_rate"] = (grp["fraud_count"] / grp["total"] * 100).round(2)
        return {"data": grp.to_dict(orient="records")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
