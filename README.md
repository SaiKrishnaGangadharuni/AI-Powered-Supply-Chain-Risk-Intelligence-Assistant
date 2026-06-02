# AI-Powered Supply Chain Risk Intelligence Assistant

An intelligent assistant for supply chain operations teams. Ask natural-language questions about supplier delays, shipment risks, inventory shortages, and logistics disruptions — the system retrieves historical incidents, runs a parallel multi-agent analysis, and returns explainable mitigation recommendations with source citations.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Full Pipeline Flow](#full-pipeline-flow)
4. [Tech Stack](#tech-stack)
5. [Project Structure](#project-structure)
6. [Local Setup (Windows)](#local-setup-windows)
7. [Local Setup (Mac / Linux)](#local-setup-mac--linux)
8. [Environment Variables](#environment-variables)
9. [Data Ingestion](#data-ingestion)
10. [UI Pages](#ui-pages)
11. [API Reference](#api-reference)
12. [Sample Queries](#sample-queries)
13. [Evaluation](#evaluation)
14. [Deploying to Render](#deploying-to-render)
15. [Datasets](#datasets)
16. [Clearing Data](#clearing-data)

---

## Overview

Supply chain operations teams face a constant challenge: risk data is spread across procurement records, shipment logs, warehouse reports, and vendor histories. This system lets operations managers ask natural-language questions and get back explainable risk intelligence — grounded in real historical incidents — in seconds.

**Core capabilities:**

- Natural-language supply chain queries (conversational + analytical)
- Hybrid semantic + keyword retrieval over historical incidents (ChromaDB + BM25)
- Reciprocal Rank Fusion (RRF) + cosine reranking
- Corrective RAG (CRAG) — reformulates query if retrieval score is low
- Multi-agent parallel analysis: Supplier Risk, Shipment, Inventory, Recommendation
- Severity classification (HIGH / MEDIUM / LOW) with HILT interrupt for HIGH severity
- Input + output guardrails (injection detection, domain relevance, faithfulness check, PII scrubbing)
- Semantic + keyword cache for instant repeat-query responses
- Supply chain analytics dashboard (Recharts)
- DeepEval + RAGAS evaluation pipeline
- LangSmith tracing
- Live agent pipeline visualization (Flow page)
- Real-time streaming via WebSocket

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DATA INGESTION                                │
│                                                                      │
│  Kaggle MCP ──► Download CSV ──► Sample (2500 rows)                 │
│  Local CSV  ──►               ──► Transform to incident docs        │
│                                   ──► Embed (BGE-small 384-dim)     │
│                                       ├──► ChromaDB (dense)         │
│                                       └──► BM25 Index (sparse)      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        QUERY PIPELINE                                │
│                                                                      │
│  User Query                                                          │
│     │                                                                │
│     ▼                                                                │
│  Input Guardrails ──── injection · length · greeting (instant)      │
│     │                                                                │
│     ▼                                                                │
│  Semantic Cache ──── cosine ≥ 0.92 → return cached answer ⚡        │
│     │ (cache miss)                                                   │
│     ▼                                                                │
│  Domain Check ──── Groq LLM on-topic classifier                     │
│     │                                                                │
│     ▼                                                                │
│  Orchestrator ──── intent classification + severity (Groq 8B)       │
│     │                                                                │
│     ├──────────────────┬──────────────────┐                         │
│     ▼                  ▼                  ▼                         │
│  Supplier Risk    Shipment Analysis  Inventory Intel                 │
│  Agent            Agent              Agent                           │
│     │                  │                  │                         │
│     └──────────────────┴──────────────────┘                         │
│                         │                                            │
│                         ▼                                            │
│         Hybrid Retrieval (per agent)                                 │
│         ChromaDB dense ∥ BM25 sparse (parallel)                     │
│         → RRF Fusion → cosine rerank                                │
│         → CRAG (score < 0.6 → reformulate + retry)                  │
│                         │                                            │
│                         ▼                                            │
│         Recommendation Agent ──── GPT-4o-mini synthesis             │
│                         │                                            │
│                         ▼                                            │
│         Output Guardrails                                            │
│         ├── Faithfulness check (Groq — LLM-as-judge)                │
│         └── PII scrubbing (email / phone / card / SSN)              │
│                         │                                            │
│                         ▼                                            │
│         HILT ──── HIGH severity → human review interrupt            │
│                         │                                            │
│                         ▼                                            │
│         Final Answer (streamed via WebSocket)                        │
└─────────────────────────────────────────────────────────────────────┘
```

Full visual diagram: `docs/architecture/architecture.svg`
Design decisions and trade-offs: `docs/architecture/design.md`

---

## Full Pipeline Flow

### 1. Input Guardrails (instant, zero latency)
- Prompt injection pattern matching (regex)
- Query length check (min 3 words, max 500 chars)
- Greeting / off-topic fast-block
- Domain relevance check via LLM (Groq 8B) only on cache miss

### 2. Semantic Cache
- Embeds the query and cosine-compares against cached entries
- Threshold: 0.92 (configurable via `SEMANTIC_CACHE_THRESHOLD`)
- On hit: returns cached answer immediately, skips full pipeline
- Also maintains a keyword LRU cache for exact-match queries

### 3. Orchestrator
- Classifies intent: `supplier_risk` | `shipment_analysis` | `inventory_intelligence` | `general`
- Classifies severity: `HIGH` | `MEDIUM` | `LOW`
- Specific intent → routes to one specialist agent only
- `general` intent → defaults to supplier_risk agent (broadest coverage, avoids multi-agent latency)

### 4. Specialist Agents (parallel via LangGraph)
Each agent runs independently and writes to shared state:
- **Supplier Risk Agent** — historical supplier incidents, delivery performance, fraud signals
- **Shipment Analysis Agent** — delay patterns, shipping mode analysis, carrier performance
- **Inventory Intelligence Agent** — stock anomalies, demand spikes, stockout risk

### 5. Hybrid Retrieval (per agent)
- **Dense**: ChromaDB cosine search (BAAI/bge-small-en-v1.5, 384-dim) — top 20
- **Sparse**: BM25 keyword index (rank-bm25) — top 20
- **Fusion**: Reciprocal Rank Fusion (RRF, k=60) → top 5 after cosine rerank
- **CRAG**: If best rerank score < 0.6, query is reformulated by LLM and retrieval retried once

### 6. Recommendation Agent
- Aggregates all agent outputs and retrieved context
- Adaptive format: bullet list for factual queries, structured report for risk analysis, natural prose for conversational
- Always cites `[Doc N]` sources
- Context compressed via LLMLingua if token budget exceeded

### 7. Output Guardrails
- **Faithfulness**: Groq LLM compares answer claims against retrieved context; returns `faithful: true/false` + reason
- **PII scrubbing**: redacts emails, phones, credit cards, SSNs before returning answer

### 8. HILT (Human-in-the-Loop Trigger)
- If `severity == HIGH`, LangGraph `interrupt_before("recommendation")` fires
- Human review flag set in response (`needs_human: true`)
- Feedback stored in SQLite via `feedback_store.py`

---

## Tech Stack

| Layer | Technology |
|---|---|
| **LLM — primary** | GPT-4o-mini (OpenAI) |
| **LLM — routing / classify** | Groq llama-3.1-8b-instant |
| **LLM — summarization** | Groq llama-3.3-70b-versatile |
| **LLM fallback chain** | openai_mini → groq_large → groq_small |

### LLM Task Routing

The system uses **task-based model selection** — not a single model for everything. Each task type maps to the best-fit model, with automatic fallback if a provider fails.

| Task | Primary Model | Fallback Chain | Reason |
|---|---|---|---|
| `ROUTING` — orchestrator, domain check | Groq llama-3.1-8b-instant | → OpenAI → Groq 70B | Fast classification (~200ms), runs on every query |
| `SUMMARIZATION` — mid-weight synthesis | Groq llama-3.3-70b-versatile | → OpenAI → Groq 8B | Better reasoning than 8B, still free on Groq |
| `REASONING` — specialist agents | GPT-4o-mini | → Groq 70B → Groq 8B | Complex domain reasoning needs best quality |
| `JUDGE` — faithfulness check | GPT-4o-mini | → Groq 70B → Groq 8B | LLM-as-judge accuracy critical for quality scoring |
| `RECOMMENDATION` — final answer | GPT-4o-mini | → Groq 70B → Groq 8B | User-facing output requires highest quality |

**Design rationale:** Groq handles all lightweight/fast tasks (routing, classification) for speed and cost savings. OpenAI handles all quality-critical tasks (reasoning, recommendations, evaluation). If any provider fails, the fallback chain automatically retries the next provider without the user seeing an error.
| **Embeddings** | BAAI/bge-small-en-v1.5 via fastembed (local, 384-dim) |
| **Vector DB** | ChromaDB (persistent, cosine space) |
| **Sparse search** | rank-bm25 |
| **Fusion** | Reciprocal Rank Fusion (RRF, k=60) |
| **Reranker** | Cosine similarity reranker |
| **CRAG** | Query reformulation on low rerank score |
| **Agent framework** | LangGraph + SqliteSaver checkpointer |
| **Context compression** | LLMLingua (llm_compress.py) |
| **Evaluation** | DeepEval + RAGAS |
| **Tracing** | LangSmith |
| **Guardrails** | Custom hybrid (regex + Pydantic + Groq LLM) |
| **Cache** | Semantic cosine cache + keyword LRU cache |
| **Backend** | FastAPI + WebSocket (uvicorn) |
| **Frontend** | React 18 + Vite + Tailwind CSS + Recharts + lucide-react |
| **Python version** | 3.11.9 |

---

## Project Structure

```
AI-Powered-Supply-Chain-Risk-Intelligence-Assistant/
│
├── backend/
│   └── app/
│       ├── agents/
│       │   ├── graph.py               # LangGraph state graph wiring
│       │   ├── orchestrator.py        # Intent + severity classification
│       │   ├── supplier_risk.py       # Supplier incidents agent
│       │   ├── shipment_analysis.py   # Shipment delay agent
│       │   ├── inventory_intelligence.py  # Inventory anomaly agent
│       │   ├── recommendation.py      # Final synthesis + guardrails
│       │   └── _common.py             # Shared agent utilities
│       │
│       ├── api/routes/
│       │   ├── chat.py                # POST /api/chat/query, WS /api/chat/ws
│       │   ├── ingestion.py           # POST /api/ingestion/run, /status, /clear
│       │   ├── analytics.py           # GET /api/analytics/*
│       │   ├── evaluation.py          # POST /api/evaluation/run
│       │   ├── anomaly.py             # POST /api/anomaly/run
│       │   └── mcp_browser.py         # GET /api/mcp/list-files
│       │
│       ├── cache/
│       │   ├── semantic_cache.py      # Cosine similarity cache (in-memory)
│       │   └── keyword_cache.py       # LRU keyword cache
│       │
│       ├── core/
│       │   ├── config.py              # Pydantic settings (all env vars)
│       │   ├── llm_router.py          # LLM fallback chain with retry
│       │   └── logging.py             # Loguru logger setup
│       │
│       ├── evaluation/
│       │   ├── deepeval_metrics.py    # DeepEval faithfulness + relevancy
│       │   ├── ragas_metrics.py       # RAGAS context precision + recall
│       │   └── golden_dataset.json    # 50 Q&A evaluation pairs
│       │
│       ├── guardrails/
│       │   ├── input_guard.py         # Injection + domain + length checks
│       │   ├── output_guard.py        # Faithfulness + PII scrubbing
│       │   └── llm_compress.py        # LLMLingua context compression
│       │
│       ├── ingestion/
│       │   ├── pipeline.py            # Main ingestion orchestrator
│       │   ├── transformer.py         # Row → incident document
│       │   ├── kaggle_mcp.py          # Kaggle MCP client
│       │   ├── local_loader.py        # Local CSV/JSON/Excel/Parquet loader
│       │   └── file_registry.py       # Loaded files tracking (JSON store)
│       │
│       ├── models/
│       │   └── schemas.py             # Pydantic request/response models
│       │
│       ├── retrieval/
│       │   ├── vector_store.py        # ChromaDB wrapper
│       │   ├── bm25_index.py          # BM25 index build + search
│       │   ├── embeddings.py          # fastembed embedding wrapper
│       │   ├── hybrid_search.py       # RRF fusion + CRAG logic
│       │   └── reranker.py            # Cosine reranker
│       │
│       ├── services/
│       │   ├── event_bus.py           # SSE/WebSocket event emitter
│       │   ├── feedback_store.py      # SQLite feedback store
│       │   └── anomaly.py             # Anomaly detection service
│       │
│       ├── mcp_server/
│       │   └── server.py              # Custom Kaggle MCP stdio server
│       │
│       └── main.py                    # FastAPI app + CORS + routers
│
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── Chat.jsx               # Main chat interface
│       │   ├── Analytics.jsx          # Supply chain analytics dashboard
│       │   ├── Flow.jsx               # End-to-end pipeline visualizer
│       │   ├── Admin.jsx              # Ingestion control panel
│       │   └── Presentation.jsx       # Panel demo presentation mode
│       │
│       ├── components/
│       │   ├── Message.jsx            # Chat message with markdown renderer
│       │   ├── DocsDrawer.jsx         # Retrieved documents drawer
│       │   ├── SeverityBadge.jsx      # HIGH/MEDIUM/LOW badge
│       │   └── flow/
│       │       ├── FlowViz.jsx        # Agent orchestration DAG (Flow page)
│       │       └── NodeCard.jsx       # Individual agent node card
│       │
│       ├── context/
│       │   └── ChatContext.jsx        # Global state: messages, pipeline, metrics
│       │
│       ├── hooks/
│       │   └── useFlowState.js        # Flow page state reducer
│       │
│       └── api/
│           └── client.js              # API + WebSocket client wrapper
│
├── data/
│   └── source_dataset/
│       ├── DataCo SMART SUPPLY CHAIN FOR BIG DATA ANALYSIS/
│       │   └── DataCoSupplyChainDataset.csv   # 180k rows, primary dataset
│       └── supply_chain_data.csv              # 100 rows, fashion/beauty fallback
│
├── docs/
│   └── architecture/
│       ├── architecture.svg           # Visual architecture diagram
│       └── design.md                  # Design decisions + trade-offs
│
├── tests/                             # Unit tests (pytest)
│   ├── test_api.py                    # Health, ingestion, chat endpoint tests
│   ├── test_agents.py                 # Orchestrator routing + intent classification tests
│   └── test_retrieval.py              # RRF fusion, reranker, semantic cache tests
│
├── requirements.txt                   # Python dependencies (root level)
├── runtime.txt                        # Python 3.11.9 (Render signal)
├── render.yaml                        # Render deployment config
└── .env.example                       # All environment variables template
```

---

## Local Setup (Windows)

> **Important:** On Windows, use `npm.cmd` instead of `npm` in PowerShell terminals.

### Prerequisites

- Python 3.11.9 (install from [python.org](https://python.org))
- Node.js 18+ (install from [nodejs.org](https://nodejs.org))
- Git

### Step 1 — Clone the repo

```powershell
git clone <your-repo-url>
cd AI-Powered-Supply-Chain-Risk-Intelligence-Assistant
```

### Step 2 — Create environment file

```powershell
copy .env.example .env
```

Edit `.env` and fill in your API keys (see [Environment Variables](#environment-variables)).

### Step 3 — Backend setup

```powershell
# Create virtual environment
python -m venv .venv

# Activate it
.venv\Scripts\activate

# Install dependencies (requirements.txt is at repo root)
pip install -r requirements.txt
```

### Step 4 — Start the backend

```powershell
# From repo root, with .venv activated
cd backend
uvicorn app.main:app --reload --port 8000
```

Backend runs at: `http://localhost:8000`
API docs (Swagger): `http://localhost:8000/docs`
Health check: `http://localhost:8000/health`

### Step 5 — Frontend setup (new terminal)

```powershell
cd frontend

# Install dependencies (use npm.cmd on Windows PowerShell)
npm.cmd install

# Start dev server
npm.cmd run dev
```

Frontend runs at: `http://localhost:5173`

> **Note:** Keep both terminals running simultaneously. Backend must be up for the frontend to work.

### Stopping

```powershell
# Stop backend: Ctrl+C in the backend terminal
# Stop frontend: Ctrl+C in the frontend terminal
# Deactivate virtual env:
deactivate
```

---

## Local Setup (Mac / Linux)

### Prerequisites

- Python 3.11.9
- Node.js 18+
- Git

### Steps

```bash
# Clone
git clone <your-repo-url>
cd AI-Powered-Supply-Chain-Risk-Intelligence-Assistant

# Environment file
cp .env.example .env
# Edit .env and fill in API keys

# Backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd backend
uvicorn app.main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

---

## Environment Variables

All variables are defined in `.env.example`. Copy it to `.env` and fill in your values.

### Required

| Variable | Description | Where to get |
|---|---|---|
| `OPENAI_API_KEY` | GPT-4o-mini key | platform.openai.com |
| `GROQ_API_KEY` | Groq Llama keys (free) | console.groq.com |

### Recommended

| Variable | Description | Where to get |
|---|---|---|
| `LANGCHAIN_API_KEY` | LangSmith tracing (free) | smith.langchain.com |
| `KAGGLE_USERNAME` | Kaggle dataset downloads | kaggle.com → Settings |
| `KAGGLE_KEY` | Kaggle API key | kaggle.com → Settings |

### Key configuration options

```env
# LLM
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
GROQ_API_KEY=gsk_...
GROQ_MODEL_SMALL=llama-3.1-8b-instant
GROQ_MODEL_LARGE=llama-3.3-70b-versatile
LLM_FALLBACK_CHAIN=openai_mini,groq_large,groq_small

# Embeddings (fastembed = local, free, no API key needed)
EMBEDDING_PROVIDER=fastembed
EMBEDDING_DIM=384

# Retrieval tuning
DENSE_TOP_K=20
SPARSE_TOP_K=20
RERANK_TOP_K=5
CRAG_RELEVANCE_THRESHOLD=0.6

# Cache tuning
SEMANTIC_CACHE_THRESHOLD=0.92

# Guardrails
MAX_CONTEXT_TOKENS=6000
PRIVACY_FILTER_ENABLED=true
HIGH_SEVERITY_INTERRUPT=true

# LangSmith tracing
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=lsv2_...
LANGCHAIN_PROJECT=supply-chain-risk-assistant

# Kaggle
KAGGLE_USERNAME=your_username
KAGGLE_KEY=your_key

# CORS (add your frontend URL here)
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

> **Local dev note:** Never change `.env` for Render deployment. Render env vars are set separately in the dashboard and do not affect local `.env`.

---

## Data Ingestion

### Via Admin UI (recommended)

1. Open `http://localhost:5173/admin`
2. In the **Load into Vector Store** section, select a file from the list
3. Choose source: **Kaggle MCP** (downloads fresh) or **Local CSV** (uses the file in `data/source_dataset/`)
4. Toggle **Reset collection** if you want to wipe existing vectors first
5. Click **Run Ingestion**
6. Watch the live status panel — DataCo takes ~60-120 seconds

Already-loaded files show an **Already Loaded** badge. You can re-load with Reset enabled to refresh.

### Via API

```bash
# PowerShell
Invoke-WebRequest -Method POST -Uri http://localhost:8000/api/ingestion/run `
  -ContentType "application/json" `
  -Body '{"dataset": "dataco", "source": "auto", "reset": false}'

# Mac/Linux
curl -X POST http://localhost:8000/api/ingestion/run \
  -H "Content-Type: application/json" \
  -d '{"dataset": "dataco", "source": "auto", "reset": false}'
```

### Supported file types

The ingestion pipeline auto-detects file type: `.csv`, `.tsv`, `.xlsx`, `.xls`, `.json`, `.parquet`

### What the pipeline does

1. **Load** — Kaggle MCP fetch or local file read
2. **Sample** — DataCo sampled to 2,500 rows (set via `DATACO_SAMPLE_ROWS`)
3. **Transform** — Each row becomes a natural-language incident document:
   > *"Order 12345 from Consumer segment in LATAM. Product: Field & Stream Sportsman 16 Gun Fire Safe. Shipping: Standard Class. Scheduled: 4 days, Actual: 6 days. Late delivery risk: YES. Order status: COMPLETE. Profit: $12.50."*
4. **Embed** — BGE-small-en-v1.5 via fastembed (384-dim, local ONNX)
5. **Index** — ChromaDB (dense vectors) + BM25 pickle index built in parallel
6. **Registry** — `data/loaded_files.json` updated to track loaded files

### Clearing vectors

**Windows PowerShell:**
```powershell
# Via API
Invoke-WebRequest -Method POST -Uri http://localhost:8000/api/ingestion/clear

# Manual deletion
Remove-Item -Recurse -Force storage\chroma
Remove-Item -Force storage\sqlite\app.db
Remove-Item -Force storage\sqlite\checkpoints.db
Remove-Item -Force data\loaded_files.json
```

**Mac/Linux:**
```bash
curl -X POST http://localhost:8000/api/ingestion/clear
# or manually:
rm -rf storage/chroma storage/sqlite/app.db storage/sqlite/checkpoints.db data/loaded_files.json
```

---

## UI Pages

| Route | Page | Description |
|---|---|---|
| `/` | **Chat** | Main interface — type supply chain questions, see AI responses with severity badges, source citations, and live agent status |
| `/analytics` | **Analytics** | Supply chain dashboard — late delivery by market, shipment mode breakdown, fraud signals, inventory trends. Has independent loading + refresh button |
| `/flow` | **Flow** | Two panels: left = end-to-end pipeline DAG (nodes light up live as query runs), right = run quality metrics (score, faithfulness, retrieval stats, CRAG retries, live model usage, techniques used) |
| `/admin` | **Admin** | File browser with type badges + loaded status, ingestion controls, Kaggle MCP browser, evaluation trigger |
| `/present` | **Presentation** | Full-screen presentation mode for panel demo — architecture slides, demo flow, tech stack overview |

### Chat page features

- ChatGPT-style message layout
- Inline markdown rendering (bold, bullets, headings, numbered lists)
- Severity badge (HIGH / MEDIUM / LOW) on each AI response
- "Retrieved Documents" drawer — click to inspect source docs used
- Cached response indicator (⚡)
- Live streaming status bar

### Flow page — Run Quality panel

After each query, the right panel shows:

- **Quality Score** (0–100): Faithfulness (40pts) + Retrieval score (30pts) + No CRAG retry (20pts) + No PII (10pts)
- **Why** box: LLM-generated reason for faithfulness pass/fail
- **Evaluation**: faithfulness result, PII status, severity, HILT flag
- **Retrieval**: docs retrieved, max rerank score, retrieval time, CRAG retry count
- **🤖 Models Used**: live view of which LLM ran for each task (routing, recommendation, faithfulness) with latency — including fallback if a provider switched mid-run
- **Techniques**: which pipeline optimizations were active this run
- **Live Timeline**: per-node event log with timestamps

### Chat page features

- Follow-up questions supported — "explain more", "why?", "can you elaborate" pass through guardrails automatically
- Timestamps (HH:MM:SS) on every message — sent time on user queries, received time on AI responses

---

## API Reference

### Health

```
GET /health
→ {"status": "ok", "service": "supply-chain-risk-assistant"}
```

### Chat

```
POST /api/chat/query
Body: {"query": "...", "session_id": "..."}
→ {"answer": "...", "severity": "HIGH|MEDIUM|LOW", "intent": "...", "docs": [...], "needs_human": bool}

WS  /api/chat/ws
Send: {"query": "...", "session_id": "..."}
Events: node_update | retrieval | crag_retry | faithfulness | cached | guard_block | final | error

POST /api/chat/feedback
Body: {"session_id": "...", "message_id": "...", "rating": 1|-1, "comment": "..."}
```

### Ingestion

```
POST /api/ingestion/run
Body: {"dataset": "dataco|fashion|custom", "source": "auto|kaggle|local", "reset": false, "file_path": "optional"}

GET  /api/ingestion/status
→ {"status": "idle|running|done|error", "docs_indexed": N, "elapsed_s": N}

GET  /api/ingestion/list-sources
→ [{"name": "...", "ext": ".csv", "loaded": bool, "loaded_docs": N}]

POST /api/ingestion/clear
→ {"cleared": true}
```

### Analytics

```
GET /api/analytics/summary
GET /api/analytics/late-delivery-by-market
GET /api/analytics/shipment-mode-breakdown
GET /api/analytics/fraud-signals
GET /api/analytics/inventory-trends
```

### Evaluation

```
POST /api/evaluation/run
Body: {"tool": "deepeval|ragas|both", "max_samples": 10, "offline": true}

GET  /api/evaluation/latest
→ latest evaluation results with per-metric scores
```

### Anomaly detection

```
POST /api/anomaly/run
Body: {"sample_n": 5000}
→ detected anomaly patterns with confidence scores
```

---

## Sample Queries

Once data is ingested, try these in the Chat interface:

```
"Which shipping modes have the highest late delivery risk?"
"Are there fraud patterns in any specific market or region?"
"What is driving the high cancellation rate in the LATAM market?"
"Which product categories face the most supply chain disruption?"
"Recommend mitigation strategies for Standard Class shipping delays."
"Are there any demand spike anomalies that could cause stockouts?"
"Which suppliers show the highest delivery failure rate?"
"Compare risk levels across different warehouse locations."
"What inventory categories are most at risk of stockout?"
"How does transportation cost correlate with late deliveries?"
```

---

## Evaluation

Golden dataset: `backend/app/evaluation/golden_dataset.json` (50 supply chain Q&A pairs)

### Via Admin UI

Navigate to `/admin` → Evaluation section → select framework + sample count → Run.

### Via API

```bash
# Mac/Linux
curl -X POST http://localhost:8000/api/evaluation/run \
  -H "Content-Type: application/json" \
  -d '{"tool": "both", "max_samples": 10, "offline": true}'

# PowerShell
Invoke-WebRequest -Method POST -Uri http://localhost:8000/api/evaluation/run `
  -ContentType "application/json" `
  -Body '{"tool": "both", "max_samples": 10, "offline": true}'
```

### Metrics

| Framework | Metrics |
|---|---|
| **DeepEval** | Faithfulness, Answer Relevancy, Contextual Precision, Contextual Recall, Hallucination |
| **RAGAS** | Faithfulness, Answer Relevancy, Context Precision, Context Recall |

### Run quality (live, per-query)

Visible in the Flow page right panel after each query:
- Faithfulness: Groq LLM judges if answer is grounded in retrieved context
- Retrieval score: max cosine rerank score (0–1)
- CRAG retries: whether query reformulation was triggered
- PII detection: whether any PII was found and redacted

---

## Deploying to Render

The app needs **two separate Render services** under one project: a backend Web Service and a frontend Static Site.

### Backend — Web Service

| Setting | Value |
|---|---|
| **Service type** | Web Service |
| **Repository** | your GitHub repo |
| **Root Directory** | `.` (repo root — requirements.txt is here) |
| **Runtime** | Python |
| **Build Command** | `pip install --upgrade pip && pip install -r requirements.txt` |
| **Start Command** | `uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port $PORT --workers 1` |

**Add a Disk** (Render → your backend service → Disks):

| Setting | Value |
|---|---|
| **Name** | `scria-storage` |
| **Mount Path** | `/opt/render/project/src/storage` |
| **Size** | 5 GB |

**Environment Variables** (set in Render dashboard → Environment — never commit secrets):

```
OPENAI_API_KEY          = sk-...            (secret — set manually)
GROQ_API_KEY            = gsk_...           (secret — set manually)
KAGGLE_USERNAME         = your_username     (secret — set manually)
KAGGLE_KEY              = your_key          (secret — set manually)
LANGCHAIN_API_KEY       = lsv2_...          (secret — set manually, optional)

OPENAI_MODEL            = gpt-4o-mini
GROQ_MODEL_SMALL        = llama-3.1-8b-instant
GROQ_MODEL_LARGE        = llama-3.3-70b-versatile
LLM_FALLBACK_CHAIN      = openai_mini,groq_large,groq_small
EMBEDDING_PROVIDER      = fastembed
EMBEDDING_DIM           = 384
CHROMA_PERSIST_DIR      = /opt/render/project/src/storage/chroma
CHROMA_COLLECTION       = supply_chain_incidents
DATABASE_URL            = sqlite:////opt/render/project/src/storage/checkpointer.db
LANGCHAIN_TRACING_V2    = true
LANGCHAIN_ENDPOINT      = https://api.smith.langchain.com
LANGCHAIN_PROJECT       = supply-chain-risk-assistant
SEMANTIC_CACHE_THRESHOLD = 0.92
CORS_ORIGINS            = https://your-frontend-name.onrender.com,http://localhost:5173
LOG_LEVEL               = INFO
```

### Frontend — Static Site

| Setting | Value |
|---|---|
| **Service type** | Static Site |
| **Repository** | your GitHub repo |
| **Root Directory** | `frontend` |
| **Build Command** | `npm install && npm run build` |
| **Publish Directory** | `dist` |

**Environment Variables:**

```
VITE_API_BASE_URL = https://your-backend-name.onrender.com
VITE_WS_BASE_URL  = wss://your-backend-name.onrender.com
```

> Use `wss://` (not `ws://`) — Render uses HTTPS so WebSocket must be secure.

### Wiring the two services together

1. Deploy backend first → copy its URL (e.g. `https://scria-backend.onrender.com`)
2. Set `VITE_API_BASE_URL` and `VITE_WS_BASE_URL` on the frontend service using that URL
3. Deploy frontend → copy its URL (e.g. `https://scria-frontend.onrender.com`)
4. Update `CORS_ORIGINS` on the backend service to include the frontend URL
5. Redeploy backend

### After deployment

- Open the frontend URL in your browser
- Go to Admin → load data via Kaggle (Kaggle keys must be set on backend)
- Analytics and Chat will work once data is ingested

> **Free tier note:** Render free tier spins down services after inactivity. First request after sleep takes ~30-60 seconds to wake up. Upgrade to Starter plan for always-on.

> **Local dev is unaffected.** Render dashboard env vars apply only to Render builds. Your local `.env` with `localhost` URLs is untouched.

---

## Datasets

### Primary — DataCo Smart Supply Chain

- **Source:** [Kaggle — shashwatwork/dataco-smart-supply-chain-for-big-data-analysis](https://www.kaggle.com/datasets/shashwatwork/dataco-smart-supply-chain-for-big-data-analysis)
- **File:** `DataCoSupplyChainDataset.csv`
- **Size:** 180,519 orders, global e-commerce supply chain
- **Key fields:** `Late_delivery_risk`, `Delivery Status`, `Order Status`, `Days for shipping (real/scheduled)`, `Market`, `Category Name`, `fraud`
- **Sampled to:** 2,500 rows by default (configurable via `DATACO_SAMPLE_ROWS`)

### Fallback — Supply Chain Analysis (Fashion)

- **Source:** [Kaggle — harshsingh2209/supply-chain-analysis](https://www.kaggle.com/datasets/harshsingh2209/supply-chain-analysis)
- **File:** `supply_chain_data.csv`
- **Size:** 100 rows, fashion/beauty products, 5 Indian suppliers
- **Key fields:** `SKU`, `Supplier name`, `Stock levels`, `Lead times`, `Defect rates`, `Transportation modes`

Both datasets are available locally in `data/source_dataset/` and can also be pulled fresh via Kaggle MCP if API keys are configured.

---

## Clearing Data

To reset to a clean state (no vectors, no cache, no feedback):

**Windows PowerShell:**
```powershell
Remove-Item -Recurse -Force storage\chroma
Remove-Item -Force storage\sqlite\app.db
Remove-Item -Force storage\sqlite\checkpoints.db
Remove-Item -Force data\loaded_files.json
```

**Mac/Linux:**
```bash
rm -rf storage/chroma
rm -f storage/sqlite/app.db storage/sqlite/checkpoints.db data/loaded_files.json
```

Then restart the backend. Re-run ingestion from the Admin page.
