import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Send, Activity, ShieldCheck, ShieldAlert, RefreshCw, UserCheck,
  CheckCircle2, AlertCircle, Circle, Loader2, Sparkles,
} from 'lucide-react'
import clsx from 'clsx'
import { api } from '../api/client.js'
import SeverityBadge from '../components/SeverityBadge.jsx'

const NODES = [
  { id: 'orchestrator',           label: 'Orchestrator',          desc: 'Intent + severity' },
  { id: 'supplier_risk',          label: 'Supplier Risk',         desc: 'Defects, lead times' },
  { id: 'shipment_analysis',      label: 'Shipment Analysis',     desc: 'Late risk, transit' },
  { id: 'inventory_intelligence', label: 'Inventory Intel',       desc: 'Stock, sell-through' },
  { id: 'recommendation',         label: 'Recommendation',        desc: 'Synthesize + answer' },
]

const initialNodeState = () => Object.fromEntries(
  NODES.map((n) => [n.id, {
    status: 'idle', elapsed_ms: null, max_score: null,
    doc_count: null, error: null, retried: false,
  }])
)

function uid() { return Math.random().toString(36).slice(2, 10) }
function fmtMs(ms) { return ms == null ? '—' : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s` }

function StatusIcon({ status }) {
  if (status === 'running') return <Loader2 size={14} className="animate-spin text-brand-600" />
  if (status === 'done')    return <CheckCircle2 size={14} className="text-emerald-600" />
  if (status === 'error')   return <AlertCircle size={14} className="text-rose-600" />
  return <Circle size={14} className="text-ink-300" />
}

function NodeCard({ node, state, onClick, active }) {
  const ring = state.status === 'running'
    ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-ink-100'
    : state.status === 'done' ? 'ring-1 ring-emerald-300'
    : state.status === 'error' ? 'ring-1 ring-rose-300'
    : 'ring-1 ring-ink-300/60'
  return (
    <button
      onClick={onClick}
      className={clsx(
        'relative w-full bg-white rounded-xl px-4 py-3 text-left shadow-sm transition-all',
        ring,
        state.status === 'running' && 'shadow-md',
        active && 'bg-brand-50',
      )}
      style={{ minHeight: 110 }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <StatusIcon status={state.status} />
          <span className="text-sm font-semibold text-ink-900 truncate">{node.label}</span>
        </div>
        <span className="text-[10px] text-ink-500">{fmtMs(state.elapsed_ms)}</span>
      </div>
      <p className="text-[11px] text-ink-500 mb-2">{node.desc}</p>
      <div className="flex items-center gap-3 text-[11px] text-ink-700">
        {state.doc_count != null && <span>docs: <strong>{state.doc_count}</strong></span>}
        {state.max_score != null && <span>score: <strong>{Number(state.max_score).toFixed(2)}</strong></span>}
        {state.retried && (
          <span className="inline-flex items-center gap-1 text-amber-700">
            <RefreshCw size={11} /> CRAG retry
          </span>
        )}
      </div>
      {state.error && <p className="text-[10px] text-rose-700 mt-1 truncate">{state.error}</p>}
    </button>
  )
}

function Connectors() {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#94a3b8" />
        </marker>
      </defs>
      <line x1="50%" y1="14%" x2="16.6%" y2="40%" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arr)" />
      <line x1="50%" y1="14%" x2="50%"   y2="40%" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arr)" />
      <line x1="50%" y1="14%" x2="83.4%" y2="40%" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arr)" />
      <line x1="16.6%" y1="62%" x2="50%" y2="86%" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arr)" />
      <line x1="50%"   y1="62%" x2="50%" y2="86%" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arr)" />
      <line x1="83.4%" y1="62%" x2="50%" y2="86%" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arr)" />
    </svg>
  )
}

function summarize(ev) {
  const k = ev.event_type
  if (k === 'node_start') return `${ev.node} started`
  if (k === 'node_end') return `${ev.node} done in ${ev.elapsed_ms}ms`
  if (k === 'node_error') return `${ev.node} failed: ${ev.error}`
  if (k === 'orchestrator_decision') return `intent=${ev.intent} · severity=${ev.severity}`
  if (k === 'retrieval')
    return `retrieved ${ev.docs} docs, max ${Number(ev.max_score).toFixed(2)}${ev.reformulated_from ? ' (CRAG)' : ''}`
  if (k === 'crag_retry')
    return `CRAG: "${ev.original_query}" → "${ev.reformulated}" (prev ${Number(ev.prev_max_score).toFixed(2)} < ${ev.threshold})`
  if (k === 'guardrail') return ev.ok ? `${ev.stage} guard ok` : `${ev.stage} guard blocked: ${ev.reason}`
  if (k === 'hilt_interrupt') return `HILT interrupt — ${ev.reason}`
  if (k === 'faithfulness')
    return `faithfulness=${ev.faithful}${ev.pii_redacted?.length ? ` · PII redacted (${ev.pii_redacted.join(',')})` : ''}`
  return k || 'event'
}

function eventIcon(ev) {
  switch (ev.event_type) {
    case 'orchestrator_decision': return <Sparkles size={12} className="text-brand-600" />
    case 'retrieval':             return <Activity size={12} className="text-ink-500" />
    case 'crag_retry':            return <RefreshCw size={12} className="text-amber-600" />
    case 'guardrail':             return ev.ok
      ? <ShieldCheck size={12} className="text-emerald-600" />
      : <ShieldAlert size={12} className="text-rose-600" />
    case 'hilt_interrupt':        return <UserCheck size={12} className="text-rose-600" />
    case 'faithfulness':          return ev.faithful
      ? <ShieldCheck size={12} className="text-emerald-600" />
      : <ShieldAlert size={12} className="text-rose-600" />
    case 'node_start':            return <Loader2 size={12} className="text-brand-600" />
    case 'node_end':              return <CheckCircle2 size={12} className="text-emerald-600" />
    case 'node_error':            return <AlertCircle size={12} className="text-rose-600" />
    default:                      return <Circle size={12} className="text-ink-400" />
  }
}

function EventRow({ ev }) {
  const ts = new Date(ev.t * 1000).toLocaleTimeString()
  return (
    <li className="flex items-start gap-2 text-[11px] py-1.5 border-b border-ink-300/30">
      <span className="mt-0.5">{eventIcon(ev)}</span>
      <span className="text-ink-500 tabular-nums w-16">{ts}</span>
      <span className="flex-1 text-ink-700">{summarize(ev)}</span>
    </li>
  )
}

export default function Flow() {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sessionId] = useState(() => uid())
  const [nodeState, setNodeState] = useState(initialNodeState)
  const [events, setEvents] = useState([])
  const [orchestratorInfo, setOrchestratorInfo] = useState({ intent: null, severity: null })
  const [finalAnswer, setFinalAnswer] = useState(null)
  const [selected, setSelected] = useState(null)
  const wsRef = useRef(null)
  const timelineRef = useRef(null)
  const lastRunningRef = useRef(null) // track which node is currently running for retrieval-event attribution

  useEffect(() => {
    if (timelineRef.current) timelineRef.current.scrollTop = timelineRef.current.scrollHeight
  }, [events])

  useEffect(() => {
    const ws = api.openChatSocket()
    wsRef.current = ws
    ws.onmessage = (evt) => {
      let data
      try { data = JSON.parse(evt.data) } catch { return }

      if (data.type === 'event') {
        setEvents((arr) => [...arr, data])
        const k = data.event_type

        if (k === 'node_start') {
          lastRunningRef.current = data.node
          setNodeState((s) => ({ ...s, [data.node]: { ...(s[data.node] || {}), status: 'running' } }))
        } else if (k === 'node_end') {
          setNodeState((s) => ({
            ...s,
            [data.node]: { ...(s[data.node] || {}), status: 'done', elapsed_ms: data.elapsed_ms },
          }))
          if (lastRunningRef.current === data.node) lastRunningRef.current = null
        } else if (k === 'node_error') {
          setNodeState((s) => ({
            ...s,
            [data.node]: { ...(s[data.node] || {}), status: 'error', error: data.error },
          }))
        } else if (k === 'orchestrator_decision') {
          setOrchestratorInfo({ intent: data.intent, severity: data.severity })
        } else if (k === 'retrieval') {
          const running = lastRunningRef.current
          if (running) {
            setNodeState((s) => ({
              ...s,
              [running]: { ...s[running], doc_count: data.docs, max_score: data.max_score },
            }))
          }
        } else if (k === 'crag_retry') {
          const running = lastRunningRef.current
          if (running) {
            setNodeState((s) => ({
              ...s,
              [running]: { ...s[running], retried: true },
            }))
          }
        }
        return
      }

      if (data.type === 'guard_block') {
        setSending(false)
        setFinalAnswer({ answer: `Blocked by input guard: ${data.detail}`, severity: data.severity || 'LOW', docs: [] })
      } else if (data.type === 'cached') {
        setSending(false)
        setFinalAnswer({ answer: data.answer, severity: data.severity, docs: data.docs, cached: true })
      } else if (data.type === 'final') {
        setSending(false)
        setFinalAnswer({
          answer: data.answer, severity: data.severity,
          docs: data.docs, needs_human: data.needs_human,
        })
      } else if (data.type === 'error') {
        setSending(false)
        setFinalAnswer({ answer: `Error: ${data.detail}`, severity: 'LOW', docs: [] })
      }
    }
    return () => { try { ws.close() } catch {} }
  }, [])

  const handleSend = useCallback(() => {
    const q = input.trim()
    if (!q || sending) return
    setNodeState(initialNodeState())
    setEvents([])
    setOrchestratorInfo({ intent: null, severity: null })
    setFinalAnswer(null)
    setSelected(null)
    lastRunningRef.current = null
    setSending(true)
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ query: q, session_id: sessionId }))
    } else {
      setSending(false)
    }
  }, [input, sending, sessionId])

  return (
    <div className="flex-1 flex flex-col">
      {/* Query bar */}
      <div className="border-b border-ink-300/60 bg-white px-6 py-3">
        <div className="max-w-5xl mx-auto flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
            placeholder="Ask about supply chain risks (watch the pipeline run live)…"
            className="flex-1 border border-ink-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="inline-flex items-center gap-1 px-3 py-2 rounded-md bg-brand-600 text-white text-sm disabled:opacity-50"
          >
            <Send size={14} /> Run
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Graph */}
        <div className="flex-1 overflow-auto p-6">
          {orchestratorInfo.intent && (
            <div className="mb-3 flex items-center gap-3 text-xs text-ink-700">
              <span>intent: <code className="bg-ink-100 px-1.5 py-0.5 rounded">{orchestratorInfo.intent}</code></span>
              <SeverityBadge severity={orchestratorInfo.severity} />
            </div>
          )}

          <div className="relative bg-ink-100/40 rounded-xl p-6" style={{ minHeight: 560 }}>
            <Connectors />
            <div className="relative grid grid-rows-3 gap-12 h-full">
              {/* orchestrator */}
              <div className="grid grid-cols-3 gap-4">
                <div />
                <NodeCard node={NODES[0]} state={nodeState.orchestrator}
                  active={selected === 'orchestrator'} onClick={() => setSelected('orchestrator')} />
                <div />
              </div>
              {/* 3 specialists */}
              <div className="grid grid-cols-3 gap-4">
                {NODES.slice(1, 4).map((n) => (
                  <NodeCard key={n.id} node={n} state={nodeState[n.id]}
                    active={selected === n.id} onClick={() => setSelected(n.id)} />
                ))}
              </div>
              {/* recommendation */}
              <div className="grid grid-cols-3 gap-4">
                <div />
                <NodeCard node={NODES[4]} state={nodeState.recommendation}
                  active={selected === 'recommendation'} onClick={() => setSelected('recommendation')} />
                <div />
              </div>
            </div>
          </div>

          {finalAnswer && (
            <div className="mt-6 bg-white rounded-xl border border-ink-300/60 p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-sm font-semibold">Final answer</h3>
                <SeverityBadge severity={finalAnswer.severity} />
                {finalAnswer.cached && <span className="text-[11px] text-ink-500">cached</span>}
                {finalAnswer.needs_human && (
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 border border-rose-200">
                    HILT escalation
                  </span>
                )}
              </div>
              <p className="text-sm text-ink-900 whitespace-pre-wrap">{finalAnswer.answer}</p>
              {finalAnswer.docs?.length > 0 && (
                <details className="mt-3">
                  <summary className="text-xs text-brand-600 cursor-pointer">
                    {finalAnswer.docs.length} retrieved sources
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {finalAnswer.docs.map((d) => (
                      <li key={d.id} className="text-[11px] border border-ink-300/60 rounded-md p-2 bg-ink-100/40">
                        <code className="text-ink-500">{d.id}</code> · score {Number(d.score).toFixed(2)}
                        <p className="text-ink-700 mt-1">{d.text}</p>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>

        {/* Right: timeline */}
        <aside className="w-[360px] border-l border-ink-300/60 bg-white flex flex-col">
          <header className="px-4 py-3 border-b border-ink-300/60">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Activity size={14} /> Live timeline
            </h3>
            <p className="text-[11px] text-ink-500">{events.length} events</p>
          </header>
          <ul ref={timelineRef} className="flex-1 overflow-y-auto px-4 py-2">
            {events.length === 0 && (
              <li className="text-xs text-ink-500 mt-4 text-center">No events yet — run a query above.</li>
            )}
            {events.map((ev, i) => <EventRow key={i} ev={ev} />)}
          </ul>
        </aside>
      </div>
    </div>
  )
}
