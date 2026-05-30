import { useEffect, useState } from 'react'
import { Database, Download, RefreshCw, X, CheckCircle, Loader2, Trash2, AlertTriangle } from 'lucide-react'
import { api } from '../api/client.js'

const DATACO_SLUG = 'shashwatwork/dataco-smart-supply-chain-for-big-data-analysis'
const FASHION_SLUG = 'harshsingh2209/supply-chain-analysis'

/* ── MCP Flow Diagram ──────────────────────────────────────── */
function McpFlowOverlay({ onClose, status }) {
  const steps = [
    { id: 1, label: 'Kaggle MCP Server',   sub: 'https://www.kaggle.com/mcp',       icon: '🌐' },
    { id: 2, label: 'MCP stdio client',    sub: 'fetch_kaggle_dataset tool call',    icon: '📡' },
    { id: 3, label: 'Download CSV',        sub: 'DataCo / Fashion dataset',          icon: '⬇️' },
    { id: 4, label: 'data/source_dataset', sub: 'Saved to local source folder',      icon: '📁' },
  ]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">MCP Download Flow</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="px-6 py-5 space-y-0">
          {steps.map((step, i) => (
            <div key={step.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-9 h-9 rounded-full bg-[#f0faf8] border-2 border-indigo-200 flex items-center justify-center text-base">
                  {step.icon}
                </div>
                {i < steps.length - 1 && <div className="w-0.5 h-6 bg-[#d4f0eb] my-1" />}
              </div>
              <div className="pb-3 pt-1">
                <p className="text-sm font-medium text-gray-800">{step.label}</p>
                <p className="text-xs text-gray-500">{step.sub}</p>
              </div>
            </div>
          ))}
          {status && (
            <div className="mt-3 p-3 bg-[#f0faf8] rounded-xl text-xs text-[#0a5e53] font-medium">
              {status}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Pipeline Load Flow ────────────────────────────────────── */
function PipelineFlowOverlay({ onClose, ingestionStatus }) {
  const steps = [
    { label: 'Read CSV files',       sub: 'DataCo (180k rows) or Fashion CSV',       icon: '📄' },
    { label: 'Sample & Clean',       sub: '~2500 rows · null drop · type coerce',    icon: '🔍' },
    { label: 'Transform → docs',     sub: 'Natural-language incident documents',      icon: '✂️' },
    { label: 'Embed (fastembed)',     sub: 'BAAI/bge-small-en-v1.5 · 384-dim ONNX',  icon: '🧠' },
    { label: 'Upsert → ChromaDB',    sub: 'Persistent vector store · cosine metric', icon: '🗄️' },
    { label: 'BM25 Index',           sub: 'rank_bm25 sparse index built',            icon: '🔑' },
    { label: 'Verify & Report',      sub: 'Doc count · collection stats logged',     icon: '✅' },
  ]

  const stageToActiveStep = (stage) => {
    if (!stage) return 0
    if (stage === 'loaded') return 1
    if (stage === 'transformed') return 3
    if (stage.startsWith('embedding')) {
      const docsIndexed = ingestionStatus?.docs_indexed || 0
      const docsBuilt   = ingestionStatus?.docs_built   || 1
      return docsIndexed >= docsBuilt ? 4 : 3
    }
    if (stage === 'bm25_built') return 6
    if (stage === 'done')       return 7
    return 0
  }

  const getStepStatus = (i) => {
    if (!ingestionStatus) return 'pending'
    const state = ingestionStatus.state || 'idle'
    const stage = ingestionStatus.stage || ''
    if (state === 'done') return 'done'
    if (state === 'idle') return 'pending'
    if (state === 'error') {
      const errorAt = stageToActiveStep(stage)
      return i < errorAt ? 'done' : i === errorAt ? 'error' : 'pending'
    }
    const activeStep = stageToActiveStep(stage)
    if (i < activeStep) return 'done'
    if (i === activeStep) return 'active'
    return 'pending'
  }

  const dotColor = (s) => {
    if (s === 'done')   return 'bg-green-500 border-green-400'
    if (s === 'active') return 'bg-blue-500 border-blue-400 animate-pulse'
    if (s === 'error')  return 'bg-red-500 border-red-400'
    return 'bg-gray-200 border-gray-300'
  }

  const isDone  = ingestionStatus?.state === 'done'
  const isError = ingestionStatus?.state === 'error'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Data → Vector DB Pipeline</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-6 py-5">
          {steps.map((step, i) => {
            const s = getStepStatus(i)
            return (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full mt-1.5 border-2 flex-shrink-0 transition-all duration-300 ${dotColor(s)}`} />
                  {i < steps.length - 1 && <div className="w-0.5 flex-1 my-1 bg-gray-200" />}
                </div>
                <div className="pb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{step.icon}</span>
                    <span className={`text-sm font-medium ${
                      s === 'active' ? 'text-blue-600' :
                      s === 'done'   ? 'text-green-700' :
                      s === 'error'  ? 'text-red-600' : 'text-gray-700'
                    }`}>{step.label}</span>
                    {s === 'active' && <Loader2 size={12} className="text-blue-500 animate-spin" />}
                    {s === 'done'   && <CheckCircle size={12} className="text-green-500" />}
                  </div>
                  {s === 'active' && i === 3 && ingestionStatus?.docs_built > 0 && (
                    <div className="ml-6 mt-1.5 w-40">
                      <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
                        <div className="h-1 bg-blue-500 rounded-full transition-all duration-500"
                          style={{ width: `${Math.round((ingestionStatus.docs_indexed / ingestionStatus.docs_built) * 100)}%` }} />
                      </div>
                      <p className="text-xs text-blue-600 mt-0.5">
                        {ingestionStatus.docs_indexed} / {ingestionStatus.docs_built} docs
                      </p>
                    </div>
                  )}
                  {s !== 'active' && <p className="text-xs text-gray-500 ml-6">{step.sub}</p>}
                </div>
              </div>
            )
          })}
        </div>
        {isDone && (
          <div className="mx-6 mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
            <div className="flex items-center gap-2 font-semibold mb-0.5">
              <CheckCircle size={14} className="text-green-600" /> Ingestion complete
            </div>
            <div className="text-xs text-green-700 space-y-0.5">
              {ingestionStatus.docs_indexed != null && <div>{ingestionStatus.docs_indexed.toLocaleString()} docs indexed into ChromaDB</div>}
              {ingestionStatus.bm25_count > 0 && <div>BM25 index: {ingestionStatus.bm25_count.toLocaleString()} docs</div>}
              {ingestionStatus.elapsed_sec > 0 && <div>Completed in {ingestionStatus.elapsed_sec}s · source: {ingestionStatus.source_used}</div>}
            </div>
          </div>
        )}
        {isError && (
          <div className="mx-6 mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
            <span className="font-semibold">Error: </span>{ingestionStatus.error}
          </div>
        )}
        {ingestionStatus?.state === 'running' && (
          <div className="mx-6 mb-4 p-2.5 bg-blue-50 rounded-xl text-xs text-blue-700">
            <div className="flex items-center gap-1.5">
              <Loader2 size={11} className="animate-spin" />
              <span className="font-medium">{ingestionStatus.stage || 'Starting…'}</span>
            </div>
            {ingestionStatus.docs_indexed > 0 && (
              <div className="mt-0.5 text-blue-600">{ingestionStatus.docs_indexed.toLocaleString()} docs indexed so far</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Main Admin ────────────────────────────────────────────── */
export default function Admin() {
  const [source, setSource]             = useState('auto')
  const [reset, setReset]               = useState(false)
  const [status, setStatus]             = useState(null)
  const [mcpAvailable, setMcpAvailable] = useState(null)
  const [slug, setSlug]                 = useState(DATACO_SLUG)
  const [files, setFiles]               = useState([])
  const [browsing, setBrowsing]         = useState(false)
  const [downloading, setDownloading]   = useState(false)
  const [downloadResult, setDownloadResult] = useState(null)
  const [error, setError]               = useState(null)
  const [showMcpFlow, setShowMcpFlow]   = useState(false)
  const [showPipelineFlow, setShowPipelineFlow] = useState(false)
  const [clearing, setClearing]         = useState(false)
  const [clearResult, setClearResult]   = useState(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  // source file picker
  const [sourceFiles, setSourceFiles]   = useState([])
  const [selectedFiles, setSelectedFiles] = useState([])
  const [loadingSources, setLoadingSources] = useState(false)

  useEffect(() => {
    let t
    const tick = async () => {
      try { setStatus(await api.ingestionStatus()) } catch {}
      t = setTimeout(tick, 1500)
    }
    tick()
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    api.mcpHealth()
      .then((r) => setMcpAvailable(r.mcp_available))
      .catch(() => setMcpAvailable(false))
  }, [])

  useEffect(() => {
    setLoadingSources(true)
    api.ingestionListSources()
      .then((r) => {
        setSourceFiles(r.files || [])
        // don't auto-select — let user choose
      })
      .catch(() => {})
      .finally(() => setLoadingSources(false))
  }, [])

  const runIngestion = async () => {
    setError(null)
    setShowPipelineFlow(true)
    try {
      await api.ingestionRun({
        dataset: 'dataco',
        source,
        reset,
        custom_csv_path: selectedFiles[0] || '',
      })
    } catch (e) { setError(e.message) }
  }

  const browse = async () => {
    setError(null)
    setBrowsing(true)
    setFiles([])
    setShowMcpFlow(true)
    try {
      const r = await api.mcpListFiles(slug)
      setFiles(r.files || [])
    } catch (e) { setError(e.message) }
    setBrowsing(false)
  }

  const download = async (path) => {
    setError(null)
    setDownloading(true)
    setDownloadResult(null)
    try {
      const r = await api.mcpDownload({ slug, path })
      setDownloadResult(r)
    } catch (e) { setError(e.message) }
    setDownloading(false)
  }

  const refreshSources = async () => {
    setLoadingSources(true)
    try {
      const r = await api.ingestionListSources()
      setSourceFiles(r.files || [])
      // don't auto-select — let user choose
    } catch {}
    setLoadingSources(false)
  }

  const clearVectorDB = async () => {
    setShowClearConfirm(false)
    setClearing(true)
    setClearResult(null)
    setError(null)
    try {
      const r = await api.ingestionClear()
      setClearResult(r.message || 'Cleared successfully')
    } catch (e) { setError(e.message) }
    setClearing(false)
  }

  // Group files by folder for display

  const statusColor = {
    idle: 'text-gray-400', running: 'text-blue-600', done: 'text-green-600', error: 'text-red-600', already_loaded: 'text-green-600',
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <h2 className="text-lg font-semibold text-gray-800">Data Management</h2>

      {/* ── MCP Health ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-gray-700">Kaggle MCP Server</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
            mcpAvailable === null ? 'bg-gray-100 text-gray-400'
            : mcpAvailable ? 'bg-green-100 text-green-700'
            : 'bg-red-100 text-red-600'
          }`}>
            {mcpAvailable === null ? 'Checking…' : mcpAvailable ? 'Connected' : 'Unavailable'}
          </span>
        </div>
        <p className="text-xs text-gray-400">Primary data source: {DATACO_SLUG}</p>
      </div>

      {/* ── Step 1: Download via MCP ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-6 rounded-full bg-[#0C7063] text-white text-xs flex items-center justify-center font-bold">1</span>
          <h3 className="text-sm font-semibold text-gray-800">Download Dataset (MCP)</h3>
          <button onClick={() => setShowMcpFlow(true)}
            className="ml-auto text-xs text-[#0e8a77] hover:underline">View Flow</button>
        </div>
        <div className="flex gap-2 mb-3">
          <input value={slug} onChange={(e) => setSlug(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 outline-none focus:border-[#0e8a77]" />
          <button onClick={browse} disabled={browsing}
            className="px-3 py-1.5 bg-[#f0faf8] text-[#0a5e53] text-xs rounded-lg hover:bg-[#d4f0eb] disabled:opacity-50 flex items-center gap-1">
            {browsing ? <Loader2 size={12} className="animate-spin" /> : null} Browse
          </button>
          <button onClick={() => setSlug(DATACO_SLUG)} className="px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg">DataCo</button>
          <button onClick={() => setSlug(FASHION_SLUG)} className="px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg">Fashion</button>
        </div>
        {files.length > 0 && (
          <div className="bg-gray-50 rounded-xl p-3 max-h-40 overflow-y-auto space-y-1">
            {files.map((f) => (
              <div key={f.path || f.name} className="flex items-center justify-between text-xs">
                <span className="text-gray-600 truncate max-w-xs">{f.path || f.name}</span>
                <button onClick={() => download(f.path || f.name)} disabled={downloading}
                  className="ml-2 text-[#0C7063] hover:text-[#083f37] flex items-center gap-1 flex-shrink-0">
                  <Download size={11} /> Download
                </button>
              </div>
            ))}
          </div>
        )}
        {downloadResult && (
          <p className="mt-2 text-xs text-green-600">✓ Saved to {downloadResult.saved_path || 'data/source_dataset'}</p>
        )}
      </div>

      {/* ── Step 2: Load into Vector DB ── */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-6 h-6 rounded-full bg-[#0C7063] text-white text-xs flex items-center justify-center font-bold">2</span>
          <h3 className="text-sm font-semibold text-gray-800">Load into Vector DB</h3>
          <button onClick={() => setShowPipelineFlow(true)}
            className="ml-auto text-xs text-[#0e8a77] hover:underline">View Flow</button>
        </div>

        {/* File list with loaded badges */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-gray-600">Select File to Load</label>
            <button onClick={refreshSources} className="text-xs text-[#3aab99] hover:text-[#0C7063] flex items-center gap-1">
              <RefreshCw size={10} className={loadingSources ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
          {loadingSources ? (
            <div className="flex items-center gap-2 text-xs text-gray-400 py-3"><Loader2 size={12} className="animate-spin" /> Scanning folder…</div>
          ) : sourceFiles.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">No files found in data/source_dataset/</p>
          ) : (
            <div className="border border-gray-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
              {sourceFiles.map((f) => {
                const isSelected = selectedFiles[0] === f.path
                const extColor = {
                  '.csv': 'bg-blue-50 text-blue-600', '.tsv': 'bg-blue-50 text-blue-600',
                  '.xlsx': 'bg-green-50 text-green-600', '.xls': 'bg-green-50 text-green-600',
                  '.json': 'bg-yellow-50 text-yellow-700', '.parquet': 'bg-purple-50 text-purple-600',
                }[f.ext] || 'bg-gray-100 text-gray-500'
                return (
                  <div
                    key={f.path}
                    onClick={() => setSelectedFiles([f.path])}
                    className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b border-gray-100 last:border-0 transition-colors ${
                      isSelected ? 'bg-[#f0faf8]' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase flex-shrink-0 ${extColor}`}>{f.ext.slice(1)}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium truncate ${isSelected ? 'text-[#0a5e53]' : 'text-gray-700'}`}>
                        {f.folder ? <span className="text-gray-400">{f.folder}/</span> : null}{f.name}
                      </p>
                      <p className="text-[10px] text-gray-400">{f.size_mb} MB</p>
                    </div>
                    {f.loaded ? (
                      <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 rounded-full flex-shrink-0 font-medium">
                        ✓ Loaded · {f.loaded_docs.toLocaleString()} docs
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 bg-gray-100 text-gray-400 rounded-full flex-shrink-0">Not loaded</span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 mb-4">
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">Source</label>
            <select value={source} onChange={(e) => setSource(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs text-gray-700 outline-none focus:border-[#0e8a77]">
              <option value="auto">Auto (MCP → local)</option>
              <option value="kaggle_mcp">Kaggle MCP only</option>
              <option value="local">Local CSV only</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer mt-4">
            <input type="checkbox" checked={reset} onChange={(e) => setReset(e.target.checked)} className="rounded" />
            Force re-embed (reset)
          </label>
        </div>

        {/* Already-loaded hint */}
        {selectedFiles[0] && sourceFiles.find(f => f.path === selectedFiles[0])?.loaded && !reset && (
          <div className="mb-3 px-3 py-2 bg-green-50 border border-green-200 rounded-xl text-xs text-green-700 flex items-center gap-2">
            <span>✅</span>
            <span>This file is already loaded. Click Load to confirm, or enable <b>Force re-embed</b> to reload from scratch.</span>
          </div>
        )}

        <button onClick={runIngestion} disabled={selectedFiles.length === 0}
          className="w-full py-2 bg-[#0C7063] hover:bg-[#0a5e53] disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors flex items-center justify-center gap-2">
          <Database size={14} />
          {selectedFiles[0] && sourceFiles.find(f => f.path === selectedFiles[0])?.loaded && !reset ? 'Already Loaded — Confirm' : 'Process & Load into Vector DB'}
        </button>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>

      {/* ── Status ── */}
      {status && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-800">Ingestion Status</h3>
            <span className={`text-xs font-semibold ${statusColor[status.state] || 'text-gray-400'}`}>
              {status.state}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
            {status.docs_indexed != null && <div>Docs indexed: <b>{status.docs_indexed}</b></div>}
            {status.dataset      && <div>Dataset: <b>{status.dataset}</b></div>}
            {status.source_used  && <div>Source: <b>{status.source_used}</b></div>}
            {status.vector_count > 0 && <div>Vector count: <b>{status.vector_count}</b></div>}
            {status.elapsed_sec > 0  && <div>Elapsed: <b>{status.elapsed_sec}s</b></div>}
            {status.error        && <div className="col-span-2 text-red-600">Error: {status.error}</div>}
          </div>
        </div>
      )}

      {/* ── Clear Vector DB ── */}
      <div className="bg-white rounded-2xl border border-red-100 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <Trash2 size={15} className="text-red-500" />
          <h3 className="text-sm font-semibold text-gray-800">Clear Vector DB</h3>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Deletes the ChromaDB collection and BM25 index. You will need to re-run ingestion afterward. Useful for a clean demo reset.
        </p>
        {clearResult && <p className="mb-3 text-xs text-green-600 font-medium">✓ {clearResult}</p>}
        {!showClearConfirm ? (
          <button onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold rounded-xl transition-colors border border-red-200">
            <Trash2 size={13} /> Clear Vector DB
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
              <AlertTriangle size={13} /> Are you sure? This cannot be undone.
            </div>
            <button onClick={clearVectorDB} disabled={clearing}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 disabled:opacity-50">
              {clearing ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              {clearing ? 'Clearing…' : 'Yes, Clear'}
            </button>
            <button onClick={() => setShowClearConfirm(false)}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded-xl">
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Overlays */}
      {showMcpFlow && (
        <McpFlowOverlay
          onClose={() => setShowMcpFlow(false)}
          status={browsing ? 'Connecting to Kaggle MCP…' : downloadResult ? `Downloaded: ${downloadResult.saved_path}` : null}
        />
      )}
      {showPipelineFlow && (
        <PipelineFlowOverlay
          onClose={() => setShowPipelineFlow(false)}
          ingestionStatus={status}
        />
      )}
    </div>
  )
}
