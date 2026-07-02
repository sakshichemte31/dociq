// src/lib/api.ts
import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/store'
import type { Document, QueryResult, DiffResult, AnalyticsData } from '@/types'

const BASE_URL = import.meta.env.VITE_API_URL || ''

// Auth endpoints never get a stale Authorization header attached, and a
// failure from them should never itself trigger a refresh attempt — that
// would risk looping forever if the refresh endpoint is what's failing.
const AUTH_ENDPOINTS = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh']

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retry?: boolean
}

// A bare axios instance (no interceptors) used only for the refresh call
// itself, so it can never recursively trigger the response interceptor below.
const refreshClient = axios.create({ baseURL: BASE_URL })

function sendToLogin(reason?: 'expired') {
  if (window.location.pathname.startsWith('/login')) return
  const redirect = encodeURIComponent(window.location.pathname + window.location.search)
  const reasonParam = reason ? `&reason=${reason}` : ''
  window.location.href = `/login?redirect=${redirect}${reasonParam}`
}

// Only one refresh call should ever be in flight at once. Any requests that
// fail with 401 while a refresh is already pending queue up and get replayed
// (or rejected) once it resolves, instead of each kicking off their own
// refresh and racing to rotate the same token.
let refreshPromise: Promise<string | null> | null = null

async function performRefresh(): Promise<string | null> {
  const { refreshToken } = useAuthStore.getState()
  if (!refreshToken) return null
  try {
    const { data } = await refreshClient.post('/api/auth/refresh', { refreshToken })
    useAuthStore.getState().setAuth({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      userId: data.userId,
      email: data.email,
      fullName: data.fullName,
    })
    return data.accessToken as string
  } catch {
    return null
  }
}

function createApiClient(): AxiosInstance {
  const client = axios.create({ baseURL: BASE_URL })

  client.interceptors.request.use((config) => {
    const token = useAuthStore.getState().accessToken
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  })

  client.interceptors.response.use(
    (r) => r,
    async (err: AxiosError) => {
      const status = err.response?.status
      const config = err.config as RetryableConfig | undefined
      const isAuthEndpoint = AUTH_ENDPOINTS.some((p) => config?.url?.includes(p))

      // 401 = no/expired/bad access token. 403 = token present but rejected
      // by the JWT filter (expired, tampered, or the user it points to no
      // longer exists) — the backend has no role-based checks, so every 403
      // here is really an auth failure too. Both are worth a silent refresh
      // attempt before giving up on the session.
      if ((status === 401 || status === 403) && config && !isAuthEndpoint && !config._retry) {
        const wasAuthenticated = useAuthStore.getState().isAuthenticated()
        if (!wasAuthenticated) {
          return Promise.reject(err)
        }

        config._retry = true
        if (!refreshPromise) {
          refreshPromise = performRefresh().finally(() => {
            refreshPromise = null
          })
        }
        const newToken = await refreshPromise

        if (newToken) {
          config.headers.Authorization = `Bearer ${newToken}`
          return client(config)
        }

        // Refresh token is gone, expired, or rejected — the session is
        // genuinely over. Clear it and send the person back to login.
        useAuthStore.getState().clearAuth()
        sendToLogin('expired')
        return Promise.reject(err)
      }

      return Promise.reject(err)
    }
  )

  return client
}

const api = createApiClient()

// ── Auth ──────────────────────────────────────────────────────
export const authApi = {
  register: (email: string, password: string, fullName: string) =>
    api.post('/api/auth/register', { email: email.trim().toLowerCase(), password, fullName: fullName.trim() }).then((r) => r.data),

  login: (email: string, password: string) =>
    api.post('/api/auth/login', { email: email.trim().toLowerCase(), password }).then((r) => r.data),

  // Best-effort — the caller clears local state regardless, so a network
  // failure here shouldn't block the person from leaving.
  logout: () => api.post('/api/auth/logout').catch(() => {}),
}

// ── Documents ─────────────────────────────────────────────────
export const documentsApi = {
  upload: (file: File, onProgress?: (pct: number) => void) => {
    const form = new FormData()
    form.append('file', file)
    return api
      .post<Document>('/api/documents/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(Math.round((e.loaded * 100) / e.total))
        },
      })
      .then((r) => r.data)
  },

  getStatus: (id: string) => api.get<Document>(`/api/documents/${id}/status`).then((r) => r.data),

  list: (page = 0, size = 20) =>
    api.get<{ content: Document[]; totalElements: number }>('/api/documents', { params: { page, size } }).then((r) => r.data),

  delete: (id: string) => api.delete(`/api/documents/${id}`),

  diff: (docId1: string, docId2: string) =>
    api.post<DiffResult>('/api/documents/diff', { docId1, docId2 }).then((r) => r.data),
}

// ── Queries ───────────────────────────────────────────────────
export const queriesApi = {
  submit: (docId: string, question: string, stream = true, clientQueryId?: string) =>
    api
      .post<{ queryId: string; status: string; wsEndpoint: string }>('/api/query', {
        docId,
        question,
        stream,
        clientQueryId,
      })
      .then((r) => r.data),

  history: (docId: string, page = 0, size = 20) =>
    api
      .get<{ content: QueryResult[]; totalElements: number }>('/api/queries/history', {
        params: { docId, page, size },
      })
      .then((r) => r.data),

  // Fallback fetch for a single query, used when the STOMP stream never
  // delivers a "done" event (e.g. the browser subscribed after the
  // Kafka-driven bridge already finished publishing — the SimpleBroker
  // doesn't replay missed messages). The answer may already be fully
  // persisted in Postgres even though the WebSocket delivery was lost.
  get: (queryId: string) => api.get<QueryResult>(`/api/queries/${queryId}`).then((r) => r.data),
}

// ── Analytics ─────────────────────────────────────────────────
export const analyticsApi = {
  getSummary: () => api.get<AnalyticsData[]>('/api/analytics/summary').then((r) => r.data),
}

// ── Knowledge graph ───────────────────────────────────────────
export const graphApi = {
  get: (docId: string) => api.get(`/api/documents/${docId}/graph`).then((r) => r.data),
}

// ── Smart features ────────────────────────────────────────────
export const smartApi = {
  getSummary: (docId: string) => api.get(`/api/smart/summary/${docId}`).then((r) => r.data),
}

export default api
