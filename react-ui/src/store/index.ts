// src/store/index.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthState, Document, QueryResult } from '@/types'

// ── Auth Store ────────────────────────────────────────────────
interface AuthStore extends AuthState {
  setAuth: (auth: AuthState) => void
  clearAuth: () => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      userId: null,
      email: null,
      fullName: null,
      setAuth: (auth) => set(auth),
      clearAuth: () => set({ accessToken: null, refreshToken: null, userId: null, email: null, fullName: null }),
      isAuthenticated: () => !!get().accessToken,
    }),
    { name: 'dociq-auth', version: 2 }
  )
)

// ── Document Store ────────────────────────────────────────────
interface DocStore {
  documents: Document[]
  setDocuments: (docs: Document[]) => void
  upsertDocument: (doc: Document) => void
  removeDocument: (id: string) => void
  activeDocId: string | null
  setActiveDocId: (id: string | null) => void
}

export const useDocStore = create<DocStore>((set) => ({
  documents: [],
  setDocuments: (docs) => set({ documents: docs }),
  upsertDocument: (doc) =>
    set((state) => {
      const idx = state.documents.findIndex((d) => d.id === doc.id)
      if (idx >= 0) {
        const updated = [...state.documents]
        updated[idx] = doc
        return { documents: updated }
      }
      return { documents: [doc, ...state.documents] }
    }),
  removeDocument: (id) =>
    set((state) => ({ documents: state.documents.filter((d) => d.id !== id) })),
  activeDocId: null,
  setActiveDocId: (id) => set({ activeDocId: id }),
}))

// ── Chat Store ────────────────────────────────────────────────
interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  faithfulnessScore?: number
  latencyMs?: number
  retrievedChunks?: any[]
  rewrittenQueries?: string[]
  queryId?: string        // backend query UUID — used for share links
  timestamp: Date
}

interface ChatStore {
  messages: Record<string, ChatMessage[]>  // keyed by docId
  addMessage: (docId: string, msg: ChatMessage) => void
  updateLastAssistantMessage: (docId: string, updates: Partial<ChatMessage> | ((prev: ChatMessage) => Partial<ChatMessage>)) => void
  clearMessages: (docId: string) => void
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: {},
  addMessage: (docId, msg) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [docId]: [...(state.messages[docId] || []), msg],
      },
    })),
  updateLastAssistantMessage: (docId, updates) =>
    set((state) => {
      const msgs = [...(state.messages[docId] || [])]
      const lastAssistantIdx = [...msgs].reverse().findIndex((m) => m.role === 'assistant')
      if (lastAssistantIdx < 0) return state
      const realIdx = msgs.length - 1 - lastAssistantIdx
      const resolved = typeof updates === 'function' ? updates(msgs[realIdx]) : updates
      msgs[realIdx] = { ...msgs[realIdx], ...resolved }
      return { messages: { ...state.messages, [docId]: msgs } }
    }),
  clearMessages: (docId) =>
    set((state) => ({ messages: { ...state.messages, [docId]: [] } })),
}))
