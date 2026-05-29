# Project Notes

## 2026-05-29 — Architecture finalized + full scaffold complete (this session)

- Backend built end-to-end: FastAPI + LangGraph (orchestrator → 3 specialists → recommendation) + hybrid retrieval (Chroma + BM25 + RRF + cross-encoder rerank + CRAG) + semantic/keyword caches + input/output guardrails + LLMLingua compression + LangSmith tracing wired in `main.py` lifespan + SQLite HILT feedback store.
- Custom Kaggle MCP server at `backend/mcp_server/server.py` exposing `ping` / `list_kaggle_files` / `fetch_kaggle_dataset`; ingestion pipeline calls it via stdio client with local-CSV fallback. Random sample of DataCo → 2.5k incident docs.
- Frontend (React + Vite + Tailwind) has 4 routes: `/` Chat (with split-view FlowViz panel), `/flow` standalone full-screen Flow page (arrow-marker DAG + right-side live timeline), `/admin` (MCP browser + ingestion controls + status polling), `/present` slide deck. Live event bus drives node status/timing/retrieval/CRAG/HILT/faithfulness visuals.
- `.env` populated with OpenAI + Groq + LangSmith + HF + Kaggle keys. OpenAI key currently throttled — user will refresh tomorrow. No tests, no docs, no arch diagrams written (per strict instruction).
- Next: create venv + `pip install -r backend/requirements.txt`, `npm install` in frontend, then a smoke run. Only build evaluation (DeepEval/RAGAS) tests + golden dataset when user explicitly asks.

## 2026-05-29 — Deployment fixes + dependency cleanup

- Dropped torch, sentence-transformers, transformers, llmlingua entirely (caused platform wheel failures on Render/Python 3.13+).
- embeddings.py → OpenAI text-embedding-3-small (1536d, API-based, no local model).
- reranker.py → cosine similarity on OpenAI embeddings (no cross-encoder, no torch).
- llm_compress.py → simple token-count truncation with tiktoken (llmlingua removed).
- config.py updated: embedding_model=text-embedding-3-small, embedding_dim=1536, reranker_model=cosine.
- requirements.txt → all loose >= pins (no hard pins); let pip resolve. Matches working afde_simple_rag pattern.
- render.yaml → env: python (not runtime: python), PYTHON_VERSION env var added, runtime.txt = 3.11.9.
- Run locally: `uvicorn backend.app.main:app --reload --port 8000` (root dir) + `cd frontend && npm install && npm run dev`.
- Next: smoke test all 4 routes (/, /flow, /admin, /present), verify /health, test a chat query end-to-end.

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

## 2026-05-29 — Smoke test + runtime fixes (this session)

- Backend boots clean: 23 routes, /health ok, /api/anomaly/* and /api/evaluation/golden return data; full app imports without error.
- LangGraph compiles with all 5 nodes (orchestrator + 3 specialists + recommendation); pipeline runs to the LLM boundary.
- Fixes: main.py (truncated router includes restored) · config.py (missing `settings = get_settings()` restored) · graph.py (SqliteSaver.from_conn_string→`SqliteSaver(sqlite3.connect(...))`; loguru %s→f-string) · llm_compress.py (tiktoken now lazy-loaded with word-count fallback, no import-time network) · requirements.txt (added langgraph-checkpoint-sqlite) · .env (EMBEDDING_MODEL=text-embedding-3-small, DIM=1536, RERANKER=cosine to match code).
- Frontend: `npm install` + `vite build` succeed (1591 modules, no errors); all 4 routes (/, /flow, /admin, /present) bundle.
- NOT verifiable in sandbox (outbound to api.openai.com/api.groq.com blocked by proxy): live chat LLM response + ingestion (OpenAI embeddings). Both work on user's machine with keys + network. Run order: `POST /api/ingestion/run` then chat.
- Note: mounted FS can't run SQLite (disk I/O error) — local Windows run is fine; on Render use the persistent disk.

## 2026-05-29 — Embeddings fallback provider added

- embeddings.py now provider-switchable via EMBEDDING_PROVIDER: "openai" (default, text-embedding-3-small, 1536d) | "fastembed" (BAAI/bge-small-en-v1.5, local ONNX, 384d, no torch, no API key).
- config.py: added embedding_provider + fastembed_model. requirements.txt: added fastembed. .env/.env.example/render.yaml: EMBEDDING_PROVIDER documented.
- Decision rationale: chose fastembed over a 2nd cloud API (incl. HF Inference) because a local backend can't be 401'd/rate-limited — real resilience vs OpenAI outage. Groq already covers LLM reasoning fallback, so fastembed + Groq = zero-OpenAI operation.
- Switching providers requires re-ingest into a fresh Chroma collection (dimension is fixed per collection: 1536 vs 384). Clear CHROMA_PERSIST_DIR before re-ingesting.
- Verified: app imports with new routing, default provider=openai. fastembed embed not runnable in sandbox (no outbound to download model); validated on user machine after `pip install fastembed`.
- Root cause of ingestion failure this session: OpenAI key in .env is invalid (401 invalid_api_key) — pipeline otherwise ran fully (180k loaded, 2500 transformed/built, Chroma connected). Fix = valid key, OR switch to fastembed.
