import { ThumbsUp, ThumbsDown, FileText, UserCheck } from 'lucide-react'
import clsx from 'clsx'
import SeverityBadge from './SeverityBadge.jsx'

export default function Message({ msg, onShowDocs, onFeedback, onEscalate }) {
  const isUser = msg.role === 'user'
  return (
    <div className={clsx('flex w-full mb-4', isUser ? 'justify-end' : 'justify-start')}>
      <div className={clsx(
        'rounded-lg px-4 py-3 max-w-[80%] whitespace-pre-wrap text-sm shadow-sm',
        isUser ? 'bg-brand-600 text-white' : 'bg-white border border-ink-300/60 text-ink-900',
      )}>
        {!isUser && msg.severity && (
          <div className="mb-2 flex items-center gap-2">
            <SeverityBadge severity={msg.severity} />
            {msg.cached && <span className="text-[11px] text-ink-500">cached</span>}
          </div>
        )}
        <div>{msg.content || (msg.streaming ? '…' : '')}</div>
        {!isUser && !msg.streaming && (
          <div className="mt-3 pt-2 border-t border-ink-300/40 flex items-center gap-3 text-xs text-ink-500">
            <button
              onClick={() => onShowDocs?.(msg)}
              className="inline-flex items-center gap-1 hover:text-ink-900"
              title="View sources"
            >
              <FileText size={14} /> Sources ({msg.docs?.length || 0})
            </button>
            <button
              onClick={() => onFeedback?.(msg, 'up')}
              className={clsx('inline-flex items-center gap-1 hover:text-emerald-600',
                msg.rating === 'up' && 'text-emerald-600')}
            >
              <ThumbsUp size={14} />
            </button>
            <button
              onClick={() => onFeedback?.(msg, 'down')}
              className={clsx('inline-flex items-center gap-1 hover:text-rose-600',
                msg.rating === 'down' && 'text-rose-600')}
            >
              <ThumbsDown size={14} />
            </button>
            {msg.needs_human && (
              <button
                onClick={() => onEscalate?.(msg)}
                className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md
                           bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100"
              >
                <UserCheck size={14} /> Escalate to Human
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
