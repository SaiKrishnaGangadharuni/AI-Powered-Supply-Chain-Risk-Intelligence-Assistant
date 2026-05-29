"""
Anomaly Correlation Analysis Module

Detects and correlates supply chain anomalies from DataCo-style data.

Anomaly types detected:
  1. Late delivery spikes       — Late_delivery_risk rate exceeds threshold
  2. Shipping day gap outliers  — real vs scheduled days z-score > 2.5
  3. Order cancellation surges  — cancellation rate by market/mode
  4. Fraud cluster detection    — SUSPECTED_FRAUD spatial-temporal clustering
  5. Profit erosion signals     — Order Profit Per Order negative trend
  6. Inventory demand spikes    — Order Item Quantity z-score by category

Usage:
    from app.services.anomaly import AnomalyDetector
    detector = AnomalyDetector(df)
    results = detector.run_all()
"""
from __future__ import annotations

import json
import warnings
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore", category=FutureWarning)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class Anomaly:
    anomaly_id: str
    anomaly_type: str
    severity: str          # HIGH / MEDIUM / LOW
    description: str
    affected_segment: str  # e.g. "Market=LATAM, Shipping Mode=Standard Class"
    metric_value: float
    threshold: float
    confidence: float      # 0-1
    recommendation: str
    supporting_data: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "anomaly_id": self.anomaly_id,
            "anomaly_type": self.anomaly_type,
            "severity": self.severity,
            "description": self.description,
            "affected_segment": self.affected_segment,
            "metric_value": round(float(self.metric_value), 4),
            "threshold": round(float(self.threshold), 4),
            "confidence": round(float(self.confidence), 4),
            "recommendation": self.recommendation,
            "supporting_data": self.supporting_data,
        }


@dataclass
class AnomalyReport:
    anomalies: List[Anomaly]
    total_orders_analyzed: int
    anomaly_rate: float
    run_timestamp: str
    summary: Dict[str, int]  # count by severity

    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_orders_analyzed": self.total_orders_analyzed,
            "anomaly_count": len(self.anomalies),
            "anomaly_rate": round(self.anomaly_rate, 4),
            "run_timestamp": self.run_timestamp,
            "summary": self.summary,
            "anomalies": [a.to_dict() for a in self.anomalies],
        }


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

THRESHOLDS = {
    "late_delivery_rate": 0.40,       # flag if > 40% late in a segment
    "shipping_gap_zscore": 2.5,       # z-score threshold for gap outlier
    "cancellation_rate": 0.15,        # flag if > 15% canceled
    "fraud_rate": 0.02,               # flag if > 2% suspected fraud
    "profit_negative_rate": 0.30,     # flag if > 30% orders have negative profit
    "quantity_zscore": 2.5,           # z-score for demand spike
    "min_segment_orders": 50,         # ignore segments with < 50 orders
}

SEVERITY_MAP = {
    "late_delivery_spike": lambda rate: "HIGH" if rate > 0.6 else "MEDIUM",
    "shipping_gap_outlier": lambda z: "HIGH" if z > 3.5 else "MEDIUM",
    "cancellation_surge": lambda rate: "HIGH" if rate > 0.25 else "MEDIUM",
    "fraud_cluster": lambda rate: "HIGH" if rate > 0.05 else "MEDIUM",
    "profit_erosion": lambda rate: "HIGH" if rate > 0.50 else "MEDIUM" if rate > 0.30 else "LOW",
    "demand_spike": lambda z: "MEDIUM" if z > 3.0 else "LOW",
}


# ---------------------------------------------------------------------------
# Detector
# ---------------------------------------------------------------------------

class AnomalyDetector:
    """
    Detects and correlates anomalies in a DataCo-style supply chain DataFrame.

    Required columns (subset used):
      - Late_delivery_risk (0/1)
      - Days for shipping (real)
      - Days for shipment (scheduled)
      - Order Status
      - Market
      - Shipping Mode
      - Order Profit Per Order
      - Order Item Quantity
      - Category Name
      - Order Region (optional)
    """

    def __init__(self, df: pd.DataFrame, thresholds: Optional[Dict] = None):
        self.df = df.copy()
        self.thresholds = {**THRESHOLDS, **(thresholds or {})}
        self._preprocess()
        self._counter = 0

    def _preprocess(self):
        df = self.df
        # Normalise column names
        df.columns = [c.strip() for c in df.columns]

        # Shipping day gap
        real_col = "Days for shipping (real)"
        sched_col = "Days for shipment (scheduled)"
        if real_col in df.columns and sched_col in df.columns:
            df["_day_gap"] = pd.to_numeric(df[real_col], errors="coerce") - \
                             pd.to_numeric(df[sched_col], errors="coerce")
        else:
            df["_day_gap"] = np.nan

        # Numeric coercions
        if "Late_delivery_risk" in df.columns:
            df["Late_delivery_risk"] = pd.to_numeric(df["Late_delivery_risk"], errors="coerce").fillna(0)
        if "Order Profit Per Order" in df.columns:
            df["Order Profit Per Order"] = pd.to_numeric(df["Order Profit Per Order"], errors="coerce")
        if "Order Item Quantity" in df.columns:
            df["Order Item Quantity"] = pd.to_numeric(df["Order Item Quantity"], errors="coerce")

        self.df = df

    def _next_id(self, prefix: str) -> str:
        self._counter += 1
        return f"{prefix}_{self._counter:04d}"

    # -----------------------------------------------------------------------
    # 1. Late delivery spike detection
    # -----------------------------------------------------------------------
    def detect_late_delivery_spikes(self) -> List[Anomaly]:
        anomalies = []
        if "Late_delivery_risk" not in self.df.columns:
            return anomalies

        threshold = self.thresholds["late_delivery_rate"]
        min_n = self.thresholds["min_segment_orders"]

        for (market, mode), grp in self.df.groupby(
            ["Market", "Shipping Mode"], observed=True
        ):
            if len(grp) < min_n:
                continue
            rate = grp["Late_delivery_risk"].mean()
            if rate > threshold:
                severity = SEVERITY_MAP["late_delivery_spike"](rate)
                anomalies.append(Anomaly(
                    anomaly_id=self._next_id("LDS"),
                    anomaly_type="late_delivery_spike",
                    severity=severity,
                    description=(
                        f"Late delivery rate {rate:.1%} exceeds {threshold:.1%} threshold "
                        f"for Market={market}, Shipping Mode={mode}"
                    ),
                    affected_segment=f"Market={market}, Shipping Mode={mode}",
                    metric_value=rate,
                    threshold=threshold,
                    confidence=min(1.0, len(grp) / 500),
                    recommendation=(
                        f"Audit carrier performance for {mode} routes in {market}. "
                        "Consider alternative carriers or upgraded shipping mode for critical orders."
                    ),
                    supporting_data={
                        "segment_order_count": int(len(grp)),
                        "late_orders": int(grp["Late_delivery_risk"].sum()),
                    },
                ))
        return anomalies

    # -----------------------------------------------------------------------
    # 2. Shipping day gap outliers (z-score)
    # -----------------------------------------------------------------------
    def detect_shipping_gap_outliers(self) -> List[Anomaly]:
        anomalies = []
        if "_day_gap" not in self.df.columns or self.df["_day_gap"].isna().all():
            return anomalies

        gap_series = self.df["_day_gap"].dropna()
        if len(gap_series) < 30:
            return anomalies

        mean_gap = gap_series.mean()
        std_gap = gap_series.std()
        if std_gap == 0:
            return anomalies

        threshold_z = self.thresholds["shipping_gap_zscore"]
        min_n = self.thresholds["min_segment_orders"]

        for mode, grp in self.df.groupby("Shipping Mode", observed=True):
            if len(grp) < min_n:
                continue
            grp_gap = grp["_day_gap"].dropna()
            if grp_gap.empty:
                continue
            seg_mean = grp_gap.mean()
            z = (seg_mean - mean_gap) / std_gap if std_gap > 0 else 0
            if z > threshold_z:
                severity = SEVERITY_MAP["shipping_gap_outlier"](z)
                anomalies.append(Anomaly(
                    anomaly_id=self._next_id("SGO"),
                    anomaly_type="shipping_gap_outlier",
                    severity=severity,
                    description=(
                        f"Shipping mode '{mode}' has avg day gap {seg_mean:.1f} days "
                        f"(z={z:.2f}) vs overall mean {mean_gap:.1f}"
                    ),
                    affected_segment=f"Shipping Mode={mode}",
                    metric_value=float(seg_mean),
                    threshold=float(mean_gap + threshold_z * std_gap),
                    confidence=min(1.0, len(grp) / 300),
                    recommendation=(
                        f"Review carrier SLAs for '{mode}'. "
                        "Investigate root cause of extended transit times."
                    ),
                    supporting_data={
                        "segment_avg_gap": round(float(seg_mean), 2),
                        "overall_avg_gap": round(float(mean_gap), 2),
                        "z_score": round(float(z), 3),
                        "segment_order_count": int(len(grp)),
                    },
                ))
        return anomalies

    # -----------------------------------------------------------------------
    # 3. Cancellation surge
    # -----------------------------------------------------------------------
    def detect_cancellation_surges(self) -> List[Anomaly]:
        anomalies = []
        if "Order Status" not in self.df.columns:
            return anomalies

        threshold = self.thresholds["cancellation_rate"]
        min_n = self.thresholds["min_segment_orders"]

        self.df["_is_canceled"] = (self.df["Order Status"] == "CANCELED").astype(int)

        for market, grp in self.df.groupby("Market", observed=True):
            if len(grp) < min_n:
                continue
            rate = grp["_is_canceled"].mean()
            if rate > threshold:
                severity = SEVERITY_MAP["cancellation_surge"](rate)
                anomalies.append(Anomaly(
                    anomaly_id=self._next_id("CAS"),
                    anomaly_type="cancellation_surge",
                    severity=severity,
                    description=(
                        f"Cancellation rate {rate:.1%} exceeds {threshold:.1%} threshold "
                        f"for Market={market}"
                    ),
                    affected_segment=f"Market={market}",
                    metric_value=rate,
                    threshold=threshold,
                    confidence=min(1.0, len(grp) / 500),
                    recommendation=(
                        f"Investigate cancellation drivers in {market}. "
                        "Check for shipping delays, out-of-stock events, or payment failures."
                    ),
                    supporting_data={
                        "canceled_orders": int(grp["_is_canceled"].sum()),
                        "total_orders": int(len(grp)),
                    },
                ))
        return anomalies

    # -----------------------------------------------------------------------
    # 4. Fraud cluster detection
    # -----------------------------------------------------------------------
    def detect_fraud_clusters(self) -> List[Anomaly]:
        anomalies = []
        if "Order Status" not in self.df.columns:
            return anomalies

        threshold = self.thresholds["fraud_rate"]
        min_n = self.thresholds["min_segment_orders"]

        self.df["_is_fraud"] = (self.df["Order Status"] == "SUSPECTED_FRAUD").astype(int)

        for (market, region), grp in self.df.groupby(
            ["Market", "Order Region"] if "Order Region" in self.df.columns else ["Market", "Market"],
            observed=True
        ):
            if len(grp) < min_n:
                continue
            rate = grp["_is_fraud"].mean()
            if rate > threshold:
                severity = SEVERITY_MAP["fraud_cluster"](rate)
                segment = f"Market={market}, Region={region}" if region != market else f"Market={market}"
                anomalies.append(Anomaly(
                    anomaly_id=self._next_id("FRC"),
                    anomaly_type="fraud_cluster",
                    severity=severity,
                    description=(
                        f"Suspected fraud rate {rate:.2%} exceeds {threshold:.2%} threshold "
                        f"for {segment}"
                    ),
                    affected_segment=segment,
                    metric_value=rate,
                    threshold=threshold,
                    confidence=min(1.0, len(grp) / 200),
                    recommendation=(
                        f"Escalate {segment} for fraud review. "
                        "Implement additional verification for new orders in this segment."
                    ),
                    supporting_data={
                        "fraud_orders": int(grp["_is_fraud"].sum()),
                        "total_orders": int(len(grp)),
                    },
                ))
        return anomalies

    # -----------------------------------------------------------------------
    # 5. Profit erosion signals
    # -----------------------------------------------------------------------
    def detect_profit_erosion(self) -> List[Anomaly]:
        anomalies = []
        if "Order Profit Per Order" not in self.df.columns:
            return anomalies

        threshold = self.thresholds["profit_negative_rate"]
        min_n = self.thresholds["min_segment_orders"]

        self.df["_is_loss"] = (self.df["Order Profit Per Order"] < 0).astype(int)

        group_col = "Category Name" if "Category Name" in self.df.columns else "Shipping Mode"
        for segment_val, grp in self.df.groupby(group_col, observed=True):
            if len(grp) < min_n:
                continue
            rate = grp["_is_loss"].mean()
            if rate > threshold:
                avg_profit = grp["Order Profit Per Order"].mean()
                severity = SEVERITY_MAP["profit_erosion"](rate)
                anomalies.append(Anomaly(
                    anomaly_id=self._next_id("PRF"),
                    anomaly_type="profit_erosion",
                    severity=severity,
                    description=(
                        f"{rate:.1%} of orders in {group_col}='{segment_val}' are loss-making. "
                        f"Avg profit: {avg_profit:.2f}"
                    ),
                    affected_segment=f"{group_col}={segment_val}",
                    metric_value=rate,
                    threshold=threshold,
                    confidence=min(1.0, len(grp) / 500),
                    recommendation=(
                        f"Cost audit required for '{segment_val}'. "
                        "Review pricing, discount rates, and fulfillment cost structure."
                    ),
                    supporting_data={
                        "avg_profit": round(float(avg_profit), 2),
                        "loss_order_count": int(grp["_is_loss"].sum()),
                        "total_orders": int(len(grp)),
                    },
                ))
        return anomalies

    # -----------------------------------------------------------------------
    # 6. Demand (quantity) spikes
    # -----------------------------------------------------------------------
    def detect_demand_spikes(self) -> List[Anomaly]:
        anomalies = []
        if "Order Item Quantity" not in self.df.columns:
            return anomalies

        threshold_z = self.thresholds["quantity_zscore"]
        min_n = self.thresholds["min_segment_orders"]

        qty_series = self.df["Order Item Quantity"].dropna()
        if len(qty_series) < 30:
            return anomalies

        mean_qty = qty_series.mean()
        std_qty = qty_series.std()
        if std_qty == 0:
            return anomalies

        group_col = "Category Name" if "Category Name" in self.df.columns else "Shipping Mode"
        for segment_val, grp in self.df.groupby(group_col, observed=True):
            grp_qty = grp["Order Item Quantity"].dropna()
            if len(grp_qty) < min_n:
                continue
            seg_mean = grp_qty.mean()
            z = (seg_mean - mean_qty) / std_qty
            if z > threshold_z:
                severity = SEVERITY_MAP["demand_spike"](z)
                anomalies.append(Anomaly(
                    anomaly_id=self._next_id("DMS"),
                    anomaly_type="demand_spike",
                    severity=severity,
                    description=(
                        f"Order quantity spike in '{segment_val}': avg {seg_mean:.1f} units "
                        f"(z={z:.2f}) vs overall {mean_qty:.1f}"
                    ),
                    affected_segment=f"{group_col}={segment_val}",
                    metric_value=float(seg_mean),
                    threshold=float(mean_qty + threshold_z * std_qty),
                    confidence=min(1.0, len(grp_qty) / 300),
                    recommendation=(
                        f"Verify inventory levels for '{segment_val}'. "
                        "Demand spike may indicate pre-positioning or promotional surge."
                    ),
                    supporting_data={
                        "segment_avg_qty": round(float(seg_mean), 2),
                        "overall_avg_qty": round(float(mean_qty), 2),
                        "z_score": round(float(z), 3),
                        "segment_order_count": int(len(grp_qty)),
                    },
                ))
        return anomalies

    # -----------------------------------------------------------------------
    # Correlation analysis
    # -----------------------------------------------------------------------
    def correlate_anomalies(self, anomalies: List[Anomaly]) -> List[Dict[str, Any]]:
        """
        Find anomalies that share the same affected segment — these are correlated
        and represent compound risk requiring priority attention.
        """
        from collections import defaultdict
        segment_map: Dict[str, List[Anomaly]] = defaultdict(list)
        for a in anomalies:
            segment_map[a.affected_segment].append(a)

        correlations = []
        for segment, items in segment_map.items():
            if len(items) > 1:
                correlations.append({
                    "segment": segment,
                    "correlated_anomaly_ids": [a.anomaly_id for a in items],
                    "anomaly_types": [a.anomaly_type for a in items],
                    "max_severity": max(
                        items, key=lambda x: {"HIGH": 3, "MEDIUM": 2, "LOW": 1}[x.severity]
                    ).severity,
                    "compound_risk": True,
                    "note": (
                        f"{len(items)} anomaly types detected in the same segment — "
                        "compound risk; escalate for immediate review."
                    ),
                })
        return sorted(correlations, key=lambda x: {"HIGH": 3, "MEDIUM": 2, "LOW": 1}[x["max_severity"]], reverse=True)

    # -----------------------------------------------------------------------
    # Full pipeline
    # -----------------------------------------------------------------------
    def run_all(self) -> AnomalyReport:
        """Run all detectors and return an AnomalyReport."""
        import time
        all_anomalies: List[Anomaly] = []

        all_anomalies.extend(self.detect_late_delivery_spikes())
        all_anomalies.extend(self.detect_shipping_gap_outliers())
        all_anomalies.extend(self.detect_cancellation_surges())
        all_anomalies.extend(self.detect_fraud_clusters())
        all_anomalies.extend(self.detect_profit_erosion())
        all_anomalies.extend(self.detect_demand_spikes())

        # Sort: HIGH first, then MEDIUM, then LOW
        severity_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
        all_anomalies.sort(key=lambda a: severity_order.get(a.severity, 3))

        summary = {"HIGH": 0, "MEDIUM": 0, "LOW": 0}
        for a in all_anomalies:
            summary[a.severity] = summary.get(a.severity, 0) + 1

        correlations = self.correlate_anomalies(all_anomalies)

        report = AnomalyReport(
            anomalies=all_anomalies,
            total_orders_analyzed=len(self.df),
            anomaly_rate=len(all_anomalies) / max(len(self.df), 1),
            run_timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            summary=summary,
        )

        # Attach correlations to report dict
        report_dict = report.to_dict()
        report_dict["correlated_risks"] = correlations
        return report


# ---------------------------------------------------------------------------
# Convenience loader for DataCo CSV
# ---------------------------------------------------------------------------

def load_dataco(path: str, sample_n: int = 5000) -> pd.DataFrame:
    """Load DataCo CSV with latin1 encoding, return a random sample."""
    df = pd.read_csv(path, encoding="latin1", low_memory=False)
    if sample_n and len(df) > sample_n:
        df = df.sample(n=sample_n, random_state=42).reset_index(drop=True)
    return df


def run_anomaly_analysis(csv_path: str, sample_n: int = 5000) -> Dict[str, Any]:
    """Top-level function: load DataCo CSV, run anomaly detection, return dict."""
    df = load_dataco(csv_path, sample_n=sample_n)
    detector = AnomalyDetector(df)
    report = detector.run_all()
    # run_all returns either AnomalyReport or dict (see correlations patch)
    if isinstance(report, AnomalyReport):
        return report.to_dict()
    return report
