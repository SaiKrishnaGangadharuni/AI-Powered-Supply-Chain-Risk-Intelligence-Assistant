import clsx from 'clsx'
import { CheckCircle2, Circle, Loader2, XCircle, MinusCircle, RefreshCw, AlertTriangle } from 'lucide-react'

const STATUS_STYLE = {
  idle:    'border-ink-300/60 bg-white text-ink-500',
  running: 'border-brand-500 bg-brand-50 text-brand-900 ring-2 ring-brand-200 animate-pulse-slow',
  done:    'border-emerald-300 bg-emerald-50 text-emerald-900',
  error:   'border-rose-300 bg-rose-50 text-rose-900',
  skipped: 'border-ink-300/40 bg-ink-100/40 text-ink-500 opacity-60',
}

const STATUS_ICON = {
  idle:    <Circle      size={14} className="text-ink-300" />,
  running: <Loader2     size={14} className="text-brand-600 animate-spin" />,
  done:    <CheckCircle2 size={14} className="text-emerald-600" />,
  error:   <XCircle     size={14} className="text-rose-600" />,
  skipped: <MinusCircle size={14} className="text-ink-400" />,
}

function fmtMs(ms) {
  if (ms == null) return null
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

export default function NodeCard({ id, label, node, isOrchestrator, isRecommendation, intent, severity, hilt, faithful }) {
  const status = node?.status || 'idle'
  const retrieval = node?.retrieval

  return (
    <div className={clsx(
      'relative rounded-xl border px-4 py-3 transition-all shadow-sm',
      STATUS_STYLE[status],
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {STATUS_ICON[status]}
          <span className="text-sm font-semibold tracking-tight">{label}</span>
        </div>
        {node?.elapsed_ms != null && (
          <span className="text-[11px] font-mono text-ink-500">{fmtMs(node.elapsed_ms)}</span>
        )}
      </div>

      {/* Orchestrator summary */}
      {isOrchestrator && (intent || severity) && (
        <div className="text-[11px] text-ink-700 mb-1 flex flex-wrap gap-1">
          {intent && <span className="px-1.5 py-0.5 rounded bg-white/60 border border-ink-300/60">intent: <b>{intent}</b></span>}
          {severity && <span className={clsx('px-1.5 py-0.5 rounded border',
            severity === 'HIGH' && 'bg-rose-100 text-rose-700 border-rose-200',
            severity === 'MEDIUM' && 'bg-amber-100 text-amber-700 border-amber-200',
            severity === 'LOW' && 'bg-emerald-100 text-emerald-700 border-emerald-200',
          )}>severity: <b>{severity}</b></span>}
        </div>
      )}

      {/* Retrieval stats */}
      {retrieval && (
        <div className="text-[11px] text-ink-700 mt-1 space-y-0.5">
          <div className="flex justify-between">
            <span>retrieved</span>
            <span className="font-mono">{retrieval.docs} docs · {Number(retrieval.max_score ?? 0).toFixed(2)}</span>
          </div>
          {retrieval.elapsed_ms != null && (
            <div className="text-ink-500">retrieval {fmtMs(retrieval.elapsed_ms)}</div>
          )}
        </div>
      )}

      {/* CRAG retry badge */}
      {node?.retried && (
        <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-700">
          <RefreshCw size={11} />
          <span className="italic">CRAG retry</span>
        </div>
      )}

      {/* Recommendation extras */}
      {isRecommendation && faithful != null && (
        <div className={clsx('mt-1 text-[11px] flex items-center gap-1',
          faithful ? 'text-emerald-700' : 'text-rose-700')}>
          {faithful ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
          faithfulness: {faithful ? 'passed' : 'failed'}
        </div>
      )}

      {isRecommendation && hilt && (
        <div className="mt-2 rounded-md border border-rose-300 bg-rose-100/70 px-2 py-1 text-[11px] text-rose-900 flex items-center gap-1">
          <AlertTriangle size={12} /> HILT interrupt · {hilt.reason}
        </div>
      )}

      {/* Error */}
      {node?.error && (
        <div className="mt-1 text-[11px] text-rose-700 break-all">{node.error}</div>
      )}
    </div>
  )
}
