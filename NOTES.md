# Project Notes

## 2026-05-29 — Architecture finalized + full scaffold complete (this session)

- Backend built end-to-end: FastAPI + LangGraph (orchestrator → 3 specialists → recommendation) + hybrid retrieval (Chroma + BM25 + RRF + cross-encoder rerank + CRAG) + semantic/keyword caches + input/output guardrails + LLMLingua compression + LangSmith tracing wired in `main.py` lifespan + SQLite HILT feedback store.
- Custom Kaggle MCP server at `backend/mcp_server/server.py` exposing `ping` / `list_kaggle_files` / `fetch_kaggle_dataset`; ingestion pipeline calls it via stdio client with local-CSV fallback. Random sample of DataCo → 2.5k incident docs.
- Frontend (React + Vite + Tailwind) has 4 routes: `/` Chat (with split-view FlowViz panel), `/flow` standalone full-screen Flow page (arrow-marker DAG + right-side live timeline), `/admin` (MCP browser + ingestion controls + status polling), `/present` slide deck. Live event bus drives node status/timing/retrieval/CRAG/HILT/faithfulness visuals.
- `.env` populated with OpenAI + Groq + LangSmith + HF + Kaggle keys. OpenAI key currently throttled — user will refresh tomorrow. No tests, no docs, no arch diagrams written (per strict instruction).
- Next: create venv + `pip install -r backend/requirements.txt`, `npm install` in frontend, then a smoke run. Only build evaluation (DeepEval/RAGAS) tests + golden dataset when user explicitly asks.

## 2026-05-29 — Handover gaps resolved (this session)

- DeepEval metrics implemented: `backend/app/evaluation/deepeval_metrics.py` — Faithfulness, AnswerRelevancy, ContextualPrecision, ContextualRecall, Hallucination; supports offline + live pipeline mode.
- RAGAS metrics implemented: `backend/app/evaluation/ragas_metrics.py` — ContextPrecision, ContextRecall, AnswerFaithfulness, AnswerRelevancy; same offline/live pattern.
- Golden dataset created: `backend/app/evaluation/golden_dataset.json` — 50 DataCo-grounded Q&A pairs across supplier_risk / shipment / inventory categories.
- Evaluation route wired: `backend/app/api/routes/evaluation.py` — `/api/evaluation/run` (POST, background job), `/api/evaluation/status/{job_id}`, `/api/evaluation/latest`, `/api/evaluation/golden`, `/api/evaluation/metrics/config`.
- Anomaly module built: `backend/app/services/anomaly.py` — 6 detectors (late delivery spike, shipping gap z-score, cancellation surge, fraud cluster, profit erosion, demand spike) + correlation analysis. Route at `/api/anomaly/run`, `/api/anomaly/summary`, `/api/anomaly/types`. Wired into `main.py`.
- Render deployment config: `render.yaml` + `RENDER_DEPLOY.md` — backend (FastAPI + persistent disk for ChromaDB/SQLite) + frontend (static site); all env vars documented.
- Presentation upgraded: 9 slides with SVG architecture diagram, retrieval pipeline flow, eval score bar chart, dot navigation, dark Tailwind theme.
- Next: smoke test (venv + pip install + npm install + verify all routes). Refresh OpenAI key in .env first.

## 2026-05-29 — Architecture discussion session (this chat)
- Finalized full tech stack: DataCo (180k rows, Kaggle MCP primary) + Fashion CSV (local fallback); both on same Kaggle MCP server.
- LLM routing: gpt-4o-mini (org) for reasoning, Groq llama-3.1-8b for routing/classification, Groq llama-3.3-70b for mid-weight tasks; fallback chain gpt-4o-mini → 70b → 8b.
- Vector DB: ChromaDB + rank_bm25 hybrid (RRF fusion) + cross-encoder reranker + CRAG; embeddings: BAAI/bge-small-en-v1.5 (384 dim, free local).
- Agents: LangGraph (orchestrator → Supplier Risk, Shipment, Inventory → Recommendation); A2A via conditional edges; SQLite checkpointer for persistence.
- Eval: DeepEval + RAGAS + LLM-as-judge; 40-50 golden Q&A pairs to build when explicitly asked.
- Next session: refresh OpenAI key in .env, run smoke test (venv + pip install + npm install), verify all routes load.
