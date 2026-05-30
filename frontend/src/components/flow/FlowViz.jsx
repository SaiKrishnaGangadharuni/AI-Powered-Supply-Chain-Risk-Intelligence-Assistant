import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Activity, ChevronDown, ChevronUp } from 'lucide-react'
import NodeCard from './NodeCard.jsx'
import { NODES } from '../../hooks/useFlowState.js'

// ── Layout constants (keep in sync with SVG viewBox) ──────────────────────────
// Tiers are at y = 0, 160, 320 (px in viewBox units)
// Each card is ~100px tall, 90px wide in viewBox
// SVG viewBox: 300 wide × 450 tall
// Tier 0 (orchestrator): center x=150, top y=0,  center y=50,  bottom y=100
// Tier 1 (specialists):  x=30/150/270, top y=160, center y=210, bottom y=260
// Tier 2 (recommendation): center x=150, top y=320, center y=370

function edgeStroke(srcStatus, tgtStatus) {
  if (srcStatus === 'done' && (tgtStatus === 'running' || tgtStatus === 'done')) return '#10b981'
  if (srcStatus === 'running' || tgtStatus === 'running') return '#0C7063'
  if (srcStatus === 'error'   || tgtStatus === 'error')   return '#f43f5e'
  if (srcStatus === 'skipped' || tgtStatus === 'skipped') return '#d1d5db'
  return '#d1d5db'
}

function edgeDash(srcStatus, tgtStatus) {
  if (srcStatus === 'running' || tgtStatus === 'running') return '5 4'
  return '0'
}

function ArrowMarker({ id, color }) {
  return (
    <marker id={id} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <path d="M0,0 L0,6 L8,3 z" fill={color} />
    </marker>
  )
}

function EdgesSvg({ flow }) {
  const o  = flow.nodes.orchestrator?.status
  const r  = flow.nodes.recommendation?.status
  const specialists = ['supplier_risk', 'shipment_analysis', 'inventory_intelligence']
  const specX = [50, 150, 250]

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      preserveAspectRatio="none"
      viewBox="0 0 300 450"
    >
      <defs>
        {specialists.map((s, i) => {
          const st = flow.nodes[s]?.status
          const c1 = edgeStroke(o, st)
          const c2 = edgeStroke(st, r)
          return [
            <ArrowMarker key={`m-o-${s}`}  id={`arr-o-${s}`}  color={c1} />,
            <ArrowMarker key={`m-${s}-r`}  id={`arr-${s}-r`}  color={c2} />,
          ]
        })}
      </defs>

      {/* Orchestrator → specialists */}
      {specialists.map((s, i) => {
        const st = flow.nodes[s]?.status
        const color = edgeStroke(o, st)
        return (
          <line
            key={`o-${s}`}
            x1="150" y1="102" x2={specX[i]} y2="158"
            stroke={color}
            strokeWidth="2"
            strokeDasharray={edgeDash(o, st)}
            markerEnd={`url(#arr-o-${s})`}
            className="transition-all duration-300"
          />
        )
      })}

      {/* Specialists → recommendation */}
      {specialists.map((s, i) => {
        const st = flow.nodes[s]?.status
        const color = edgeStroke(st, r)
        return (
          <line
            key={`${s}-r`}
            x1={specX[i]} y1="262" x2="150" y2="318"
            stroke={color}
            strokeWidth="2"
            strokeDasharray={edgeDash(st, r)}
            markerEnd={`url(#arr-${s}-r)`}
            className="transition-all duration-300"
          />
        )
      })}
    </svg>
  )
}

function RunHeader({ flow }) {
  const pill = {
    idle:    'bg-gray-100 text-gray-500',
    running: 'bg-[#f0faf8] text-[#0C7063]',
    done:    'bg-emerald-100 text-emerald-700',
    error:   'bg-rose-100 text-rose-700',
    blocked: 'bg-amber-100 text-amber-700',
    cached:  'bg-violet-100 text-violet-700',
  }[flow.runStatus] || 'bg-gray-100 text-gray-500'

  const elapsed = flow.startedAt
    ? Math.max(0, (flow.finishedAt || Date.now()) - flow.startedAt)
    : null

  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Activity size={15} className="text-[#0C7063]" />
        <h3 className="text-sm font-semibold text-gray-800">Agent Orchestration</h3>
        <span className={clsx('text-[11px] px-2 py-0.5 rounded-full font-medium', pill)}>
          {flow.runStatus}
        </span>
      </div>
      {elapsed != null && (
        <span className="text-[11px] text-gray-400 font-mono">{(elapsed / 1000).toFixed(2)}s total</span>
      )}
    </div>
  )
}

function EventLog({ events }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-gray-200 rounded-xl bg-white mt-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-2 text-xs flex items-center justify-between text-gray-600 hover:bg-gray-50 rounded-xl"
      >
        <span className="font-medium">Event log ({events.length})</span>
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {open && (
        <ul className="max-h-48 overflow-y-auto px-4 py-2 text-[11px] text-gray-600 font-mono space-y-0.5 border-t border-gray-100">
          {events.length === 0 && <li className="text-gray-400">no events yet</li>}
          {events.slice().reverse().map((e, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-gray-300">{new Date(e.t).toLocaleTimeString().slice(0, 8)}</span>
              <span className="font-semibold text-gray-500">{e.event_type || e.type}</span>
              {e.node         && <span className="text-[#0C7063]">{e.node}</span>}
              {e.elapsed_ms   != null && <span className="text-gray-400">{e.elapsed_ms}ms</span>}
              {e.docs         != null && <span className="text-gray-400">docs={e.docs}</span>}
              {e.max_score    != null && <span className="text-gray-400">s={Number(e.max_score).toFixed(2)}</span>}
              {e.reformulated_from && <span className="text-amber-600">CRAG</span>}
              {e.severity     && <span className="text-rose-500">{e.severity}</span>}
              {e.error        && <span className="text-rose-600">{e.error}</span>}
              {e.detail       && <span className="text-rose-600 truncate">{e.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function FlowViz({ flow, compact = false }) {
  const specialists = useMemo(() => NODES.filter(n => n.tier === 1), [])
  const orchestratorNode = NODES.find(n => n.id === 'orchestrator')
  const recommendationNode = NODES.find(n => n.id === 'recommendation')

  return (
    <div className={clsx('relative flex flex-col', compact ? 'p-3 gap-2' : 'p-6 gap-4')}>
      <RunHeader flow={flow} />

      {flow.query && (
        <div className="text-[12px] text-gray-600 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 italic">
          "{flow.query}"
        </div>
      )}

      {/* Visual flow — relative container for SVG overlay */}
      <div className="relative">
        <EdgesSvg flow={flow} />

        <div className="relative flex flex-col gap-10">
          {/* Tier 0 — Orchestrator */}
          <div className="grid grid-cols-3 gap-6">
            <div />
            <NodeCard
              id="orchestrator"
              label={orchestratorNode.label}
              caption={orchestratorNode.caption}
              node={flow.nodes.orchestrator}
              isOrchestrator
              intent={flow.intent}
              severity={flow.severity}
            />
            <div />
          </div>

          {/* Tier 1 — Specialists */}
          <div className="grid grid-cols-3 gap-6">
            {specialists.map(s => (
              <NodeCard
                key={s.id}
                id={s.id}
                label={s.label}
                caption={s.caption}
                node={flow.nodes[s.id]}
              />
            ))}
          </div>

          {/* Tier 2 — Recommendation */}
          <div className="grid grid-cols-3 gap-6">
            <div />
            <NodeCard
              id="recommendation"
              label={recommendationNode.label}
              caption={recommendationNode.caption}
              node={flow.nodes.recommendation}
              isRecommendation
              hilt={flow.hilt_interrupt}
              faithful={flow.faithfulness?.faithful}
            />
            <div />
          </div>
        </div>
      </div>

      <EventLog events={flow.events} />
    </div>
  )
}
