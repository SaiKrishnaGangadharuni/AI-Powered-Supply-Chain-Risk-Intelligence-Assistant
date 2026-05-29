import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { api } from '../api/client.js'

function uid() { return Math.random().toString(36).slice(2, 10) }

const NODE_TO_ID = {
  cache_lookup:           'cache',
  domain_check:           'domain_check',
  orchestrator:           'orchestrator',
  supplier_risk:          'supplier_risk',
  shipment_analysis:      'shipment',
  inventory_intelligence: 'inventory',
  recommendation:         'recommendation',
}

const ChatContext = createContext(null)

export function ChatProvider({ children }) {
  const [messages,   setMessages]   = useState([])
  const [sending,    setSending]    = useState(false)
  const [liveStatus, setLiveStatus] = useState('')
  const [sessionId]                 = useState(() => uid())
  const [nodeStatus, setNodeStatus] = useState({})
  const [timeline,   setTimeline]   = useState([])
  const wsRef = useRef(null)

  const markNode   = (id, status) => setNodeStatus((p) => ({ ...p, [id]: status }))
  const addTimeline = (label, type = 'node') => setTimeline((p) => [...p, { label, type }])
  const resetPipeline = () => { setNodeStatus({}); setTimeline([]) }

  useEffect(() => {
    const connect = () => {
      const ws = api.openChatSocket()
      wsRef.current = ws

      ws.onmessage = (evt) => {
        let data
        try { data = JSON.parse(evt.data) } catch { return }

        if (data.type === 'run_start') {
          resetPipeline()
          // New order: instant guard → cache → domain → pipeline
          markNode('guard_in', 'active')
          setLiveStatus('Input guardrails…')

        } else if (data.type === 'node_update') {
          const node   = data.node || ''
          const stepId = NODE_TO_ID[node]

          if (node === 'cache_lookup') {
            markNode('guard_in', 'done')
            markNode('cache',    'active')
            setLiveStatus('Cache lookup…')
            addTimeline('Cache lookup', 'node')
          } else if (node === 'domain_check') {
            markNode('cache',        'done')   // cache miss confirmed
            markNode('domain_check', 'active')
            setLiveStatus('Domain check…')
            addTimeline('Domain check (cache miss)', 'node')
          } else if (stepId) {
            markNode('domain_check', 'done')
            markNode(stepId, 'active')
            setLiveStatus(`Running: ${node.replace(/_/g, ' ')}…`)
            addTimeline(`Running: ${node.replace(/_/g, ' ')}`, 'node')
            // mark previous pipeline node done
            const pipelineOrder = ['orchestrator','supplier_risk','shipment','inventory','recommendation']
            const idx = pipelineOrder.indexOf(stepId)
            if (idx > 0) markNode(pipelineOrder[idx - 1], 'done')
          }

          setMessages((m) => {
            const next = [...m]
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i].role === 'assistant' && next[i].streaming) {
                next[i] = { ...next[i], content: `Running: ${node.replace(/_/g, ' ')}…` }
                break
              }
            }
            return next
          })

        } else if (data.type === 'guard_block') {
          markNode('guard_in', 'error')
          addTimeline(`Blocked: ${data.detail}`, 'error')
          setLiveStatus(`Blocked: ${data.detail}`)
          setMessages((m) => {
            const next = [...m]
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i].role === 'assistant' && next[i].streaming) {
                next[i] = { ...next[i], streaming: false,
                  content: `I can't help with that: ${data.detail}`, severity: 'LOW' }
                break
              }
            }
            return next
          })
          setSending(false)
          setTimeout(() => setLiveStatus(''), 2500)

        } else if (data.type === 'cached') {
          markNode('guard_in', 'done')
          markNode('cache',    'done')
          // domain check + full pipeline skipped
          ;['domain_check','orchestrator','supplier_risk','shipment','inventory',
            'retrieval','rerank','recommendation','guard_out','hilt'].forEach(
            (id) => markNode(id, 'skipped')
          )
          addTimeline('Cache hit — full pipeline skipped ⚡', 'cache')
          setLiveStatus('Cache hit ⚡')
          setMessages((m) => {
            const next = [...m]
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i].role === 'assistant' && next[i].streaming) {
                next[i] = { ...next[i], id: uid(), streaming: false,
                  content: data.answer || '', severity: data.severity || 'LOW',
                  docs: data.docs || [], needs_human: !!data.needs_human, cached: true }
                break
              }
            }
            return next
          })
          setSending(false)
          setTimeout(() => setLiveStatus(''), 3000)

        } else if (data.type === 'final') {
          markNode('recommendation', 'done')
          markNode('guard_out',      'done')
          markNode('hilt', data.needs_human ? 'active' : 'done')
          addTimeline('Final answer ready ✓', 'done')
          setLiveStatus('Done ✓')
          setMessages((m) => {
            const next = [...m]
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i].role === 'assistant' && next[i].streaming) {
                next[i] = { ...next[i], id: uid(), streaming: false,
                  content: data.answer || '', severity: data.severity || 'LOW',
                  docs: data.docs || [], needs_human: !!data.needs_human, cached: false }
                break
              }
            }
            return next
          })
          setSending(false)
          setTimeout(() => setLiveStatus(''), 3000)

        } else if (data.type === 'crag_retry') {
          markNode('rerank', 'active')
          addTimeline(`CRAG retry #${data.attempt} (score ${data.score?.toFixed(2)})`, 'retry')
          setLiveStatus(`CRAG retry #${data.attempt}…`)

        } else if (data.type === 'error') {
          setLiveStatus('')
          setMessages((m) => {
            const next = [...m]
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i].role === 'assistant' && next[i].streaming) {
                next[i] = { ...next[i], streaming: false,
                  content: `Error: ${data.detail || 'Something went wrong.'}` }
                break
              }
            }
            return next
          })
          setSending(false)
        }
      }

      ws.onerror = () => { setSending(false); setLiveStatus('') }
      ws.onclose = () => setTimeout(connect, 2000)
    }

    connect()
    return () => {
      if (wsRef.current) wsRef.current.onclose = null
      wsRef.current?.close()
    }
  }, [])

  const send = useCallback((input) => {
    const q = input.trim()
    if (!q || sending) return
    setLiveStatus('Sending…')
    setMessages((m) => [
      ...m,
      { id: uid(), role: 'user', content: q },
      { id: uid(), role: 'assistant', content: '', streaming: true },
    ])
    setSending(true)
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({ query: q, session_id: sessionId }))
    } else {
      setMessages((m) => {
        const next = [...m]
        next[next.length - 1] = { ...next[next.length - 1], streaming: false,
          content: 'Connection error. Please refresh.' }
        return next
      })
      setSending(false)
      setLiveStatus('')
    }
  }, [sending, sessionId])

  return (
    <ChatContext.Provider value={{ messages, sending, liveStatus, sessionId, nodeStatus, timeline, send }}>
      {children}
    </ChatContext.Provider>
  )
}

export const useChatContext = () => useContext(ChatContext)
