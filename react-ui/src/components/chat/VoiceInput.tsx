/**
 * VoiceInput — browser Web Speech API for voice-to-text input
 * Uses SpeechRecognition (Chrome/Edge) with graceful fallback for Firefox/Safari.
 * Zero backend changes needed.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { Mic, Square } from 'lucide-react'

interface VoiceInputProps {
  onTranscript: (text: string) => void
  disabled?: boolean
}

// Extend window type for cross-browser Speech API
interface SpeechRecognitionEvent extends Event {
  resultIndex: number
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance
    webkitSpeechRecognition: new () => SpeechRecognitionInstance
  }
}

export function VoiceInput({ onTranscript, disabled }: VoiceInputProps) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening]   = useState(false)
  const [interim, setInterim]       = useState('')
  const recogRef = useRef<SpeechRecognitionInstance | null>(null)

  useEffect(() => {
    const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechAPI) return
    setSupported(true)

    const recog = new SpeechAPI()
    recog.continuous     = true
    recog.interimResults = true
    recog.lang           = 'en-US'

    recog.onresult = (e: SpeechRecognitionEvent) => {
      let interimText = ''
      let finalText   = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) finalText += t
        else interimText += t
      }
      if (finalText) {
        onTranscript(finalText.trim())
        setInterim('')
      } else {
        setInterim(interimText)
      }
    }

    recog.onend = () => setListening(false)
    recog.onerror = () => setListening(false)

    recogRef.current = recog
    return () => { recog.abort(); recogRef.current = null }
  }, [onTranscript])

  const toggle = useCallback(() => {
    if (!recogRef.current) return
    if (listening) {
      recogRef.current.stop()
      setListening(false)
      setInterim('')
    } else {
      recogRef.current.start()
      setListening(true)
    }
  }, [listening])

  if (!supported) return null

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      {interim && (
        <div style={{
          position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
          marginBottom: 8, background: 'var(--surface-2)', border: '0.5px solid var(--border)',
          borderRadius: 8, padding: '6px 12px', fontSize: 12, color: 'var(--text-secondary)',
          whiteSpace: 'nowrap', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis',
          pointerEvents: 'none',
        }}>
          {interim}
        </div>
      )}
      <button
        onClick={toggle}
        disabled={disabled}
        title={listening ? 'Stop recording' : 'Voice input'}
        style={{
          width: 34, height: 34, borderRadius: '50%', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: listening ? '#FAEAEA' : 'var(--surface-2)',
          color: listening ? '#C0392B' : 'var(--text-secondary)',
          position: 'relative', transition: 'all 0.15s',
        }}
      >
        {listening
          ? <Square size={14} fill="currentColor" />
          : <Mic size={15} />
        }
        {listening && (
          <span style={{
            position: 'absolute', inset: -2, borderRadius: '50%',
            border: '2px solid #E74C3C', animation: 'pulse-ring 1.2s ease-out infinite',
          }} />
        )}
      </button>
      <style>{`
        @keyframes pulse-ring {
          0%   { transform: scale(0.9); opacity: 0.8; }
          70%  { transform: scale(1.3); opacity: 0; }
          100% { transform: scale(1.3); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

/**
 * useTTS — text-to-speech for streaming answers
 * Call speak(token) for each token; it queues words and reads naturally.
 */
export function useTTS() {
  const [enabled, setEnabled] = useState(false)
  const bufferRef  = useRef('')
  const speakingRef = useRef(false)

  const flushBuffer = useCallback(() => {
    if (!enabled || !window.speechSynthesis || speakingRef.current) return
    const text = bufferRef.current.trim()
    if (!text) return
    bufferRef.current = ''
    const utt = new SpeechSynthesisUtterance(text)
    utt.rate  = 1.1
    utt.pitch = 1.0
    utt.onend = () => {
      speakingRef.current = false
      flushBuffer()
    }
    speakingRef.current = true
    window.speechSynthesis.speak(utt)
  }, [enabled])

  const speakToken = useCallback((token: string) => {
    if (!enabled) return
    bufferRef.current += token
    // Flush on sentence boundaries for natural pacing
    if (/[.!?]\s/.test(bufferRef.current) || bufferRef.current.length > 120) {
      flushBuffer()
    }
  }, [enabled, flushBuffer])

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel()
    bufferRef.current = ''
    speakingRef.current = false
  }, [])

  const finish = useCallback(() => {
    flushBuffer()
  }, [flushBuffer])

  return { enabled, setEnabled, speakToken, stop, finish }
}
