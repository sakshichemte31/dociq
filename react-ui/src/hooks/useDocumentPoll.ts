import { useEffect, useRef, useCallback } from 'react'
import { documentsApi } from '@/lib/api'
import { useDocStore } from '@/store'
import type { Document } from '@/types'

/**
 * Polls document status every `interval` ms until READY or FAILED,
 * updating the doc store on each poll.
 */
export function useDocumentPoll(
  docId: string | null,
  onDone?: (doc: Document) => void,
  interval = 2000
) {
  const { upsertDocument } = useDocStore()
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!docId) return
    stop()

    timerRef.current = setInterval(async () => {
      try {
        const doc = await documentsApi.getStatus(docId)
        upsertDocument(doc)
        if (doc.status === 'READY' || doc.status === 'FAILED') {
          stop()
          onDone?.(doc)
        }
      } catch {
        stop()
      }
    }, interval)

    return stop
  }, [docId, interval, stop, upsertDocument, onDone])

  return { stop }
}
