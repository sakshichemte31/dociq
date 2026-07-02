// src/components/chat/DebugPanel.tsx
import { useState } from 'react'
import { ChevronDown, ChevronRight, Search, FileText } from 'lucide-react'
import type { RetrievedChunk } from '@/types'

interface DebugPanelProps {
  rewrittenQueries?: string[]
  retrievedChunks?: RetrievedChunk[]
  onChunkClick?: (chunk: RetrievedChunk) => void
}

export default function DebugPanel({ rewrittenQueries, retrievedChunks, onChunkClick }: DebugPanelProps) {
  const [open, setOpen] = useState(false)

  if (!rewrittenQueries?.length && !retrievedChunks?.length) return null

  return (
    <div className="mt-2 border border-black/[0.08] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-black/[0.04] text-[#6B6B63] text-xs hover:text-[#1A1A18] hover:bg-white transition-colors"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        Debug: {rewrittenQueries?.length ?? 0} sub-queries · {retrievedChunks?.length ?? 0} chunks
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-4 bg-black/[0.03]">
          {/* Rewritten queries */}
          {rewrittenQueries && rewrittenQueries.length > 0 && (
            <div className="pt-3">
              <div className="flex items-center gap-1.5 text-xs font-medium text-[#6B6B63] mb-2">
                <Search className="w-3 h-3" />
                Generated sub-queries
              </div>
              <ol className="space-y-1">
                {rewrittenQueries.map((q, i) => (
                  <li key={i} className="text-xs text-[#6B6B63] bg-white rounded px-2 py-1.5">
                    <span className="text-[#A8A89C] mr-2">{i + 1}.</span>
                    {q}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Retrieved chunks */}
          {retrievedChunks && retrievedChunks.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-[#6B6B63] mb-2">
                <FileText className="w-3 h-3" />
                Top retrieved chunks
              </div>
              <div className="space-y-2">
                {retrievedChunks.map((chunk, i) => (
                  <button
                    key={i}
                    onClick={() => onChunkClick?.(chunk)}
                    className="w-full text-left bg-white rounded p-2 hover:bg-[#F0EFE9] transition-colors group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-accent-500 font-mono">
                        Page {chunk.page_num} · chunk #{chunk.chunk_index}
                      </span>
                      <span className={[
                        'text-xs font-mono px-1.5 py-0.5 rounded',
                        chunk.score >= 0.8 ? 'bg-emerald-500/10 text-emerald-600' :
                        chunk.score >= 0.6 ? 'bg-amber-500/10 text-amber-600' :
                        'bg-black/[0.06] text-[#6B6B63]',
                      ].join(' ')}>
                        {(chunk.score * 100).toFixed(1)}%
                      </span>
                    </div>
                    {(chunk.text_preview || chunk.text) && (
                      <p className="text-xs text-[#6B6B63] line-clamp-2 group-hover:text-[#6B6B63] transition-colors">
                        {chunk.text_preview || chunk.text}
                      </p>
                    )}
                    <p className="text-xs text-accent-600 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      Click to jump to page →
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
