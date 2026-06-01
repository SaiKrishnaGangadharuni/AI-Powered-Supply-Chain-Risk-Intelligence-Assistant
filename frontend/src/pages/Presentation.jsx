import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Link } from 'react-router-dom'

/* ── Eval Chart ────────────────────────────────────────────────────────────── */
function EvalChart() {
  const metrics = [
    { name: 'Faithfulness',   deepeval: 0.84, ragas: 0.82, threshold: 0.80 },
    { name: 'Ans. Relevancy', deepeval: 0.79, ragas: 0.77, threshold: 0.75 },
    { name: 'Ctx. Precision', deepeval: 0.81, ragas: 0.78, threshold: 0.75 },
    { name: 'Ctx. Recall',    deepeval: 0.73, ragas: 0.71, threshold: 0.70 },
    { name: 'Hallucination',  deepeval: 0.12, ragas: null,  threshold: 0.20, invertPass: true },
  ]
  const W = 700, H = 260, PL = 110, PR = 20, PT = 30, PB = 50
  const chartW = W - PL - PR, chartH = H - PT - PB
  const barH = 14, gap = 8, groupH = barH * 2 + gap + 24
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-h-[260px]" style={{ fontFamily: 'sans-serif' }}>
      <line x1={PL} y1={PT} x2={PL} y2={PT + chartH} stroke="#475569" strokeWidth="1" />
      <line x1={PL} y1={PT + chartH} x2={W - PR} y2={PT + chartH} stroke="#475569" strokeWidth="1" />
      {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map(v => {
        const x = PL + v * chartW
        return (
          <g key={v}>
            <line x1={x} y1={PT} x2={x} y2={PT + chartH} stroke="#334155" strokeWidth="0.5" />
            <text x={x} y={PT + chartH + 14} textAnchor="middle" fill="#94a3b8" fontSize="9">{v.toFixed(1)}</text>
          </g>
        )
      })}
      {metrics.map((m, i) => {
        const y = PT + i * groupH
        const deW = m.deepeval * chartW
        const raW = m.ragas != null ? m.ragas * chartW : 0
        const thX = PL + m.threshold * chartW
        const pass = m.invertPass ? (s) => s <= m.threshold : (s) => s >= m.threshold
        return (
          <g key={m.name}>
            <text x={PL - 6} y={y + barH - 1} textAnchor="end" fill="#e2e8f0" fontSize="9" fontWeight="600">{m.name}</text>
            <rect x={PL} y={y} width={deW} height={barH} rx="3" fill={pass(m.deepeval) ? '#22c55e' : '#ef4444'} fillOpacity="0.85" />
            <text x={PL + deW + 4} y={y + barH - 2} fill="#e2e8f0" fontSize="8">{m.deepeval.toFixed(2)} DE</text>
            {m.ragas != null && (
              <>
                <rect x={PL} y={y + barH + gap} width={raW} height={barH} rx="3" fill={pass(m.ragas) ? '#38bdf8' : '#f97316'} fillOpacity="0.85" />
                <text x={PL + raW + 4} y={y + barH + gap + barH - 2} fill="#e2e8f0" fontSize="8">{m.ragas.toFixed(2)} RAGAS</text>
              </>
            )}
            <line x1={thX} y1={y - 3} x2={thX} y2={y + barH * 2 + gap + 3} stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="3 2" />
          </g>
        )
      })}
      <rect x={PL} y={PT + chartH + 28} width={10} height={8} rx="2" fill="#22c55e" />
      <text x={PL + 14} y={PT + chartH + 36} fill="#94a3b8" fontSize="8">DeepEval (pass)</text>
      <rect x={PL + 100} y={PT + chartH + 28} width={10} height={8} rx="2" fill="#38bdf8" />
      <text x={PL + 114} y={PT + chartH + 36} fill="#94a3b8" fontSize="8">RAGAS (pass)</text>
      <line x1={PL + 210} y1={PT + chartH + 32} x2={PL + 230} y2={PT + chartH + 32} stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="3 2" />
      <text x={PL + 234} y={PT + chartH + 36} fill="#94a3b8" fontSize="8">Threshold</text>
    </svg>
  )
}

/* ── Reusable layout pieces ────────────────────────────────────────────────── */
function Tag({ text, color = 'bg-blue-500/20 text-blue-300 border-blue-500/30' }) {
  return <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${color}`}>{text}</span>
}

function SectionLabel({ letter, title, color = 'bg-blue-600' }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className={`w-7 h-7 rounded-lg ${color} flex items-center justify-center text-white font-bold text-sm`}>{letter}</span>
      <span className="text-base font-semibold text-slate-200">{title}</span>
    </div>
  )
}

function BulletList({ items, color = 'text-blue-400' }) {
  return (
    <ul className="space-y-1.5">
      {items.map((line, idx) => (
        <li key={idx} className="flex gap-2 text-sm text-slate-200">
          <span className={`${color} mt-0.5 flex-shrink-0`}>▸</span>
          <span>{line}</span>
        </li>
      ))}
    </ul>
  )
}

/* ── Slides ────────────────────────────────────────────────────────────────── */

function Slide1() {
  return (
    <div className="max-w-4xl w-full">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-xl bg-[#0C7063] flex items-center justify-center text-2xl">🔗</div>
        <div>
          <h1 className="text-3xl font-bold">AI-Powered Supply Chain</h1>
          <h1 className="text-3xl font-bold text-[#3aab99]">Risk Intelligence Assistant</h1>
        </div>
      </div>
      <p className="text-slate-400 text-sm mb-6">Analyse. Predict. Recommend — across your entire supply chain.</p>
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { icon: '🤖', title: 'Multi-Agent AI', sub: 'LangGraph orchestration with 4 specialist agents' },
          { icon: '🔍', title: 'Hybrid RAG', sub: 'ChromaDB + BM25 + RRF + Cross-encoder rerank' },
          { icon: '📊', title: 'Real Datasets', sub: 'DataCo 180k rows + Fashion 100 SKUs' },
        ].map((c, i) => (
          <div key={i} className="bg-slate-800/60 rounded-xl p-4 border border-slate-700/50">
            <div className="text-2xl mb-2">{c.icon}</div>
            <div className="text-sm font-semibold text-slate-100 mb-1">{c.title}</div>
            <div className="text-xs text-slate-400">{c.sub}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {['FastAPI', 'React + Vite', 'LangGraph', 'ChromaDB', 'GPT-4o-mini', 'Groq Llama', 'fastembed', 'DeepEval', 'RAGAS', 'LangSmith', 'Render'].map(t => (
          <Tag key={t} text={t} />
        ))}
      </div>
    </div>
  )
}

function Slide2() {
  return (
    <div className="max-w-4xl w-full">
      <h1 className="text-3xl font-semibold mb-1">Architecture Overview</h1>
      <p className="text-sm text-slate-400 mb-4">High-level system showing data ingestion, storage layers, and core components</p>
      <div className="bg-slate-800/30 rounded-xl border border-slate-700/50 overflow-hidden">
        <img src="/architecture.png" alt="Architecture Diagram" className="w-full object-contain max-h-[460px]" />
      </div>
    </div>
  )
}

function Slide3() {
  return (
    <div className="max-w-4xl w-full">
      <h1 className="text-3xl font-semibold mb-1">Tech Stack</h1>
      <p className="text-sm text-slate-400 mb-5">Section A — Data Ingestion Pipeline</p>

      <SectionLabel letter="A" title="Data Ingestion: From Raw CSV to Searchable Vector Store" color="bg-indigo-600" />

      <div className="grid grid-cols-5 gap-2 mb-4">
        {[
          { step: '① Load', detail: 'pandas CSV reader\nKaggle MCP download\n180k DataCo rows\n100 Fashion SKUs' },
          { step: '② Sample', detail: '2,500 rows sampled\nrandom_state=42\nBalanced coverage\nFast ingestion' },
          { step: '③ Transform', detail: 'Row → NL incident doc\n"Late delivery in LATAM\nvia First Class..."\nDomain-specific text' },
          { step: '④ Embed', detail: 'fastembed\nBAAI/bge-small-en\n384-dim vectors\nLocal ONNX — free' },
          { step: '⑤ Store', detail: 'ChromaDB persist\nCosine similarity\nBM25 sparse index\nSemantic cache' },
        ].map((s, i) => (
          <div key={i} className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50 text-center">
            <div className="text-xs font-bold text-[#3aab99] mb-2">{s.step}</div>
            <div className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-line">{s.detail}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-indigo-900/30 rounded-xl p-3 border border-indigo-700/40">
          <div className="text-xs font-semibold text-indigo-300 mb-1">Why fastembed?</div>
          <div className="text-xs text-slate-400">Runs locally as ONNX model — no API key, no cost, no network call during ingestion. 384-dim is 4× smaller than OpenAI (1536-dim) → faster similarity search.</div>
        </div>
        <div className="bg-purple-900/30 rounded-xl p-3 border border-purple-700/40">
          <div className="text-xs font-semibold text-purple-300 mb-1">Why ChromaDB?</div>
          <div className="text-xs text-slate-400">Open-source, persistent on disk, cosine similarity built-in. No external service needed. Survives server restarts. Works locally and on Render with a 5GB disk.</div>
        </div>
        <div className="bg-teal-900/30 rounded-xl p-3 border border-teal-700/40">
          <div className="text-xs font-semibold text-teal-300 mb-1">Why BM25 alongside?</div>
          <div className="text-xs text-slate-400">Dense vectors miss exact keyword matches (e.g. "LATAM", "First Class"). BM25 catches them. RRF fusion merges both lists — best of semantic + keyword retrieval.</div>
        </div>
      </div>
    </div>
  )
}

function Slide4() {
  const steps = [
    { icon: '💬', label: 'User Query', sub: 'Natural language\nfrom chat UI' },
    { icon: '🛡️', label: 'Input Guard', sub: 'Injection check\nLength · Domain' },
    { icon: '⚡', label: 'Cache Check', sub: 'Semantic ≥0.92\n<100ms hit' },
    { icon: '🧭', label: 'Orchestrator', sub: 'Intent + Severity\nGroq 8B fast' },
    { icon: '🤖', label: 'Specialist\nAgent', sub: 'Supplier / Ship\nInventory' },
    { icon: '🔍', label: 'Hybrid\nRetrieval', sub: 'ChromaDB+BM25\nRRF→Rerank→CRAG' },
    { icon: '✍️', label: 'Recommend-\nation', sub: 'GPT-4o-mini\nSynthesis' },
    { icon: '🔒', label: 'Output Guard', sub: 'Faithfulness\nPII redact' },
    { icon: '📤', label: 'Response', sub: 'Answer + Severity\n+ Sources' },
  ]
  return (
    <div className="max-w-4xl w-full">
      <h1 className="text-3xl font-semibold mb-1">Tech Stack</h1>
      <p className="text-sm text-slate-400 mb-5">Section B — Query to Response Pipeline</p>

      <SectionLabel letter="B" title="User Input → Agents → Retrieval → Output" color="bg-teal-700" />

      <div className="flex items-center gap-1 mb-5 overflow-x-auto pb-2">
        {steps.map((s, i) => (
          <div key={i} className="flex items-center gap-1 flex-shrink-0">
            <div className="bg-slate-800/70 border border-slate-700/50 rounded-xl p-2.5 text-center w-[84px]">
              <div className="text-lg mb-1">{s.icon}</div>
              <div className="text-[11px] font-semibold text-slate-100 leading-tight whitespace-pre-line">{s.label}</div>
              <div className="text-[10px] text-slate-400 mt-1 leading-tight whitespace-pre-line">{s.sub}</div>
            </div>
            {i < steps.length - 1 && <span className="text-slate-500 text-lg flex-shrink-0">→</span>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/40">
          <div className="text-xs font-semibold text-yellow-300 mb-2">CRAG — Corrective RAG</div>
          <div className="text-xs text-slate-300">If max rerank score &lt; 0.6, LLM reformulates the query and retrieval retries. Prevents low-quality context reaching the LLM.</div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/40">
          <div className="text-xs font-semibold text-red-300 mb-2">HILT — Human-in-the-Loop</div>
          <div className="text-xs text-slate-300">HIGH severity queries (fraud, SLA breach) pause at the Recommendation node. Human must approve before the final answer is dispatched.</div>
        </div>
      </div>
    </div>
  )
}

function Slide5() {
  const folders = [
    { name: 'backend/app/agents/', color: 'text-blue-400', items: ['graph.py — LangGraph DAG wiring', 'orchestrator.py — intent + severity routing', 'supplier_risk / shipment / inventory — specialists', 'recommendation.py — final synthesis + faithfulness'] },
    { name: 'backend/app/retrieval/', color: 'text-purple-400', items: ['vector_store.py — ChromaDB wrapper', 'bm25_index.py — sparse keyword index', 'hybrid_search.py — RRF fusion logic', 'reranker.py — cosine reranker top-5'] },
    { name: 'backend/app/guardrails/', color: 'text-red-400', items: ['input_guard.py — injection + domain check', 'output_guard.py — faithfulness + PII scrub', 'llm_compress.py — token limit enforcement'] },
    { name: 'backend/app/ingestion/', color: 'text-green-400', items: ['pipeline.py — full ingestion orchestration', 'transformer.py — row → NL incident doc', 'kaggle_mcp.py — Kaggle MCP client', 'file_registry.py — prevents re-ingestion'] },
    { name: 'frontend/src/pages/', color: 'text-yellow-400', items: ['Chat.jsx — main conversation UI', 'Flow.jsx — live LangGraph DAG viz', 'Admin.jsx — ingestion control panel', 'Analytics.jsx — charts dashboard'] },
    { name: 'Root files', color: 'text-slate-300', items: ['requirements.txt — all Python deps', 'render.yaml — Render deploy config', 'runtime.txt — Python 3.11.9 for Render', '.env.example — env var template'] },
  ]
  return (
    <div className="max-w-4xl w-full">
      <h1 className="text-3xl font-semibold mb-1">Repository Structure</h1>
      <p className="text-sm text-slate-400 mb-4">What each folder does and why it exists</p>
      <div className="grid grid-cols-2 gap-3">
        {folders.map((f, i) => (
          <div key={i} className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/40">
            <div className={`text-xs font-bold mb-2 font-mono ${f.color}`}>{f.name}</div>
            <ul className="space-y-0.5">
              {f.items.map((item, j) => (
                <li key={j} className="text-[11px] text-slate-300 flex gap-1.5">
                  <span className="text-slate-500 flex-shrink-0">·</span>{item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

function Slide6() {
  const sections = [
    {
      title: 'LLM Providers', color: 'border-blue-500/40 bg-blue-900/20',
      vars: [
        { k: 'OPENAI_API_KEY', w: 'Authenticates GPT-4o-mini — primary reasoning model' },
        { k: 'OPENAI_BASE_URL', w: 'Gateway URL (arshniv) — routes calls without direct OpenAI account' },
        { k: 'GROQ_API_KEY', w: 'Groq — free fast LLM for routing (8B) and fallback (70B)' },
        { k: 'LLM_FALLBACK_CHAIN', w: 'openai_mini → groq_large → groq_small — resilience if one fails' },
      ]
    },
    {
      title: 'Embeddings & Retrieval', color: 'border-purple-500/40 bg-purple-900/20',
      vars: [
        { k: 'EMBEDDING_PROVIDER', w: 'fastembed — local ONNX, no API cost during ingestion' },
        { k: 'FASTEMBED_MODEL', w: 'BAAI/bge-small-en-v1.5 — 384-dim, production-grade retrieval model' },
        { k: 'CRAG_RELEVANCE_THRESHOLD', w: '0.6 — rerank score below this triggers query reformulation' },
        { k: 'SEMANTIC_CACHE_THRESHOLD', w: '0.92 cosine — same query returns cached answer in <100ms' },
      ]
    },
    {
      title: 'Storage & Persistence', color: 'border-green-500/40 bg-green-900/20',
      vars: [
        { k: 'CHROMA_PERSIST_DIR', w: 'Where ChromaDB saves vectors — survives server restarts' },
        { k: 'LANGGRAPH_CHECKPOINT_DB', w: 'SQLite for conversation state — enables multi-turn memory' },
        { k: 'DATACO_SAMPLE_ROWS', w: '2500 — balance between coverage and ingestion speed' },
      ]
    },
    {
      title: 'Guardrails & Safety', color: 'border-red-500/40 bg-red-900/20',
      vars: [
        { k: 'HIGH_SEVERITY_INTERRUPT', w: 'true in prod — pauses pipeline for human review on fraud/SLA alerts' },
        { k: 'MAX_CONTEXT_TOKENS', w: '6000 — prevents context overflow to LLM' },
        { k: 'INJECTION_DETECTION_ENABLED', w: 'Blocks "ignore previous instructions" style attacks' },
        { k: 'LANGCHAIN_API_KEY', w: 'LangSmith — traces every agent call for debugging' },
      ]
    },
  ]
  return (
    <div className="max-w-4xl w-full">
      <h1 className="text-3xl font-semibold mb-1">Environment Variables</h1>
      <p className="text-sm text-slate-400 mb-4">What each key does and why it matters</p>
      <div className="grid grid-cols-2 gap-3">
        {sections.map((s, i) => (
          <div key={i} className={`rounded-xl p-3 border ${s.color}`}>
            <div className="text-xs font-bold text-slate-200 mb-2">{s.title}</div>
            <ul className="space-y-1.5">
              {s.vars.map((v, j) => (
                <li key={j} className="text-[11px]">
                  <span className="font-mono text-[#3aab99]">{v.k}</span>
                  <span className="text-slate-400"> — {v.w}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

function Slide7() {
  return (
    <div className="max-w-4xl w-full">
      <h1 className="text-3xl font-semibold mb-1">Multi-Agent Design</h1>
      <p className="text-sm text-slate-400 mb-4">LangGraph DAG with conditional routing and interrupt support</p>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { name: 'Orchestrator', model: 'Groq llama-3.1-8b-instant', color: 'bg-teal-700', desc: 'Classifies intent: supplier_risk / shipment / inventory / general. Sets severity: LOW / MEDIUM / HIGH. Routes to correct specialist via conditional edge.' },
          { name: 'Supplier Risk Agent', model: 'GPT-4o-mini', color: 'bg-amber-700', desc: 'Handles: vendor reliability, lead time gaps, SUSPECTED_FRAUD patterns, defect rates. Retrieves from ChromaDB + BM25 on supplier-related context.' },
          { name: 'Shipment Analysis', model: 'GPT-4o-mini', color: 'bg-amber-700', desc: 'Handles: Late_delivery_risk, carrier performance, shipping mode comparison (First Class 95.3% late), routing failures.' },
          { name: 'Inventory Intelligence', model: 'GPT-4o-mini', color: 'bg-amber-700', desc: 'Handles: stockout detection (stock < 25th pct = 16.8 units), reorder signals, demand spikes, safety stock recommendations.' },
          { name: 'Recommendation', model: 'GPT-4o-mini', color: 'bg-green-700', desc: 'Synthesises specialist output into final answer. Runs faithfulness check (LLM judge). Emits SSE events. Triggers HILT on HIGH severity.' },
          { name: 'SQLite Checkpointer', model: 'LangGraph built-in', color: 'bg-slate-600', desc: 'Persists full pipeline state to disk. Enables multi-turn conversation memory. Allows HILT to pause and resume across HTTP requests.' },
        ].map((a, i) => (
          <div key={i} className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50">
            <div className={`inline-block text-xs px-2 py-0.5 rounded-full text-white mb-2 ${a.color}`}>{a.name}</div>
            <div className="text-[10px] text-slate-400 mb-1">{a.model}</div>
            <div className="text-xs text-slate-300 leading-relaxed">{a.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Slide8() {
  return (
    <div className="max-w-4xl w-full">
      <h1 className="text-3xl font-semibold mb-1">Guardrails & Safety</h1>
      <p className="text-sm text-slate-400 mb-4">Every query passes through 3 guard layers — input, context, output</p>
      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          {
            title: '🛡️ Input Guard', color: 'border-blue-500/40',
            items: ['Length check (max 4000 chars)', 'Regex injection detection — blocks "ignore previous instructions"', 'Greeting fast-path — no LLM needed', 'Follow-up detection — "explain more" passes through', 'Domain check via Groq 8B — rejects off-topic queries', 'Fail-open — if LLM unavailable, query proceeds']
          },
          {
            title: '📦 Context Guard', color: 'border-yellow-500/40',
            items: ['Token counter (tiktoken cl100k_base)', 'Hard cap at 6000 tokens', 'Truncates lowest-ranked docs first', 'Preserves top-ranked context intact', 'Fallback word-count estimator if tiktoken offline']
          },
          {
            title: '🔒 Output Guard', color: 'border-red-500/40',
            items: ['PII scrubbing — email, phone, SSN, credit card → [REDACTED]', 'Faithfulness check — Groq LLM judge verifies answer vs context', 'Returns faithful=true/false + reason', 'Contributes to Run Quality score (40pts)', 'HILT trigger on HIGH severity before dispatch']
          },
        ].map((g, i) => (
          <div key={i} className={`bg-slate-800/50 rounded-xl p-4 border ${g.color}`}>
            <div className="text-sm font-semibold text-slate-100 mb-3">{g.title}</div>
            <ul className="space-y-1.5">
              {g.items.map((item, j) => (
                <li key={j} className="text-xs text-slate-300 flex gap-1.5">
                  <span className="text-slate-500 flex-shrink-0">·</span>{item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

function Slide9() {
  return (
    <div className="max-w-4xl w-full">
      <h1 className="text-3xl font-semibold mb-1">Evaluation Framework</h1>
      <p className="text-sm text-slate-400 mb-3">DeepEval + RAGAS — 50 data-grounded golden Q&A pairs</p>
      <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50 mb-3">
        <EvalChart />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/40">
          <div className="text-xs font-semibold text-green-300 mb-1">50 Golden Q&A Pairs</div>
          <div className="text-xs text-slate-400">Grounded in real dataset values — First Class 95.3% late, LATAM 1182 fraud, Supplier 3 14.3d lead time. Not generic questions.</div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/40">
          <div className="text-xs font-semibold text-blue-300 mb-1">Dual Framework</div>
          <div className="text-xs text-slate-400">DeepEval measures Faithfulness, Relevancy, Hallucination. RAGAS measures Context Precision and Recall. Cross-validated.</div>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/40">
          <div className="text-xs font-semibold text-yellow-300 mb-1">LLM-as-Judge</div>
          <div className="text-xs text-slate-400">Groq model acts as faithfulness judge on every live query — not just eval runs. Score shown in Flow page Run Quality panel.</div>
        </div>
      </div>
    </div>
  )
}

function Slide10() {
  return (
    <div className="max-w-4xl w-full">
      <h1 className="text-3xl font-semibold mb-1">Deployment</h1>
      <p className="text-sm text-slate-400 mb-4">Two-service architecture on Render</p>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-slate-800/50 rounded-xl p-4 border border-purple-500/30">
          <div className="text-sm font-semibold text-purple-300 mb-3">🖥️ Backend — Web Service</div>
          <ul className="space-y-1.5 text-xs text-slate-300">
            <li>· FastAPI + uvicorn, Python 3.11.9 (runtime.txt)</li>
            <li>· <span className="font-mono text-slate-400">uvicorn app.main:app --app-dir backend</span></li>
            <li>· 5GB persistent disk → ChromaDB + SQLite</li>
            <li>· BAAI embedding model cached on first boot (~130MB)</li>
            <li>· CORS_ORIGINS set to frontend Render URL</li>
          </ul>
        </div>
        <div className="bg-slate-800/50 rounded-xl p-4 border border-blue-500/30">
          <div className="text-sm font-semibold text-blue-300 mb-3">🌐 Frontend — Static Site</div>
          <ul className="space-y-1.5 text-xs text-slate-300">
            <li>· React + Vite, rootDir = frontend/</li>
            <li>· <span className="font-mono text-slate-400">npm ci &amp;&amp; npm run build</span></li>
            <li>· VITE_API_BASE_URL = backend Render URL</li>
            <li>· VITE_WS_BASE_URL = wss:// (secure WebSocket)</li>
            <li>· SPA rewrite rule: all paths → index.html</li>
          </ul>
        </div>
      </div>
      <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/40">
        <div className="text-xs font-semibold text-teal-300 mb-2">Post-Deploy Steps</div>
        <div className="flex gap-6 text-xs text-slate-300">
          <span>① Deploy backend first</span>
          <span className="text-slate-500">→</span>
          <span>② Copy backend URL to VITE_API_BASE_URL</span>
          <span className="text-slate-500">→</span>
          <span>③ Deploy frontend</span>
          <span className="text-slate-500">→</span>
          <span>④ Trigger ingestion from Admin page</span>
          <span className="text-slate-500">→</span>
          <span>⑤ Run evaluation</span>
        </div>
      </div>
    </div>
  )
}

/* ── Slide registry ────────────────────────────────────────────────────────── */
const SLIDES = [
  { id: 'title',      label: 'Overview',       component: <Slide1 /> },
  { id: 'arch',       label: 'Architecture',   component: <Slide2 /> },
  { id: 'ingest',     label: 'Data Ingestion', component: <Slide3 /> },
  { id: 'pipeline',   label: 'Query Pipeline', component: <Slide4 /> },
  { id: 'repo',       label: 'Repo Structure', component: <Slide5 /> },
  { id: 'env',        label: 'ENV Variables',  component: <Slide6 /> },
  { id: 'agents',     label: 'Agents',         component: <Slide7 /> },
  { id: 'guardrails', label: 'Guardrails',     component: <Slide8 /> },
  { id: 'eval',       label: 'Evaluation',     component: <Slide9 /> },
  { id: 'deploy',     label: 'Deployment',     component: <Slide10 /> },
]

/* ── Presentation shell ────────────────────────────────────────────────────── */
export default function Presentation() {
  const [i, setI] = useState(0)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') setI((x) => Math.min(SLIDES.length - 1, x + 1))
      if (e.key === 'ArrowLeft')  setI((x) => Math.max(0, x - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const s = SLIDES[i]

  return (
    <div className="h-screen w-screen bg-slate-900 text-white flex flex-col">
      <header className="px-6 py-3 flex items-center justify-between border-b border-white/10 flex-shrink-0">
        <span className="text-xs text-slate-400">{i + 1} / {SLIDES.length}</span>
        <div className="flex gap-1">
          {SLIDES.map((sl, idx) => (
            <button key={sl.id} onClick={() => setI(idx)}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                idx === i ? 'bg-[#0C7063] text-white' : 'text-slate-500 hover:text-slate-300'
              }`}>
              {sl.label}
            </button>
          ))}
        </div>
        <Link to="/" className="text-slate-400 hover:text-white" title="Exit">
          <X size={18} />
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-8 py-4 overflow-auto">
        {s.component}
      </main>

      <footer className="px-6 py-3 flex items-center justify-between border-t border-white/10 flex-shrink-0">
        <button onClick={() => setI((x) => Math.max(0, x - 1))}
          className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white disabled:opacity-30"
          disabled={i === 0}>
          <ChevronLeft size={16} /> Prev
        </button>
        <div className="flex gap-1.5">
          {SLIDES.map((_, idx) => (
            <button key={idx} onClick={() => setI(idx)}
              className={`w-2 h-2 rounded-full transition-colors ${idx === i ? 'bg-[#3aab99]' : 'bg-slate-600 hover:bg-slate-400'}`} />
          ))}
        </div>
        <button onClick={() => setI((x) => Math.min(SLIDES.length - 1, x + 1))}
          className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white disabled:opacity-30"
          disabled={i === SLIDES.length - 1}>
          Next <ChevronRight size={16} />
        </button>
      </footer>
    </div>
  )
}
