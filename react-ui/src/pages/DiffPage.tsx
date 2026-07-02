import { useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { motion, AnimatePresence } from 'framer-motion'
import { GitCompare, Upload, Loader2 } from 'lucide-react'
import { documentsApi } from '@/lib/api'
import { useDocStore } from '@/store'
import { DiffViewer } from '@/components/diff/DiffViewer'
import type { DiffResult } from '@/types'

function DocSlot({
  label, doc, onFile, isLoading,
}: {
  label: string
  doc: { id: string; name: string } | null
  onFile: (f: File) => void
  isLoading: boolean
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => files[0] && onFile(files[0]),
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    disabled: !!doc || isLoading,
  })
  return (
    <motion.div
      {...(getRootProps() as any)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0, scale: isDragActive ? 1.015 : 1 }}
      whileHover={!doc && !isLoading ? { scale: 1.008 } : {}}
      whileTap={!doc && !isLoading ? { scale: 0.995 } : {}}
      transition={{ type: 'spring', stiffness: 300, damping: 26 }}
      className={[
        'border-2 border-dashed rounded-xl p-8 text-center transition-colors',
        doc ? 'border-accent-500/50 bg-accent-50 cursor-default' : 'border-black/10 cursor-pointer',
        isDragActive ? 'border-accent-400 bg-accent-100' : '',
        !doc && !isLoading ? 'hover:border-accent-500 hover:bg-white' : '',
      ].join(' ')}
    >
      <input {...getInputProps()} />
      <AnimatePresence mode="wait">
        <motion.div
          key={isLoading ? 'loading' : doc ? 'done' : 'idle'}
          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className="flex flex-col items-center gap-2"
        >
          {isLoading ? (
            <Loader2 className="w-8 h-8 text-accent-500 animate-spin" />
          ) : doc ? (
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 15 }}
              className="w-8 h-8 rounded-full bg-accent-500 flex items-center justify-center text-white text-sm font-bold"
            >
              ✓
            </motion.div>
          ) : (
            <Upload className="w-8 h-8 text-[#6B6B63]" />
          )}
          <p className="text-sm font-medium text-[#6B6B63]">{label}</p>
          {doc
            ? <p className="text-xs text-accent-500 max-w-[200px] truncate">{doc.name}</p>
            : <p className="text-xs text-[#A8A89C]">Drop PDF or click to browse</p>
          }
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}

export default function DiffPage() {
  const { upsertDocument } = useDocStore()
  const [doc1, setDoc1] = useState<{ id: string; name: string } | null>(null)
  const [doc2, setDoc2] = useState<{ id: string; name: string } | null>(null)
  const [loading1, setLoading1] = useState(false)
  const [loading2, setLoading2] = useState(false)
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null)
  const [computing, setComputing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFile = async (file: File, slot: 1 | 2) => {
    const setLoading = slot === 1 ? setLoading1 : setLoading2
    const setDoc    = slot === 1 ? setDoc1    : setDoc2
    setLoading(true)
    setError(null)
    try {
      const doc = await documentsApi.upload(file)
      upsertDocument(doc)
      const poll = async () => {
        const status = await documentsApi.getStatus(doc.id)
        if (status.status === 'READY') {
          setDoc({ id: doc.id, name: file.name })
          setLoading(false)
        } else if (status.status === 'FAILED') {
          setError(`Processing failed: ${status.errorMessage}`)
          setLoading(false)
        } else {
          setTimeout(poll, 2000)
        }
      }
      poll()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Upload failed')
      setLoading(false)
    }
  }

  const computeDiff = async () => {
    if (!doc1 || !doc2) return
    setComputing(true)
    setError(null)
    try {
      const result = await documentsApi.diff(doc1.id, doc2.id)
      setDiffResult(result)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Diff computation failed')
    } finally {
      setComputing(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-xl font-semibold text-[#1A1A18] mb-1">Semantic Document Diff</h2>
        <p className="text-[#6B6B63] text-sm">Upload two PDFs to compare them semantically — not just character-by-character.</p>
      </motion.div>

      <div className="grid grid-cols-2 gap-4">
        <DocSlot label="Original document" doc={doc1} onFile={(f) => handleFile(f, 1)} isLoading={loading1} />
        <DocSlot label="New document"      doc={doc2} onFile={(f) => handleFile(f, 2)} isLoading={loading2} />
      </div>

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="bg-red-500/10 border border-red-500/20 text-red-600 text-sm rounded-lg px-4 py-3"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {doc1 && doc2 && !diffResult && (
          <motion.button
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
            onClick={computeDiff}
            disabled={computing}
            className="w-full flex items-center justify-center gap-2 bg-accent-600 hover:bg-accent-500 disabled:bg-[#F0EFE9] disabled:text-[#A8A89C] text-white font-semibold py-3 rounded-xl transition-colors shadow-accent"
          >
            {computing ? <Loader2 className="w-5 h-5 animate-spin" /> : <GitCompare className="w-5 h-5" />}
            {computing ? 'Computing semantic diff…' : 'Compare Documents'}
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {diffResult && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#1A1A18]">
                {diffResult.total_changes} change{diffResult.total_changes !== 1 ? 's' : ''} detected
              </h3>
              <motion.button
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => { setDiffResult(null); setDoc1(null); setDoc2(null) }}
                className="text-sm text-[#6B6B63] hover:text-[#1A1A18] transition-colors"
              >
                Reset
              </motion.button>
            </div>
            <DiffViewer sections={diffResult.sections} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
