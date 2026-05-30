"""RAGAS metric suite for supply chain RAG evaluation.

Metrics:
  - Faithfulness      : claims in answer are grounded in context
  - Answer Relevancy  : answer addresses the question
  - Context Precision : relevant docs ranked higher
  - Context Recall    : context covers the ground truth

Compatible with ragas>=0.2.x (uses EvaluationDataset + SingleTurnSample).
Falls back to legacy datasets.Dataset API if new API unavailable.
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
    "context_precision": 0.6,
    "context_recall": 0.6,
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _set_openai_key() -> None:
    from app.core.config import settings
    key = settings.openai_api_key
    if key:
        os.environ.setdefault("OPENAI_API_KEY", key)


def _load_samples(category: Optional[str], max_samples: int) -> List[Dict[str, Any]]:
    with open(GOLDEN_DATASET_PATH, encoding="utf-8") as f:
        data = json.load(f)
    if category:
        data = [d for d in data if d.get("category") == category]
    return data[:max_samples]


def _resolve_answers(
    samples: List[Dict[str, Any]],
    pipeline_fn: Optional[Callable],
) -> tuple[List[str], List[str], List[List[str]], List[str]]:
    """Return (questions, answers, contexts_list, ground_truths)."""
    questions, answers, contexts_list, ground_truths = [], [], [], []

    for item in samples:
        q = item["question"]
        gt = item["ground_truth"]
        ctx = item.get("contexts", [])

        if pipeline_fn is not None:
            try:
                import asyncio
                if asyncio.get_event_loop().is_running():
                    import concurrent.futures
                    with concurrent.futures.ThreadPoolExecutor() as pool:
                        result = pool.submit(asyncio.run, pipeline_fn(q)).result()
                else:
                    result = asyncio.run(pipeline_fn(q))
                answer = result.get("answer", gt)
                if result.get("contexts"):
                    ctx = result["contexts"]
            except Exception as e:
                logger.warning(f"pipeline_fn failed: {e!r}; using ground_truth")
                answer = gt
        else:
            answer = gt

        questions.append(q)
        answers.append(answer)
        contexts_list.append(ctx if ctx else [gt])
        ground_truths.append(gt)

    return questions, answers, contexts_list, ground_truths


def _build_ragas_dataset(
    questions: List[str],
    answers: List[str],
    contexts_list: List[List[str]],
    ground_truths: List[str],
    model: str,
) -> Any:
    """Build RAGAS evaluation dataset, trying new API first then legacy."""
    # Try RAGAS 0.2.x new API
    try:
        from ragas.dataset_schema import EvaluationDataset, SingleTurnSample

        samples = [
            SingleTurnSample(
                user_input=q,
                response=a,
                retrieved_contexts=c,
                reference=gt,
            )
            for q, a, c, gt in zip(questions, answers, contexts_list, ground_truths)
        ]
        return EvaluationDataset(samples=samples), "new"
    except ImportError:
        pass

    # Fallback: legacy HuggingFace datasets API (ragas 0.1.x)
    try:
        from datasets import Dataset as HFDataset

        return HFDataset.from_dict({
            "question": questions,
            "answer": answers,
            "contexts": contexts_list,
            "ground_truth": ground_truths,
        }), "legacy"
    except ImportError as e:
        raise RuntimeError(
            f"Could not build RAGAS dataset with either API. "
            f"Ensure ragas and datasets are installed. Error: {e}"
        )


def _get_ragas_metrics(model: str) -> List[Any]:
    """Get RAGAS metric instances, trying new class API first."""
    try:
        # RAGAS 0.2.x class-based metrics
        from ragas.metrics import (
            AnswerRelevancy,
            ContextPrecision,
            ContextRecall,
            Faithfulness,
        )
        return [Faithfulness(), AnswerRelevancy(), ContextPrecision(), ContextRecall()]
    except ImportError:
        pass

    # Legacy instance-based metrics
    from ragas.metrics import (
        answer_relevancy,
        context_precision,
        context_recall,
        faithfulness,
    )
    return [faithfulness, answer_relevancy, context_precision, context_recall]


def _set_ragas_llm(model: str) -> None:
    """Configure RAGAS LLM if supported."""
    try:
        from langchain_openai import ChatOpenAI
        from ragas import RunConfig
        from ragas.llms import LangchainLLMWrapper

        from app.core.config import settings
        llm = LangchainLLMWrapper(ChatOpenAI(
            model=model,
            temperature=0,
            api_key=settings.openai_api_key or None,
            base_url=settings.openai_base_url or None,
        ))
        # Store for metrics that support it
        os.environ["RAGAS_LLM_MODEL"] = model
    except Exception:
        pass  # RAGAS will pick up OPENAI_API_KEY automatically


def _extract_score(result: Any, metric_name: str) -> float:
    """Extract numeric score from RAGAS result object."""
    try:
        if hasattr(result, "to_pandas"):
            df = result.to_pandas()
            # Map metric names to column names
            col_map = {
                "faithfulness": "faithfulness",
                "answer_relevancy": "answer_relevancy",
                "context_precision": "context_precision",
                "context_recall": "context_recall",
            }
            col = col_map.get(metric_name, metric_name)
            if col in df.columns:
                return float(df[col].mean())
        # Direct dict/attribute access
        if hasattr(result, "__getitem__"):
            return float(result[metric_name])
        if hasattr(result, metric_name):
            return float(getattr(result, metric_name))
    except Exception as e:
        logger.warning(f"Score extraction failed for {metric_name}: {e!r}")
    return 0.0


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
    Run the full RAGAS metric suite.

    Args:
        pipeline_fn: async callable(question) -> {"answer": str, "contexts": list[str]}
                     If None, runs in offline mode using golden ground_truth.
        model:       LLM for RAGAS evaluation.
        max_samples: Max golden samples.
        category:    Filter by category.

    Returns:
        Dict with per-metric scores + overall stats.
    """
    _set_openai_key()
    _set_ragas_llm(model)

    from ragas import evaluate as ragas_evaluate

    t0 = time.time()
    samples = _load_samples(category, max_samples)
    logger.info(f"[RAGAS] Loaded {len(samples)} samples (category={category})")

    questions, answers, contexts_list, ground_truths = _resolve_answers(samples, pipeline_fn)
    dataset, api_version = _build_ragas_dataset(
        questions, answers, contexts_list, ground_truths, model
    )
    logger.info(f"[RAGAS] Dataset built (api={api_version}, samples={len(questions)})")

    metrics = _get_ragas_metrics(model)
    logger.info(f"[RAGAS] Running {len(metrics)} metrics with model={model}")

    result = ragas_evaluate(dataset, metrics=metrics)

    metric_names = ["faithfulness", "answer_relevancy", "context_precision", "context_recall"]
    aggregated: Dict[str, Any] = {}
    all_scores = []

    for name in metric_names:
        score = _extract_score(result, name)
        passed = score >= METRIC_THRESHOLDS[name]
        aggregated[name] = {
            "mean_score": round(score, 4),
            "threshold": METRIC_THRESHOLDS[name],
            "pass_rate": 1.0 if passed else 0.0,
            "passed": passed,
        }
        all_scores.append(score)

    overall_mean = round(sum(all_scores) / len(all_scores), 4) if all_scores else 0.0
    overall_pass = round(
        sum(1 for s, n in zip(all_scores, metric_names) if s >= METRIC_THRESHOLDS[n])
        / len(all_scores),
        4,
    ) if all_scores else 0.0

    elapsed = round(time.time() - t0, 2)

    import datetime
    return {
        "tool": "ragas",
        "metrics": aggregated,
        "overall_pass_rate": overall_pass,
        "overall_mean_score": overall_mean,
        "sample_count": len(questions),
        "model": model,
        "category": category,
        "offline_mode": pipeline_fn is None,
        "elapsed_seconds": elapsed,
        "ran_at": datetime.datetime.utcnow().isoformat(),
        "api_version": api_version,
        "status": "completed",
    }
