"""Row → natural-language incident document transformer.

Each row becomes a short paragraph describing the order/shipment/supplier
state. These documents are what we embed + index for retrieval.
"""
from __future__ import annotations

import hashlib
from typing import Any, Dict, List

import pandas as pd

from app.core.logging import logger


# ---------------- helpers ----------------
def _s(v: Any, default: str = "unknown") -> str:
    if v is None:
        return default
    try:
        if pd.isna(v):
            return default
    except (TypeError, ValueError):
        pass
    return str(v).strip() or default


def _f(v: Any, default: float = 0.0) -> float:
    try:
        if pd.isna(v):
            return default
        return float(v)
    except (TypeError, ValueError):
        return default


def _i(v: Any, default: int = 0) -> int:
    try:
        if pd.isna(v):
            return default
        return int(float(v))
    except (TypeError, ValueError):
        return default


def _doc_id(prefix: str, *parts: Any) -> str:
    raw = f"{prefix}::" + "::".join(str(p) for p in parts)
    return hashlib.md5(raw.encode("utf-8")).hexdigest()[:16]


def _classify_severity(late_risk: int, profit: float, status: str) -> str:
    s = status.lower()
    if late_risk == 1 or "cancel" in s or "suspect" in s or profit < -50:
        return "HIGH"
    if "late" in s or profit < 0:
        return "MEDIUM"
    return "LOW"


# ---------------- DataCo transformer ----------------
def dataco_row_to_incident(row: pd.Series) -> Dict[str, Any]:
    """One DataCo order row → one incident document."""
    order_id = _i(row.get("Order Id"))
    product = _s(row.get("Product Name"))
    category = _s(row.get("Category Name"))
    department = _s(row.get("Department Name"))

    market = _s(row.get("Market"))
    region = _s(row.get("Order Region"))
    order_country = _s(row.get("Order Country"))
    order_city = _s(row.get("Order City"))
    customer_segment = _s(row.get("Customer Segment"))

    ship_mode = _s(row.get("Shipping Mode"))
    delivery_status = _s(row.get("Delivery Status"))
    order_status = _s(row.get("Order Status"))
    days_real = _i(row.get("Days for shipping (real)"))
    days_sched = _i(row.get("Days for shipment (scheduled)"))
    late_risk = _i(row.get("Late_delivery_risk"))

    order_date = _s(row.get("order date (DateOrders)"))
    ship_date = _s(row.get("shipping date (DateOrders)"))

    qty = _i(row.get("Order Item Quantity"))
    sales = _f(row.get("Sales"))
    discount = _f(row.get("Order Item Discount"))
    profit = _f(row.get("Order Profit Per Order"))
    profit_ratio = _f(row.get("Order Item Profit Ratio"))

    severity = _classify_severity(late_risk, profit, delivery_status)

    delay = days_real - days_sched
    delay_phrase = (
        f"Shipment took {days_real} days vs {days_sched} scheduled ({'+' if delay > 0 else ''}{delay} days)."
    )

    late_phrase = (
        "This order was flagged with late-delivery risk." if late_risk == 1
        else "No late-delivery risk was flagged."
    )

    profit_phrase = (
        f"Order generated profit of {profit:.2f} (ratio {profit_ratio:.2f}); "
        f"sales {sales:.2f}, discount {discount:.2f}."
    )

    text = (
        f"Order {order_id} placed on {order_date}, shipped on {ship_date}. "
        f"Product: {product} (category {category}, department {department}). "
        f"Customer segment {customer_segment}; destination {order_city}, {order_country} "
        f"(region {region}, market {market}). "
        f"Shipping mode: {ship_mode}. Delivery status: {delivery_status}. "
        f"Order status: {order_status}. {delay_phrase} {late_phrase} "
        f"Quantity {qty}. {profit_phrase} Severity: {severity}."
    )

    return {
        "id": _doc_id("dataco", order_id, _s(row.get("Order Item Id"))),
        "text": text,
        "metadata": {
            "source": "dataco",
            "order_id": order_id,
            "product": product,
            "category": category,
            "department": department,
            "market": market,
            "region": region,
            "order_country": order_country,
            "order_city": order_city,
            "customer_segment": customer_segment,
            "shipping_mode": ship_mode,
            "delivery_status": delivery_status,
            "order_status": order_status,
            "days_real": days_real,
            "days_scheduled": days_sched,
            "delay_days": delay,
            "late_delivery_risk": late_risk,
            "sales": sales,
            "profit": profit,
            "profit_ratio": profit_ratio,
            "severity": severity,
            "order_date": order_date,
            "ship_date": ship_date,
        },
    }


# ---------------- Fashion transformer ----------------
def fashion_row_to_incident(row: pd.Series) -> Dict[str, Any]:
    """One fashion-supply-chain row → one incident document."""
    sku = _s(row.get("SKU"))
    product_type = _s(row.get("Product type"))
    supplier = _s(row.get("Supplier name"))
    location = _s(row.get("Location"))

    price = _f(row.get("Price"))
    revenue = _f(row.get("Revenue generated"))
    stock = _i(row.get("Stock levels"))
    sold = _i(row.get("Number of products sold"))
    lead_time = _i(row.get("Lead times"))
    mfg_lead_time = _i(row.get("Manufacturing lead time"))
    shipping_time = _i(row.get("Shipping times"))
    shipping_cost = _f(row.get("Shipping costs"))
    carrier = _s(row.get("Shipping carriers"))
    defect_rate = _f(row.get("Defect rates"))
    inspection = _s(row.get("Inspection results"))
    transport_mode = _s(row.get("Transportation modes"))
    route = _s(row.get("Routes"))

    if defect_rate > 3 or inspection.lower() == "fail":
        severity = "HIGH"
    elif defect_rate > 1 or stock < 20 or lead_time > 25:
        severity = "MEDIUM"
    else:
        severity = "LOW"

    text = (
        f"SKU {sku} ({product_type}) supplied by {supplier} from {location}. "
        f"Price {price:.2f}; revenue {revenue:.2f}; {sold} units sold; "
        f"stock level {stock}. "
        f"Lead time {lead_time} days (manufacturing {mfg_lead_time} days); "
        f"shipping {shipping_time} days via {carrier} ({transport_mode}, route {route}); "
        f"shipping cost {shipping_cost:.2f}. "
        f"Inspection: {inspection}; defect rate {defect_rate:.2f}%. "
        f"Severity: {severity}."
    )

    return {
        "id": _doc_id("fashion", sku, row.name),  # row.name = index, prevents SKU collision
        "text": text,
        "metadata": {
            "source": "fashion",
            "sku": sku,
            "product_type": product_type,
            "supplier": supplier,
            "location": location,
            "price": price,
            "revenue": revenue,
            "stock_levels": stock,
            "units_sold": sold,
            "lead_time": lead_time,
            "manufacturing_lead_time": mfg_lead_time,
            "shipping_time": shipping_time,
            "shipping_cost": shipping_cost,
            "carrier": carrier,
            "transport_mode": transport_mode,
            "route": route,
            "defect_rate": defect_rate,
            "inspection": inspection,
            "severity": severity,
        },
    }


# ---------------- Generic transformer (custom CSVs) ----------------
def generic_row_to_incident(row: pd.Series) -> Dict[str, Any]:
    """Fallback transformer for any CSV — converts all columns to a readable doc."""
    idx = row.name  # integer row index — guarantees unique IDs
    fields = {k: _s(v) for k, v in row.items() if _s(v) not in ("unknown", "", "nan")}
    text = "; ".join(f"{k}: {v}" for k, v in list(fields.items())[:30])  # cap at 30 fields
    return {
        "id": _doc_id("custom", idx, text[:64]),
        "text": text,
        "metadata": {
            "source": "custom",
            "row_index": int(idx),
            **{k: v for k, v in list(fields.items())[:20]},  # store first 20 as metadata
        },
    }


# ---------------- Batch driver ----------------
def transform_dataframe(df: pd.DataFrame, source: str) -> List[Dict[str, Any]]:
    """Apply the right per-row transformer based on source name."""
    if source == "dataco":
        fn = dataco_row_to_incident
    elif source == "fashion":
        fn = fashion_row_to_incident
    else:
        # custom CSV or unknown — use generic transformer
        logger.info(f"Using generic transformer for source='{source}'")
        fn = generic_row_to_incident

    docs: List[Dict[str, Any]] = []
    for _, row in df.iterrows():
        try:
            docs.append(fn(row))
        except Exception as e:  # noqa: BLE001
            logger.warning(f"row transform failed: {e!r}")
    logger.info(f"Transformed {len(docs):,} rows from {source}")
    return docs
