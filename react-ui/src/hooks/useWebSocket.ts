// src/hooks/useWebSocket.ts
import { createContext, createElement, useContext, useEffect, useRef, useCallback, type ReactNode, type MutableRefObject } from 'react'
import { Client, type IMessage, type StompSubscription } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import { useAuthStore } from '@/store'

interface WebSocketContextValue {
  subscribe: (destination: string, callback: (msg: IMessage) => void, onTimeout?: () => void) => void
  unsubscribe: (destination: string) => void
  publish: (destination: string, body: object) => void
  client: MutableRefObject<Client | null>
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null)

// One STOMP connection for the whole app lifetime (per logged-in session),
// instead of a fresh SockJS/STOMP connection per component that happens to
// call useWebSocket(). This also matters for correctness, not just
// efficiency: because the connection is established once, up front, at app
// mount, subscribe() calls made from event handlers (e.g. right before
// submitting a query) hit an already-connected client and send their
// SUBSCRIBE frame immediately instead of waiting on a fresh handshake —
// which is what makes "subscribe before you trigger the server-side
// publish" a reliable ordering guarantee rather than a race.
export function WebSocketProvider({ children }: { children: ReactNode }) {
  const clientRef = useRef<Client | null>(null)
  const subscriptionsRef = useRef<Map<string, StompSubscription>>(new Map())
  const token = useAuthStore((s) => s.accessToken)

  useEffect(() => {
    if (!token) return

    const client = new Client({
      webSocketFactory: () => new SockJS('/ws'),
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 3000,
      onStompError: (frame) => {
        console.error('[WS] STOMP protocol error:', frame.headers?.message, frame.body)
      },
      onWebSocketError: (evt) => {
        console.error('[WS] Transport-level WebSocket error:', evt)
      },
      onWebSocketClose: (evt) => {
        if (evt?.code && evt.code !== 1000) {
          console.warn('[WS] Connection closed unexpectedly:', evt.code, evt.reason)
        }
      },
    })

    client.activate()
    clientRef.current = client

    return () => {
      subscriptionsRef.current.forEach((sub) => sub.unsubscribe())
      subscriptionsRef.current.clear()
      client.deactivate()
      clientRef.current = null
    }
  }, [token])

  const subscribe = useCallback((destination: string, callback: (msg: IMessage) => void, onTimeout?: () => void) => {
    const client = clientRef.current
    if (client?.connected) {
      const sub = client.subscribe(destination, callback)
      subscriptionsRef.current.set(destination, sub)
      return
    }

    // Queue subscription until connected — but give up after 10s instead of
    // polling forever, so a broken/never-connecting client surfaces as an
    // error rather than an invisible infinite wait.
    let attempts = 0
    const maxAttempts = 50 // 50 * 200ms = 10s
    const checkAndSubscribe = setInterval(() => {
      attempts++
      if (clientRef.current?.connected) {
        clearInterval(checkAndSubscribe)
        const sub = clientRef.current.subscribe(destination, callback)
        subscriptionsRef.current.set(destination, sub)
      } else if (attempts >= maxAttempts) {
        clearInterval(checkAndSubscribe)
        console.error('[WS] Gave up waiting for connection to subscribe to', destination)
        onTimeout?.()
      }
    }, 200)
  }, [])

  const unsubscribe = useCallback((destination: string) => {
    const sub = subscriptionsRef.current.get(destination)
    if (sub) {
      sub.unsubscribe()
      subscriptionsRef.current.delete(destination)
    }
  }, [])

  const publish = useCallback((destination: string, body: object) => {
    clientRef.current?.publish({
      destination,
      body: JSON.stringify(body),
    })
  }, [])

  const value: WebSocketContextValue = { subscribe, unsubscribe, publish, client: clientRef }

  return createElement(WebSocketContext.Provider, { value }, children)
}

export function useWebSocket() {
  const ctx = useContext(WebSocketContext)
  if (!ctx) {
    throw new Error('useWebSocket must be used within a <WebSocketProvider>')
  }
  return ctx
}

// ── Document status hook ──────────────────────────────────────
export function useDocumentStatus(
  docId: string | null,
  onStatusChange: (status: string, message?: string) => void
) {
  const { subscribe, unsubscribe } = useWebSocket()

  useEffect(() => {
    if (!docId) return
    const dest = `/topic/documents/${docId}/status`
    subscribe(dest, (msg) => {
      try {
        const payload = JSON.parse(msg.body)
        onStatusChange(payload.status, payload.message)
      } catch {
        // ignore parse errors
      }
    })
    return () => unsubscribe(dest)
  }, [docId, subscribe, unsubscribe, onStatusChange])
}

// ── Query stream hook ─────────────────────────────────────────
// `armStream(id)` is exposed separately from the `queryId`-driven effect so
// callers that need the "subscribe before publish" ordering guarantee (see
// ChatPanel.handleSubmit) can subscribe synchronously before making the
// network request that triggers the server-side publish, rather than
// waiting for a `queryId` state update to flow through a render + effect
// cycle first.
export function useQueryStream(
  queryId: string | null,
  onToken: (token: string) => void,
  onDone: (meta: { faithfulnessScore: number; latencyMs: number; retrievedChunks?: any[]; rewrittenQueries?: string[] }) => void,
  onError: (msg: string) => void
) {
  const { subscribe, unsubscribe } = useWebSocket()
  const metaRef = useRef<{ retrievedChunks?: any[]; rewrittenQueries?: string[] }>({})
  const armedRef = useRef<string | null>(null)

  // Keep latest callbacks in refs so the subscription effect below only
  // depends on `queryId` — not on these function identities, which can
  // change every render and would otherwise tear down / rebuild the
  // subscription mid-stream (and can race with incoming messages).
  const onTokenRef = useRef(onToken)
  const onDoneRef = useRef(onDone)
  const onErrorRef = useRef(onError)
  onTokenRef.current = onToken
  onDoneRef.current = onDone
  onErrorRef.current = onError

  const makeHandler = useCallback(() => (msg: IMessage) => {
    try {
      const event = JSON.parse(msg.body)
      if (event.type === 'meta') {
        metaRef.current = { retrievedChunks: event.retrievedChunks, rewrittenQueries: event.rewrittenQueries }
      } else if (event.type === 'token') onTokenRef.current(event.content)
      else if (event.type === 'done') onDoneRef.current({ faithfulnessScore: event.faithfulness_score, latencyMs: event.latency_ms, ...metaRef.current })
      else if (event.type === 'error') onErrorRef.current(event.message)
      else if (event.type === 'faithfulness_fail') onTokenRef.current('\n\n' + event.replacement)
    } catch {
      // ignore parse errors
    }
  }, [])

  // Call this synchronously, before kicking off the request that triggers
  // the server-side Kafka publish, to guarantee the SUBSCRIBE frame is sent
  // first. Safe to call multiple times for the same id (no-ops after the
  // first). The effect below also arms on the `queryId` prop, for callers
  // that don't need the early-subscribe guarantee.
  const armStream = useCallback((id: string) => {
    if (armedRef.current === id) return
    armedRef.current = id
    metaRef.current = {}
    subscribe(`/topic/queries/${id}/stream`, makeHandler(), () =>
      onErrorRef.current('Could not connect to server to receive the answer. Please refresh and try again.')
    )
  }, [subscribe, makeHandler])

  useEffect(() => {
    if (!queryId) {
      armedRef.current = null
      return
    }
    armStream(queryId)
    const dest = `/topic/queries/${queryId}/stream`
    return () => {
      unsubscribe(dest)
      if (armedRef.current === queryId) armedRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryId])

  return { armStream }
}
