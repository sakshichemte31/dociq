import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText, Trash2, MessageSquare, Clock,
  CheckCircle, XCircle, Loader2, Upload,
} from 'lucide-react'
import { documentsApi } from '@/lib/api'
import { useDocStore } from '@/store'
import type { Document } from '@/types'
import { formatDistanceToNow } from 'date-fns'

function StatusChip({ status }: { status: Document['status'] }) {
  const map = {
    READY:      { icon: <CheckCircle className="w-3 h-3" />, label: 'Ready',      cls: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
    FAILED:     { icon: <XCircle     className="w-3 h-3" />, label: 'Failed',     cls: 'text-red-600 bg-red-50 border-red-100' },
    PROCESSING: { icon: <Loader2     className="w-3 h-3 animate-spin" />, label: 'Processing', cls: 'text-amber-600 bg-amber-50 border-amber-100' },
    UPLOADED:   { icon: <Clock       className="w-3 h-3" />, label: 'Uploaded',   cls: 'text-[#6B6B63] bg-[#F0EFE9] border-black/8' },
  }
  const cfg = map[status]
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium border rounded-full px-1.5 py-0.5 ${cfg.cls}`}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

export default function DocumentsPage() {
  const navigate = useNavigate()
  const { documents, setDocuments, removeDocument } = useDocStore()
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    documentsApi.list(0, 50)
      .then(r => setDocuments(r.content))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [setDocuments])

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Delete this document and all its data?')) return
    setDeletingId(id)
    try {
      await documentsApi.delete(id)
      removeDocument(id)
    } catch (err) { console.error(err) }
    finally { setDeletingId(null) }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div>
          <h1 className="text-xl font-semibold text-[#1A1A18]">Documents</h1>
          <p className="text-sm text-[#6B6B63] mt-0.5">
            {loading ? 'Loading…' : `${documents.length} document${documents.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
          onClick={() => navigate('/upload')}
          className="flex items-center gap-1.5 px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white text-sm font-medium rounded-lg shadow-accent transition-all"
        >
          <Upload className="w-4 h-4" /> Upload PDF
        </motion.button>
      </motion.div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 text-accent-400 animate-spin" />
        </div>
      ) : documents.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex flex-col items-center justify-center h-64 text-center gap-4"
        >
          <div className="w-16 h-16 rounded-2xl bg-[#F0EFE9] flex items-center justify-center">
            <FileText className="w-7 h-7 text-[#A8A89C]" />
          </div>
          <div>
            <p className="text-[#1A1A18] font-medium">No documents yet</p>
            <p className="text-sm text-[#6B6B63] mt-0.5">Upload a PDF to get started</p>
          </div>
          <motion.button
            whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => navigate('/upload')}
            className="flex items-center gap-1.5 px-4 py-2 bg-accent-500 text-white text-sm font-medium rounded-lg shadow-accent"
          >
            <Upload className="w-4 h-4" /> Upload your first PDF
          </motion.button>
        </motion.div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {documents.map((doc, i) => (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => doc.status === 'READY' && navigate(`/chat/${doc.id}`)}
                whileHover={{ y: -1, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
                className={`flex items-center gap-4 p-4 bg-white border border-black/8 rounded-xl transition-shadow ${
                  doc.status === 'READY' ? 'cursor-pointer' : 'cursor-default'
                }`}
              >
                {/* Icon */}
                <div className="w-10 h-10 rounded-xl bg-accent-500/10 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-accent-500" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#1A1A18] truncate">{doc.originalFilename}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <StatusChip status={doc.status} />
                    {doc.pageCount && <span className="text-[11px] text-[#A8A89C]">{doc.pageCount} pages</span>}
                    {doc.fileSize  && <span className="text-[11px] text-[#A8A89C]">{(doc.fileSize/1024/1024).toFixed(1)} MB</span>}
                    <span className="text-[11px] text-[#A8A89C]">
                      {formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  {doc.errorMessage && (
                    <p className="text-[11px] text-red-500 mt-1 truncate">{doc.errorMessage}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {doc.status === 'READY' && (
                    <motion.button
                      whileHover={{ scale: 1.1, backgroundColor: 'rgba(249,115,22,0.1)' }}
                      whileTap={{ scale: 0.9 }}
                      onClick={e => { e.stopPropagation(); navigate(`/chat/${doc.id}`) }}
                      className="p-2 rounded-lg text-accent-500 transition-colors"
                      title="Open chat"
                    >
                      <MessageSquare className="w-4 h-4" />
                    </motion.button>
                  )}
                  <motion.button
                    whileHover={{ scale: 1.1, backgroundColor: 'rgba(239,68,68,0.08)' }}
                    whileTap={{ scale: 0.9 }}
                    onClick={e => handleDelete(doc.id, e)}
                    disabled={deletingId === doc.id}
                    className="p-2 rounded-lg text-[#A8A89C] hover:text-red-500 transition-colors disabled:opacity-40"
                    title="Delete"
                  >
                    {deletingId === doc.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Trash2  className="w-4 h-4" />
                    }
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
