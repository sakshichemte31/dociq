// src/components/pdf/PDFViewer.tsx
import { useState, useCallback, useMemo } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import type { PageHighlight } from '@/types'
import { useAuthStore } from '@/store'

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`

interface PDFViewerProps {
  docId: string
  highlight?: PageHighlight | null
  onAskAbout?: (text: string) => void
}

export default function PDFViewer({ docId, highlight, onAskAbout }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [scale, setScale] = useState<number>(1.0)
  const [isLoading, setIsLoading] = useState(true)
  const [selection, setSelection] = useState<{ text: string; x: number; y: number } | null>(null)

  const handleMouseUp = (e: React.MouseEvent) => {
    const sel = window.getSelection()
    const text = sel?.toString().trim()
    if (text && text.length > 5 && onAskAbout) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      setSelection({ text, x: e.clientX - rect.left, y: e.clientY - rect.top - 44 })
    } else {
      setSelection(null)
    }
  }

  // `Document`'s `file` prop, when given a plain string, is fetched by
  // pdf.js directly — it never goes through our axios instance, so the
  // interceptor that attaches the Authorization header never runs. The
  // `/file` endpoint requires auth like everything else, so a bare URL
  // here gets a 403. Passing the object form lets us attach the header
  // to pdf.js's own request instead.
  const accessToken = useAuthStore((s) => s.accessToken)
  const pdfFile = useMemo(
    () => ({
      url: `/api/documents/${docId}/file`,
      httpHeaders: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    }),
    [docId, accessToken]
  )

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setIsLoading(false)
  }, [])

  // Jump to highlighted page
  if (highlight && highlight.pageNum !== currentPage) {
    setCurrentPage(highlight.pageNum)
  }

  const goTo = (page: number) => setCurrentPage(Math.max(1, Math.min(numPages, page)))

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-black/[0.08] bg-[#FAFAF8]">
        <div className="flex items-center gap-2">
          <button
            onClick={() => goTo(currentPage - 1)}
            disabled={currentPage <= 1}
            className="p-1.5 rounded hover:bg-[#F0EFE9] disabled:opacity-30 text-[#6B6B63] hover:text-[#1A1A18] transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm text-[#6B6B63] min-w-[80px] text-center">
            {isLoading ? '—' : `${currentPage} / ${numPages}`}
          </span>
          <button
            onClick={() => goTo(currentPage + 1)}
            disabled={currentPage >= numPages}
            className="p-1.5 rounded hover:bg-[#F0EFE9] disabled:opacity-30 text-[#6B6B63] hover:text-[#1A1A18] transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setScale((s) => Math.max(0.5, s - 0.1))}
            className="p-1.5 rounded hover:bg-[#F0EFE9] text-[#6B6B63] hover:text-[#1A1A18] transition-colors"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs text-[#6B6B63] min-w-[42px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(2.5, s + 0.1))}
            className="p-1.5 rounded hover:bg-[#F0EFE9] text-[#6B6B63] hover:text-[#1A1A18] transition-colors"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setScale(1.0)}
            className="p-1.5 rounded hover:bg-[#F0EFE9] text-[#6B6B63] hover:text-[#1A1A18] transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Page input */}
      <div className="flex items-center justify-center gap-2 py-1.5 border-b border-black/[0.08] bg-[#FAFAF8]">
        <span className="text-xs text-[#6B6B63]">Go to page:</span>
        <input
          type="number"
          min={1}
          max={numPages}
          value={currentPage}
          onChange={(e) => goTo(parseInt(e.target.value) || 1)}
          className="w-14 text-center text-xs bg-[#F0EFE9] text-[#1A1A18] border border-black/10 rounded px-2 py-0.5 focus:outline-none focus:border-accent-500"
        />
      </div>

      {/* PDF canvas */}
      <div className="flex-1 overflow-auto flex justify-center p-4 relative" onMouseUp={handleMouseUp} onClick={(e) => { if ((e.target as HTMLElement).tagName !== 'BUTTON') setSelection(null) }}>
        <Document
          file={pdfFile}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="flex items-center justify-center h-96 text-[#6B6B63]">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Loading PDF…</span>
              </div>
            </div>
          }
          error={
            <div className="flex items-center justify-center h-96 text-red-600 text-sm">
              Failed to load PDF
            </div>
          }
        >
          <Page
            pageNumber={currentPage}
            scale={scale}
            renderTextLayer={true}
            renderAnnotationLayer={true}
            className="shadow-2xl"
            customTextRenderer={
              highlight && highlight.pageNum === currentPage
                ? ({ str, itemIndex }) => {
                    // Simple highlight — production would use char positions
                    return `<span class="bg-yellow-300/40 rounded">${str}</span>`
                  }
                : undefined
            }
          />
        </Document>
      </div>

      {/* Highlight-to-ask floating popup */}
      {selection && onAskAbout && (
        <div style={{ position: 'absolute', left: Math.min(selection.x, 600), top: selection.y, zIndex: 50, background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 8, padding: '6px 10px', display: 'flex', gap: 8, alignItems: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }}>
          <span style={{ fontSize: 11, color: '#6B6B63', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>"{selection.text.slice(0, 60)}{selection.text.length > 60 ? '…' : ''}"</span>
          <button onClick={(e) => { e.stopPropagation(); onAskAbout(`Explain: "${selection.text.slice(0, 200)}"`); setSelection(null) }} style={{ fontSize: 11, padding: '3px 10px', background: '#F97316', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 500 }}>Ask about this</button>
        </div>
      )}

      {/* Thumbnail strip */}
      {numPages > 1 && (
        <div className="flex gap-1 overflow-x-auto p-2 border-t border-black/[0.08] bg-[#FAFAF8]">
          {Array.from({ length: numPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => goTo(p)}
              className={[
                'flex-shrink-0 text-xs w-8 h-8 rounded font-medium transition-colors',
                p === currentPage ? 'bg-accent-600 text-white' : 'bg-[#F0EFE9] text-[#6B6B63] hover:bg-black/[0.06]',
              ].join(' ')}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
