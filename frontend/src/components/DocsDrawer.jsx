import { X } from 'lucide-react'
import SeverityBadge from './SeverityBadge.jsx'

export default function DocsDrawer({ open, onClose, docs = [] }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <aside className="w-[420px] max-w-[90vw] h-full bg-white border-l border-ink-300 shadow-xl flex flex-col">
        <header className="px-4 py-3 border-b border-ink-300 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Retrieved sources ({docs.length})</h3>
          <button onClick={onClose} className="p-1 hover:bg-ink-100 rounded">
            <X size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {docs.length === 0 && (
            <p className="text-sm text-ink-500">No sources for this response.</p>
          )}
          {docs.map((d) => (
            <article key={d.id} className="border border-ink-300/60 rounded-md p-3 bg-ink-100/50">
              <div className="flex items-center justify-between mb-1.5">
                <code className="text-[11px] text-ink-500">{d.id}</code>
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={d.metadata?.severity} />
                  <span className="text-[11px] text-ink-500">score {Number(d.score).toFixed(2)}</span>
                </div>
              </div>
              <p className="text-xs text-ink-700 whitespace-pre-wrap">{d.text}</p>
              {d.metadata && (
                <details className="mt-2">
                  <summary className="text-[11px] text-brand-600 cursor-pointer">metadata</summary>
                  <pre className="text-[10px] text-ink-500 mt-1 overflow-auto max-h-32">
                    {JSON.stringify(d.metadata, null, 2)}
                  </pre>
                </details>
              )}
            </article>
          ))}
        </div>
      </aside>
    </div>
  )
}
