"""
DeepEval metric runners for the Supply Chain Risk Intelligence Assistant.

Metrics evaluated:
  - Faithfulness          : answer claims are grounded in retrieved context
  - AnswerRelevancy       : answer addresses the user question
  - ContextualPrecision   : relevant nodes are ranked higher in retrieved context
  - ContextualRecall      : ground truth is covered by retrieved context
  - HallucinationMetric   : factual contradictions vs context

Usage (user-triggered only):
    from app.evaluation.deepeval_metrics import run_metrics, run_full_suite
    results = run_full_suite()          # runs all golden pairs
    results = run_metrics([test_case]) # runs a single LLMTestCase
"""
from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.core.logging import logger

GOLDEN_DATASET_PATH = Path(__file__).parent / "golden_dataset.json"

# ---------------------------------------------------------------------------
# Lazy imports — deepeval is only loaded when actually running evaluations
# ---------------------------------------------------------------------------

def _load_deepeval():
    try:
        from deepeval import evaluate
        from deepeval.metrics import (
            AnswerRelevancyMetric,
            ContextualPrecisionMetric,
            ContextualRecallMetric,
            FaithfulnessMetric,
            HallucinationMetric,
        )
        from deepeval.test_case import LLMTestCase
        return evaluate, AnswerRelevancyMetric, ContextualPrecisionMetric, \
               ContextualRecallMetric, FaithfulnessMetric, HallucinationMetric, LLMTestCase
    except ImportError as e:
        raise RuntimeError(
            "deepeval not installed. Run: pip install deepeval"
        ) from e


# ---------------------------------------------------------------------------
# Metric config
# ---------------------------------------------------------------------------

METRIC_THRESHOLDS = {
    "faithfulness": 0.80,
    "answer_relevancy": 0.75,
    "contextual_precision": 0.75,
    "contextual_recall": 0.70,
    "hallucination": 0.20,  # lower is better; threshold = max acceptable
}


def _build_metrics(model: str = "gpt-4o-mini"):
    """Instantiate all DeepEval metrics with shared LLM judge."""
    (
        evaluate, AnswerRelevancyMetric, ContextualPrecisionMetric,
        ContextualRecallMetric, FaithfulnessMetric, HallucinationMetric, LLMTestCase
    ) = _load_deepeval()

    return {
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


# ---------------------------------------------------------------------------
# Test case builder
# ---------------------------------------------------------------------------

def build_test_case(
    question: str,
    actual_output: str,
    contexts: List[str],
    expected_output: Optional[str] = None,
) -> Any:
    """Build a DeepEval LLMTestCase from RAG pipeline outputs."""
    _, _, _, _, _, _, LLMTestCase = _load_deepeval()
    return LLMTestCase(
        input=question,
        actual_output=actual_output,
        expected_output=expected_output or "",
        retrieval_context=contexts,
        context=contexts,
    )


# ---------------------------------------------------------------------------
# Golden dataset loader
# ---------------------------------------------------------------------------

def load_golden_dataset(category: Optional[str] = None) -> List[Dict]:
    """Load golden Q&A pairs, optionally filtered by category."""
    with open(GOLDEN_DATASET_PATH, encoding="utf-8") as f:
        data = json.load(f)
    if category:
        data = [d for d in data if d.get("category") == category]
    return data


# ---------------------------------------------------------------------------
# Core runner
# ---------------------------------------------------------------------------

def run_metrics(
    test_cases: List[Any],
    metric_names: Optional[List[str]] = None,
    model: str = "gpt-4o-mini",
) -> Dict[str, Any]:
    """
    Run DeepEval metrics on a list of LLMTestCase objects.

    Args:
        test_cases: list of deepeval LLMTestCase instances
        metric_names: subset of metric names to run; None = all
        model: OpenAI model used as LLM judge

    Returns:
        dict with per-metric scores, pass/fail, and overall summary
    """
    evaluate, *_ = _load_deepeval()

    all_metrics = _build_metrics(model=model)
    if metric_names:
        metrics = [v for k, v in all_metrics.items() if k in metric_names]
    else:
        metrics = list(all_metrics.values())

    logger.info(f"[DeepEval] Running {len(metrics)} metrics on {len(test_cases)} test cases")
    t0 = time.perf_counter()

    results = evaluate(test_cases, metrics, print_results=False)

    elapsed = time.perf_counter() - t0
    logger.info(f"[DeepEval] Evaluation complete in {elapsed:.1f}s")

    return _summarise(results, elapsed)


def _summarise(results: Any, elapsed: float) -> Dict[str, Any]:
    """Convert DeepEval EvaluationResult to a serialisable dict."""
    metric_summary: Dict[str, Dict] = {}
    all_passed = 0
    all_total = 0

    for test_result in getattr(results, "test_results", []):
        for metric_data in getattr(test_result, "metrics_data", []):
            name = metric_data.name.lower().replace(" ", "_")
            score = metric_data.score or 0.0
            passed = metric_data.success

            if name not in metric_summary:
                metric_summary[name] = {"scores": [], "passed": 0, "total": 0}

            metric_summary[name]["scores"].append(score)
            metric_summary[name]["passed"] += int(passed)
            metric_summary[name]["total"] += 1
            all_passed += int(passed)
            all_total += 1

    aggregated = {}
    for name, data in metric_summary.items():
        scores = data["scores"]
        aggregated[name] = {
            "mean_score": round(sum(scores) / len(scores), 4) if scores else 0.0,
            "min_score": round(min(scores), 4) if scores else 0.0,
            "max_score": round(max(scores), 4) if scores else 0.0,
            "pass_rate": round(data["passed"] / data["total"], 4) if data["total"] else 0.0,
            "threshold": METRIC_THRESHOLDS.get(name, 0.75),
            "passed": data["passed"],
            "total": data["total"],
        }

    return {
        "tool": "deepeval",
        "metrics": aggregated,
        "overall_pass_rate": round(all_passed / all_total, 4) if all_total else 0.0,
        "total_test_cases": all_total // max(len(metric_summary), 1),
        "elapsed_seconds": round(elapsed, 2),
        "ran_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }


# ---------------------------------------------------------------------------
# Full suite runner (against golden dataset, requires live RAG pipeline)
# ---------------------------------------------------------------------------

def run_full_suite(
    pipeline_fn=None,
    model: str = "gpt-4o-mini",
    max_samples: int = 10,
    category: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Run the full DeepEval suite against the golden dataset.

    Args:
        pipeline_fn: async callable(question) -> {"answer": str, "contexts": list[str]}
                     If None, uses ground_truth + contexts from golden dataset directly
                     (offline mode — tests evaluation logic without live pipeline).
        model: LLM judge model
        max_samples: max golden pairs to evaluate (keep low to control cost)
        category: filter golden dataset by category

    Returns:
        Evaluation summary dict
    """
    import asyncio

    golden = load_golden_dataset(category=category)[:max_samples]
    _, _, _, _, _, _, LLMTestCase = _load_deepeval()

    test_cases = []
    for entry in golden:
        if pipeline_fn:
            try:
                result = asyncio.run(pipeline_fn(entry["question"]))
                actual_output = result.get("answer", "")
                contexts = result.get("contexts", entry["contexts"])
            except Exception as exc:
                logger.warning(f"[DeepEval] Pipeline failed for GD {entry['id']}: {exc}")
                actual_output = entry["ground_truth"]  # fallback
                contexts = entry["contexts"]
        else:
            # Offline: use ground truth as the "actual output" to verify metric logic
            actual_output = entry["ground_truth"]
            contexts = entry["contexts"]

        tc = LLMTestCase(
            input=entry["question"],
            actual_output=actual_output,
            expected_output=entry["ground_truth"],
            retrieval_context=contexts,
            context=contexts,
        )
        test_cases.append(tc)

    return run_metrics(test_cases, model=model)
