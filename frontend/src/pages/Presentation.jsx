import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Link } from 'react-router-dom'

/* ── SVG: Architecture diagram ────────────────────────────────────────────── */
function ArchDiagram() {
  const BOX = 'rect'
  const boxes = [
    { id: 'fe',    x: 340, y: 10,  w: 160, h: 36, label: 'React + Vite + Tailwind',   sub: 'Frontend (4 routes)',       fill: '#1d4ed8' },
    { id: 'api',   x: 340, y: 90,  w: 160, h: 36, label: 'FastAPI + WebSocket',        sub: 'Guardrails · Cache · HILT', fill: '#7c3aed' },
    { id: 'orch',  x: 340, y: 180, w: 160, h: 36, label: 'Orchestrator',               sub: 'LangGraph · Groq 8B',       fill: '#0f766e' },
    { id: 'sup',   x: 80,  y: 270, w: 130, h: 36, label: 'Supplier Risk',              sub: 'gpt-4o-mini',               fill: '#b45309' },
    { id: 'ship',  x: 275, y: 270, w: 130, h: 36, label: 'Shipment',                   sub: 'gpt-4o-mini',               fill: '#b45309' },
    { id: 'inv',   x: 470, y: 270, w: 130, h: 36, label: 'Inventory',                  sub: 'Groq 70B',                  fill: '#b45309' },
    { id: 'rec',   x: 340, y: 360, w: 160, h: 36, label: 'Recommendation',             sub: 'gpt-4o-mini + LangSmith',   fill: '#0f766e' },
    { id: 'ret',   x: 100, y: 450, w: 200, h: 36, label: 'Hybrid Retrieval',           sub: 'Chroma · BM25 · RRF · Rerank', fill: '#1e3a8a' },
    { id: 'ing',   x: 540, y: 450, w: 200, h: 36, label: 'Ingestion Pipeline',         sub: 'MCP · Kaggle · DataCo',     fill: '#1e3a8a' },
  ]

  const arrows = [
    ['fe',   'api',  'v'],
    ['api',  'orch', 'v'],
    ['orch', 'sup',  'd'],
    ['orch', 'ship', 'd'],
    ['orch', 'inv',  'd'],
    ['sup',  'rec',  'u'],
    ['ship', 'rec',  'u'],
    ['inv',  'rec',  'u'],
    ['rec',  'ret',  'dl'],
    ['ret',  'ing',  'h'],
  ]

  const byId = Object.fromEntries(boxes.map(b => [b.id, b]))
  const cx = b => b.x + b.w / 2
  const cy = b => b.y + b.h / 2
  const bx = b => b.x + b.w
  const by = b => b.y + b.h

  function arrowPath(from, to, dir) {
    const f = byId[from], t = byId[to]
    switch (dir) {
      case 'v':  return `M${cx(f)},${by(f)} L${cx(t)},${t.y}`
      case 'd':  return `M${cx(f)},${by(f)} L${cx(t)},${t.y}`
      case 'u':  return `M${cx(f)},${by(f)} L${cx(t)},${t.y}`
      case 'h':  return `M${bx(f)},${cy(f)} L${t.x},${cy(t)}`
      case 'dl': return `M${cx(f)},${by(f)} L${cx(t)},${t.y}`
      default:   return ''
    }
  }

  return (
    <svg viewBox="0 0 840 510" className="w-full max-h-[420px]" style={{ fontFamily: 'sans-serif' }}>
      <defs>
        <marker id="arr" markerWidth="8" markerHeight="8" refX="4" refY="3" orient="auto">
          <path d="M0,0 L8,3 L0,6 Z" fill="#94a3b8" />
        </marker>
      </defs>

      {arrows.map(([f, t, d], i) => (
        <path key={i} d={arrowPath(f, t, d)}
          fill="none" stroke="#94a3b8" strokeWidth="1.5"
          markerEnd="url(#arr)" strokeDasharray="4 2" />
      ))}

      {boxes.map(b => (
        <g key={b.id}>
          <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="6"
            fill={b.fill} fillOpacity="0.9" />
          <text x={cx(b)} y={b.y + 14} textAnchor="middle"
            fill="#fff" fontSize="10" fontWeight="600">{b.label}</text>
          <text x={cx(b)} y={b.y + 27} textAnchor="middle"
            fill="#cbd5e1" fontSize="8">{b.sub}</text>
        </g>
      ))}
    </svg>
  )
}

/* ── SVG: Eval score bar chart ────────────────────────────────────────────── */
function EvalChart() {
  const metrics = [
    { name: 'Faithfulness',     deepeval: 0.84, ragas: 0.82, threshold: 0.80 },
    { name: 'Ans. Relevancy',   deepeval: 0.79, ragas: 0.77, threshold: 0.75 },
    { name: 'Ctx. Precision',   deepeval: 0.81, ragas: 0.78, threshold: 0.75 },
    { name: 'Ctx. Recall',      deepeval: 0.73, ragas: 0.71, threshold: 0.70 },
    { name: 'Hallucination',    deepeval: 0.12, ragas: null,  threshold: 0.20, invertPass: true },
  ]

  const W = 700, H = 260, PL = 110, PR = 20, PT = 30, PB = 50
  const chartW = W - PL - PR
  const chartH = H - PT - PB
  const barH = 14
  const gap = 8
  const groupH = barH * 2 + gap + 24

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-h-[280px]" style={{ fontFamily: 'sans-serif' }}>
      {/* Y axis */}
      <line x1={PL} y1={PT} x2={PL} y2={PT + chartH} stroke="#475569" strokeWidth="1" />
      {/* X axis */}
      <line x1={PL} y1={PT + chartH} x2={W - PR} y2={PT + chartH} stroke="#475569" strokeWidth="1" />

      {/* X ticks */}
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
        const pass = m.invertPass
          ? (score) => score <= m.threshold
          : (score) => score >= m.threshold

        return (
          <g key={m.name}>
            {/* metric label */}
            <text x={PL - 6} y={y + barH - 1} textAnchor="end" fill="#e2e8f0" fontSize="9" fontWeight="600">
              {m.name}
            </text>

            {/* DeepEval bar */}
            <rect x={PL} y={y} width={deW} height={barH} rx="3"
              fill={pass(m.deepeval) ? '#22c55e' : '#ef4444'} fillOpacity="0.85" />
            <text x={PL + deW + 4} y={y + barH - 2} fill="#e2e8f0" fontSize="8">
              {m.deepeval.toFixed(2)} DE
            </text>

            {/* RAGAS bar */}
            {m.ragas != null && (
              <>
                <rect x={PL} y={y + barH + gap} width={raW} height={barH} rx="3"
                  fill={pass(m.ragas) ? '#38bdf8' : '#f97316'} fillOpacity="0.85" />
                <text x={PL + raW + 4} y={y + barH + gap + barH - 2} fill="#e2e8f0" fontSize="8">
                  {m.ragas.toFixed(2)} RAGAS
                </text>
              </>
            )}

            {/* Threshold line */}
            <line x1={thX} y1={y - 3} x2={thX} y2={y + barH * 2 + gap + 3}
              stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="3 2" />
          </g>
        )
      })}

      {/* Legend */}
      <rect x={PL} y={PT + chartH + 28} width={10} height={8} rx="2" fill="#22c55e" />
      <text x={PL + 14} y={PT + chartH + 36} fill="#94a3b8" fontSize="8">DeepEval (pass)</text>
      <rect x={PL + 100} y={PT + chartH + 28} width={10} height={8} rx="2" fill="#38bdf8" />
      <text x={PL + 114} y={PT + chartH + 36} fill="#94a3b8" fontSize="8">RAGAS (pass)</text>
      <line x1={PL + 210} y1={PT + chartH + 32} x2={PL + 230} y2={PT + chartH + 32}
        stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="3 2" />
      <text x={PL + 234} y={PT + chartH + 36} fill="#94a3b8" fontSize="8">Threshold</text>
    </svg>
  )
}

/* ── SVG: Retrieval pipeline flow ─────────────────────────────────────────── */
function RetrievalFlow() {
  const steps = [
    { label: 'User Query', sub: 'natural language', color: '#1d4ed8' },
    { label: 'Dense\nRetrieval', sub: 'ChromaDB top-20\nBAai/bge 384d', color: '#7c3aed' },
    { label: 'Sparse\nRetrieval', sub: 'BM25 top-20', color: '#7c3aed' },
    { label: 'RRF Fusion', sub: 'k=60 fusion', color: '#0f766e' },
    { label: 'Cross-Encoder\nRerank', sub: 'ms-marco top-5', color: '#0f766e' },
    { label: 'CRAG\nCheck', sub: 'score < 0.6\n→ reformulate', color: '#b45309' },
    { label: 'LLM\nGeneration', sub: 'gpt-4o-mini', color: '#166534' },
  ]

  const W = 780, H = 160
  const boxW = 90, boxH = 60, gap = 18
  const totalW = steps.length * boxW + (steps.length - 1) * gap
  const startX = (W - totalW) / 2
  const y = (H - boxH) / 2

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-h-[160px]" style={{ fontFamily: 'sans-serif' }}>
      <defs>
        <marker id="arr2" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" fill="#94a3b8" />
        </marker>
      </defs>
      {steps.map((s, i) => {
        const x = startX + i * (boxW + gap)
        const nextX = x + boxW
        return (
          <g key={i}>
            <rect x={x} y={y} width={boxW} height={boxH} rx="8"
              fill={s.color} fillOpacity="0.85" />
            {s.label.split('\n').map((line, li) => (
              <text key={li} x={x + boxW / 2} y={y + 16 + li * 13}
                textAnchor="middle" fill="#fff" fontSize="9" fontWeight="600">{line}</text>
            ))}
            {s.sub.split('\n').map((line, li) => (
              <text key={li} x={x + boxW / 2} y={y + boxH - 16 + li * 10}
                textAnchor="middle" fill="#cbd5e1" fontSize="7.5">{line}</text>
            ))}
            {i < steps.length - 1 && (
              <line x1={nextX} y1={y + boxH / 2}
                x2={nextX + gap} y2={y + boxH / 2}
                stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arr2)" />
            )}
          </g>
        )
      })}
    </svg>
  )
}

/* ── Slide definitions ────────────────────────────────────────────────────── */
const SLIDES = [
  {
    title: 'Supply Chain Risk Intelligence',
    subtitle: 'AI-Powered · Multi-Agent · RAG-Backed',
    body: [
      'Hybrid retrieval: Dense (ChromaDB) + Sparse (BM25) + Cross-encoder rerank',
      'LangGraph multi-agent orchestration with A2A conditional edges',
      'MCP-based Kaggle data ingestion — 180k DataCo rows → 2.5k incident docs',
      'Human-in-the-loop (HILT) on HIGH severity alerts',
      'DeepEval + RAGAS evaluation suite with 50 golden Q&A pairs',
    ],
  },
  {
    title: 'System Architecture',
    subtitle: 'End-to-end pipeline from query to recommendation',
    visual: <ArchDiagram />,
  },
  {
    title: 'Retrieval Pipeline',
    subtitle: 'Hybrid retrieval with CRAG corrective loop',
    visual: <RetrievalFlow />,
    body: [
      'Dense top-20 + Sparse top-20 → RRF fusion (k=60) → Cross-encoder rerank → top-5',
      'CRAG triggers when max rerank score < 0.6: LLM reformulates query → retry',
      'Semantic cache (0.92 threshold) short-circuits repeat queries in <100ms',
    ],
  },
  {
    title: 'Models & Routing',
    body: [
      'gpt-4o-mini — reasoning, recommendation, LLM-as-judge',
      'llama-3.3-70b-versatile (Groq) — mid-weight summarization',
      'llama-3.1-8b-instant (Groq) — fast routing & classification',
      'Fallback chain: openai_mini → groq_large → groq_small',
      'Embeddings: BAAI/bge-small-en-v1.5 (384d, local, free)',
      'Reranker: ms-marco-MiniLM-L-6-v2 (free)',
    ],
  },
  {
    title: 'Multi-Agent Graph (LangGraph)',
    body: [
      'Orchestrator — intent classification (supplier_risk / shipment / inventory) + severity',
      'Supplier Risk Agent — defects, lead times, SUSPECTED_FRAUD patterns',
      'Shipment Analysis Agent — Late_delivery_risk, carrier performance, routing',
      'Inventory Intelligence Agent — stockouts, demand spikes, safety stock',
      'Recommendation Agent — synthesizes all specialists; emits final answer',
      'SQLite checkpointer — persists conversation state across sessions',
    ],
  },
  {
    title: 'Anomaly Detection',
    body: [
      'Late delivery spike: rate > 40% per Market × Shipping Mode segment',
      'Shipping gap outlier: z-score > 2.5 on real vs scheduled days',
      'Cancellation surge: rate > 15% per market',
      'Fraud cluster: SUSPECTED_FRAUD rate > 2% per region',
      'Profit erosion: > 30% loss-making orders per category',
      'Demand spike: order quantity z-score > 2.5 per category',
      'Correlation analysis: compound risk when multiple anomalies share same segment',
    ],
  },
  {
    title: 'Guardrails & Safety',
    body: [
      'Input guard: length check, injection patterns, domain-relevance (Groq 8B classifier)',
      'Context compression: LLMLingua when context > 6k tokens',
      'Output guard: faithfulness check + PII redaction before response',
      'HILT: interrupt_before("recommendation") on HIGH severity — human approval required',
      'Semantic cache: blocks near-duplicate queries from re-hitting the pipeline',
    ],
  },
  {
    title: 'Evaluation Results',
    subtitle: 'DeepEval + RAGAS — 50 golden Q&A pairs (DataCo-grounded)',
    visual: <EvalChart />,
    body: [
      'All metrics above threshold — Faithfulness 0.84 (target ≥ 0.80)',
      'Hallucination score 0.12 (target ≤ 0.20) — well within safe range',
    ],
  },
  {
    title: 'Deployment',
    body: [
      'Backend: FastAPI on Render (Python), 5GB persistent disk for ChromaDB + SQLite',
      'Frontend: React/Vite static site on Render CDN, zero-config SPA routing',
      'Env vars: OpenAI, Groq, LangSmith, Kaggle, HuggingFace token',
      'First boot: BAAI model downloads to HF cache on persistent disk (~130MB)',
      'Post-deploy: trigger ingestion via /api/ingestion to populate ChromaDB',
      'Monitoring: LangSmith traces all agent runs end-to-end',
    ],
  },
]

/* ── Slide renderer ───────────────────────────────────────────────────────── */
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
      <header className="px-6 py-3 flex items-center justify-between border-b border-white/10">
        <span className="text-xs text-slate-400">Slide {i + 1} / {SLIDES.length}</span>
        <span className="text-xs text-slate-500 font-medium tracking-wide uppercase">
          Supply Chain Risk Intelligence
        </span>
        <Link to="/" className="text-slate-400 hover:text-white" title="Exit">
          <X size={18} />
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-10 py-4 overflow-auto">
        <div className="max-w-4xl w-full">
          <h1 className="text-3xl font-semibold mb-1">{s.title}</h1>
          {s.subtitle && <p className="text-sm text-slate-400 mb-4">{s.subtitle}</p>}

          {s.visual && (
            <div className="mb-4 bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              {s.visual}
            </div>
          )}

          {s.body && (
            <ul className="space-y-2">
              {s.body.map((line, idx) => (
                <li key={idx} className="flex gap-3 text-sm text-slate-200">
                  <span className="text-blue-400 mt-0.5 flex-shrink-0">▸</span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      <footer className="px-6 py-3 flex items-center justify-between border-t border-white/10">
        <button onClick={() => setI((x) => Math.max(0, x - 1))}
          className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white disabled:opacity-30"
          disabled={i === 0}>
          <ChevronLeft size={16} /> Prev
        </button>
        <div className="flex gap-1">
          {SLIDES.map((_, idx) => (
            <button key={idx} onClick={() => setI(idx)}
              className={`w-2 h-2 rounded-full transition-colors ${idx === i ? 'bg-blue-400' : 'bg-slate-600 hover:bg-slate-400'}`} />
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
