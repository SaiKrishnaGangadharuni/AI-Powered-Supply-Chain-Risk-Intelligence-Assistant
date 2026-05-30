import { useEffect, useState } from 'react'
import { useChatContext } from '../context/ChatContext.jsx'

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
  gray:    { bg: '#f9fafb', border: '#d1d5db', text: '#6b7280', glow: '#d1d5db80' },
}

function Node({ label, sub, color, status, badge, width = 190 }) {
  const c = C[color] || C.indigo
  const isDone   = status === 'done'
  const isActive = status === 'active'
  const isError  = status === 'error'
  const isSkip   = status === 'skipped'
  const bg     = isDone ? '#f0fdf4' : isError ? '#fef2f2' : isActive ? c.bg : isSkip ? '#f9fafb' : '#fff'
  const border = isDone ? '#4ade80' : isError ? '#f87171' : isActive ? c.border : '#e5e7eb'
  const shadow = isActive ? `0 0 0 3px ${c.glow},0 4px 14px ${c.glow}` : isDone ? '0 2px 8px #4ade8030' : '0 1px 3px #0001'
  return (
    <div style={{ background: bg, border: `2px solid ${border}`, borderRadius: 12,
      padding: '9px 13px', width, boxShadow: shadow, transition: 'all 0.3s',
      opacity: isSkip ? 0.45 : 1, position: 'relative', flexShrink: 0, textAlign: 'center' }}>
      <div style={{ position:'absolute', top:8, right:8, width:8, height:8, borderRadius:'50%',
        background: isDone?'#22c55e':isError?'#ef4444':isActive?c.border:'#d1d5db',
        boxShadow: isActive?`0 0 6px ${c.border}`:'none',
        animation: isActive?'pulse 1.2s ease-in-out infinite':'none' }} />
      <div style={{ fontSize:12, fontWeight:600, textAlign:'center',
        color: isDone?'#15803d':isError?'#b91c1c':isActive?c.text:'#374151' }}>{label}</div>
      {sub  && <div style={{ fontSize:10, color:'#9ca3af', marginTop:2, lineHeight:1.4, textAlign:'center' }}>{sub}</div>}
      {badge && <div style={{ marginTop:4, fontSize:9, background:'#fef3c7', color:'#92400e',
        borderRadius:4, padding:'1px 6px', display:'inline-block' }}>{badge}</div>}
    </div>
  )
}

const LINE = (done, active, color='#d1d5db') => ({
  background: done ? '#4ade80' : active ? color : '#e5e7eb',
  transition: 'background 0.3s',
})

function VArrow({ h=32, done=false, active=false, color='#818cf8' }) {
  const c = done?'#4ade80':active?color:'#d1d5db'
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', height:h }}>
      <div style={{ width:2, flex:1, ...LINE(done,active,color) }} />
      <svg width="10" height="6"><path d="M5 6 L0 0 L10 0 Z" fill={c}/></svg>
    </div>
  )
}

// Parallel box: 2 nodes side-by-side with a "∥ parallel" label
function ParallelPair({ left, right, done, active }) {
  const lineC = done?'#4ade80':active?'#22d3ee':'#e5e7eb'
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', width:'100%' }}>
      {/* branch out */}
      <div style={{ display:'flex', width:370, justifyContent:'space-between', alignItems:'flex-end', height:28 }}>
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'flex-end' }}>
          <div style={{ width:2, height:18, ...LINE(done,active,'#22d3ee') }} />
          <div style={{ height:2, width:'85%', ...LINE(done,active,'#22d3ee') }} />
        </div>
        <div style={{ fontSize:9, color:'#22d3ee', fontWeight:700, padding:'0 6px', whiteSpace:'nowrap', marginBottom:2 }}>
          ∥ parallel
        </div>
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'flex-start' }}>
          <div style={{ width:2, height:18, ...LINE(done,active,'#22d3ee') }} />
          <div style={{ height:2, width:'85%', ...LINE(done,active,'#22d3ee') }} />
        </div>
      </div>
      {/* nodes */}
      <div style={{ display:'flex', gap:12 }}>
        {left}
        {right}
      </div>
      {/* merge */}
      <div style={{ display:'flex', width:370, justifyContent:'space-between', alignItems:'flex-start', height:28 }}>
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'flex-end' }}>
          <div style={{ height:2, width:'85%', ...LINE(done,active,'#22d3ee') }} />
          <div style={{ width:2, height:18, ...LINE(done,active,'#22d3ee') }} />
        </div>
        <div style={{ width:12 }} />
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'flex-start' }}>
          <div style={{ height:2, width:'85%', ...LINE(done,active,'#22d3ee') }} />
          <div style={{ width:2, height:18, ...LINE(done,active,'#22d3ee') }} />
        </div>
      </div>
    </div>
  )
}

// Agent fan-out: 1 → 3 → 1
function AgentFanOut({ s }) {
  const done   = s('supplier_risk')==='done' && s('shipment')==='done' && s('inventory')==='done'
  const active = s('supplier_risk')==='active'||s('shipment')==='active'||s('inventory')==='active'
  const lc     = done?'#4ade80':active?'#c084fc':'#e5e7eb'
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
      {/* fan out */}
      <div style={{ display:'flex', width:560, justifyContent:'space-between', alignItems:'flex-end', height:32 }}>
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'flex-end' }}>
          <div style={{ width:2, height:20, background:lc, transition:'background 0.3s' }} />
          <div style={{ height:2, width:'90%', background:lc, transition:'background 0.3s' }} />
        </div>
        <div style={{ width:2, height:32, background:lc, transition:'background 0.3s' }} />
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'flex-start' }}>
          <div style={{ width:2, height:20, background:lc, transition:'background 0.3s' }} />
          <div style={{ height:2, width:'90%', background:lc, transition:'background 0.3s' }} />
        </div>
      </div>
      {/* 3 agents */}
      <div style={{ display:'flex', gap:10 }}>
        <Node label="Supplier Risk Agent"    sub="Historical supplier incidents" color="purple" status={s('supplier_risk')} width={170} />
        <Node label="Shipment Analysis"      sub="Delay patterns · mode"         color="purple" status={s('shipment')}      width={160} />
        <Node label="Inventory Intelligence" sub="Anomalies · demand spikes"     color="purple" status={s('inventory')}     width={170} />
      </div>
      {/* merge */}
      <div style={{ display:'flex', width:560, justifyContent:'space-between', alignItems:'flex-start', height:32 }}>
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'flex-end' }}>
          <div style={{ height:2, width:'90%', background:lc, transition:'background 0.3s' }} />
          <div style={{ width:2, height:20, background:lc, transition:'background 0.3s' }} />
        </div>
        <div style={{ width:2, height:32, background:lc, transition:'background 0.3s' }} />
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'flex-start' }}>
          <div style={{ height:2, width:'90%', background:lc, transition:'background 0.3s' }} />
          <div style={{ width:2, height:20, background:lc, transition:'background 0.3s' }} />
        </div>
      </div>
    </div>
  )
}

function QualityScore({ metrics }) {
  if (!metrics) return null
  // Score: faithfulness 40pts + retrieval score 30pts + no-crag-retry 20pts + no-pii 10pts
  const faith    = metrics.faithful === true ? 40 : metrics.faithful === false ? 0 : null
  const retScore = metrics.retrieval_score != null ? Math.round(metrics.retrieval_score * 30) : null
  const cragBonus = metrics.crag_retries > 0 ? 0 : (metrics.retrieval_docs > 0 ? 20 : null)
  const piiBonus  = metrics.pii_redacted === false ? 10 : metrics.pii_redacted === true ? 5 : null
  if (faith === null && retScore === null) return null
  const total = (faith ?? 0) + (retScore ?? 0) + (cragBonus ?? 0) + (piiBonus ?? 0)
  const color = total >= 80 ? '#15803d' : total >= 55 ? '#b45309' : '#b91c1c'
  const bg    = total >= 80 ? '#f0fdf4' : total >= 55 ? '#fffbeb' : '#fef2f2'
  const ring  = total >= 80 ? '#4ade80' : total >= 55 ? '#fbbf24' : '#f87171'
  return (
    <div style={{ background: bg, border: `2px solid ${ring}`, borderRadius: 12, padding: '10px 12px', marginBottom: 12, textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{total}<span style={{ fontSize: 12 }}>/100</span></div>
      <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>Quality Score</div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
        {faith != null && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: faith===40?'#dcfce7':'#fee2e2', color: faith===40?'#166534':'#991b1b' }}>Faith {faith}pts</span>}
        {retScore != null && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: '#eff6ff', color: '#1e40af' }}>Ret {retScore}pts</span>}
        {cragBonus != null && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: cragBonus===20?'#f0fdf4':'#fef3c7', color: cragBonus===20?'#166534':'#92400e' }}>CRAG {cragBonus}pts</span>}
        {piiBonus != null && <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: '#f5f3ff', color: '#6b21a8' }}>PII {piiBonus}pts</span>}
      </div>
      {metrics.faithful_reason && metrics.faithful_reason !== 'no-context-skip' && (
        <div style={{ marginTop: 8, fontSize: 10, color: metrics.faithful ? '#166534' : '#991b1b',
          background: metrics.faithful ? '#f0fdf4' : '#fff1f2',
          border: `1px solid ${metrics.faithful ? '#bbf7d0' : '#fecdd3'}`,
          borderRadius: 8, padding: '6px 8px', textAlign: 'left', lineHeight: 1.5 }}>
          <span style={{ fontWeight: 700 }}>Why: </span>{metrics.faithful_reason}
        </div>
      )}
    </div>
  )
}

function MetricRow({ label, value, sub, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 7 }}>
      <span style={{ fontSize: 10, color: '#6b7280', lineHeight: 1.4 }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: color || '#374151' }}>{value}</span>
        {sub && <div style={{ fontSize: 9, color: '#9ca3af' }}>{sub}</div>}
      </div>
    </div>
  )
}

export default function Flow() {
  const { messages, liveStatus, nodeStatus: ns_ctx, timeline, runMetrics } = useChatContext()
  const [ns, setNs] = useState({})

  useEffect(() => { setNs(ns_ctx || {}) }, [ns_ctx])

  const s = (id) => ns[id] || 'pending'

  return (
    <div style={{ display:'flex', height:'calc(100vh - 84px)', background:'#f8fafc', fontFamily:'system-ui,sans-serif' }}>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

      {/* ── Flow canvas ── */}
      <div style={{ flex:1, overflowY:'auto', padding:'20px 0', display:'flex', flexDirection:'column', alignItems:'center' }}>
        <div style={{ textAlign:'center', marginBottom:20 }}>
          <div style={{ fontSize:14, fontWeight:600, color:'#374151' }}>End-to-End Pipeline</div>
          <div style={{ fontSize:11, color:'#9ca3af' }}>Send a query from Chat — nodes activate live</div>
        </div>

        {/* USER INPUT */}
        <Node label="User Query" sub="Operations manager enters disruption query" color="indigo" status={messages.length?'done':'pending'} />
        <VArrow done={messages.length>0} />

        {/* INSTANT GUARDRAILS */}
        <Node label="Input Guardrails" sub="Injection · length · greeting — instant, zero latency" color="red" status={s('guard_in')} />
        <VArrow done={s('guard_in')==='done'} active={s('cache')==='active'} />

        {/* CACHE — now before domain check */}
        <Node label="Cache Lookup" sub="Semantic cosine ≥ 0.92 · keyword LRU  — checked before domain LLM call" color="yellow" status={s('cache')}
          badge={s('cache')==='done' && s('domain_check')==='skipped' ? 'cache hit ⚡ domain skipped' : null} />
        <VArrow done={s('cache')==='done'} active={s('domain_check')==='active'} />

        {/* DOMAIN CHECK — only on cache miss */}
        <Node label="Domain Check" sub="Groq LLM on-topic check — only runs on cache miss" color="orange" status={s('domain_check')} />
        <VArrow done={s('domain_check')==='done'} active={s('orchestrator')==='active'} />

        {/* ORCHESTRATOR */}
        <Node label="Orchestrator" sub="Intent classification · severity · A2A fan-out (Groq llama-3.1-8b)" color="blue" status={s('orchestrator')} />

        {/* AGENTS FAN-OUT */}
        <AgentFanOut s={s} />

        <VArrow done={s('retrieval')==='done'||s('rerank')==='done'} active={s('retrieval')==='active'} />

        {/* PARALLEL RETRIEVAL */}
        <ParallelPair
          done={s('retrieval')==='done'}
          active={s('retrieval')==='active'}
          left={<Node label="ChromaDB Dense" sub="Embedding vector search (fastembed 384-dim)" color="cyan" status={s('retrieval')} width={175} />}
          right={<Node label="BM25 Sparse" sub="Keyword index (rank_bm25)" color="cyan" status={s('retrieval')} width={175} />}
        />

        <VArrow done={s('rerank')==='done'} active={s('rerank')==='active'} color="#2dd4bf" />

        {/* RRF + RERANK + CRAG */}
        <Node label="RRF Fusion + Rerank + CRAG" sub="Reciprocal Rank Fusion → cosine rerank → score < 0.6 → query reformulation + retry" color="teal" status={s('rerank')} width={370} />
        <VArrow done={s('recommendation')==='done'} active={s('recommendation')==='active'} />

        {/* RECOMMENDATION */}
        <Node label="Recommendation Node" sub="Mitigation guidance synthesis (gpt-4o-mini)" color="green" status={s('recommendation')} />
        <VArrow done={s('guard_out')==='done'} active={s('guard_out')==='active'} />

        {/* OUTPUT GUARDRAILS */}
        <Node label="Output Guardrails" sub="Faithfulness check · hallucination filter · DeepEval" color="red" status={s('guard_out')} />
        <VArrow done={s('hilt')==='done'} active={s('hilt')==='active'} />

        {/* HILT */}
        <Node label="HILT + Feedback" sub="HIGH severity → human review interrupt · SQLite feedback store" color="amber" status={s('hilt')} />
        <VArrow done={s('hilt')==='done'} />

        {/* FINAL ANSWER */}
        <Node label="Final Answer" sub="Explainable mitigation guidance delivered to user" color="indigo" status={s('hilt')==='done'?'done':'pending'} />

        <div style={{ height:32 }} />
      </div>

      {/* ── Right panel ── */}
      <div style={{ width:236, borderLeft:'1px solid #e5e7eb', background:'#fff', padding:'16px 14px', overflowY:'auto', flexShrink:0 }}>

        {/* Quality score card */}
        <div style={{ fontSize:10, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>Run Quality</div>
        {runMetrics
          ? <QualityScore metrics={runMetrics} />
          : <div style={{ fontSize:11, color:'#9ca3af', marginBottom:12 }}>No run yet</div>
        }

        {/* Evaluation metrics */}
        {runMetrics && (
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>Evaluation</div>
            <MetricRow
              label="Faithfulness"
              value={runMetrics.faithful === true ? '✓ Passed' : runMetrics.faithful === false ? '✗ Failed' : '—'}
              color={runMetrics.faithful === true ? '#15803d' : runMetrics.faithful === false ? '#b91c1c' : '#9ca3af'}
            />
            <MetricRow
              label="PII Detected"
              value={runMetrics.pii_redacted === true ? '⚠ Redacted' : runMetrics.pii_redacted === false ? '✓ Clean' : '—'}
              color={runMetrics.pii_redacted ? '#b45309' : '#15803d'}
            />
            <MetricRow
              label="Severity"
              value={runMetrics.severity || '—'}
              color={runMetrics.severity==='HIGH'?'#b91c1c':runMetrics.severity==='MEDIUM'?'#b45309':'#15803d'}
            />
            {runMetrics.needs_human && (
              <div style={{ fontSize:10, background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:6, padding:'4px 8px', color:'#9a3412', marginBottom:6 }}>
                ⚠ HILT: human review required
              </div>
            )}
          </div>
        )}

        {/* Retrieval metrics */}
        {runMetrics && (
          <div style={{ marginBottom:12, paddingTop:10, borderTop:'1px solid #f3f4f6' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>Retrieval</div>
            <MetricRow label="Docs retrieved" value={runMetrics.retrieval_docs ?? '—'} />
            <MetricRow
              label="Max rerank score"
              value={runMetrics.retrieval_score != null ? runMetrics.retrieval_score.toFixed(3) : '—'}
              color={runMetrics.retrieval_score >= 0.7 ? '#15803d' : runMetrics.retrieval_score >= 0.5 ? '#b45309' : '#b91c1c'}
            />
            <MetricRow label="Retrieval time" value={runMetrics.retrieval_ms != null ? `${runMetrics.retrieval_ms}ms` : '—'} color="#6b7280" />
            <MetricRow
              label="CRAG retries"
              value={runMetrics.crag_retries > 0 ? `${runMetrics.crag_retries}× (score ${runMetrics.crag_last_score?.toFixed(2)})` : '0 — first-pass'}
              color={runMetrics.crag_retries > 0 ? '#b45309' : '#15803d'}
            />
            {runMetrics.cache_hit && (
              <div style={{ fontSize:10, background:'#f5f3ff', border:'1px solid #ddd6fe', borderRadius:6, padding:'4px 8px', color:'#6b21a8' }}>
                ⚡ Cache hit — pipeline skipped
              </div>
            )}
          </div>
        )}

        {/* Total time */}
        {runMetrics?.elapsed_total && (
          <div style={{ marginBottom:12, paddingTop:10, borderTop:'1px solid #f3f4f6' }}>
            <MetricRow label="Total elapsed" value={`${(runMetrics.elapsed_total/1000).toFixed(2)}s`} color="#0C7063" />
          </div>
        )}

        {/* Techniques used */}
        <div style={{ paddingTop:10, borderTop:'1px solid #f3f4f6' }}>
          <div style={{ fontSize:10, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>Techniques</div>
          {[
            ['⚡', 'Semantic cache (cosine ≥0.92)', true],
            ['∥',  'ChromaDB + BM25 parallel', true],
            ['🔀', 'RRF fusion + cosine rerank', true],
            ['🔄', 'CRAG adaptive retry', runMetrics?.crag_retries > 0],
            ['🛡',  'Input + output guardrails', true],
            ['📊', 'Faithfulness eval (DeepEval)', runMetrics?.faithful != null],
          ].map(([icon, label, active]) => (
            <div key={label} style={{ display:'flex', gap:6, marginBottom:6, alignItems:'flex-start', opacity: active ? 1 : 0.35 }}>
              <span style={{ fontSize:11, flexShrink:0 }}>{icon}</span>
              <span style={{ fontSize:10, color: active ? '#374151' : '#9ca3af', lineHeight:1.4 }}>{label}</span>
            </div>
          ))}
        </div>

        {/* Timeline */}
        <div style={{ paddingTop:12, borderTop:'1px solid #f3f4f6', marginTop:4 }}>
          <div style={{ fontSize:10, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>Live Timeline</div>
          {liveStatus && (
            <div style={{ fontSize:11, color:'#4f46e5', background:'#eef2ff', borderRadius:6, padding:'4px 8px', marginBottom:6 }}>{liveStatus}</div>
          )}
          {timeline.length === 0
            ? <p style={{ fontSize:11, color:'#9ca3af' }}>Waiting for query…</p>
            : timeline.map((t,i) => (
              <div key={i} style={{ fontSize:10, borderRadius:5, padding:'3px 7px', marginBottom:3,
                background: t.type==='error'?'#fef2f2':t.type==='retry'?'#fef3c7':t.type==='cache'||t.type==='done'?'#f0fdf4':'#f9fafb',
                color: t.type==='error'?'#b91c1c':t.type==='retry'?'#92400e':t.type==='cache'||t.type==='done'?'#15803d':'#374151',
                border:'1px solid #f3f4f6' }}>
                {t.label}
              </div>
            ))
          }
        </div>

        {/* Legend */}
        <div style={{ paddingTop:12, borderTop:'1px solid #f3f4f6', marginTop:8 }}>
          <div style={{ fontSize:10, fontWeight:700, color:'#9ca3af', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>Legend</div>
          {[['#d1d5db','Pending'],['#818cf8','Active'],['#22c55e','Done'],['#facc15','Skipped'],['#ef4444','Error']].map(([c,l])=>(
            <div key={l} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:5 }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background:c, flexShrink:0 }} />
              <span style={{ fontSize:10, color:'#6b7280' }}>{l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
