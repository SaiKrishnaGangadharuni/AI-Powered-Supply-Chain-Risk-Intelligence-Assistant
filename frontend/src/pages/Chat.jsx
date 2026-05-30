import { useCallback, useEffect, useRef, useState } from 'react'
import { Send, X, Loader2, ThumbsUp, ThumbsDown, Zap } from 'lucide-react'
import { useChatContext } from '../context/ChatContext.jsx'
import { api } from '../api/client.js'

/* ── All possible pipeline steps (ordered) ─────────────────── */
const ALL_STEPS = [
  { id: 'guard_in',       label: 'Input Guardrails',        detail: 'Injection · length · greeting (instant, zero latency)' },
  { id: 'cache',          label: 'Cache Lookup',            detail: 'Semantic (cosine ≥ 0.92) + keyword LRU — before domain check' },
  { id: 'domain_check',   label: 'Domain Check',            detail: 'Groq LLM on-topic check — only on cache miss' },
  { id: 'compress',       label: 'Prompt Compression',      detail: 'Token trimming' },
  { id: 'orchestrator',   label: 'Orchestrator',            detail: 'Intent + severity routing (Groq llama-3.1-8b)' },
  { id: 'supplier_risk',  label: 'Supplier Risk Agent',     detail: 'Historical supplier incidents' },
  { id: 'shipment',       label: 'Shipment Analysis Agent', detail: 'Delay patterns · mode analysis' },
  { id: 'inventory',      label: 'Inventory Intelligence',  detail: 'Stock anomalies · demand spikes' },
  { id: 'retrieval',      label: 'Hybrid Retrieval',        detail: 'ChromaDB ∥ BM25 parallel → RRF fusion (k=60)' },
  { id: 'rerank',         label: 'Rerank + CRAG',           detail: 'Cosine rerank · retry if score < 0.6' },
  { id: 'recommendation', label: 'Recommendation',          detail: 'Mitigation synthesis (gpt-4o-mini)' },
  { id: 'guard_out',      label: 'Output Guardrails',       detail: 'Faithfulness · hallucination filter' },
  { id: 'hilt',           label: 'HILT / Feedback',         detail: 'HIGH severity → human review · SQLite' },
]

/* ── Process Modal — only triggered steps ──────────────────── */
function ProcessModal({ nodeStatus, timeline, onClose }) {
  // Only show steps that have been touched (not pending)
  const triggered = ALL_STEPS.filter((s) => nodeStatus[s.id] && nodeStatus[s.id] !== 'pending')

  const dotColor = (s) => ({
    done:    'bg-green-500',
    active:  'bg-blue-500 animate-pulse',
    error:   'bg-red-500',
    skipped: 'bg-yellow-400',
  }[s] || 'bg-gray-200')

  const labelColor = (s) => ({
    done:    'text-green-700',
    active:  'text-blue-600',
    error:   'text-red-600',
    skipped: 'text-yellow-600',
  }[s] || 'text-gray-500')

  const badge = (s) => ({
    done:    { text: 'done',    cls: 'bg-green-100 text-green-700' },
    active:  { text: 'running', cls: 'bg-blue-100 text-blue-700' },
    error:   { text: 'blocked', cls: 'bg-red-100 text-red-700' },
    skipped: { text: 'skipped', cls: 'bg-yellow-100 text-yellow-700' },
  }[s])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900">Pipeline Process</h2>
            <p className="text-xs text-gray-400 mt-0.5">Showing triggered steps only</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1"><X size={18} /></button>
        </div>

        {/* Steps */}
        <div className="overflow-y-auto px-6 py-4 flex-1">
          {triggered.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-gray-400">No steps triggered yet.</p>
              <p className="text-xs text-gray-300 mt-1">Send a message to see the pipeline run.</p>
            </div>
          ) : (
            <div className="space-y-0">
              {triggered.map((step, i) => {
                const s = nodeStatus[step.id]
                const b = badge(s)
                return (
                  <div key={step.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full mt-1.5 flex-shrink-0 ${dotColor(s)}`} />
                      {i < triggered.length - 1 && (
                        <div className="w-0.5 flex-1 my-1 bg-gray-200" />
                      )}
                    </div>
                    <div className="pb-3 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-medium ${labelColor(s)}`}>{step.label}</span>
                        {b && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${b.cls}`}>
                            {b.text}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{step.detail}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Timeline footer — only if there are events */}
        {timeline.length > 0 && (
          <div className="border-t px-6 py-3 flex-shrink-0 bg-gray-50 rounded-b-2xl">
            <p className="text-xs font-medium text-gray-500 mb-2">Timeline</p>
            <div className="space-y-1 max-h-24 overflow-y-auto">
              {timeline.map((t, i) => (
                <div key={i} className={`text-xs px-2 py-1 rounded ${
                  t.type === 'error'  ? 'bg-red-50 text-red-600' :
                  t.type === 'retry'  ? 'bg-yellow-50 text-yellow-700' :
                  t.type === 'cache'  ? 'bg-green-50 text-green-700' :
                  t.type === 'done'   ? 'bg-green-50 text-green-700' :
                  'bg-white text-gray-500 border border-gray-100'
                }`}>{t.label}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Markdown renderer ─────────────────────────────────────── */
function MarkdownContent({ text }) {
  const lines = text.split('\n')
  const elements = []
  let key = 0

  const parseInline = (str) => {
    // Bold **text**
    const parts = str.split(/(\*\*[^*]+\*\*)/)
    return parts.map((p, i) =>
      p.startsWith('**') && p.endsWith('**')
        ? <strong key={i}>{p.slice(2, -2)}</strong>
        : p
    )
  }

  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) { elements.push(<div key={key++} className="h-2" />); i++; continue }

    // Heading: ## text
    if (trimmed.startsWith('## ')) {
      elements.push(<p key={key++} className="font-bold text-gray-900 mt-3 mb-1 text-sm">{parseInline(trimmed.slice(3))}</p>)
      i++; continue
    }

    // Bullet: * or - or numbered
    if (/^[*\-•]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
      const items = []
      while (i < lines.length && (/^[*\-•]\s/.test(lines[i].trim()) || /^\d+\.\s/.test(lines[i].trim()))) {
        const t = lines[i].trim().replace(/^[*\-•]\s|^\d+\.\s/, '')
        items.push(<li key={i} className="mb-1">{parseInline(t)}</li>)
        i++
      }
      elements.push(<ul key={key++} className="list-none pl-2 space-y-0.5 my-1">{items}</ul>)
      continue
    }

    // Normal paragraph
    elements.push(<p key={key++} className="mb-1">{parseInline(trimmed)}</p>)
    i++
  }

  return <div className="space-y-0.5">{elements}</div>
}

/* ── Message bubble ────────────────────────────────────────── */
function Message({ msg, onFeedback }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-[#0C7063] flex items-center justify-center text-white text-xs font-bold mr-2 flex-shrink-0 mt-1">AI</div>
      )}
      <div className="max-w-[75%]">
        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-[#0C7063] text-white rounded-br-sm whitespace-pre-wrap'
            : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
        }`}>
          {msg.streaming
            ? <span className="flex items-center gap-2 text-gray-400"><Loader2 size={14} className="animate-spin" />{msg.content || 'Processing…'}</span>
            : isUser ? msg.content : <MarkdownContent text={msg.content} />}
          {msg.cached && <span className="ml-2 text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">cached ⚡</span>}
        </div>
        {!isUser && !msg.streaming && (
          <div className="flex items-center gap-2 mt-1 px-1">
            {msg.severity && msg.severity !== 'LOW' && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${msg.severity === 'HIGH' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {msg.severity}
              </span>
            )}
            {msg.needs_human && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Needs review</span>}
            <button onClick={() => onFeedback(msg.id, 'up')} className="text-gray-300 hover:text-green-500 ml-auto"><ThumbsUp size={13} /></button>
            <button onClick={() => onFeedback(msg.id, 'down')} className="text-gray-300 hover:text-red-400"><ThumbsDown size={13} /></button>
          </div>
        )}
      </div>
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 text-xs font-bold ml-2 flex-shrink-0 mt-1">U</div>
      )}
    </div>
  )
}

/* ── Main Chat ─────────────────────────────────────────────── */
export default function Chat() {
  const { messages, sending, liveStatus, sessionId, nodeStatus, timeline, send } = useChatContext()
  const [input,       setInput]       = useState('')
  const [showModal,   setShowModal]   = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [showSug,     setShowSug]     = useState(false)
  const listRef = useRef(null)

  // Persisted query history across sessions
  const [savedHistory, setSavedHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('scria_query_history') || '[]') } catch { return [] }
  })

  // Merge persisted + current session queries (deduplicated)
  const history = [...new Set([
    ...savedHistory,
    ...messages.filter((m) => m.role === 'user').map((m) => m.content),
  ])]

  // Filter suggestions on input change
  useEffect(() => {
    const q = input.trim().toLowerCase()
    if (!q) { setSuggestions([]); return }
    const matches = history.filter((h) => h.toLowerCase().includes(q) && h.toLowerCase() !== q)
    setSuggestions(matches.slice(0, 5))
  }, [input, messages, savedHistory])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  const onFeedback = useCallback(async (msgId, rating) => {
    try { await api.feedback({ session_id: sessionId, message_id: msgId, rating }) } catch {}
  }, [sessionId])

  const acceptSuggestion = (s) => { setInput(s); setSuggestions([]); setShowSug(false) }

  const persistQuery = (q) => {
    if (!q.trim()) return
    setSavedHistory((prev) => {
      const updated = [...new Set([...prev, q.trim()])].slice(-100) // keep last 100
      try { localStorage.setItem('scria_query_history', JSON.stringify(updated)) } catch {}
      return updated
    })
  }

  const handleKey = (e) => {
    if (e.key === 'Tab' && suggestions.length > 0) {
      e.preventDefault(); acceptSuggestion(suggestions[0]); return
    }
    if (e.key === 'Escape') { setSuggestions([]); return }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault(); setSuggestions([]); persistQuery(input); send(input); setInput('')
    }
  }
  const handleSend = () => { setSuggestions([]); persistQuery(input); send(input); setInput('') }
  const started = messages.length > 0

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 max-w-3xl w-full mx-auto">
        {!started && (
          <div className="flex flex-col items-center justify-center h-full text-center pb-10">
            <div className="w-14 h-14 rounded-2xl bg-[#0C7063] flex items-center justify-center mb-4 shadow-lg">
              <Zap size={28} className="text-white" />
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              Welcome to Supply Chain Risk Intelligence Assistant
            </h2>
            <p className="text-sm text-gray-500 max-w-md">
              Ask me about supplier risks, shipment delays, inventory anomalies, or any supply chain disruption.
            </p>
          </div>
        )}
        {messages.map((msg) => <Message key={msg.id} msg={msg} onFeedback={onFeedback} />)}
      </div>

      {/* Input bar */}
      <div className="bg-white border-t border-gray-200 px-4 py-3 flex-shrink-0">
        <div className="max-w-3xl mx-auto relative">
          {/* Suggestion dropdown */}
          {suggestions.length > 0 && (
            <div className="absolute bottom-full mb-2 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden z-10">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onMouseDown={(e) => { e.preventDefault(); acceptSuggestion(s) }}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-[#f0faf8] hover:text-[#0a5e53] border-b border-gray-100 last:border-0 truncate"
                >
                  <span className="text-[#0e8a77] mr-1">↑</span>{s}
                </button>
              ))}
              <div className="px-4 py-1.5 text-xs text-gray-400 bg-gray-50">Tab to accept · Esc to dismiss</div>
            </div>
          )}
          <div className="flex items-end gap-2 bg-white border-2 border-gray-300 rounded-2xl px-4 py-2.5 shadow-sm focus-within:border-[#0C7063] focus-within:ring-2 focus-within:ring-[#d4f0eb] transition-all">
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about supply chain risks, shipment delays, inventory…"
              className="flex-1 resize-none text-sm text-gray-800 outline-none bg-transparent placeholder-gray-400 max-h-32 overflow-y-auto"
              style={{ minHeight: '24px' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || sending}
              className="mb-0.5 p-2 rounded-xl bg-[#0C7063] text-white disabled:opacity-40 hover:bg-[#0a5e53] transition-colors flex-shrink-0"
            >
              {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
          <div className="flex items-center justify-between mt-1.5 px-1">
            <span className="text-xs text-gray-400 min-h-[16px]">{liveStatus}</span>
            <button
              onClick={() => setShowModal(true)}
              className="text-xs text-[#0e8a77] hover:text-[#0a5e53] underline underline-offset-2"
            >
              View Process
            </button>
          </div>
        </div>
      </div>

      {showModal && (
        <ProcessModal nodeStatus={nodeStatus} timeline={timeline} onClose={() => setShowModal(false)} />
      )}
    </div>
  )
}
