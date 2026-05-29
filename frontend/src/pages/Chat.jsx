import { useCallback, useEffect, useRef, useState } from 'react'
import { Send, PanelRightClose, PanelRightOpen } from 'lucide-react'
import clsx from 'clsx'
import { api } from '../api/client.js'
import Message from '../components/Message.jsx'
import DocsDrawer from '../components/DocsDrawer.jsx'
import FlowViz from '../components/flow/FlowViz.jsx'
import { useFlowState } from '../hooks/useFlowState.js'

function uid() { return Math.random().toString(36).slice(2, 10) }

export default function Chat() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [drawer, setDrawer] = useState({ open: false, docs: [] })
  const [showFlow, setShowFlow] = useState(true)
  const [sessionId] = useState(() => uid())
  const wsRef = useRef(null)
  const listRef = useRef(null)
  const { flow, ingest, reset: resetFlow } = useFlowState()

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages])

  // Single shared WS for the page
  useEffect(() => {
    const ws = api.openChatSocket()
    wsRef.current = ws
    ws.onmessage = (evt) => {
      let data
      try { data = JSON.parse(evt.data) } catch { return }
      // Feed the flow reducer first
      ingest(data)

      if (data.type === 'final' || data.type === 'cached') {
        setMessages((m) => {
          const next = [...m]
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].role === 'assistant' && next[i].streaming) {
              next[i] = {
                ...next[i], id: uid(), streaming: false,
                content: data.answer || '',
                severity: data.severity || 'LOW',
                docs: data.docs || [],
                needs_human: !!data.needs_human,
                cached: data.type === 'cached',
              }
              break
            }
          }
          return next
        })
        setSending(false)
      } else if (data.type === 'node_update') {
        setMessages((m) => {
          const next = [...m]
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].role === 'assistant' && next[i].streaming) {
              next[i] = { ...next[i], content: `working… (${data.node})` }
              break
            }
          }
          return next
        })
      } else if (data.type === 'guard_block') {
        setMessages((m) => {
          const next = [...m]
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].role === 'assistant' && next[i].streaming) {
              next[i] = { ...next[i], streaming: false,
                content: `Blocked by input guard: ${data.detail}`,
                severity: data.severity || 'LOW' }
              break
            }
          }
          return next
        })
        setSending(false)
      } else if (data.type === 'error') {
        setMessages((m) => {
          const next = [...m]
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].role === 'assistant' && next[i].streaming) {
              next[i] = { ...next[i], streaming: false, content: `Error: ${data.detail}` }
              break
            }
          }
          return next
        })
        setSending(false)
      }
    }
    return () => { try { ws.close() } catch {} }
  }, [ingest])

  const send = useCallback(() => {
    const q = input.trim()
    if (!q || sending) return
    resetFlow()
    const userMsg = { id: uid(), role: 'user', content: q }
    const placeholder = { id: uid(), role: 'assistant', content: '', streaming: true, docs: [] }
    setMessages((m) => [...m, userMsg, placeholder])
    setInput('')
    setSending(true)
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ query: q, session_id: sessionId }))
    } else {
      api.query({ query: q, session_id: sessionId })
        .then((r) => {
          setMessages((m) => {
            const next = [...m]
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i].role === 'assistant' && next[i].streaming) {
                next[i] = { ...next[i], streaming: false, content: r.answer, severity: r.severity, docs: r.docs, needs_human: r.needs_human }
                break
              }
            }
            return next
          })
        })
        .catch((e) => setMessages((m) => [...m, { id: uid(), role: 'assistant', content: `Error: ${e.message}` }]))
        .finally(() => setSending(false))
    }
  }, [input, sending, sessionId, resetFlow])

  const onShowDocs = (msg) => setDrawer({ open: true, docs: msg.docs || [] })
  const onFeedback = (msg, rating) => {
    setMessages((m) => m.map((x) => x.id === msg.id ? { ...x, rating } : x))
    api.feedback({ session_id: sessionId, message_id: msg.id, rating }).catch(() => {})
  }
  const onEscalate = (msg) => {
    api.feedback({ session_id: sessionId, message_id: msg.id, rating: 'down', note: 'ESCALATE_TO_HUMAN' }).catch(() => {})
    setMessages((m) => [...m, {
      id: uid(), role: 'assistant',
      content: 'Flagged for human review. A specialist will pick this up.',
      severity: 'HIGH',
    }])
  }

  return (
    <div className="flex-1 flex">
      {/* Chat column */}
      <div className={clsx('flex-1 flex flex-col min-w-0', showFlow ? 'border-r border-ink-300/60' : '')}>
        <div ref={listRef} className="flex-1 overflow-y-auto px-6 py-4 max-w-3xl mx-auto w-full">
          {messages.length === 0 && (
            <div className="text-center text-ink-500 mt-20">
              <p className="text-sm">Ask anything about suppliers, shipments, or inventory.</p>
              <p className="text-xs mt-1">Try: "Which suppliers had defect rates above 3%?"</p>
            </div>
          )}
          {messages.map((m) => (
            <Message key={m.id} msg={m} onShowDocs={onShowDocs} onFeedback={onFeedback} onEscalate={onEscalate} />
          ))}
        </div>
        <div className="border-t border-ink-300/60 bg-white px-6 py-3">
          <div className="max-w-3xl mx-auto flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              rows={1}
              placeholder="Ask about supply chain risks…"
              className="flex-1 resize-none border border-ink-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-brand-500"
            />
            <button
              onClick={() => setShowFlow((v) => !v)}
              className="inline-flex items-center px-2 py-2 rounded-md border border-ink-300 text-ink-700 hover:bg-ink-100"
              title={showFlow ? 'Hide flow panel' : 'Show flow panel'}
            >
              {showFlow ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
            </button>
            <button
              onClick={send}
              disabled={sending || !input.trim()}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-md bg-brand-600 text-white text-sm disabled:opacity-50"
            >
              <Send size={14} /> Send
            </button>
          </div>
        </div>
      </div>

      {/* Flow side panel */}
      {showFlow && (
        <aside className="w-[460px] xl:w-[520px] shrink-0 bg-ink-100/40 overflow-y-auto">
          <FlowViz flow={flow} compact />
        </aside>
      )}

      <DocsDrawer open={drawer.open} docs={drawer.docs} onClose={() => setDrawer({ open: false, docs: [] })} />
    </div>
  )
}
