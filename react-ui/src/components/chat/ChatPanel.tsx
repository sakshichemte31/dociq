// src/components/chat/ChatPanel.tsx
import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Loader2, Bot, User, Network, Share2, Volume2, VolumeX, Copy, Check, RotateCcw, ArrowDown, Sparkles } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { queriesApi } from '@/lib/api'
import api from '@/lib/api'
import { useChatStore } from '@/store'
import { useQueryStream } from '@/hooks/useWebSocket'
import FaithfulnessBadge from './FaithfulnessBadge'
import DebugPanel from './DebugPanel'
import SmartSummary from './SmartSummary'
import ExportButton from './ExportButton'
import { VoiceInput, useTTS } from './VoiceInput'
import { PromptTemplates } from './PromptTemplates'
import type { RetrievedChunk } from '@/types'

interface ChatPanelProps {
  docId: string
  docName?: string
  onChunkClick?: (chunk: RetrievedChunk) => void
  prefillQuestion?: string
  onPrefillConsumed?: () => void
}

const FOLLOW_UP_SUGGESTIONS = [
  'Explain that in more detail',
  'Summarize as bullet points',
  'What are the key risks or caveats?',
  'Give a concrete example',
]

export default function ChatPanel({ docId, docName = 'Document', onChunkClick, prefillQuestion, onPrefillConsumed }: ChatPanelProps) {
  const { messages, addMessage, updateLastAssistantMessage, clearMessages } = useChatStore()

  // Auto-fill input when text is selected in PDF viewer
  useEffect(() => {
    if (prefillQuestion) {
      setInput(prefillQuestion)
      inputRef.current?.focus()
      onPrefillConsumed?.()
    }
  }, [prefillQuestion, onPrefillConsumed])
  const docMessages = messages[docId] || []
  const [input, setInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeQueryId, setActiveQueryId] = useState<string | null>(null)
  const [sharingQueryId, setSharingQueryId] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copySuccess, setCopySuccess] = useState(false)
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const quickCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { enabled: ttsEnabled, setEnabled: setTtsEnabled, speakToken, stop: stopTTS, finish: finishTTS } = useTTS()

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current)
      watchdogRef.current = null
    }
    if (quickCheckRef.current) {
      clearTimeout(quickCheckRef.current)
      quickCheckRef.current = null
    }
  }, [])

  useEffect(() => clearWatchdog, [clearWatchdog])

  // Auto-scroll on new messages, but only if the user is already near the bottom
  useEffect(() => {
    const el = messagesContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom < 200) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [docMessages])

  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setShowScrollBtn(distanceFromBottom > 250)
  }, [])

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const copyToClipboard = useCallback((id: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedMsgId(id)
    setTimeout(() => setCopiedMsgId((cur) => (cur === id ? null : cur)), 1800)
  }, [])

  // Keyboard shortcut: Cmd/Ctrl+K focuses the composer
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleToken = useCallback(
    (token: string) => {
      updateLastAssistantMessage(docId, (prev) => ({
        content: (prev?.content || '') + token,
        streaming: true,
      }))
      speakToken(token)
    },
    [docId, updateLastAssistantMessage, speakToken]
  )

  const handleDone = useCallback(
    ({ faithfulnessScore, latencyMs, retrievedChunks, rewrittenQueries }: {
      faithfulnessScore: number; latencyMs: number; retrievedChunks?: any[]; rewrittenQueries?: string[]
    }) => {
      clearWatchdog()
      updateLastAssistantMessage(docId, { streaming: false, faithfulnessScore, latencyMs, retrievedChunks, rewrittenQueries })
      setIsSubmitting(false)
      setActiveQueryId(null)
      finishTTS()
    },
    [docId, updateLastAssistantMessage, finishTTS, clearWatchdog]
  )

  const handleStreamError = useCallback(
    (msg: string) => {
      clearWatchdog()
      updateLastAssistantMessage(docId, { content: `Error: ${msg}`, streaming: false })
      setIsSubmitting(false)
      setActiveQueryId(null)
      stopTTS()
    },
    [docId, updateLastAssistantMessage, stopTTS, clearWatchdog]
  )

  const handleVoiceTranscript = useCallback((text: string) => {
    setInput(prev => (prev ? prev + ' ' + text : text))
    inputRef.current?.focus()
  }, [])

  const handleShare = useCallback(async (queryId: string) => {
    setSharingQueryId(queryId)
    try {
      const res = await api.post<{ shareToken: string; shareUrl: string }>(`/api/queries/${queryId}/share`)
      const url = window.location.origin + res.data.shareUrl
      setShareUrl(url)
      await navigator.clipboard.writeText(url)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2500)
    } catch (e) {
      console.error('Share failed', e)
    } finally {
      setSharingQueryId(null)
    }
  }, [])

  const { armStream } = useQueryStream(activeQueryId, handleToken, handleDone, handleStreamError)

  const handleSubmit = async (overrideQuestion?: string) => {
    const question = (overrideQuestion ?? input).trim()
    if (!question || isSubmitting) return

    if (!overrideQuestion) setInput('')
    setIsSubmitting(true)

    // Add user message
    addMessage(docId, {
      id: crypto.randomUUID(),
      role: 'user',
      content: question,
      timestamp: new Date(),
    })

    // Add placeholder assistant message
    const assistantId = crypto.randomUUID()
    addMessage(docId, {
      id: assistantId,
      role: 'assistant',
      content: '',
      streaming: true,
      timestamp: new Date(),
    })

    // Generate the id and subscribe to its stream *before* issuing the
    // request that causes the server to publish to it. The WebSocketProvider
    // keeps one connection open for the whole session, so this SUBSCRIBE
    // frame goes out immediately — well before the POST below reaches the
    // backend, commits the query row, and triggers the Kafka-driven bridge.
    // That ordering is what actually closes the race (the REST fallback
    // further down is a safety net for the rare case this still loses).
    const clientQueryId = crypto.randomUUID()
    setActiveQueryId(clientQueryId)
    armStream(clientQueryId)

    try {
      const { queryId } = await queriesApi.submit(docId, question, true, clientQueryId)
      console.log('[ChatPanel] submit() resolved with queryId:', queryId)
      if (queryId !== clientQueryId) {
        // Extremely unlikely (server only deviates on a UUID collision),
        // but if it happens, arm the id the server actually used too.
        setActiveQueryId(queryId)
        armStream(queryId)
      }
      // Store queryId in the pending assistant message so share button can use it
      updateLastAssistantMessage(docId, { queryId })

      // Returns true if the REST fallback resolved the query (completed or
      // failed), false if it's still genuinely pending.
      const tryResolveFromRest = async (): Promise<boolean> => {
        try {
          const result = await queriesApi.get(queryId)
          if (result.status === 'COMPLETED') {
            handleDone({
              faithfulnessScore: result.faithfulnessScore,
              latencyMs: result.latencyMs,
              retrievedChunks: result.retrievedChunks,
              rewrittenQueries: result.rewrittenQueries,
            })
            updateLastAssistantMessage(docId, { content: result.answer })
            return true
          }
          if (result.status === 'FAILED') {
            handleStreamError('The query failed while processing. Please try again.')
            return true
          }
        } catch (fallbackErr) {
          console.error('[ChatPanel] REST fallback fetch failed', fallbackErr)
        }
        return false
      }

      clearWatchdog()

      // Quick probe: the Kafka-driven bridge + python-ml round trip usually
      // finishes in a couple of seconds. If the frontend's STOMP subscribe
      // lost the race against that (SimpleBroker doesn't replay to late
      // subscribers), this catches it fast instead of making the user wait
      // out the full 45s watchdog below for what is actually already done.
      quickCheckRef.current = setTimeout(() => {
        tryResolveFromRest()
      }, 5_000)

      watchdogRef.current = setTimeout(async () => {
        console.warn('[ChatPanel] No WS event within 45s for query', queryId, '— checking REST fallback')
        const resolved = await tryResolveFromRest()
        if (!resolved) {
          handleStreamError('No response received in time. The server may be busy — please try again.')
        }
      }, 45_000)
    } catch (err: any) {
      updateLastAssistantMessage(docId, {
        content: `Failed to submit query: ${err.response?.data?.detail || err.message}`,
        streaming: false,
      })
      setIsSubmitting(false)
      setActiveQueryId(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#FAFAF8] relative">
      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleMessagesScroll}
        className="flex-1 overflow-y-auto p-4 space-y-6"
      >
        {docMessages.length === 0 && (
          <div className="flex flex-col h-full">
            <SmartSummary
              docId={docId}
              onQuestionClick={(q) => { setInput(q); inputRef.current?.focus() }}
            />
            <div className="flex flex-col items-center justify-center flex-1 text-center space-y-3 py-8">
              <div className="w-14 h-14 rounded-2xl bg-accent-500/10 flex items-center justify-center">
                <Bot className="w-7 h-7 text-accent-500" />
              </div>
              <p className="text-[#1A1A18] font-medium">Ask anything about {docName}</p>
              <p className="text-xs text-[#A8A89C] max-w-xs">
                Press <kbd className="px-1.5 py-0.5 rounded bg-black/[0.06] font-mono">{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} K</kbd> anytime to jump to the composer
              </p>
            </div>
          </div>
        )}

        {docMessages.map((msg, idx) => (
          <div key={msg.id} className={`msg-enter flex gap-3 group ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            {/* Avatar */}
            <div
              className={[
                'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
                msg.role === 'user' ? 'bg-accent-600' : 'bg-[#F0EFE9]',
              ].join(' ')}
            >
              {msg.role === 'user' ? (
                <User className="w-4 h-4 text-white" />
              ) : (
                <Bot className="w-4 h-4 text-accent-500" />
              )}
            </div>

            {/* Bubble */}
            <div className={`max-w-[80%] space-y-1 ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col`}>
              <div
                className={[
                  'rounded-2xl px-4 py-3 text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'bg-accent-600 text-white rounded-tr-sm'
                    : 'bg-white text-[#1A1A18] rounded-tl-sm border border-black/[0.08]',
                ].join(' ')}
              >
                {msg.content ? (
                  msg.role === 'assistant' ? (
                    <div className="prose-chat">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap">{msg.content}</span>
                  )
                ) : (
                  msg.streaming && (
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-accent-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 bg-accent-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 bg-accent-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  )
                )}
                {msg.streaming && msg.content && (
                  <span className="inline-block w-0.5 h-4 bg-accent-400 animate-pulse ml-0.5 align-middle" />
                )}
              </div>

              {/* Meta: faithfulness + latency + hover actions (copy / regenerate / share) */}
              {!msg.streaming && msg.content && (
                <div className="flex items-center gap-1.5 px-1 flex-wrap">
                  {msg.role === 'assistant' && msg.faithfulnessScore !== undefined && (
                    <>
                      <FaithfulnessBadge score={msg.faithfulnessScore} />
                      {msg.latencyMs && (
                        <span className="text-xs text-[#A8A89C]">{msg.latencyMs}ms</span>
                      )}
                    </>
                  )}

                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    <button
                      onClick={() => copyToClipboard(msg.id, msg.content)}
                      title="Copy"
                      className="msg-action-btn"
                    >
                      {copiedMsgId === msg.id ? <Check size={12} /> : <Copy size={12} />}
                    </button>

                    {msg.role === 'assistant' && idx > 0 && (
                      <button
                        onClick={() => handleSubmit(docMessages[idx - 1]?.content)}
                        disabled={isSubmitting}
                        title="Regenerate response"
                        className="msg-action-btn"
                      >
                        <RotateCcw size={12} />
                      </button>
                    )}

                    {msg.role === 'assistant' && msg.queryId && (
                      <button
                        onClick={() => handleShare(msg.queryId!)}
                        disabled={sharingQueryId === msg.queryId}
                        title="Copy share link"
                        className="msg-action-btn"
                      >
                        <Share2 size={12} />
                        {sharingQueryId === msg.queryId ? 'Copying…' : copySuccess && sharingQueryId === null ? 'Copied!' : 'Share'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Debug panel */}
              {msg.role === 'assistant' && !msg.streaming && (
                <div className="w-full">
                  <DebugPanel
                    rewrittenQueries={msg.rewrittenQueries}
                    retrievedChunks={msg.retrievedChunks}
                    onChunkClick={onChunkClick}
                  />
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Follow-up suggestions after the latest completed answer */}
        {!isSubmitting &&
          docMessages.length > 0 &&
          docMessages[docMessages.length - 1].role === 'assistant' &&
          !docMessages[docMessages.length - 1].streaming &&
          docMessages[docMessages.length - 1].content && (
            <div className="flex flex-wrap gap-2 pl-11 msg-enter">
              {FOLLOW_UP_SUGGESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => { setInput(q); inputRef.current?.focus() }}
                  className="follow-up-chip"
                >
                  <Sparkles size={11} className="text-accent-500" />
                  {q}
                </button>
              ))}
            </div>
          )}

        <div ref={bottomRef} />
      </div>

      {/* Floating scroll-to-bottom button */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-28 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 bg-white border border-black/[0.08] shadow-md rounded-full text-xs text-[#1A1A18] hover:bg-[#F0EFE9] transition-colors z-10"
        >
          <ArrowDown size={12} />
          Jump to latest
        </button>
      )}

      {/* Input */}
      <div className="border-t border-black/[0.08] p-4">
        {/* Prompt templates */}
        <div className="mb-2">
          <PromptTemplates
            onSelect={(prompt) => { setInput(prompt); inputRef.current?.focus() }}
            disabled={isSubmitting}
          />
        </div>

        <div className="flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question… (Enter to send, Shift+Enter for newline)"
            rows={1}
            disabled={isSubmitting}
            className="flex-1 bg-white text-[#1A1A18] border border-black/[0.08] rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-accent-500 disabled:opacity-50 placeholder:text-[#A8A89C] min-h-[46px] max-h-32"
            style={{ height: 'auto' }}
            onInput={(e) => {
              const t = e.currentTarget
              t.style.height = 'auto'
              t.style.height = Math.min(t.scrollHeight, 128) + 'px'
            }}
          />

          {/* Voice input */}
          <VoiceInput onTranscript={handleVoiceTranscript} disabled={isSubmitting} />

          {/* TTS toggle */}
          <button
            onClick={() => { setTtsEnabled(e => !e); if (ttsEnabled) stopTTS() }}
            title={ttsEnabled ? 'Disable text-to-speech' : 'Enable text-to-speech'}
            style={{
              width: 34, height: 34, borderRadius: '50%', border: 'none',
              background: ttsEnabled ? '#FFF7ED' : 'transparent',
              color: ttsEnabled ? '#C2560B' : '#6B6B63',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >
            {ttsEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>

          {/* Knowledge graph link */}
          <a
            href={'/graph/' + docId}
            title="View knowledge graph"
            style={{
              width: 34, height: 34, borderRadius: '50%',
              background: 'transparent', color: '#6B6B63',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              textDecoration: 'none', flexShrink: 0,
            }}
          >
            <Network size={15} />
          </a>

          <ExportButton
            docName={docName}
            messages={docMessages.map((m) => ({
              role: m.role,
              content: m.content,
              faithfulnessScore: m.faithfulnessScore,
            }))}
          />
          <button
            onClick={() => handleSubmit()}
            disabled={!input.trim() || isSubmitting}
            className="p-3 bg-accent-600 hover:bg-accent-500 disabled:bg-[#F0EFE9] disabled:text-[#A8A89C] text-white rounded-xl transition-colors flex-shrink-0"
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
