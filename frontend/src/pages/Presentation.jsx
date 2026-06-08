import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X, Maximize2, Minimize2 } from 'lucide-react'
import { Link } from 'react-router-dom'

// ── Prodapt brand tokens ───────────────────────────────────────────────────
const R = '#C8102E'   // Prodapt red
const D = '#1F2937'   // dark navy
const G = '#374151'   // gray
const MG = '#6B7280'  // mid gray
const LG = '#E5E7EB'  // light gray

// ── Reusable primitives ────────────────────────────────────────────────────
function SlideHeader({ title }) {
  return (
    <div className="flex items-center gap-3 mb-5 pb-3 border-b border-gray-200">
      <div style={{ width:6, height:36, background:R, borderRadius:2, flexShrink:0 }} />
      <h1 style={{ fontSize:22, fontWeight:700, color:D, margin:0, lineHeight:1.2 }}>{title}</h1>
      <span style={{ marginLeft:'auto', fontSize:11, fontWeight:700, color:R }}>Prodapt.</span>
    </div>
  )
}

function Tag({ text, bg = R, fg = '#fff' }) {
  return (
    <span style={{ fontSize:10, padding:'3px 10px', borderRadius:99, background:bg, color:fg, fontWeight:600, display:'inline-block' }}>
      {text}
    </span>
  )
}

function Card({ title, body, accent = R }) {
  return (
    <div style={{ background:'#fff', border:`1px solid ${LG}`, borderRadius:8, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
      <div style={{ background:accent, padding:'6px 12px' }}>
        <span style={{ fontSize:10, fontWeight:700, color:'#fff' }}>{title}</span>
      </div>
      <div style={{ padding:'8px 12px', fontSize:9, color:G, lineHeight:1.5 }}>{body}</div>
    </div>
  )
}

function Bullet({ items, color = D }) {
  return (
    <ul style={{ margin:0, padding:0, listStyle:'none' }}>
      {items.map((t, i) => (
        <li key={i} style={{ display:'flex', gap:8, marginBottom:6, fontSize:10, color:G, alignItems:'flex-start' }}>
          <span style={{ color:R, marginTop:1, flexShrink:0 }}>▸</span>
          <span style={{ lineHeight:1.4 }}>{t}</span>
        </li>
      ))}
    </ul>
  )
}

// ── Dot grid decoration ────────────────────────────────────────────────────
function DotGrid({ x, y, cols = 6, rows = 4, color = R, opacity = 0.18 }) {
  const dots = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      dots.push(<circle key={`${r}-${c}`} cx={x + c * 12} cy={y + r * 12} r={1.5} fill={color} opacity={opacity} />)
  return <g>{dots}</g>
}

// ── Eval Chart ────────────────────────────────────────────────────────────
function EvalChart() {
  const metrics = [
    { name: 'Faithfulness',   deepeval: 0.84, ragas: 0.82, threshold: 0.80 },
    { name: 'Relevancy',      deepeval: 0.79, ragas: 0.77, threshold: 0.75 },
    { name: 'Ctx. Precision', deepeval: 0.81, ragas: 0.78, threshold: 0.75 },
    { name: 'Ctx. Recall',    deepeval: 0.73, ragas: 0.71, threshold: 0.70 },
    { name: 'Hallucination ↓',deepeval: 0.12, ragas: null, threshold: 0.20, invertPass: true },
  ]
  const W = 620, H = 240, PL = 110, PR = 10, PT = 20, PB = 40
  const chartW = W - PL - PR, chartH = H - PT - PB
  const barH = 12, gap = 6, groupH = barH * 2 + gap + 22
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ fontFamily: 'sans-serif', maxHeight: 220 }}>
      <line x1={PL} y1={PT} x2={PL} y2={PT + chartH} stroke={LG} strokeWidth="1" />
      <line x1={PL} y1={PT + chartH} x2={W - PR} y2={PT + chartH} stroke={LG} strokeWidth="1" />
      {[0, 0.2, 0.4, 0.6, 0.8, 1.0].map(v => {
        const x = PL + v * chartW
        return (
          <g key={v}>
            <line x1={x} y1={PT} x2={x} y2={PT + chartH} stroke={LG} strokeWidth="0.5" />
            <text x={x} y={PT + chartH + 14} textAnchor="middle" fill={MG} fontSize="8">{v.toFixed(1)}</text>
          </g>
        )
      })}
      {metrics.map((m, i) => {
        const y = PT + i * groupH
        const deW = m.deepeval * chartW
        const raW = m.ragas != null ? m.ragas * chartW : 0
        const thX = PL + m.threshold * chartW
        const pass = m.invertPass ? s => s <= m.threshold : s => s >= m.threshold
        return (
          <g key={m.name}>
            <text x={PL - 6} y={y + barH - 1} textAnchor="end" fill={D} fontSize="8" fontWeight="600">{m.name}</text>
            <rect x={PL} y={y} width={deW} height={barH} rx="2" fill={pass(m.deepeval) ? '#16a34a' : R} fillOpacity="0.9" />
            <text x={PL + deW + 4} y={y + barH - 1} fill={G} fontSize="7">{m.deepeval.toFixed(2)}</text>
            {m.ragas != null && (
              <>
                <rect x={PL} y={y + barH + gap} width={raW} height={barH} rx="2" fill={pass(m.ragas) ? '#0891b2' : '#f97316'} fillOpacity="0.85" />
                <text x={PL + raW + 4} y={y + barH + gap + barH - 1} fill={G} fontSize="7">{m.ragas.toFixed(2)}</text>
              </>
            )}
            <line x1={thX} y1={y - 2} x2={thX} y2={y + barH * 2 + gap + 2} stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="3 2" />
          </g>
        )
      })}
      <rect x={PL} y={PT + chartH + 24} width={10} height={8} rx="1" fill={R} />
      <text x={PL + 14} y={PT + chartH + 32} fill={MG} fontSize="7">DeepEval</text>
      <rect x={PL + 65} y={PT + chartH + 24} width={10} height={8} rx="1" fill="#0891b2" />
      <text x={PL + 79} y={PT + chartH + 32} fill={MG} fontSize="7">RAGAS</text>
      <line x1={PL + 130} y1={PT + chartH + 28} x2={PL + 148} y2={PT + chartH + 28} stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="3 2" />
      <text x={PL + 152} y={PT + chartH + 32} fill={MG} fontSize="7">Threshold</text>
    </svg>
  )
}

// ══════════════════════════════════════════════════════════════════════════
// SLIDES
// ══════════════════════════════════════════════════════════════════════════

function Slide0() {
  return (
    <div style={{ position:'relative', height:'100%', width:'100%', overflow:'hidden' }}>
      <img src="/prodapt_bg.jpg" alt="Prodapt" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
    </div>
  )
}

function Slide1() {
  return (
    <div style={{ display:'flex', height:'100%', background:'#fff' }}>
      {/* Left red panel */}
      <div style={{ width:42, background:R, flexShrink:0 }} />
      {/* Content */}
      <div style={{ flex:1, padding:'32px 40px', display:'flex', flexDirection:'column', justifyContent:'center', position:'relative', overflow:'hidden' }}>
        {/* Dot grids */}
        <svg style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', pointerEvents:'none' }} viewBox="0 0 800 460">
          <DotGrid x={430} y={20} cols={10} rows={5} />
          <DotGrid x={430} y={360} cols={7} rows={4} opacity={0.12} />
          <DotGrid x={650} y={150} cols={5} rows={6} opacity={0.1} />
        </svg>
        {/* Prodapt logo */}
        <div style={{ marginBottom:28 }}>
          <span style={{ fontSize:22, fontWeight:800, color:R, letterSpacing:-0.5 }}>Prodapt.</span>
        </div>
        {/* Title */}
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:34, fontWeight:800, color:D, lineHeight:1.15 }}>AI-Powered Supply Chain</div>
          <div style={{ fontSize:34, fontWeight:800, color:R, lineHeight:1.15 }}>Risk Intelligence Assistant</div>
        </div>
        {/* Tagline */}
        <div style={{ fontSize:13, color:G, fontStyle:'italic', marginBottom:28 }}>
          Analyse · Predict · Recommend — Across Your Entire Supply Chain
        </div>
        {/* Tags */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:28 }}>
          {['Multi-Agent AI','Hybrid RAG','LangGraph','DeepEval + RAGAS','Real Datasets','FastAPI + React'].map(t => (
            <Tag key={t} text={t} bg={LG} fg={D} />
          ))}
        </div>
        {/* Footer */}
        <div style={{ fontSize:10, color:MG, borderTop:`1px solid ${LG}`, paddingTop:12 }}>
          Sai Krishna Gangadharuni &nbsp;·&nbsp; Prodapt &nbsp;·&nbsp; June 2026
        </div>
      </div>
    </div>
  )
}

function Slide2() {
  const cols = [
    { title:'Challenges', color:R, items:['Supplier delays for critical components','Port congestion impacting schedules','Warehouse inventory approaching stockout','Transport costs spiking unexpectedly','Demand spikes causing fulfillment issues'] },
    { title:'Current Pain', color:G, items:['Only threshold alerts & manual analysis','Data scattered across ERP, WMS, TMS','No proactive risk intelligence layer','Hours correlating signals manually','No explainable recommendations'] },
    { title:'What We Need', color:'#028090', items:['Natural language query interface','Semantic incident retrieval','Multi-agent risk analysis','Explainable mitigation recommendations','Real-time anomaly detection'] },
  ]
  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' }}>
      <SlideHeader title="Business Problem" />
      <p style={{ fontSize:10, color:MG, fontStyle:'italic', marginBottom:12 }}>
        Supply chain managers spend hours investigating risks across fragmented systems — without a unified intelligence layer.
      </p>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, flex:1 }}>
        {cols.map((col, i) => (
          <div key={i} style={{ border:`1px solid ${LG}`, borderRadius:8, overflow:'hidden' }}>
            <div style={{ background:col.color, padding:'8px 12px' }}>
              <span style={{ fontSize:11, fontWeight:700, color:'#fff' }}>{col.title}</span>
            </div>
            <div style={{ padding:'10px 12px', background:'#fafafa' }}>
              <Bullet items={col.items} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop:10, padding:'6px 12px', background:'#fff1f2', border:`1px solid ${R}`, borderRadius:6 }}>
        <span style={{ fontSize:9, fontWeight:700, color:R }}>
          Traditional monitoring systems cannot proactively detect, correlate, or recommend actions for emerging supply chain risks.
        </span>
      </div>
    </div>
  )
}

function Slide3() {
  const caps = [
    { title:'Natural Language Queries', body:"Operations teams describe supply chain problems conversationally — no SQL, no dashboards needed", color:R },
    { title:'Semantic Incident Retrieval', body:'Retrieves historical logistics disruptions by conceptual similarity using hybrid search', color:'#028090' },
    { title:'Explainable Recommendations', body:'Every mitigation recommendation cites source documents [Doc 1]...[Doc N] for transparency', color:G },
    { title:'Evaluation Framework', body:'DeepEval + RAGAS with 50 golden Q&A pairs grounded in real dataset values', color:'#7c3aed' },
  ]
  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' }}>
      <SlideHeader title="Proposed Solution" />
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, flex:1 }}>
        {/* Left */}
        <div style={{ border:`1px solid ${LG}`, borderRadius:8, overflow:'hidden' }}>
          <div style={{ background:R, padding:'8px 14px' }}>
            <span style={{ fontSize:12, fontWeight:700, color:'#fff' }}>Our Approach</span>
          </div>
          <div style={{ padding:'14px', background:'#fafafa', height:'calc(100% - 36px)' }}>
            <p style={{ fontSize:12, fontWeight:700, color:D, marginBottom:12 }}>
              A composite AI system that thinks like a supply chain operations team.
            </p>
            {[
              ['Multi-Agent AI','Orchestrator routes to Supplier Risk, Shipment, or Inventory agents based on query intent.'],
              ['Hybrid RAG','ChromaDB dense + BM25 sparse + RRF fusion + cosine rerank → top-5 context.'],
              ['CRAG','Auto-reformulates low-scoring queries for better retrieval quality.'],
              ['HILT','HIGH severity alerts pause for human approval before dispatch.'],
            ].map(([title, body]) => (
              <div key={title} style={{ marginBottom:10 }}>
                <div style={{ fontSize:10, fontWeight:700, color:R, marginBottom:2 }}>{title}</div>
                <div style={{ fontSize:9, color:G, lineHeight:1.4 }}>{body}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Right cards */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, alignContent:'start' }}>
          {caps.map(c => <Card key={c.title} title={c.title} body={c.body} accent={c.color} />)}
        </div>
      </div>
    </div>
  )
}

function Slide4() {
  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' }}>
      <SlideHeader title="System Architecture" />
      <p style={{ fontSize:9, color:MG, fontStyle:'italic', marginBottom:8 }}>
        High-level view: data ingestion, storage layers, multi-agent pipeline, and core components
      </p>
      <div style={{ flex:1, background:LG, borderRadius:8, overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center' }}>
        <img src="/architecture.png" alt="Architecture" style={{ maxWidth:'100%', maxHeight:'100%', objectFit:'contain' }} />
      </div>
    </div>
  )
}

function Slide5() {
  const steps = [
    { n:'①', title:'Load', sub:'pandas CSV\nKaggle MCP\n180k DataCo rows\n100 Fashion SKUs', color:'#1e3a8a' },
    { n:'②', title:'Sample', sub:'2,500 rows\nrandom_state=42\nBalanced coverage', color:'#1d4ed8' },
    { n:'③', title:'Transform', sub:"Row → NL incident\n'Late delivery LATAM\nvia First Class...'\nOur chunking strategy", color:R },
    { n:'④', title:'Embed', sub:'fastembed\nBAAI/bge-small-en\n384-dim vectors\nLocal ONNX — free', color:'#059669' },
    { n:'⑤', title:'Store', sub:'ChromaDB\nCosine similarity\nBM25 sparse index\nPersist to disk', color:'#7c3aed' },
  ]
  const insights = [
    { title:'Why row-level chunking?', body:'Each CSV row is a self-contained incident record (50-150 tokens). Recursive chunking would split related fields, destroying semantic coherence.', color:R },
    { title:'Why fastembed + BAAI/bge?', body:'Runs locally as ONNX — zero API cost. BGE is trained for retrieval tasks, scoring higher than all-MiniLM on BEIR benchmarks.', color:'#028090' },
    { title:'Why ChromaDB + BM25?', body:'Dense vectors miss exact keyword matches. BM25 catches them. RRF fusion merges both ranked lists — best of semantic + keyword retrieval.', color:G },
  ]
  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' }}>
      <SlideHeader title="Data Engineering — CSV to Vector DB" />
      <p style={{ fontSize:9, color:MG, fontStyle:'italic', marginBottom:10 }}>
        Chunking strategy: Row-level NL transformation — each CSV row becomes one self-contained incident document
      </p>
      {/* Pipeline steps */}
      <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:14 }}>
        {steps.map((s, i) => (
          <>
            <div key={s.n} style={{ flex:1, background:s.color, borderRadius:6, padding:'8px 6px', textAlign:'center' }}>
              <div style={{ fontSize:16, fontWeight:800, color:'#fff' }}>{s.n}</div>
              <div style={{ fontSize:9, fontWeight:700, color:'#fff', marginBottom:4 }}>{s.title}</div>
              <div style={{ fontSize:7.5, color:'rgba(255,255,255,0.85)', lineHeight:1.4, whiteSpace:'pre-line' }}>{s.sub}</div>
            </div>
            {i < steps.length - 1 && <div style={{ fontSize:14, color:MG, flexShrink:0 }}>→</div>}
          </>
        ))}
      </div>
      {/* Insight cards */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
        {insights.map(ins => <Card key={ins.title} title={ins.title} body={ins.body} accent={ins.color} />)}
      </div>
    </div>
  )
}

function Slide6() {
  const agents = [
    { label:'Supplier Risk Agent', sub:'Fraud · lead times\ndelivery performance', color:'#7c3aed' },
    { label:'Shipment Analysis', sub:'Late delivery rates\ncarrier performance', color:'#7c3aed' },
    { label:'Inventory Intelligence', sub:'Stockout risk\ndemand spikes', color:'#7c3aed' },
  ]
  const details = [
    { label:'SQLite Checkpointer', body:'Persists full pipeline state — enables multi-turn memory and HILT resume' },
    { label:'LLM Task Routing', body:'Routing → Groq 8B (fast). Reasoning / Recommendation / Judge → GPT-4o-mini (quality)' },
    { label:'HILT — Human Review', body:'HIGH severity: interrupt_before("recommendation") — human approves before dispatch' },
    { label:'LangSmith Tracing', body:'Every agent call, LLM prompt, retrieval context, token count and latency traced' },
  ]
  const nodeStyle = (color) => ({ background:color, borderRadius:6, padding:'6px 10px', textAlign:'center', minWidth:0 })
  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' }}>
      <SlideHeader title="Multi-Agent Design — LangGraph Pipeline" />
      {/* Top pipeline row */}
      <div style={{ display:'flex', alignItems:'center', gap:3, marginBottom:10 }}>
        {[
          { label:'User Query', sub:'WebSocket', color:'#1e3a8a' },
          { label:'Input Guard', sub:'Injection · domain', color:R },
          { label:'Cache Lookup', sub:'Semantic ≥0.92', color:'#d97706' },
          { label:'Orchestrator', sub:'Intent + Severity', color:'#028090' },
          { label:'Recommendation', sub:'Synthesis + Judge', color:'#059669' },
        ].map((n, i, arr) => (
          <>
            <div key={n.label} style={{ ...nodeStyle(n.color), flex:1 }}>
              <div style={{ fontSize:9, fontWeight:700, color:'#fff' }}>{n.label}</div>
              <div style={{ fontSize:7.5, color:'rgba(255,255,255,0.8)' }}>{n.sub}</div>
            </div>
            {i < arr.length-1 && <span style={{ color:MG, fontSize:12 }}>→</span>}
          </>
        ))}
      </div>
      {/* Agents fan-out */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:8 }}>
        {agents.map(a => (
          <div key={a.label} style={{ ...nodeStyle(a.color) }}>
            <div style={{ fontSize:9, fontWeight:700, color:'#fff' }}>{a.label}</div>
            <div style={{ fontSize:7.5, color:'rgba(255,255,255,0.8)', whiteSpace:'pre-line' }}>{a.sub}</div>
          </div>
        ))}
      </div>
      {/* Retrieval bar */}
      <div style={{ background:'#f0fdfa', border:'1px solid #0d9488', borderRadius:6, padding:'6px 14px', marginBottom:10, textAlign:'center' }}>
        <span style={{ fontSize:9, color:'#0f766e', fontWeight:600 }}>
          Hybrid Retrieval: Dense top-20 + Sparse top-20 → RRF Fusion (k=60) → Cosine Rerank top-5 → CRAG if score &lt; 0.6
        </span>
      </div>
      {/* Details */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:8 }}>
        {details.map(d => (
          <div key={d.label} style={{ border:`1px solid ${LG}`, borderRadius:6, padding:'8px 10px', background:'#fafafa' }}>
            <div style={{ fontSize:8.5, fontWeight:700, color:R, marginBottom:4 }}>{d.label}</div>
            <div style={{ fontSize:8, color:G, lineHeight:1.4 }}>{d.body}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Slide7() {
  const sections = [
    { title:'Agent Framework', color:'#028090', items:['LangGraph — DAG with conditional edges','SqliteSaver checkpointer — multi-turn memory','4 specialist agents + orchestrator','interrupt_before for HILT'] },
    { title:'LLM Providers', color:R, items:['GPT-4o-mini — reasoning, recommendation, judge','Groq llama-3.1-8b — fast routing & classification','Groq llama-3.3-70b — mid-weight fallback','Fallback chain: OpenAI → Groq 70B → Groq 8B'] },
    { title:'Retrieval & Embeddings', color:'#7c3aed', items:['fastembed + BAAI/bge-small-en (384-dim)','ChromaDB — persistent vector store','rank-bm25 — sparse keyword index','RRF fusion + cosine reranker + CRAG'] },
    { title:'Backend / API', color:G, items:['FastAPI + uvicorn + WebSocket','Pydantic schemas for all endpoints','LangSmith tracing — full observability','SQLite for feedback + session state'] },
    { title:'Frontend', color:'#d97706', items:['React 18 + Vite + Tailwind CSS','Live LangGraph DAG visualization','Run Quality panel (0-100 score)','5 pages: Chat, Flow, Admin, Analytics, Present'] },
    { title:'Evaluation', color:'#059669', items:['DeepEval — Faithfulness, Relevancy, Hallucination','RAGAS — Context Precision & Recall','50 golden Q&A pairs (real dataset values)','LLM-as-judge on every live query'] },
  ]
  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' }}>
      <SlideHeader title="Technology Stack" />
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, flex:1 }}>
        {sections.map(sec => (
          <div key={sec.title} style={{ border:`1px solid ${LG}`, borderRadius:8, overflow:'hidden' }}>
            <div style={{ background:sec.color, padding:'6px 12px' }}>
              <span style={{ fontSize:10, fontWeight:700, color:'#fff' }}>{sec.title}</span>
            </div>
            <div style={{ padding:'10px 12px', background:'#fafafa' }}>
              <Bullet items={sec.items} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Slide8() {
  const kpis = [
    { val:'0.84', label:'Faithfulness', sub:'Target ≥ 0.80 ✓', color:'#16a34a' },
    { val:'0.12', label:'Hallucination', sub:'Target ≤ 0.20 ✓', color:'#028090' },
    { val:'50', label:'Golden Pairs', sub:'Real dataset values', color:R },
    { val:'2×', label:'Frameworks', sub:'DeepEval + RAGAS', color:'#7c3aed' },
  ]
  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' }}>
      <SlideHeader title="Evaluation Results" />
      <p style={{ fontSize:9, color:MG, fontStyle:'italic', marginBottom:8 }}>
        DeepEval + RAGAS — 50 golden Q&A pairs grounded in real DataCo and fashion dataset values
      </p>
      <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:16, flex:1 }}>
        <div style={{ background:'#fafafa', borderRadius:8, border:`1px solid ${LG}`, padding:'8px 12px' }}>
          <EvalChart />
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8, width:160 }}>
          {kpis.map(k => (
            <div key={k.label} style={{ border:`1px solid ${LG}`, borderRadius:8, padding:'10px 12px', display:'flex', gap:10, alignItems:'center', background:'#fff', boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ borderLeft:`4px solid ${k.color}`, paddingLeft:8 }}>
                <div style={{ fontSize:22, fontWeight:800, color:k.color, lineHeight:1 }}>{k.val}</div>
                <div style={{ fontSize:9, fontWeight:700, color:D }}>{k.label}</div>
                <div style={{ fontSize:8, color:MG }}>{k.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Slide9() {
  const steps = [
    { n:'01', title:'Ingest Data', body:'Admin page → select DataCo CSV → Load → watch live pipeline progress', color:'#028090' },
    { n:'02', title:'Ask a Query', body:"'Which shipping mode has highest late delivery rate?' — watch Flow DAG animate live", color:'#1d4ed8' },
    { n:'03', title:'View Pipeline', body:'Flow page: live node activation, Run Quality score, models used, faithfulness result', color:'#7c3aed' },
    { n:'04', title:'Fraud Alert', body:"'Suspected fraud order from LATAM worth $50,000' — triggers HIGH severity + HILT", color:R },
    { n:'05', title:'Analytics', body:'Analytics page: late delivery by market, fraud by region, shipment mode breakdown', color:'#059669' },
  ]
  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column' }}>
      <SlideHeader title="Live Demo" />
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr', gap:10, flex:1 }}>
        {steps.map(d => (
          <div key={d.n} style={{ border:`1px solid ${LG}`, borderRadius:8, overflow:'hidden' }}>
            <div style={{ background:d.color, padding:'10px 8px', textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:800, color:'#fff', lineHeight:1 }}>{d.n}</div>
            </div>
            <div style={{ padding:'10px 10px', background:'#fafafa' }}>
              <div style={{ fontSize:10, fontWeight:700, color:D, marginBottom:6 }}>{d.title}</div>
              <div style={{ fontSize:8.5, color:G, lineHeight:1.45 }}>{d.body}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop:10, padding:'6px 14px', background:'#fff1f2', border:`1px solid ${R}`, borderRadius:6 }}>
        <span style={{ fontSize:9, color:R, fontWeight:600 }}>
          18 curated demo queries available — covering all agent paths, HILT trigger, and semantic cache demonstration
        </span>
      </div>
    </div>
  )
}

function Slide10() {
  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#fff', position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:0, left:0, width:'100%', height:6, background:R }} />
      <div style={{ position:'absolute', bottom:0, left:0, width:'100%', height:6, background:R }} />
      <svg style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', pointerEvents:'none' }} viewBox="0 0 800 460">
        <DotGrid x={20} y={20} cols={8} rows={5} opacity={0.1} />
        <DotGrid x={600} y={300} cols={6} rows={5} opacity={0.1} />
      </svg>
      <div style={{ fontSize:72, fontWeight:800, color:D, letterSpacing:-2, marginBottom:12, zIndex:1 }}>Q & A</div>
      <div style={{ fontSize:16, color:MG, fontStyle:'italic', zIndex:1 }}>Questions, discussion, and feedback</div>
      <div style={{ position:'absolute', bottom:16, left:20, fontSize:13, fontWeight:800, color:R }}>Prodapt.</div>
    </div>
  )
}

function Slide11() {
  return (
    <div style={{ height:'100%', display:'flex', background:'#fff', overflow:'hidden' }}>
      {/* Left red panel */}
      <div style={{ width:'45%', background:R, position:'relative', overflow:'hidden', display:'flex', flexDirection:'column', justifyContent:'center', padding:'32px 36px' }}>
        {/* Decorative triangles */}
        <svg style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', pointerEvents:'none' }} viewBox="0 0 360 460">
          <polygon points="0,0 90,0 0,90" fill="rgba(255,255,255,0.12)" />
          <polygon points="0,380 110,460 0,460" fill="rgba(255,255,255,0.12)" />
          <DotGrid x={100} y={20} cols={8} rows={5} color="#fff" opacity={0.2} />
          <DotGrid x={100} y={340} cols={7} rows={4} color="#fff" opacity={0.15} />
        </svg>
        <div style={{ fontSize:14, fontWeight:800, color:'#fff', opacity:0.9, zIndex:1 }}>Prodapt.</div>
      </div>
      {/* Right white panel */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', padding:'32px 40px', position:'relative' }}>
        <svg style={{ position:'absolute', top:0, left:0, width:'100%', height:'100%', pointerEvents:'none' }} viewBox="0 0 440 460">
          <DotGrid x={240} y={20} cols={6} rows={5} opacity={0.1} />
          <polygon points="380,0 440,0 440,60" fill="none" stroke={R} strokeWidth="1" opacity="0.3" />
          <polygon points="380,400 440,400 440,460" fill="none" stroke={R} strokeWidth="1" opacity="0.3" />
        </svg>
        <div style={{ fontSize:52, fontWeight:800, color:D, lineHeight:1.1, marginBottom:16 }}>Thank You</div>
        <div style={{ fontSize:15, fontWeight:700, color:D, marginBottom:6 }}>Sai Krishna Gangadharuni</div>
        <div style={{ fontSize:11, color:G, marginBottom:4 }}>AI-Powered Supply Chain Risk Intelligence Assistant</div>
        <div style={{ fontSize:10, color:MG }}>Prodapt · June 2026</div>
        <div style={{ marginTop:24, fontSize:10, color:MG }}>www.prodapt.com</div>
      </div>
    </div>
  )
}

// ── Slide registry ─────────────────────────────────────────────────────────
const SLIDES = [
  { id:'title',      label:'Overview',       component:<Slide1 /> },
  { id:'problem',    label:'Problem',        component:<Slide2 /> },
  { id:'solution',   label:'Solution',       component:<Slide3 /> },
  { id:'arch',       label:'Architecture',   component:<Slide4 /> },
  { id:'data',       label:'Data Eng',       component:<Slide5 /> },
  { id:'agents',     label:'Agents',         component:<Slide6 /> },
  { id:'stack',      label:'Tech Stack',     component:<Slide7 /> },
  { id:'eval',       label:'Evaluation',     component:<Slide8 /> },
  { id:'demo',       label:'Demo',           component:<Slide9 /> },
  { id:'qa',         label:'Q & A',          component:<Slide10 /> },
  { id:'thanks',     label:'Thank You',      component:<Slide11 /> },
]

// ── Presentation shell ─────────────────────────────────────────────────────
export default function Presentation() {
  const [i, setI] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') setI(x => Math.min(SLIDES.length - 1, x + 1))
      if (e.key === 'ArrowLeft')  setI(x => Math.max(0, x - 1))
      if (e.key === 'f' || e.key === 'F') toggleFullscreen()
      if (e.key === 'Escape' && isFullscreen) exitFullscreen()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isFullscreen])

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }

  const exitFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  }

  const s = SLIDES[i]

  return (
    <div style={{ height:'100vh', width:'100vw', background:'#f3f4f6', display:'flex', flexDirection:'column', fontFamily:"'Segoe UI', system-ui, sans-serif" }}>
      {/* Header nav */}
      <div style={{ background:'#fff', borderBottom:`1px solid ${LG}`, padding:'6px 20px', display:'flex', alignItems:'center', gap:4, flexShrink:0 }}>
        <span style={{ fontSize:11, color:MG, marginRight:8 }}>{i + 1} / {SLIDES.length}</span>
        <div style={{ display:'flex', gap:3, flex:1, flexWrap:'wrap' }}>
          {SLIDES.map((sl, idx) => (
            <button key={sl.id} onClick={() => setI(idx)} style={{
              fontSize:10, padding:'3px 10px', borderRadius:99, border:'none', cursor:'pointer',
              background: idx === i ? R : LG,
              color: idx === i ? '#fff' : D,
              fontWeight: idx === i ? 700 : 400,
              transition:'all 0.15s'
            }}>{sl.label}</button>
          ))}
        </div>
        <button onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}
          style={{ background:'none', border:'none', cursor:'pointer', color:MG, display:'flex', alignItems:'center', padding:4, borderRadius:6 }}>
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
        <Link to="/" style={{ color:MG, display:'flex', alignItems:'center', marginLeft:4 }}>
          <X size={18} />
        </Link>
      </div>

      {/* Slide area */}
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:'12px 20px', overflow:'hidden' }}>
        <div style={{
          width:'100%', maxWidth:1100,
          aspectRatio:'16/9',
          background:'#fff',
          borderRadius:10,
          boxShadow:'0 8px 32px rgba(0,0,0,0.12)',
          overflow:'hidden',
          display:'flex',
          flexDirection:'column',
          padding: (i === 0 || i === 9 || i === 10) ? 0 : '20px 26px',
        }}>
          {s.component}
        </div>
      </div>

      {/* Footer */}
      <div style={{ background:'#fff', borderTop:`1px solid ${LG}`, padding:'8px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <button onClick={() => setI(x => Math.max(0, x - 1))} disabled={i === 0}
          style={{ display:'flex', alignItems:'center', gap:4, fontSize:13, color: i===0 ? LG : G, background:'none', border:'none', cursor: i===0 ? 'default' : 'pointer' }}>
          <ChevronLeft size={16} /> Prev
        </button>
        <div style={{ display:'flex', gap:6 }}>
          {SLIDES.map((_, idx) => (
            <button key={idx} onClick={() => setI(idx)} style={{
              width: idx === i ? 20 : 8, height:8, borderRadius:99, border:'none', cursor:'pointer',
              background: idx === i ? R : LG, transition:'all 0.2s'
            }} />
          ))}
        </div>
        <button onClick={() => setI(x => Math.min(SLIDES.length - 1, x + 1))} disabled={i === SLIDES.length - 1}
          style={{ display:'flex', alignItems:'center', gap:4, fontSize:13, color: i===SLIDES.length-1 ? LG : G, background:'none', border:'none', cursor: i===SLIDES.length-1 ? 'default' : 'pointer' }}>
          Next <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
