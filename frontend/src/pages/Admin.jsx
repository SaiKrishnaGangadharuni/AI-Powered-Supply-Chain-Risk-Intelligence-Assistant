import { useEffect, useState } from 'react'
import { Database, Download, Search, RefreshCw, Plug } from 'lucide-react'
import { api } from '../api/client.js'

const DATACO_SLUG = 'shashwatwork/dataco-smart-supply-chain-for-big-data-analysis'
const FASHION_SLUG = 'harshsingh2209/supply-chain-analysis'

export default function Admin() {
  // Ingestion controls
  const [dataset, setDataset] = useState('dataco')
  const [source, setSource] = useState('auto')
  const [reset, setReset] = useState(false)

  // Status (polled)
  const [status, setStatus] = useState(null)
  const [mcpAvailable, setMcpAvailable] = useState(null)

  // MCP browser
  const [slug, setSlug] = useState(DATACO_SLUG)
  const [files, setFiles] = useState([])
  const [browsing, setBrowsing] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadResult, setDownloadResult] = useState(null)
  const [error, setError] = useState(null)

  // Poll status
  useEffect(() => {
    let t
    const tick = async () => {
      try {
        setStatus(await api.ingestionStatus())
      } catch (_) {}
      t = setTimeout(tick, 1500)
    }
    tick()
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    api.mcpHealth().then((r) => setMcpAvailable(r.mcp_available)).catch(() => setMcpAvailable(false))
  }, [])

  const runIngestion = async () => {
    setError(null)
    try {
      await api.ingestionRun({ dataset, source, reset })
    } catch (e) { setError(e.message) }
  }

  const browse = async () => {
    setError(null)
    setBrowsing(true)
    setFiles([])
    try {
      const r = await api.mcpListFiles(slug)
      setFiles(r.files || [])
    } catch (e) { setError(e.message) }
    setBrowsing(false)
  }

  const download = async () => {
    setError(null)
    setDownloading(true)
    setDownloadResult(null)
    try {
      const r = await api.mcpDownload({ slug })
      setDownloadResult(r)
    } catch (e) { setError(e.message) }
    setDownloading(false)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto w-full space-y-6">
      {/* MCP status */}
      <section className="bg-white border border-ink-300/60 rounded-md p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Plug size={16} /> Kaggle MCP Tool
          </h2>
          <span className={`text-xs px-2 py-0.5 rounded-md border ${
            mcpAvailable ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
            mcpAvailable === false ? 'bg-rose-100 text-rose-700 border-rose-200' :
            'bg-ink-100 text-ink-500 border-ink-300'
          }`}>
            {mcpAvailable === null ? 'checking…' : mcpAvailable ? 'connected' : 'unavailable'}
          </span>
        </div>
      </section>

      {/* Ingestion */}
      <section className="bg-white border border-ink-300/60 rounded-md p-4">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Database size={16} /> Ingestion Pipeline
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <label className="text-xs">
            Dataset
            <select value={dataset} onChange={(e) => setDataset(e.target.value)}
              className="mt-1 w-full border border-ink-300 rounded-md px-2 py-1.5 text-sm">
              <option value="dataco">DataCo (180k rows)</option>
              <option value="fashion">Fashion (100 rows)</option>
            </select>
          </label>
          <label className="text-xs">
            Source
            <select value={source} onChange={(e) => setSource(e.target.value)}
              className="mt-1 w-full border border-ink-300 rounded-md px-2 py-1.5 text-sm">
              <option value="auto">Auto (MCP → local fallback)</option>
              <option value="kaggle_mcp">Kaggle MCP</option>
              <option value="local">Local CSV</option>
            </select>
          </label>
          <label className="text-xs flex items-end gap-2">
            <input type="checkbox" checked={reset} onChange={(e) => setReset(e.target.checked)} />
            Reset existing index
          </label>
        </div>
        <button onClick={runIngestion}
          disabled={status?.state === 'running'}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-brand-600 text-white text-sm disabled:opacity-50">
          <RefreshCw size={14} /> Run ingestion
        </button>

        {status && (
          <div className="mt-4 text-xs text-ink-700 space-y-1">
            <div>State: <code>{status.state}</code> · Stage: <code>{status.stage}</code></div>
            <div>Source used: <code>{status.source_used || '—'}</code></div>
            <div>Rows: {status.rows_loaded} · Docs built: {status.docs_built} · Indexed: {status.docs_indexed}</div>
            <div>Vector count: <strong>{status.vector_count}</strong> · BM25: <strong>{status.bm25_count}</strong></div>
            <div>Elapsed: {status.elapsed_sec}s</div>
            {status.error && <div className="text-rose-700">Error: {status.error}</div>}
            {status.recent_events?.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-brand-600">Recent events</summary>
                <ul className="mt-1 space-y-0.5">
                  {status.recent_events.slice().reverse().map((e, i) => (
                    <li key={i} className="text-ink-500">· {e.msg}</li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </section>

      {/* MCP browser */}
      <section className="bg-white border border-ink-300/60 rounded-md p-4">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <Search size={16} /> MCP Kaggle Browser
        </h2>
        <div className="flex flex-col md:flex-row gap-2 mb-3">
          <input value={slug} onChange={(e) => setSlug(e.target.value)}
            placeholder="owner/dataset-slug"
            className="flex-1 border border-ink-300 rounded-md px-2 py-1.5 text-sm" />
          <div className="flex gap-2">
            <button onClick={() => setSlug(DATACO_SLUG)}
              className="px-2 py-1 text-xs rounded-md border border-ink-300 hover:bg-ink-100">DataCo</button>
            <button onClick={() => setSlug(FASHION_SLUG)}
              className="px-2 py-1 text-xs rounded-md border border-ink-300 hover:bg-ink-100">Fashion</button>
          </div>
          <button onClick={browse} disabled={browsing}
            className="px-3 py-1.5 rounded-md bg-brand-600 text-white text-sm disabled:opacity-50">
            {browsing ? 'Listing…' : 'List files'}
          </button>
          <button onClick={download} disabled={downloading}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-brand-600 text-brand-700 text-sm disabled:opacity-50">
            <Download size={14} /> {downloading ? 'Downloading…' : 'Download'}
          </button>
        </div>

        {files.length > 0 && (
          <div className="border border-ink-300/60 rounded-md overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-ink-100/70">
                <tr><th className="text-left px-2 py-1">File</th><th className="text-right px-2 py-1">Size</th></tr>
              </thead>
              <tbody>
                {files.map((f, i) => (
                  <tr key={i} className="border-t border-ink-300/40">
                    <td className="px-2 py-1 font-mono">{f.name}</td>
                    <td className="px-2 py-1 text-right text-ink-500">{f.size ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {downloadResult && (
          <details className="mt-3 text-xs">
            <summary className="cursor-pointer text-brand-600">Download result</summary>
            <pre className="mt-1 bg-ink-100/60 p-2 rounded-md overflow-auto max-h-48">
              {JSON.stringify(downloadResult, null, 2)}
            </pre>
          </details>
        )}

        {error && (
          <p className="mt-3 text-xs text-rose-700">Error: {error}</p>
        )}
      </section>
    </div>
  )
}
