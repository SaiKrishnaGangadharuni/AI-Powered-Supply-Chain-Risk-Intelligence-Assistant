// Thin fetch wrapper around the FastAPI backend.
const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
const WS_BASE = import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:8000'

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json()
}

export const api = {
  // ---- chat ----
  query: (body) =>
    request('/api/chat/query', { method: 'POST', body: JSON.stringify(body) }),
  feedback: (body) =>
    request('/api/chat/feedback', { method: 'POST', body: JSON.stringify(body) }),
  openChatSocket: () => new WebSocket(`${WS_BASE}/api/chat/ws`),

  // ---- ingestion ----
  ingestionStatus: () => request('/api/ingestion/status'),
  ingestionRun: (body) =>
    request('/api/ingestion/run', { method: 'POST', body: JSON.stringify(body) }),
  mcpHealth: () => request('/api/ingestion/mcp-health'),

  // ---- mcp browser ----
  mcpListFiles: (slug) =>
    request(`/api/mcp/list-files?slug=${encodeURIComponent(slug)}`),
  mcpDownload: (body) =>
    request('/api/mcp/download', { method: 'POST', body: JSON.stringify(body) }),

  // ---- evaluation ----
  evalLatest: () => request('/api/evaluation/latest'),
}
