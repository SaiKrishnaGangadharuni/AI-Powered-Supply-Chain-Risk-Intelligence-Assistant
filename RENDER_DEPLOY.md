# Render Deployment Guide

## Pre-flight checklist

- [ ] Valid OpenAI API key (not throttled)
- [ ] Groq API key
- [ ] LangSmith API key
- [ ] Kaggle credentials (KAGGLE_USERNAME + KAGGLE_KEY)
- [ ] HuggingFace token (for BAAI/bge-small-en-v1.5 download)
- [ ] GitHub repo connected to Render

---

## Step 1 — Deploy the backend

1. In Render Dashboard → **New → Web Service**
2. Connect your GitHub repo
3. Set **Root Directory**: `.` (repo root)
4. Set **Runtime**: Python 3.11
5. **Build command**: `pip install --upgrade pip && pip install -r requirements.txt`
6. **Start command**:
   ```
   uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT --workers 1 --timeout-keep-alive 75
   ```
7. Add **Persistent Disk**:
   - Name: `scria-storage`
   - Mount path: `/opt/render/project/src/storage`
   - Size: 5 GB
8. Set **Environment Variables** (Dashboard → Environment):

| Key | Value |
|-----|-------|
| OPENAI_API_KEY | your key |
| GROQ_API_KEY | your key |
| HUGGINGFACE_TOKEN | your token |
| LANGCHAIN_API_KEY | your key |
| KAGGLE_USERNAME | your username |
| KAGGLE_KEY | your kaggle.json key |
| CHROMA_PERSIST_DIR | /opt/render/project/src/storage/chroma |
| DATABASE_URL | sqlite:////opt/render/project/src/storage/checkpointer.db |
| CORS_ORIGINS | https://scria-frontend.onrender.com,http://localhost:5173 |
| LANGCHAIN_TRACING_V2 | true |
| LANGCHAIN_PROJECT | supply-chain-risk-assistant |
| OPENAI_MODEL | gpt-4o-mini |
| GROQ_MODEL_SMALL | llama-3.1-8b-instant |
| GROQ_MODEL_LARGE | llama-3.3-70b-versatile |
| EMBEDDING_MODEL | BAAI/bge-small-en-v1.5 |
| RERANKER_MODEL | cross-encoder/ms-marco-MiniLM-L-6-v2 |

9. Deploy. Wait for health check at `/health` to return `{"status": "ok"}`.
10. Copy the backend URL (e.g. `https://scria-backend.onrender.com`)

---

## Step 2 — Deploy the frontend

1. Render Dashboard → **New → Static Site**
2. Connect same repo
3. **Root Directory**: `frontend`
4. **Build command**: `npm ci && npm run build`
5. **Publish directory**: `./dist`
6. Set **Environment Variables**:

| Key | Value |
|-----|-------|
| VITE_API_BASE_URL | https://scria-backend.onrender.com |
| VITE_WS_BASE_URL | wss://scria-backend.onrender.com |

7. Deploy. The static site will be at `https://scria-frontend.onrender.com`.

---

## Step 3 — Post-deploy smoke test

```bash
# Health
curl https://scria-backend.onrender.com/health

# Anomaly summary (fast)
curl https://scria-backend.onrender.com/api/anomaly/summary?sample_n=500

# Eval golden dataset sample
curl https://scria-backend.onrender.com/api/evaluation/golden?limit=3

# Trigger offline eval (no OpenAI cost)
curl -X POST https://scria-backend.onrender.com/api/evaluation/run \
  -H "Content-Type: application/json" \
  -d '{"tool":"ragas","max_samples":3,"offline":true}'
```

---

## Known limitations on free/starter tier

| Issue | Mitigation |
|-------|-----------|
| Cold start ~30s (free tier sleeps) | Upgrade to Starter ($7/mo) for always-on |
| BAAI model downloads ~130MB at boot | First boot is slow; subsequent boots use HF cache on disk |
| SQLite concurrency | Single worker (`--workers 1`) avoids write conflicts |
| DataCo CSV not in repo (large file) | Trigger ingestion via `/api/ingestion` after deploy |
