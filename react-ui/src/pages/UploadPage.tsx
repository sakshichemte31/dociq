import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, FileText, CheckCircle, XCircle, Loader2, ArrowRight, Sparkles } from 'lucide-react'
import { documentsApi } from '@/lib/api'
import { useDocStore } from '@/store'
import type { Document } from '@/types'

type Phase = 'idle' | 'uploading' | 'processing' | 'ready' | 'failed'
interface UploadState {
  phase: Phase; uploadProgress: number
  docId?: string; document?: Document; error?: string
}

const STEPS = ['Upload', 'Process', 'Ready']
const STEP_IDX: Record<Phase, number> = { idle: -1, uploading: 0, processing: 1, ready: 2, failed: 1 }

export default function UploadPage() {
  const navigate = useNavigate()
  const { upsertDocument } = useDocStore()
  const [state, setState] = useState<UploadState>({ phase: 'idle', uploadProgress: 0 })

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0]; if (!file) return
    setState({ phase: 'uploading', uploadProgress: 0 })
    try {
      // documentsApi.upload() now blocks until the server has fully
      // parsed, chunked, and embedded the PDF — the response already
      // carries the final READY/FAILED state, ready for Q&A immediately.
      const doc = await documentsApi.upload(file, pct => {
        setState(p => ({
          ...p,
          uploadProgress: pct,
          // Once the file bytes are fully sent, the request is still open
          // while the server ingests it — reflect that as "processing".
          phase: pct >= 100 ? 'processing' : 'uploading',
        }))
      })
      upsertDocument(doc)
      setState({
        phase: doc.status === 'READY' ? 'ready' : 'failed',
        uploadProgress: 100,
        docId: doc.id,
        document: doc,
        error: doc.errorMessage,
      })
    } catch (err: any) {
      setState({ phase: 'failed', uploadProgress: 0, error: err.response?.data?.detail || 'Upload failed' })
    }
  }, [upsertDocument])

  const { getRootProps, getInputProps, isDragActive, isDragAccept, isDragReject } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    disabled: state.phase !== 'idle' && state.phase !== 'failed',
  })

  const interactive = state.phase === 'idle' || state.phase === 'failed'
  const currentStep = STEP_IDX[state.phase]

  return (
    <div className="max-w-xl mx-auto px-6 py-10 space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
        <div className="flex items-center gap-1.5 text-xs text-accent-600 font-medium mb-2">
          <Sparkles className="w-3.5 h-3.5" />
          AI-powered document intelligence
        </div>
        <h1 className="text-2xl font-semibold text-[#1A1A18]">Upload a Document</h1>
        <p className="text-sm text-[#6B6B63]">PDF files up to 100 MB · parsed, embedded, and ready to query in seconds</p>
      </motion.div>

      {/* Dropzone */}
      <motion.div
        {...(getRootProps() as any)}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ scale: isDragActive ? 1.01 : 1, opacity: 1 }}
        whileHover={interactive ? { scale: 1.005 } : {}}
        whileTap={interactive ? { scale: 0.998 } : {}}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className={`relative overflow-hidden bg-white border-2 border-dashed rounded-2xl p-16 text-center transition-colors shadow-soft ${
          isDragReject  ? 'border-red-300 bg-red-50'     :
          isDragAccept  ? 'border-accent-400 bg-accent-50/40' :
          interactive   ? 'border-black/12 hover:border-accent-300 cursor-pointer' :
                          'border-black/8 cursor-default'
        }`}
      >
        <AnimatePresence>
          {isDragActive && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-accent-500/5 pointer-events-none"
            />
          )}
        </AnimatePresence>
        <input {...getInputProps()} />

        <AnimatePresence mode="wait">
          <motion.div
            key={state.phase}
            initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.18 }}
            className="flex flex-col items-center gap-3"
          >
            {state.phase === 'idle' && (
              <>
                <motion.div
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-14 h-14 rounded-2xl bg-accent-500/10 flex items-center justify-center"
                >
                  <Upload className="w-7 h-7 text-accent-500" />
                </motion.div>
                <div>
                  <p className="text-sm font-medium text-[#1A1A18]">Drop a PDF here, or <span className="text-accent-500">browse files</span></p>
                  <p className="text-xs text-[#A8A89C] mt-0.5">PDF only · max 100 MB</p>
                </div>
              </>
            )}
            {state.phase === 'uploading' && (
              <>
                <div className="w-14 h-14 rounded-2xl bg-accent-500/10 flex items-center justify-center">
                  <Loader2 className="w-7 h-7 text-accent-500 animate-spin" />
                </div>
                <p className="text-sm font-medium text-[#1A1A18]">Uploading… {state.uploadProgress}%</p>
              </>
            )}
            {state.phase === 'processing' && (
              <>
                <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center">
                  <Loader2 className="w-7 h-7 text-amber-500 animate-spin" />
                </div>
                <p className="text-sm font-medium text-[#1A1A18]">Parsing and embedding…</p>
                <p className="text-xs text-[#A8A89C]">This usually takes a few seconds</p>
              </>
            )}
            {state.phase === 'ready' && (
              <>
                <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
                  <CheckCircle className="w-7 h-7 text-emerald-500" />
                </div>
                <p className="text-sm font-medium text-[#1A1A18]">Document ready!</p>
              </>
            )}
            {state.phase === 'failed' && (
              <>
                <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
                  <XCircle className="w-7 h-7 text-red-600" />
                </div>
                <p className="text-sm font-medium text-[#1A1A18]">{state.error || 'Processing failed'}</p>
                <motion.button
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                  onClick={e => { e.stopPropagation(); setState({ phase: 'idle', uploadProgress: 0 }) }}
                  className="text-xs text-accent-500 hover:text-accent-600 underline underline-offset-4"
                >
                  Try again
                </motion.button>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Progress bar */}
      <AnimatePresence>
        {(state.phase === 'uploading' || state.phase === 'processing') && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="h-1.5 bg-[#F0EFE9] rounded-full overflow-hidden">
              {state.phase === 'uploading' ? (
                <motion.div
                  className="h-full bg-accent-500 rounded-full"
                  initial={{ width: 0 }} animate={{ width: `${state.uploadProgress}%` }}
                />
              ) : (
                <motion.div
                  className="h-full bg-amber-400 rounded-full"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                  style={{ width: '100%' }}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Steps */}
      <div className="flex items-center justify-center gap-2 text-xs">
        {STEPS.map((label, i) => {
          const done   = currentStep > i || state.phase === 'ready'
          const active = currentStep === i && state.phase !== 'ready'
          return (
            <div key={label} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                done   ? 'bg-emerald-500 text-white' :
                active ? 'bg-accent-500 text-white' :
                         'bg-[#F0EFE9] text-[#A8A89C]'
              }`}>
                {done ? '✓' : i + 1}
              </div>
              <span className={done ? 'text-emerald-600' : active ? 'text-[#1A1A18] font-medium' : 'text-[#A8A89C]'}>{label}</span>
              {i < STEPS.length - 1 && (
                <div className="w-6 h-px bg-[#D4D4C8] relative overflow-hidden">
                  {done && <motion.div initial={{ x: '-100%' }} animate={{ x: 0 }} className="absolute inset-0 bg-emerald-400" />}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* CTA */}
      <AnimatePresence>
        {state.phase === 'ready' && state.docId && (
          <motion.button
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.98 }}
            onClick={() => navigate(`/chat/${state.docId}`)}
            className="w-full flex items-center justify-center gap-2 bg-accent-500 hover:bg-accent-600 text-white font-semibold py-3 rounded-xl shadow-accent transition-all"
          >
            Open Chat <ArrowRight className="w-4 h-4" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* File info */}
      <AnimatePresence>
        {state.document && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 bg-white border border-black/8 rounded-xl p-3 shadow-soft text-sm"
          >
            <FileText className="w-4 h-4 text-accent-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[#1A1A18] font-medium truncate">{state.document.originalFilename}</p>
              <p className="text-[11px] text-[#A8A89C]">{state.document.pageCount ? `${state.document.pageCount} pages` : 'Processing…'}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
