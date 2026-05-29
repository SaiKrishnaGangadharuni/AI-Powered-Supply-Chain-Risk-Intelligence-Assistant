# AI-Powered Supply Chain Risk Intelligence Assistant

An intelligent assistant for supply chain operations teams. Ask natural-language questions about supplier delays, shipment risks, inventory shortages, and fraud signals — the system retrieves historical incidents, runs multi-agent analysis, and returns explainable mitigation recommendations.

---

## Architecture Overview

```
Kaggle MCP / Local CSV
        │
        ▼
  Ingestion Pipeline
  (transform → embed → index)
        │
        ├──► ChromaDB (dense vectors, BGE-small-en-v1.5)
        └──► BM25 Index (sparse keyword)
                │
                ▼
       Hybrid Retrieval Layer
       Dense + Sparse → RRF Fusion
       → Cross-encoder Rerank → CRAG
                │
                ▼
      LangGraph Multi-Agent System
      ┌─────────────────────────────┐
      │  Orchestrator (intent+sev)  │
      │    ↓         ↓         ↓   │
      │ Supplier  Shipment  Invent  │
      │  Risk     Analysis  Intel   │
      │    └────────┬───────┘       │
      │        Recommendation       │
      └─────────────────────────────┘
                │
                ▼
         FastAPI Backend
         (WebSocket streaming)
                │
                ▼
      React + Vite + Tailwind
      Chat │ Analytics │ Admin │ Present
```

Full visual diagram: `docs/architecture/architecture.svg`

---

## Tech Stack

| Layer | Technology |
|---|---|
| LLM (primary) | GPT-4o-mini (org key) |
| LLM (routing/classify) | Groq llama-3.1-8b-instant (free) |
| LLM (summarization) | Groq llama-3.3-70b-versatile (free) |
| Embeddings | BAAI/bge-small-en-v1.5 (local, free) |
| Vector DB | ChromaDB (persistent) |
| Sparse search | rank-bm25 |
| Fusion | Reciprocal Rank Fusion (RRF) |
| Reranker | cross-encoder/ms-marco-MiniLM-L-6-v2 |
| CRAG | Query reformulation on low relevance |
| Agents | LangGraph (SQLite checkpointer) |
| Evaluation | DeepEval + RAGAS |
| Tracing | LangSmith |
| Guardrails | Custom hybrid (Pydantic + LLM domain check) |
| Context compression | LLMLingua |
| Backend | FastAPI + WebSocket |
| Frontend | React 18 + Vite + Tailwind + Recharts |

---

## Project Structure

```
├── backend/
│   └── app/
│       ├── agents/          # LangGraph agents
│       ├── api/routes/      # FastAPI endpoints
│       ├── cache/           # Semantic + keyword cache
│       ├── core/            # Config, LLM router, logging
│       ├── evaluation/      # DeepEval, RAGAS, golden dataset
│       ├── guardrails/      # Input/output guards + LLMLingua
│       ├── ingestion/       # Kaggle MCP + local loader + transformer
│       ├── mcp_server/      # Custom Kaggle MCP stdio server
│       ├── models/          # Pydantic schemas
│       ├── retrieval/       # ChromaDB, BM25, hybrid search, reranker
│       └── services/        # Event bus, feedback store, anomaly detector
├── frontend/
│   └── src/
│       ├── pages/           # Chat, Analytics, Admin, Flow, Presentation
│       ├── components/      # Message, FlowViz, DocsDrawer, SeverityBadge
│       ├── hooks/           # useFlowState
│       └── api/             # client.js
├── data/
│   └── source_dataset/      # DataCo CSV + Fashion CSV
├── docs/
│   └── architecture/        # architecture.svg, design.md
├── requirements.txt
└── .env.example
```

---

## Setup

### 1. Prerequisites

- Python 3.11+
- Node.js 18+
- Git

### 2. Clone & environment variables

```bash
git clone <repo-url>
cd AI-Powered-Supply-Chain-Risk-Intelligence-Assistant
cp .env.example .env
```

Edit `.env` and fill in:

```env
OPENAI_API_KEY=sk-...          # org-provided GPT-4o-mini key
GROQ_API_KEY=gsk_...           # free at console.groq.com
LANGCHAIN_API_KEY=ls__...      # free at smith.langchain.com
KAGGLE_USERNAME=your_username
KAGGLE_KEY=your_kaggle_api_key
```

### 3. Backend

```bash
# From repo root (requirements.txt is at root)
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Mac/Linux

pip install -r requirements.txt

cd backend
uvicorn app.main:app --reload --port 8000
```

Backend starts at `http://localhost:8000`
API docs at `http://localhost:8000/docs`

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend starts at `http://localhost:5173`

---

## Data Ingestion

### Via Admin UI (recommended)

1. Open `http://localhost:5173/admin`
2. Select dataset: **DataCo** (180k rows, e-commerce supply chain) or **Fashion** (100 rows, fallback)
3. Select source: **Kaggle MCP** (fetches fresh data) or **Local CSV** (uses downloaded file)
4. Click **Run Ingestion**
5. Watch the status panel — ingestion takes ~60-120 seconds for DataCo

### Via API

```bash
# Trigger ingestion (DataCo, auto source)
curl -X POST http://localhost:8000/api/ingestion/run \
  -H "Content-Type: application/json" \
  -d '{"dataset": "dataco", "source": "auto", "reset": false}'

# Poll status
curl http://localhost:8000/api/ingestion/status
```

### What the pipeline does

1. **Load** — Kaggle MCP fetch or local CSV read
2. **Sample** — DataCo sampled to 2,500 rows (configurable)
3. **Transform** — Each row → natural-language incident document
   - Example: *"Order 12345 from Consumer segment in LATAM. Product: Field & Stream Sportsman 16 Gun Fire Safe (Furniture). Shipping: Standard Class via Route A. Scheduled: 4 days, Actual: 6 days. Late delivery risk: YES. Order status: COMPLETE. Profit: $12.50."*
4. **Embed** — BGE-small-en-v1.5 (384-dim vectors)
5. **Index** — ChromaDB (dense) + BM25 (sparse) built in parallel

---

## Sample Queries

Once ingested, try these in the Chat interface or via API:

```
"Which shipping modes have the highest late delivery risk?"
"Are there fraud patterns in any specific market or region?"
"What is driving the high cancellation rate in the LATAM market?"
"Which product categories face the most supply chain disruption?"
"Recommend mitigation strategies for Standard Class shipping delays."
"Are there any demand spike anomalies that could cause stockouts?"
```

---

## Example API Usage

### Query (REST)

```bash
curl -X POST http://localhost:8000/api/chat/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Which markets have the highest late delivery risk and what should we do?",
    "session_id": "demo-001"
  }'
```

**Example response:**

```json
{
  "answer": "Based on retrieved incidents, the LATAM and Europe markets show the highest late delivery risk (Late_delivery_risk=1) — particularly for Standard Class shipments [Doc 3][Doc 7]. Key drivers include longer international transit times and customs delays. Recommendations: (1) Switch high-value LATAM orders to Second Class or First Class shipping; (2) Increase safety stock for top-selling categories in these markets; (3) Flag Standard Class LATAM routes for carrier performance review.",
  "severity": "HIGH",
  "intent": "shipment_analysis",
  "docs": [...],
  "needs_human": true
}
```

### WebSocket (streaming)

```javascript
const ws = new WebSocket('ws://localhost:8000/api/chat/ws')
ws.send(JSON.stringify({
  query: "What are the main fraud signals in the DataCo dataset?",
  session_id: "demo-002"
}))
ws.onmessage = (e) => {
  const data = JSON.parse(e.data)
  // types: node_update | retrieval | crag_retry | final | guard_block
  console.log(data.type, data)
}
```

### Trigger evaluation

```bash
# Run DeepEval + RAGAS (offline mode, 10 samples)
curl -X POST http://localhost:8000/api/evaluation/run \
  -H "Content-Type: application/json" \
  -d '{"tool": "both", "max_samples": 10, "offline": true}'

# Poll result
curl http://localhost:8000/api/evaluation/status/<job_id>
```

### Run anomaly detection

```bash
curl -X POST http://localhost:8000/api/anomaly/run \
  -H "Content-Type: application/json" \
  -d '{"sample_n": 5000}'
```

### Analytics dashboard data

```bash
curl http://localhost:8000/api/analytics/summary
curl http://localhost:8000/api/analytics/late-delivery-by-market
curl http://localhost:8000/api/analytics/shipment-mode-breakdown
```

---

## UI Routes

| Route | Description |
|---|---|
| `/` | Chat interface — ChatGPT-style with live agent flow panel |
| `/analytics` | Supply chain analytics dashboard (Recharts) |
| `/flow` | Fullscreen agent pipeline DAG visualization |
| `/admin` | Data ingestion control + Kaggle MCP browser |
| `/present` | Built-in presentation mode for panel demo |

---

## Evaluation

Golden dataset: `backend/app/evaluation/golden_dataset.json` (50 Q&A pairs)

```bash
# Via API
curl -X POST http://localhost:8000/api/evaluation/run \
  -d '{"tool": "both", "max_samples": 15, "offline": true}'

# Via Admin UI: navigate to /admin and trigger from the Evaluation section
```

**Metrics tracked:**

| Framework | Metrics |
|---|---|
| DeepEval | Faithfulness, Answer Relevancy, Contextual Precision, Contextual Recall, Hallucination |
| RAGAS | Faithfulness, Answer Relevancy, Context Precision, Context Recall |

---

## Deployment (Render)

1. Push repo to GitHub
2. Create **Web Service** on Render — root `backend/`, start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
3. Create **Static Site** on Render — root `frontend/`, build: `npm run build`, publish: `dist/`
4. Add a **Disk** to the web service (mount at `/data`) for ChromaDB + SQLite persistence
5. Set all env vars from `.env` in Render dashboard

---

## Dataset

**Primary:** DataCo Smart Supply Chain (`shashwatwork/dataco-smart-supply-chain-for-big-data-analysis`)
- 180,519 orders, global e-commerce supply chain
- Key risk fields: `Late_delivery_risk`, `Delivery Status`, `Order Status`, `Days for shipping (real/scheduled)`

**Fallback:** Supply Chain Analysis (`harshsingh2209/supply-chain-analysis`)
- 100 rows, fashion/beauty products, 5 Indian suppliers

Both datasets pulled via **Kaggle MCP** (`https://www.kaggle.com/mcp`) with local CSV fallback.
