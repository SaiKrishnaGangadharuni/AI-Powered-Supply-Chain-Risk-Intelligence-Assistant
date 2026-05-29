// Shared flow-state reducer hook.
// Consumes WS messages from the backend and produces a strongly-shaped
// flow snapshot that the FlowViz component can render.
//
// Event envelopes from backend:
//   { type: "run_start",  session_id, query }
//   { type: "node_update", node, intent?, severity? }      (LangGraph stream)
//   { type: "event", event_type: "node_start"   | "node_end" | "node_error"
//                                | "retrieval"   | "hilt_interrupt"
//                                | "faithfulness", node?, ... }
//   { type: "guard_block", detail, severity }
//   { type: "cached",      ... }
//   { type: "final",       ... }
//   { type: "error",       detail }
import { useCallback, useReducer } from 'react'

export const NODES = [
  { id: 'orchestrator',           label: 'Orchestrator',           tier: 0 },
  { id: 'supplier_risk',          label: 'Supplier Risk',          tier: 1 },
  { id: 'shipment_analysis',      label: 'Shipment Analysis',      tier: 1 },
  { id: 'inventory_intelligence', label: 'Inventory Intelligence', tier: 1 },
  { id: 'recommendation',         label: 'Recommendation',         tier: 2 },
]

const blankNode = () => ({
  status: 'idle',           // idle | running | done | error | skipped
  elapsed_ms: null,
  error: null,
  retried: false,           // CRAG retry happened during this node's retrieval
  retrieval: null,          // { docs, max_score, reformulated_from, elapsed_ms }
})

export const initialState = {
  query: null,
  runStatus: 'idle',        // idle | running | done | error | blocked | cached
  intent: null,
  severity: null,
  hilt_interrupt: null,
  faithfulness: null,
  answer: null,
  cached: false,
  blockedReason: null,
  errorDetail: null,
  startedAt: null,
  finishedAt: null,
  nodes: Object.fromEntries(NODES.map((n) => [n.id, blankNode()])),
  events: [],               // raw event log
  activeNode: null,         // last node_start without matching node_end (for retrieval attribution)
}

function reducer(state, action) {
  switch (action.type) {
    case 'reset':
      return { ...initialState, nodes: Object.fromEntries(NODES.map((n) => [n.id, blankNode()])) }

    case 'run_start':
      return {
        ...initialState,
        nodes: Object.fromEntries(NODES.map((n) => [n.id, blankNode()])),
        query: action.query,
        runStatus: 'running',
        startedAt: Date.now(),
        events: [{ t: Date.now(), type: 'run_start', query: action.query }],
      }

    case 'guard_block':
      return {
        ...state,
        runStatus: 'blocked',
        blockedReason: action.detail,
        severity: action.severity || state.severity,
        finishedAt: Date.now(),
        events: [...state.events, { t: Date.now(), type: 'guard_block', detail: action.detail, severity: action.severity }],
      }

    case 'cached':
      return {
        ...state,
        runStatus: 'cached',
        cached: true,
        answer: action.answer,
        severity: action.severity,
        finishedAt: Date.now(),
        events: [...state.events, { t: Date.now(), type: 'cached', severity: action.severity }],
      }

    case 'node_update': {
      // LangGraph stream — used to mark which specialists were SKIPPED.
      // When orchestrator completes, we know intent; mark non-routed specialists as skipped.
      const updates = { ...state.nodes }
      const events = [...state.events, { t: Date.now(), type: 'node_update', node: action.node, intent: action.intent, severity: action.severity }]
      let next = { ...state, events }
      if (action.intent) next.intent = action.intent
      if (action.severity) next.severity = action.severity

      // When orchestrator finishes, mark unrouted specialists as 'skipped'
      if (action.node === 'orchestrator' && action.intent) {
        const intent = action.intent
        const all = ['supplier_risk', 'shipment_analysis', 'inventory_intelligence']
        const routed = intent === 'general' ? all : [intent]
        for (const n of all) {
          if (!routed.includes(n) && updates[n].status === 'idle') {
            updates[n] = { ...updates[n], status: 'skipped' }
          }
        }
        next.nodes = updates
      }
      return next
    }

    case 'event': {
      const ev = action.event
      const events = [...state.events, { t: Date.now(), ...ev }]
      const nodes = { ...state.nodes }
      let activeNode = state.activeNode
      let extra = {}

      if (ev.event_type === 'node_start' && ev.node && nodes[ev.node]) {
        nodes[ev.node] = { ...nodes[ev.node], status: 'running', error: null }
        activeNode = ev.node
      } else if (ev.event_type === 'node_end' && ev.node && nodes[ev.node]) {
        nodes[ev.node] = { ...nodes[ev.node], status: 'done', elapsed_ms: ev.elapsed_ms }
        if (activeNode === ev.node) activeNode = null
      } else if (ev.event_type === 'node_error' && ev.node && nodes[ev.node]) {
        nodes[ev.node] = { ...nodes[ev.node], status: 'error', elapsed_ms: ev.elapsed_ms, error: ev.error }
        if (activeNode === ev.node) activeNode = null
      } else if (ev.event_type === 'retrieval') {
        if (activeNode && nodes[activeNode]) {
          nodes[activeNode] = {
            ...nodes[activeNode],
            retrieval: {
              docs: ev.docs,
              max_score: ev.max_score,
              reformulated_from: ev.reformulated_from,
              elapsed_ms: ev.elapsed_ms,
            },
          }
        }
      } else if (ev.event_type === 'orchestrator_decision') {
        extra.intent = ev.intent || state.intent
        extra.severity = ev.severity || state.severity
        // mark non-routed specialists as skipped (preview before fan-out)
        if (ev.intent) {
          const all = ['supplier_risk', 'shipment_analysis', 'inventory_intelligence']
          const routed = ev.intent === 'general' ? all : [ev.intent]
          for (const n of all) {
            if (!routed.includes(n) && nodes[n].status === 'idle') {
              nodes[n] = { ...nodes[n], status: 'skipped' }
            }
          }
        }
      } else if (ev.event_type === 'crag_retry') {
        if (activeNode && nodes[activeNode]) {
          nodes[activeNode] = { ...nodes[activeNode], retried: true }
        }
      } else if (ev.event_type === 'guardrail') {
        extra.lastGuardrail = {
          stage: ev.stage, ok: ev.ok, reason: ev.reason || null, severity: ev.severity || null,
        }
      } else if (ev.event_type === 'hilt_interrupt') {
        extra.hilt_interrupt = { severity: ev.severity, reason: ev.reason }
      } else if (ev.event_type === 'faithfulness') {
        extra.faithfulness = { faithful: ev.faithful, pii_redacted: ev.pii_redacted }
      }

      return { ...state, nodes, events, activeNode, ...extra }
    }

    case 'final':
      return {
        ...state,
        runStatus: 'done',
        answer: action.answer,
        severity: action.severity,
        finishedAt: Date.now(),
        events: [...state.events, { t: Date.now(), type: 'final', severity: action.severity }],
      }

    case 'error':
      return {
        ...state,
        runStatus: 'error',
        errorDetail: action.detail,
        finishedAt: Date.now(),
        events: [...state.events, { t: Date.now(), type: 'error', detail: action.detail }],
      }

    default:
      return state
  }
}

export function useFlowState() {
  const [state, dispatch] = useReducer(reducer, initialState)

  // Main entry point: feed a parsed WS message into the reducer.
  const ingest = useCallback((msg) => {
    if (!msg || typeof msg !== 'object') return
    switch (msg.type) {
      case 'run_start':    dispatch({ type: 'run_start', query: msg.query }); break
      case 'guard_block':  dispatch({ type: 'guard_block', detail: msg.detail, severity: msg.severity }); break
      case 'cached':       dispatch({ type: 'cached', answer: msg.answer, severity: msg.severity }); break
      case 'node_update':  dispatch({ type: 'node_update', node: msg.node, intent: msg.intent, severity: msg.severity }); break
      case 'event':        dispatch({ type: 'event', event: msg }); break
      case 'final':        dispatch({ type: 'final', answer: msg.answer, severity: msg.severity }); break
      case 'error':        dispatch({ type: 'error', detail: msg.detail }); break
      default: break
    }
  }, [])

  const reset = useCallback(() => dispatch({ type: 'reset' }), [])

  return { flow: state, ingest, reset }
}
