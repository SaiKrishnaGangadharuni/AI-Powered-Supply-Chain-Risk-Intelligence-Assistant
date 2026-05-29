import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Activity, ChevronDown, ChevronUp } from 'lucide-react'
import NodeCard from './NodeCard.jsx'
import { NODES } from '../../hooks/useFlowState.js'

// Color the connector edge based on the source node's status.
function edgeClass(srcStatus, tgtStatus) {
  if (srcStatus === 'done' && (tgtStatus === 'running' || tgtStatus === 'done')) return 'stroke-emerald-400'
  if (srcStatus === 'running' || tgtStatus === 'running') return 'stroke-brand-500'
  if (srcStatus === 'error' || tgtStatus === 'error') return 'stroke-rose-400'
  if (srcStatus === 'skipped' || tgtStatus === 'skipped') return 'stroke-ink-300/40'
  return 'stroke-ink-300'
}

function EdgesSvg({ flow }) {
  const o = flow.nodes.orchestrator?.status
  const r = flow.nodes.recommendation?.status
  const specialists = ['supplier_risk', 'shipment_analysis', 'inventory_intelligence']

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none" viewBox="0 0 300 200">
      {/* Orchestrator (top-center: 150,30) → 3 specialists (tier1: y=100, x=50/150/250) */}
      {specialists.map((s, i) => {
        const x = 50 + i * 100
        const status = flow.nodes[s]?.status
        return (
          <line
            key={`o-${s}`}
            x1="150" y1="40" x2={x} y2="90"
            className={clsx('transition-all', edgeClass(o, status))}
            strokeWidth="1.5"
            strokeDasharray={status === 'running' ? '4 3' : '0'}
          />
        )
      })}
      {/* 3 specialists → recommendation (bottom-center: 150,170) */}
      {specialists.map((s, i) => {
        const x = 50 + i * 100
        const status = flow.nodes[s]?.status
        return (
          <line
            key={`${s}-r`}
            x1={x} y1="120" x2="150" y2="160"
            className={clsx('transition-all', edgeClass(status, r))}
            strokeWidth="1.5"
            strokeDasharray={status === 'done' && r === 'running' ? '4 3' : '0'}
          />
        )
      })}
    </svg>
  )
}

function RunHeader({ flow }) {
  const pillStyle = {
    idle:     'bg-ink-100 text-ink-500',
    running:  'bg-brand-100 text-brand-700',
    done:     'bg-emerald-100 text-emerald-700',
    error:    'bg-rose-100 text-rose-700',
    blocked:  'bg-amber-100 text-amber-700',
    cached:   'bg-violet-100 text-violet-700',
  }[flow.runStatus] || 'bg-ink-100 text-ink-500'

  const elapsed = flow.startedAt
    ? Math.max(0, (flow.finishedAt || Date.now()) - flow.startedAt)
    : null

  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <Activity size={14} className="text-brand-600" />
        <h3 className="text-sm font-semibold">Agent Orchestration</h3>
        <span className={clsx('text-[11px] px-2 py-0.5 rounded-md font-medium', pillStyle)}>
          {flow.runStatus}
        </span>
      </div>
      {elapsed != null && (
        <span className="text-[11px] text-ink-500 font-mono">
          {(elapsed / 1000).toFixed(2)}s total
        </span>
      )}
    </div>
  )
}

function EventLog({ events }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-ink-300/60 rounded-md bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-3 py-1.5 text-xs flex items-center justify-between text-ink-700 hover:bg-ink-100/60"
      >
        <span>Event log ({events.length})</span>
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && (
        <ul className="max-h-48 overflow-y-auto px-3 py-2 text-[11px] text-ink-700 font-mono space-y-0.5 border-t border-ink-300/40">
          {events.length === 0 && <li className="text-ink-500">no events yet</li>}
          {events.slice().reverse().map((e, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-ink-400">{new Date(e.t).toLocaleTimeString().slice(0, 8)}</span>
              <span className="font-semibold">{e.event_type || e.type}</span>
              {e.node && <span className="text-brand-600">{e.node}</span>}
              {e.elapsed_ms != null && <span className="text-ink-500">{e.elapsed_ms}ms</span>}
              {e.docs != null && <span className="text-ink-500">docs={e.docs}</span>}
              {e.max_score != null && <span className="text-ink-500">s={Number(e.max_score).toFixed(2)}</span>}
              {e.reformulated_from && <span className="text-amber-700">CRAG</span>}
              {e.severity && <span className="text-rose-600">{e.severity}</span>}
              {e.error && <span className="text-rose-700">{e.error}</span>}
              {e.detail && <span className="text-rose-700 truncate">{e.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function FlowViz({ flow, compact = false }) {
  const specialists = useMemo(() => NODES.filter((n) => n.tier === 1), [])

  return (
    <div className={clsx('relative flex flex-col gap-3', compact ? 'p-3' : 'p-5')}>
      <RunHeader flow={flow} />

      {flow.query && (
        <div className="text-[12px] text-ink-700 bg-ink-100/70 border border-ink-300/60 rounded-md px-3 py-1.5 italic">
          "{flow.query}"
        </div>
      )}

      {/* Visual flow */}
      <div className="relative">
        <EdgesSvg flow={flow} />
        <div className="relative grid grid-cols-1 gap-3">
          {/* Tier 0 — Orchestrator (full width centered) */}
          <div className="grid grid-cols-3 gap-3">
            <div />
            <NodeCard
              id="orchestrator"
              label="Orchestrator"
              node={flow.nodes.orchestrator}
              isOrchestrator
              intent={flow.intent}
              severity={flow.severity}
            />
            <div />
          </div>

          {/* Tier 1 — Specialists (3 in a row) */}
          <div className="grid grid-cols-3 gap-3">
            {specialists.map((s) => (
              <NodeCard
                key={s.id}
                id={s.id}
                label={s.label}
                node={flow.nodes[s.id]}
              />
            ))}
          </div>

          {/* Tier 2 — Recommendation (full width centered) */}
          <div className="grid grid-cols-3 gap-3">
            <div />
            <NodeCard
              id="recommendation"
              label="Recommendation"
              node={flow.nodes.recommendation}
              isRecommendation
              hilt={flow.hilt_interrupt}
              faithful={flow.faithfulness?.faithful}
            />
            <div />
          </div>
        </div>
      </div>

      {/* Event log */}
      <EventLog events={flow.events} />
    </div>
  )
}
