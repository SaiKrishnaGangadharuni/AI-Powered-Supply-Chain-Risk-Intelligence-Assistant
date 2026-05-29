# System Design Decisions

## Vector Database — ChromaDB over Qdrant / Pinecone

**Chosen:** ChromaDB (persistent, in-process)

**Why:** Dataset scale is 2,500–5,000 documents after sampling. At this size ChromaDB has zero latency overhead (no network hop), runs on Render persistent disk without an extra service, and metadata filtering is sufficient for our needs. Qdrant's native hybrid search advantage matters at >100k vectors; below that we implement hybrid ourselves via `rank_bm25` + RRF, which gives us full control and a better panel story.

**Trade-off:** Qdrant would outperform at production scale (>500k vectors) and offers native sparse+dense without the manual BM25 layer.

---

## Chunking Strategy — Row-to-Document

**Chosen:** Each DataCo CSV row → one natural-language incident document (~100–150 tokens)

**Why:** DataCo rows are already atomic "incidents" — one order with all its risk signals. Splitting rows would lose the correlation between shipment mode, late risk, market, and profit in a single context window. Template-based conversion preserves all structured fields in readable prose.

**Trade-off:** No multi-row semantic grouping. Trend analysis ("LATAM fraud is rising") emerges from LLM synthesis over retrieved docs, not from pre-aggregated chunks.

---

## Hybrid Search — Manual BM25 + RRF over Native Hybrid

**Chosen:** `rank_bm25` + ChromaDB dense → Reciprocal Rank Fusion (k=60)

**Why:** Full transparency — we control scoring, weights, and fusion. RRF is proven to outperform simple score interpolation for heterogeneous retrieval systems. Explainability matters for the panel.

**Trade-off:** Qdrant's native hybrid uses learned sparse encoders (SPLADE) which can outperform BM25 on domain-specific vocabulary. BM25 is simpler and free.

---

## Agent Orchestration — LangGraph over CrewAI / AutoGen

**Chosen:** LangGraph (state machine graph)

**Why:** A2A escalation = conditional edges in a directed graph. LangGraph's TypedDict state is explicitly typed, making agent handoffs auditable. Built-in SQLite checkpointer enables conversation persistence across page reloads. Native LangSmith tracing requires zero extra instrumentation.

**Trade-off:** Higher boilerplate than CrewAI. CrewAI is faster to scaffold but loses control over escalation conditions.

---

## CRAG — Corrective RAG

**Chosen:** If max cross-encoder rerank score < 0.6 → Groq-8B reformulates query → single retry

**Why:** Supply chain queries can be ambiguous ("shipping issues" vs "late delivery risk"). One reformulation pass meaningfully improves retrieval for off-nominal queries without doubling latency for good queries.

**Trade-off:** Two LLM calls on CRAG path. Threshold of 0.6 is empirically set; tunable via config.

---

## LLM Routing — Task-Specific Models

| Task | Model | Reason |
|---|---|---|
| Intent classification | Groq llama-3.1-8b-instant | ~200ms, free, single-token output |
| Retrieval summarization | Groq llama-3.3-70b-versatile | Better reasoning than 8B, still free |
| Recommendation + judge | GPT-4o-mini (org key) | Best quality for final user-facing output |

Fallback chain: `gpt-4o-mini → groq-70b → groq-8b` with `tenacity` retry on each hop.

---

## Guardrails — Custom Hybrid over NeMo

**Chosen:** Custom pipeline (Pydantic + regex + Groq domain check + DeepEval faithfulness)

**Why:** NeMo Guardrails adds ~300MB and significant latency. Our guardrails are transparent, testable, and directly integrated with the evaluation pipeline. Domain check via Groq-8B is fast (<200ms) and free.

---

## Evaluation — DeepEval + RAGAS

**Why both:** DeepEval excels at component-level metrics (hallucination, contextual precision). RAGAS provides end-to-end RAG-specific scores. Running both gives a complete quality picture and satisfies the Req 2 specification.

Golden dataset: 50 manually curated Q&A pairs covering all three agent domains.
