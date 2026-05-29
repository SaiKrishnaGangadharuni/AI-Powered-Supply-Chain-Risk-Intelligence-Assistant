"""DeepEval metric suite for supply chain RAG evaluation.

Metrics:
  - Faithfulness         : answer grounded in retrieved context
  - Answer Relevancy     : answer addresses the question
  - Contextual Precision : retrieved docs ranked correctly
  - Contextual Recall    : retrieved docs cover ground truth
  - Hallucination        : answer introduces unsupported claims

Offline mode (default): uses golden ground_truth as the answer — evaluates
quality of the golden dataset itself without a live pipeline.
Live mode: routes each question through pipeline_fn to get real answers.
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from app.core.logging import logger

GOLDEN_DATASET_PATH = Path(__file__).parent / "golden_dataset.json"

METRIC_THRESHOLDS: Dict[str, float] = {
    "faithfulness": 0.7,
    "answer_relevancy": 0.7,
    "contextual_precision": 0.6,
    "contextual_recall": 0.6,
    "hallucination": 0.4,   # lower = better; pass if score <= threshold
}


# ---------------------------------------------------------------------------
# Golden dataset loader
# ---------------------------------------------------------------------------

def load_golden_dataset(category: Optional[str] = None) -> List[Dict[str, Any]]:
    """Load and optionally filter the golden Q&A dataset."""
    with open(GOLDEN_DATASET_PATH, encoding="utf-8") as f:
        data = json.load(f)
    if category:
        data = [d for d in data if d.get("category") == category]
    return data


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _set_openai_key() -> None:
    """Ensure OPENAI_API_KEY is set for DeepEval's internal LLM calls."""
    from app.core.config import settings
    key = settings.openai_api_key
    if key:
        os.environ.setdefault("OPENAI_API_KEY", key)


def _build_test_cases(
    samples: List[Dict[str, Any]],
    pipeline_fn: Optional[Callable],
    max_samples: int,
) -> List[Any]:
    """Build DeepEval LLMTestCase objects from samples."""
    from deepeval.test_case import LLMTestCase

    cases = []
    for item in samples[:max_samples]:
        question = item["question"]
        ground_truth = item["ground_truth"]
        contexts: List[str] = item.get("contexts", [])

        if pipeline_fn is not None:
            try:
                import asyncio
                result = asyncio.get_event_loop().run_until_complete(
                    pipeline_fn(question)
                ) if asyncio.get_event_loop().is_running() else asyncio.run(
                    pipeline_fn(question)
                )
                actual_output = result.get("answer", ground_truth)
                if result.get("contexts"):
                    contexts = result["contexts"]
            except Exception as e:
                logger.warning(f"pipeline_fn failed for '{question[:40]}': {e!r}; using ground_truth")
                actual_output = ground_truth
        else:
            # Offline: evaluate against the golden answer
            actual_output = ground_truth

        cases.append(
            LLMTestCase(
                input=question,
                actual_output=actual_output,
                expected_output=ground_truth,
                retrieval_context=contexts,
            )
        )
    return cases


def _score_metric(metric: Any, test_case: Any) -> Dict[str, Any]:
    """Run a single metric on a test case, return score + reason safely."""
    try:
        metric.measure(test_case)
        return {
            "score": float(getattr(metric, "score", 0.0) or 0.0),
            "reason": getattr(metric, "reason", None),
            "passed": bool(getattr(metric, "is_successful", lambda: False)()),
        }
    except Exception as e:
        logger.warning(f"Metric {metric.__class__.__name__} failed: {e!r}")
        return {"score": 0.0, "reason": str(e), "passed": False}


def _aggregate(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Aggregate per-sample scores into mean/min/max/pass_rate."""
    if not results:
        return {}
    scores = [r["score"] for r in results]
    passed = [r["passed"] for r in results]
    return {
        "mean_score": round(sum(scores) / len(scores), 4),
        "min_score": round(min(scores), 4),
        "max_score": round(max(scores), 4),
        "pass_rate": round(sum(passed) / len(passed), 4),
        "sample_count": len(results),
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run_full_suite(
    pipeline_fn: Optional[Callable] = None,
    model: str = "gpt-4o-mini",
    max_samples: int = 10,
    category: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Run the full DeepEval metric suite.

    Args:
        pipeline_fn: async callable(question) -> {"answer": str, "contexts": list[str]}
                     If None, runs in offline mode using golden ground_truth.
        model:       LLM to use for evaluation (default gpt-4o-mini).
        max_samples: Max golden samples to evaluate.
        category:    Filter golden dataset by category (supplier_risk/shipment/inventory).

    Returns:
        Dict with per-metric aggregated results + overall stats.
    """
    _set_openai_key()

    from deepeval.metrics import (
        AnswerRelevancyMetric,
        ContextualPrecisionMetric,
        ContextualRecallMetric,
        FaithfulnessMetric,
        HallucinationMetric,
    )

    t0 = time.time()
    samples = load_golden_dataset(category=category)
    logger.info(f"[DeepEval] Loaded {len(samples)} golden samples (category={category})")

    test_cases = _build_test_cases(samples, pipeline_fn, max_samples)
    logger.info(f"[DeepEval] Built {len(test_cases)} test cases (model={model})")

    # Define metrics
    metrics_map = {
        "faithfulness": FaithfulnessMetric(
            threshold=METRIC_THRESHOLDS["faithfulness"],
            model=model,
            include_reason=True,
        ),
        "answer_relevancy": AnswerRelevancyMetric(
            threshold=METRIC_THRESHOLDS["answer_relevancy"],
            model=model,
            include_reason=True,
        ),
        "contextual_precision": ContextualPrecisionMetric(
            threshold=METRIC_THRESHOLDS["contextual_precision"],
            model=model,
            include_reason=True,
        ),
        "contextual_recall": ContextualRecallMetric(
            threshold=METRIC_THRESHOLDS["contextual_recall"],
            model=model,
            include_reason=True,
        ),
        "hallucination": HallucinationMetric(
            threshold=METRIC_THRESHOLDS["hallucination"],
            model=model,
            include_reason=True,
        ),
    }

    # Run each metric over all test cases
    per_metric: Dict[str, List[Dict[str, Any]]] = {k: [] for k in metrics_map}

    for i, tc in enumerate(test_cases):
        logger.debug(f"[DeepEval] Evaluating test case {i+1}/{len(test_cases)}")
        for metric_name, metric in metrics_map.items():
            result = _score_metric(metric, tc)
            per_metric[metric_name].append(result)

    # Aggregate
    aggregated: Dict[str, Any] = {}
    all_pass_rates = []
    all_means = []
    for metric_name, results in per_metric.items():
        agg = _aggregate(results)
        agg["threshold"] = METRIC_THRESHOLDS[metric_name]
        aggregated[metric_name] = agg
        all_pass_rates.append(agg.get("pass_rate", 0.0))
        # Hallucination: lower is better — invert for overall score
        if metric_name == "hallucination":
            all_means.append(1.0 - agg.get("mean_score", 0.0))
        else:
            all_means.append(agg.get("mean_score", 0.0))

    elapsed = round(time.time() - t0, 2)
    overall_pass_rate = round(sum(all_pass_rates) / len(all_pass_rates), 4) if all_pass_rates else 0.0
    overall_mean = round(sum(all_means) / len(all_means), 4) if all_means else 0.0

    import datetime
    return {
        "tool": "deepeval",
        "metrics": aggregated,
        "overall_pass_rate": overall_pass_rate,
        "overall_mean_score": overall_mean,
        "sample_count": len(test_cases),
        "model": model,
        "category": category,
        "offline_mode": pipeline_fn is None,
        "elapsed_seconds": elapsed,
        "ran_at": datetime.datetime.utcnow().isoformat(),
        "status": "completed",
    }
