import clsx from 'clsx'
import { CheckCircle2, Circle, Loader2, XCircle, MinusCircle, RefreshCw, AlertTriangle } from 'lucide-react'

const STATUS_STYLE = {
  idle:    'border-gray-200 bg-white text-gray-500',
  running: 'border-[#0C7063] bg-[#f0faf8] text-[#083f37] ring-2 ring-[#d4f0eb] animate-pulse-slow',
  done:    'border-emerald-300 bg-emerald-50 text-emerald-900',
  error:   'border-rose-300 bg-rose-50 text-rose-900',
  skipped: 'border-gray-200 bg-gray-50 text-gray-400 opacity-50',
}

const STATUS_ICON = {
  idle:    <Circle       size={16} className="text-gray-300" />,
  running: <Loader2      size={16} className="text-[#0C7063] animate-spin" />,
  done:    <CheckCircle2 size={16} className="text-emerald-500" />,
  error:   <XCircle      size={16} className="text-rose-500" />,
  skipped: <MinusCircle  size={16} className="text-gray-300" />,
}

function fmtMs(ms) {
  if (ms == null) return null
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`
}

export default function NodeCard({ id, label, caption, node, isOrchestrator, isRecommendation, intent, severity, hilt, faithful }) {
  const status = node?.status || 'idle'
  const retrieval = node?.retrieval

  return (
    <div className={clsx(
      'relative rounded-2xl border-2 px-4 py-4 transition-all shadow-sm flex flex-col items-center text-center',
      STATUS_STYLE[status],
    )}>
      {/* Status icon */}
      <div className="mb-2">{STATUS_ICON[status]}</div>

      {/* Title — centered */}
      <span className="text-sm font-bold tracking-tight leading-tight">{label}</span>

      {/* Caption */}
      {caption && (
        <span className="text-[11px] text-gray-400 mt-1 leading-snug">{caption}</span>
      )}

      {/* Elapsed */}
      {node?.elapsed_ms != null && (
        <span className="text-[11px] font-mono text-gray-400 mt-1">{fmtMs(node.elapsed_ms)}</span>
      )}

      {/* Orchestrator: intent + severity badges */}
      {isOrchestrator && (intent || severity) && (
        <div className="mt-2 flex flex-wrap gap-1 justify-center">
          {intent && (
            <span className="px-2 py-0.5 rounded-full bg-white border border-gray-200 text-[11px] text-gray-600">
              intent: <b>{intent}</b>
            </span>
          )}
          {severity && (
            <span className={clsx('px-2 py-0.5 rounded-full text-[11px] font-medium border',
              severity === 'HIGH'   && 'bg-rose-100 text-rose-700 border-rose-200',
              severity === 'MEDIUM' && 'bg-amber-100 text-amber-700 border-amber-200',
              severity === 'LOW'    && 'bg-emerald-100 text-emerald-700 border-emerald-200',
            )}>
              {severity}
            </span>
          )}
        </div>
      )}

      {/* Retrieval stats */}
      {retrieval && (
        <div className="mt-2 text-[11px] text-gray-500 space-y-0.5 w-full">
          <div className="flex justify-between px-1">
            <span>docs retrieved</span>
            <span className="font-mono">{retrieval.docs} · score {Number(retrieval.max_score ?? 0).toFixed(2)}</span>
          </div>
          {retrieval.elapsed_ms != null && (
            <div className="text-gray-400 text-center">{fmtMs(retrieval.elapsed_ms)}</div>
          )}
        </div>
      )}

      {/* CRAG retry */}
      {node?.retried && (
        <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-600">
          <RefreshCw size={11} /> CRAG retry
        </div>
      )}

      {/* Faithfulness */}
      {isRecommendation && faithful != null && (
        <div className={clsx('mt-1 text-[11px] flex items-center gap-1',
          faithful ? 'text-emerald-600' : 'text-rose-600')}>
          {faithful ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
          faithfulness: {faithful ? 'passed' : 'failed'}
        </div>
      )}

      {/* HILT */}
      {isRecommendation && hilt && (
        <div className="mt-2 rounded-xl border border-rose-300 bg-rose-50 px-2 py-1 text-[11px] text-rose-800 flex items-center gap-1">
          <AlertTriangle size={11} /> HILT · {hilt.reason}
        </div>
      )}

      {/* Error */}
      {node?.error && (
        <div className="mt-1 text-[11px] text-rose-600 break-all">{node.error}</div>
      )}
    </div>
  )
}
