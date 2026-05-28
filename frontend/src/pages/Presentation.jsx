import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Link } from 'react-router-dom'

const SLIDES = [
  {
    title: 'Supply Chain Risk Intelligence',
    subtitle: 'AI-Powered, Multi-Agent, RAG-Backed',
    body: [
      'Hybrid retrieval (Dense + BM25 + Cross-encoder rerank)',
      'LangGraph multi-agent orchestration',
      'MCP-based Kaggle data ingestion',
      'Human-in-the-loop on HIGH severity',
    ],
  },
  {
    title: 'Architecture',
    body: [
      'Frontend (React + Vite + Tailwind)',
      '↓ WebSocket / REST',
      'FastAPI ─ Guardrails ─ Semantic Cache',
      '↓',
      'LangGraph: Orchestrator → Specialists → Recommendation',
      '↓',
      'Hybrid Retrieval (ChromaDB + BM25 + Cross-encoder)',
      '↑',
      'Ingestion: MCP server → fetch_kaggle_dataset → transform → embed',
    ],
  },
  {
    title: 'Models & Routing',
    body: [
      'gpt-4o-mini — reasoning, recommendation, LLM-as-judge',
      'llama-3.3-70b-versatile (Groq) — mid-weight summarization',
      'llama-3.1-8b-instant (Groq) — routing / classification',
      'Fallback chain: openai_mini → groq_large → groq_small',
      'Embeddings: BAAI/bge-small-en-v1.5 (384d, local, free)',
      'Reranker: ms-marco-MiniLM-L-6-v2 (free)',
    ],
  },
  {
    title: 'Retrieval Stack',
    body: [
      'Dense: ChromaDB cosine, top-20',
      'Sparse: BM25 over same docs, top-20',
      'Fusion: Reciprocal Rank Fusion (k=60)',
      'Rerank: Cross-encoder, top-5',
      'CRAG: query reformulation if max score < 0.6',
    ],
  },
  {
    title: 'Agents',
    body: [
      'Orchestrator — intent + severity classification',
      'Supplier Risk — defects, lead times, inspection',
      'Shipment Analysis — late risk, ship modes, transit',
      'Inventory Intelligence — stock, sell-through, stockouts',
      'Recommendation — synthesizes specialists; emits final answer',
    ],
  },
  {
    title: 'Guardrails',
    body: [
      'Input: length, injection patterns, domain-relevance (Groq 8B)',
      'Generation: LLMLingua compression when ctx > 6k tokens',
      'Output: DeepEval-style faithfulness + PII redaction',
      'HILT: interrupt_before("recommendation") on HIGH severity',
    ],
  },
]

export default function Presentation() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') setI((x) => Math.min(SLIDES.length - 1, x + 1))
      if (e.key === 'ArrowLeft')  setI((x) => Math.max(0, x - 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const s = SLIDES[i]

  return (
    <div className="h-screen w-screen bg-ink-900 text-white flex flex-col">
      <header className="px-6 py-3 flex items-center justify-between border-b border-white/10">
        <span className="text-xs text-ink-300">Slide {i + 1} / {SLIDES.length}</span>
        <Link to="/" className="text-ink-300 hover:text-white" title="Exit">
          <X size={18} />
        </Link>
      </header>
      <main className="flex-1 flex items-center justify-center px-12">
        <div className="max-w-4xl w-full">
          <h1 className="text-4xl font-semibold mb-2">{s.title}</h1>
          {s.subtitle && <p className="text-lg text-ink-300 mb-8">{s.subtitle}</p>}
          <ul className="space-y-3 text-lg text-ink-100">
            {s.body.map((line, idx) => (
              <li key={idx} className="flex gap-3">
                <span className="text-brand-500">·</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </main>
      <footer className="px-6 py-3 flex items-center justify-between border-t border-white/10">
        <button onClick={() => setI((x) => Math.max(0, x - 1))}
          className="inline-flex items-center gap-1 text-sm text-ink-300 hover:text-white disabled:opacity-30"
          disabled={i === 0}>
          <ChevronLeft size={16} /> Prev
        </button>
        <span className="text-xs text-ink-500">← →</span>
        <button onClick={() => setI((x) => Math.min(SLIDES.length - 1, x + 1))}
          className="inline-flex items-center gap-1 text-sm text-ink-300 hover:text-white disabled:opacity-30"
          disabled={i === SLIDES.length - 1}>
          Next <ChevronRight size={16} />
        </button>
      </footer>
    </div>
  )
}
