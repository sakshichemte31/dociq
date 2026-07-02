import { useState, useEffect } from 'react'
import { queriesApi } from '@/lib/api'
import type { QueryResult } from '@/types'

export function useQueryHistory(docId: string | null) {
  const [history, setHistory] = useState<QueryResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!docId) return
    setLoading(true)
    queriesApi.history(docId)
      .then(r => setHistory(r.content))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [docId])

  return { history, loading }
}
