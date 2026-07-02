// src/pages/ChatPage.tsx
import { useState, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, BarChart3, Split } from 'lucide-react'
import { documentsApi } from '@/lib/api'
import { useDocStore } from '@/store'
import PDFViewer from '@/components/pdf/PDFViewer'
import ChatPanel from '@/components/chat/ChatPanel'
import type { Document, PageHighlight, RetrievedChunk } from '@/types'

export default function ChatPage() {
  const { docId } = useParams<{ docId: string }>()
  const navigate = useNavigate()
  const { documents, upsertDocument } = useDocStore()
  const [highlight, setHighlight] = useState<PageHighlight | null>(null)
  const [prefillQuestion, setPrefillQuestion] = useState<string | undefined>(undefined)
  const [panelRatio, setPanelRatio] = useState(50) // percent for left panel
  const [isDragging, setIsDragging] = useState(false)

  const doc = documents.find((d) => d.id === docId)

  useEffect(() => {
    if (!docId) return
    if (!doc) {
      documentsApi.getStatus(docId).then(upsertDocument).catch(() => navigate('/'))
    }
  }, [docId, doc, upsertDocument, navigate])

  const handleChunkClick = useCallback((chunk: RetrievedChunk) => {
    setHighlight({
      pageNum: chunk.page_num,
      charStart: chunk.char_start ?? 0,
      charEnd: chunk.char_end ?? 0,
    })
  }, [])

  // Divider drag
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    const onMove = (moveEvent: MouseEvent) => {
      const pct = (moveEvent.clientX / window.innerWidth) * 100
      setPanelRatio(Math.max(25, Math.min(75, pct)))
    }
    const onUp = () => {
      setIsDragging(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  if (!docId) return null

  return (
    <div className="flex flex-col h-screen bg-[#FAFAF8]">
      {/* Top bar */}
      <header className="flex items-center gap-3 px-4 py-2 border-b border-black/[0.08] bg-[#FAFAF8] flex-shrink-0">
        <button
          onClick={() => navigate('/')}
          className="p-1.5 rounded hover:bg-[#F0EFE9] text-[#6B6B63] hover:text-[#1A1A18] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <FileText className="w-4 h-4 text-accent-500 flex-shrink-0" />
          <span className="text-sm text-[#1A1A18] font-medium truncate">
            {doc?.originalFilename || 'Loading…'}
          </span>
          {doc?.pageCount && (
            <span className="text-xs text-[#A8A89C] flex-shrink-0">{doc.pageCount} pages</span>
          )}
        </div>

        <button
          onClick={() => navigate('/analytics')}
          className="p-1.5 rounded hover:bg-[#F0EFE9] text-[#6B6B63] hover:text-[#1A1A18] transition-colors"
          title="Analytics"
        >
          <BarChart3 className="w-4 h-4" />
        </button>
      </header>

      {/* Split panels */}
      <div
        className="flex flex-1 overflow-hidden"
        style={{ cursor: isDragging ? 'col-resize' : 'auto' }}
      >
        {/* PDF viewer */}
        <div style={{ width: `${panelRatio}%` }} className="flex flex-col overflow-hidden border-r border-black/[0.08]">
          <PDFViewer docId={docId} highlight={highlight} onAskAbout={(text) => setPrefillQuestion(text)} />
        </div>

        {/* Draggable divider */}
        <div
          onMouseDown={onMouseDown}
          className="w-1 bg-[#F0EFE9] hover:bg-accent-600 cursor-col-resize flex-shrink-0 transition-colors group"
        >
          <div className="w-full h-full flex items-center justify-center">
            <div className="h-8 w-0.5 bg-black/10 group-hover:bg-accent-400 rounded-full transition-colors" />
          </div>
        </div>

        {/* Chat panel */}
        <div style={{ width: `${100 - panelRatio}%` }} className="flex flex-col overflow-hidden">
          <ChatPanel docId={docId} onChunkClick={handleChunkClick} prefillQuestion={prefillQuestion} onPrefillConsumed={() => setPrefillQuestion(undefined)} />
        </div>
      </div>
    </div>
  )
}
