// src/types/index.ts

export type DocumentStatus = 'UPLOADED' | 'PROCESSING' | 'READY' | 'FAILED'

export interface Document {
  id: string
  filename: string
  originalFilename: string
  status: DocumentStatus
  pageCount?: number
  fileSize?: number
  errorMessage?: string
  createdAt: string
  updatedAt: string
}

export interface QueryResult {
  id: string
  question: string
  answer: string
  faithfulnessScore: number
  latencyMs: number
  status: string
  retrievedChunks?: RetrievedChunk[]
  rewrittenQueries?: string[]
  createdAt: string
  completedAt?: string
}

export interface RetrievedChunk {
  chunk_index: number
  page_num: number
  score: number
  text?: string
  text_preview?: string
  char_start?: number
  char_end?: number
}

export interface StreamEvent {
  type: 'meta' | 'token' | 'done' | 'error' | 'faithfulness_fail'
  content?: string        // token text
  queryId?: string
  faithfulness_score?: number
  faithfulness_explanation?: string
  latency_ms?: number
  full_answer?: string
  retrievedChunks?: RetrievedChunk[]
  rewrittenQueries?: string[]
  message?: string        // error message
  score?: number          // faithfulness_fail score
  replacement?: string    // faithfulness_fail replacement text
}

export interface DiffSection {
  section: string
  change_type: 'ADDED' | 'REMOVED' | 'MODIFIED' | 'UNCHANGED'
  old_summary?: string
  new_summary?: string
  similarity: number
  page_old?: number
  page_new?: number
  semantic_diff?: string
}

export interface DiffResult {
  doc_id_1: string
  doc_id_2: string
  sections: DiffSection[]
  total_changes: number
}

export interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  userId: string | null
  email: string | null
  fullName: string | null
}

export interface AnalyticsData {
  date: string
  avgFaithfulness: number
  p50Latency: number
  p95Latency: number
  queryCount: number
}

export interface GraphNode {
  id: string
  label: string
  type: 'person' | 'organization' | 'concept' | 'date' | 'location' | 'technology' | 'other'
  page?: number
}

export interface GraphEdge {
  source: string
  target: string
  label: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface ShareResponse {
  shareToken: string
  shareUrl: string
  queryId: string
}

export interface PageHighlight {
  pageNum: number
  charStart: number
  charEnd: number
}
