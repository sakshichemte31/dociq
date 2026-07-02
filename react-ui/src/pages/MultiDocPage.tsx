// src/pages/MultiDocPage.tsx
import { useState, useEffect } from 'react'
import { GitCompare, Plus, Trash2, Send, Loader2, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import api, { documentsApi } from '@/lib/api'
import type { Document } from '@/types'

interface PerDocResult {
  doc_id: string
  answer: string
  faithfulness_score: number
  top_chunks: Array<{ page_num: number; text_preview: string; score: number }>
}

interface MultiQueryResult {
  question: string
  synthesis: string
  per_document: PerDocResult[]
  doc_count: number
}

function FaithBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = pct >= 80 ? 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20'
    : pct >= 60 ? 'text-amber-600 bg-amber-500/10 border-amber-500/20'
    : 'text-red-600 bg-red-500/10 border-red-500/20'
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${color}`}>
      <ShieldCheck className="w-3 h-3" /> {pct}%
    </span>
  )
}

export default function MultiDocPage() {
  const [docs, setDocs] = useState<Document[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<MultiQueryResult | null>(null)
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null)

  useEffect(() => {
    documentsApi.list(0, 50).then((r) => {
      setDocs(r.content.filter((d) => d.status === 'READY'))
    })
  }, [])

  const toggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 5 ? [...prev, id] : prev
    )
  }

  const submit = async () => {
    if (!question.trim() || selectedIds.length < 2) return
    setLoading(true)
    setResult(null)
    try {
      const r = await api.post<MultiQueryResult>('/api/smart/multi-query', {
        docIds: selectedIds,
        question: question.trim(),
      })
      setResult(r.data)
    } catch {
      // error shown inline
    } finally {
      setLoading(false)
    }
  }

  const docName = (id: string) => docs.find((d) => d.id === id)?.originalFilename ?? id

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[#1A1A18] flex items-center gap-2">
          <GitCompare className="w-5 h-5 text-accent-500" />
          Multi-Document Q&A
        </h2>
        <p className="text-[#6B6B63] text-sm mt-1">
          Ask a question across up to 5 documents and get a synthesized answer.
        </p>
      </div>

      {/* Document selector */}
      <div className="bg-white border border-black/[0.08] rounded-xl p-5 space-y-3">
        <p className="text-sm font-medium text-[#1A1A18]">
          Select documents ({selectedIds.length}/5 selected)
        </p>
        {docs.length === 0 && (
          <p className="text-[#6B6B63] text-sm">No ready documents found. Upload and process PDFs first.</p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
          {docs.map((doc) => {
            const sel = selectedIds.includes(doc.id)
            return (
              <button
                key={doc.id}
                onClick={() => toggle(doc.id)}
                className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${
                  sel
                    ? 'border-accent-500 bg-accent-500/10 text-accent-700'
                    : 'border-black/10 bg-black/[0.04] text-[#1A1A18] hover:border-black/10'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                    sel ? 'border-accent-500 bg-accent-500' : 'border-black/10'
                  }`}>
                    {sel && <span className="text-white text-xs">✓</span>}
                  </div>
                  <span className="truncate">{doc.originalFilename}</span>
                </div>
                {doc.pageCount && (
                  <span className="text-xs text-[#6B6B63] ml-6">{doc.pageCount} pages</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Question input */}
      <div className="flex gap-3">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && submit()}
          placeholder="What question do you want answered across all selected documents?"
          className="flex-1 bg-white border border-black/10 rounded-xl px-4 py-3 text-sm text-[#1A1A18] placeholder-[#A8A89C] focus:outline-none focus:border-accent-500 transition-colors"
        />
        <button
          onClick={submit}
          disabled={loading || selectedIds.length < 2 || !question.trim()}
          className="px-5 py-3 bg-accent-600 hover:bg-accent-500 disabled:bg-black/[0.06] disabled:text-[#6B6B63] text-white rounded-xl transition-colors flex items-center gap-2 text-sm font-medium"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Ask
        </button>
      </div>

      {selectedIds.length === 1 && (
        <p className="text-xs text-amber-600">Select at least 2 documents to compare.</p>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Synthesis */}
          <div className="bg-white border border-accent-500/30 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-accent-400" />
              <p className="text-sm font-semibold text-accent-600">
                Synthesized Answer ({result.doc_count} documents)
              </p>
            </div>
            <p className="text-[#1A1A18] text-sm leading-relaxed">{result.synthesis}</p>
          </div>

          {/* Per-document breakdown */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-[#6B6B63] uppercase tracking-wide">
              Per-Document Answers
            </p>
            {result.per_document.map((r) => (
              <div key={r.doc_id} className="bg-white border border-black/[0.08] rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedDoc(expandedDoc === r.doc_id ? null : r.doc_id)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-black/[0.04] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm text-[#1A1A18] truncate max-w-xs">{docName(r.doc_id)}</span>
                    <FaithBadge score={r.faithfulness_score} />
                  </div>
                  {expandedDoc === r.doc_id ? (
                    <ChevronUp className="w-4 h-4 text-[#6B6B63] flex-shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-[#6B6B63] flex-shrink-0" />
                  )}
                </button>
                {expandedDoc === r.doc_id && (
                  <div className="px-4 pb-4 border-t border-black/[0.08] space-y-3 pt-3">
                    <div className="prose-chat text-sm text-[#1A1A18] leading-relaxed">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{r.answer}</ReactMarkdown>
                    </div>
                    {r.top_chunks.length > 0 && (
                      <div>
                        <p className="text-xs text-[#6B6B63] mb-2">Sources</p>
                        <div className="space-y-1.5">
                          {r.top_chunks.map((c, i) => (
                            <div key={i} className="text-xs bg-[#F0EFE9] rounded-lg px-3 py-2 text-[#6B6B63]">
                              <span className="text-[#6B6B63]">Page {c.page_num} · </span>
                              {c.text_preview}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
