import { useEffect, useState } from 'react'
import { useChatContext } from '../context/ChatContext.jsx'

/* ─────────────────────────────────────────────────────────────
   Color palette per stage
───────────────────────────────────────────────────────────── */
const C = {
  indigo:  { bg: '#eef2ff', border: '#818cf8', text: '#3730a3', glow: '#818cf880' },
  red:     { bg: '#fef2f2', border: '#f87171', text: '#991b1b', glow: '#f8717180' },
  orange:  { bg: '#fff7ed', border: '#fb923c', text: '#9a3412', glow: '#fb923c80' },
  yellow:  { bg: '#fefce8', border: '#facc15', text: '#854d0e', glow: '#facc1580' },
  blue:    { bg: '#eff6ff', border: '#60a5fa', text: '#1e40af', glow: '#60a5fa80' },
  purple:  { bg: '#faf5ff', border: '#c084fc', text: '#6b21a8', glow: '#c084fc80' },
  cyan:    { bg: '#ecfeff', border: '#22d3ee', text: '#164e63', glow: '#22d3ee80' },
  teal:    { bg: '#f0fdfa', border: '#2dd4bf', text: '#134e4a', glow: '#2dd4bf80' },
  green:   { bg: '#f0fdf4', border: '#4ade80', text: '#14532d', glow: '#4ade8080' },
  amber:   { bg: '#fffbeb', border: '#fbbf24', text: '#78350f', glow: '#fbbf2480' },
}

/* ─────────────────────────────────────────────────────────────
   Single flow node component
───────────────────────────────────────────────────────────── */
function Node({ label, sub, color, status, badge }) {
  const c = C[color] || C.indigo
  const isActive = status === 'active'
  const isDone   = status === 'done'
  const isError  = status === 'error'
  const isSkip   = status === 'skipped'

  const bg     = isDone ? '#f0fdf4' : isError ? '#fef2f2' : isActive ? c.bg : isSkip ? '#f9fafb' : '#ffffff'
  const border = isDone ? '#4ade80' : isError ? '#f87171' : isActive ? c.border : '#e5e7eb'
  const shadow = isActive ? `0 0 0 3px ${c.glow}, 0 4px 12px ${c.glow}` : isDone ? '0 2px 8px #4ade8030' : '0 1px 3px #0000001a'

  return (
    <div style={{
      background: bg, border: `2px solid ${border}`,
      borderRadius: 12, padding: '10px 14px', minWidth: 150, maxWidth: 190,
      boxShadow: shadow, transition: 'all 0.35s ease', position: 'relative',
      opacity: isSkip ? 0.5 : 1,
    }}>
      {/* status dot */}
      <div style={{
        position: 'absolute', top: 8, right: 8,
        width: 8, height: 8, borderRadius: '50%',
        background: isDone ? '#22c55e' : isError ? '#ef4444' : isActive ? c.border : '#d1d5db',
        boxShadow: isActive ? `0 0 6px ${c.border}` : 'none',
        animation: isActive ? 'pulse 1.2s ease-in-out infinite' : 'none',
      }} />
      <div style={{ fontSize: 12, fontWeight: 600, color: isDone ? '#15803d' : isError ? '#b91c1c' : isActive ? c.text : '#374151', paddingRight: 14 }}>
        {label}
      </div>
      {sub && <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2, lineHeight: 1.4 }}>{sub}</div>}
      {badge && <div style={{ marginTop: 4, fontSize: 9, background: '#fef3c7', color: '#92400e', borderRadius: 4, padding: '1px 6px', display: 'inline-block' }}>{badge}</div>}
    </div>
  )
}

/* Vertical arrow */
function VArrow({ active, done }) {
  const color = done ? '#4ade80' : active ? '#818cf8' : '#d1d5db'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: 32 }}>
      <div style={{ width: 2, flex: 1, background: color, transition: 'background 0.3s' }} />
      <svg width="10" height="6" style={{ display: 'block' }}>
        <path d="M5 6 L0 0 L10 0 Z" fill={color} />
      </svg>
    </div>
  )
}

/* Horizontal branch line from center to left/right */
function HBranch({ dir, active, done }) {
  const color = done ? '#4ade80' : active ? '#c084fc' : '#d1d5db'
  return (
    <div style={{
      width: '50%', height: 2, background: color,
      alignSelf: dir === 'left' ? 'flex-end' : 'flex-start',
      transition: 'background 0.3s',
      marginTop: 20,
    }} />
  )
}

/* ─────────────────────────────────────────────────────────────
   Main Flow page
───────────────────────────────────────────────────────────── */
const NODE_MAP = {
  orchestrator: 'orchestrator', supplier_risk: 'supplier_risk',
  shipment_analysis: 'shipment', inventory_intelligence: 'inventory',
  recommendation: 'recommendation',
}

export default function Flow() {
  const { messages, liveStatus } = useChatContext()
  const [ns, setNs] = useState({})          // nodeStatus map
  const [timeline, setTimeline] = useState([])
  const [retries,  setRetries]  = useState([])

  useEffect(() => {
    const next = {}
    const tl   = []
    const rt   = []
    messages.forEach((m) => {
      if (m.role !== 'assistant') return
      if (m.streaming && m.content?.startsWith('Running: ')) {
        const raw = m.content.replace('Running: ', '').replace('…', '').toLowerCase().replace(/ /g, '_')
        const id = NODE_MAP[raw] || raw
        next[id] = 'active'
        tl.push(m.content)
      }
      if (!m.streaming && m.content && !m.content.startsWith('Running:') && !m.content.startsWith('I can')) {
        next['recommendation'] = 'done'
        next['guard_out']      = 'done'
        next['hilt']           = m.needs_human ? 'active' : 'done'
        if (m.cached) { next['cache'] = 'done'; tl.push('Cache hit ⚡') }
      }
    })
    setNs(next)
    setTimeline(tl)
    setRetries(rt)
  }, [messages])

  const s = (id) => ns[id] || 'pending'

  const agentsActive = s('supplier_risk') === 'active' || s('shipment') === 'active' || s('inventory') === 'active'
  const agentsDone   = s('supplier_risk') === 'done'   && s('shipment') === 'done'   && s('inventory') === 'done'

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 84px)', background: '#f8fafc', fontFamily: 'system-ui, sans-serif' }}>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>

      {/* ── Main flow canvas ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 2 }}>End-to-End Pipeline</div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 24 }}>Send a query from Chat — nodes activate live</div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

          {/* USER INPUT */}
          <Node label="User Query" sub="Operations manager enters disruption query" color="indigo" status={messages.length ? 'done' : 'pending'} />
          <VArrow active={false} done={messages.length > 0} />

          {/* INPUT GUARDRAILS */}
          <Node label="Input Guardrails" sub="Injection · domain check · toxic filter" color="red" status={s('guard_in')} />
          <VArrow active={s('compress') === 'active'} done={s('compress') === 'done'} />

          {/* PROMPT COMPRESSION */}
          <Node label="Prompt Compression" sub="Token trimming · LLMLingua" color="orange" status={s('compress')} />
          <VArrow active={s('cache') === 'active'} done={s('cache') === 'done'} />

          {/* CACHE */}
          <Node label="Cache Lookup" sub="Semantic (cosine ≥ 0.92) · keyword LRU" color="yellow" status={s('cache')} badge={s('cache') === 'done' && ns['cache'] === 'done' ? 'cache hit ⚡' : null} />
          <VArrow active={s('orchestrator') === 'active'} done={s('orchestrator') === 'done' || s('orchestrator') === 'active'} />

          {/* ORCHESTRATOR */}
          <Node label="Orchestrator" sub="Intent classification · severity · A2A fan-out" color="blue" status={s('orchestrator')} />

          {/* FAN-OUT to 3 agents in parallel */}
          <div style={{ display: 'flex', alignItems: 'flex-start', width: '100%', justifyContent: 'center', marginTop: 0 }}>
            {/* left branch line */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', paddingTop: 20 }}>
              <div style={{ width: '80%', height: 2, background: agentsDone ? '#4ade80' : agentsActive ? '#c084fc' : '#e5e7eb', transition: 'background 0.3s' }} />
              <div style={{ width: 2, height: 24, background: agentsDone ? '#4ade80' : agentsActive ? '#c084fc' : '#e5e7eb' }} />
            </div>
            {/* center line */}
            <div style={{ width: 2, height: 44, background: agentsDone ? '#4ade80' : agentsActive ? '#c084fc' : '#e5e7eb', marginTop: 0, transition: 'background 0.3s' }} />
            {/* right branch line */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', paddingTop: 20 }}>
              <div style={{ width: '80%', height: 2, background: agentsDone ? '#4ade80' : agentsActive ? '#c084fc' : '#e5e7eb', transition: 'background 0.3s' }} />
              <div style={{ width: 2, height: 24, background: agentsDone ? '#4ade80' : agentsActive ? '#c084fc' : '#e5e7eb' }} />
            </div>
          </div>

          {/* 3 AGENTS side by side */}
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
            <Node label="Supplier Risk Agent"     sub="Historical supplier incidents" color="purple" status={s('supplier_risk')} />
            <Node label="Shipment Analysis"       sub="Delay patterns · mode analysis" color="purple" status={s('shipment')} />
            <Node label="Inventory Intelligence"  sub="Stock anomalies · demand spikes" color="purple" status={s('inventory')} />
          </div>

          {/* Merge lines back */}
          <div style={{ display: 'flex', alignItems: 'flex-end', width: '100%', justifyContent: 'center' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', paddingBottom: 0 }}>
              <div style={{ width: 2, height: 24, background: agentsDone ? '#4ade80' : '#e5e7eb' }} />
              <div style={{ width: '80%', height: 2, background: agentsDone ? '#4ade80' : '#e5e7eb' }} />
            </div>
            <div style={{ width: 2, height: 24, background: agentsDone ? '#4ade80' : '#e5e7eb' }} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', paddingBottom: 0 }}>
              <div style={{ width: 2, height: 24, background: agentsDone ? '#4ade80' : '#e5e7eb' }} />
              <div style={{ width: '80%', height: 2, background: agentsDone ? '#4ade80' : '#e5e7eb' }} />
            </div>
          </div>

          <VArrow active={s('retrieval') === 'active'} done={s('retrieval') === 'done'} />

          {/* RETRIEVAL */}
          <Node label="Hybrid Retrieval" sub="ChromaDB dense + BM25 sparse → RRF fusion (k=60)" color="cyan" status={s('retrieval')} />
          <VArrow active={s('rerank') === 'active'} done={s('rerank') === 'done'} />

          {/* RERANK + CRAG */}
          <Node label="Rerank + CRAG" sub="Cosine rerank · score < 0.6 → query reformulation + retry" color="teal"
            status={s('rerank')} badge={retries.length ? `${retries.length} retry` : null} />
          <VArrow active={s('recommendation') === 'active'} done={s('recommendation') === 'done'} />

          {/* RECOMMENDATION */}
          <Node label="Recommendation Node" sub="Mitigation guidance synthesis (gpt-4o-mini)" color="green" status={s('recommendation')} />
          <VArrow active={s('guard_out') === 'active'} done={s('guard_out') === 'done'} />

          {/* OUTPUT GUARD */}
          <Node label="Output Guardrails" sub="Faithfulness check · hallucination filter · DeepEval" color="red" status={s('guard_out')} />
          <VArrow active={s('hilt') === 'active'} done={s('hilt') === 'done'} />

          {/* HILT */}
          <Node label="HILT + Feedback" sub="HIGH severity → human review · SQLite feedback store" color="amber" status={s('hilt')} />
          <VArrow active={false} done={s('hilt') === 'done'} />

          {/* FINAL ANSWER */}
          <Node label="Final Answer" sub="Explainable mitigation guidance delivered to user" color="indigo"
            status={s('hilt') === 'done' ? 'done' : 'pending'} />
        </div>
      </div>

      {/* ── Right panel: timeline + legend ── */}
      <div style={{ width: 220, borderLeft: '1px solid #e5e7eb', background: '#fff', padding: '20px 16px', overflowY: 'auto', flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Live Timeline</div>
        {liveStatus && (
          <div style={{ fontSize: 11, color: '#4f46e5', background: '#eef2ff', borderRadius: 6, padding: '4px 8px', marginBottom: 8 }}>
            {liveStatus}
          </div>
        )}
        {timeline.length === 0
          ? <p style={{ fontSize: 11, color: '#9ca3af' }}>Waiting for query…</p>
          : timeline.map((t, i) => (
            <div key={i} style={{ fontSize: 11, color: '#374151', background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: 6, padding: '4px 8px', marginBottom: 4 }}>
              {t}
            </div>
          ))
        }
        {retries.length > 0 && (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '14px 0 8px' }}>CRAG Retries</div>
            {retries.map((r, i) => (
              <div key={i} style={{ fontSize: 11, background: '#fef3c7', color: '#92400e', borderRadius: 6, padding: '4px 8px', marginBottom: 4 }}>
                Attempt #{r.attempt} · score {r.score?.toFixed(2)}
              </div>
            ))}
          </>
        )}
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid #e5e7eb' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Legend</div>
          {[
            ['#d1d5db', 'Pending'],
            ['#818cf8', 'Active'],
            ['#22c55e', 'Done'],
            ['#facc15', 'Skipped'],
            ['#ef4444', 'Blocked'],
          ].map(([color, label]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#6b7280' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
