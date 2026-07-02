import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { BookOpen, Clock, Sparkles, ArrowLeft, AlertCircle } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import api from '@/lib/api'

interface SharedSession {
  queryId: string
  question: string
  answer: string
  faithfulnessScore: number | null
  latencyMs: number | null
  createdAt: string
  rewrittenQueries: string[] | null
  documentName: string
  pageCount: number | null
}

function FaithfulnessBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = score >= 0.85 ? '#0F6E56' : score >= 0.7 ? '#854F0B' : '#8B1C1C'
  const bg   = score >= 0.85 ? '#E1F5EE' : score >= 0.7 ? '#FAEEDA' : '#FAEAEA'
  return (
    <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 99, background: bg, color, whiteSpace: 'nowrap' }}>
      ✦ {pct}% faithful
    </span>
  )
}

export default function SharePage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<SharedSession | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  useEffect(() => {
    if (!token) return
    api.get<SharedSession>(`/share/${token}`)
      .then(r => setSession(r.data))
      .catch(() => setError('This share link is invalid or has been removed.'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-0)' }}>
      <div style={{ width: 36, height: 36, border: '2px solid var(--border)', borderTopColor: '#F97316', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (error || !session) return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, background: 'var(--surface-0)', padding: 24 }}>
      <AlertCircle size={40} style={{ color: 'var(--text-danger)' }} />
      <p style={{ fontSize: 16, color: 'var(--text-primary)', fontWeight: 500 }}>Link not found</p>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', maxWidth: 320 }}>{error}</p>
      <button onClick={() => navigate('/login')} style={{ fontSize: 13, padding: '8px 16px', background: '#F97316', color: '#fff', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer' }}>
        Open DocIQ
      </button>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-0)', padding: '0 0 60px' }}>
      {/* Top bar */}
      <div style={{ background: 'var(--surface-1)', borderBottom: '0.5px solid var(--border)', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={18} style={{ color: '#F97316' }} />
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>DocIQ</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>· shared answer</span>
        </div>
        <button onClick={() => navigate('/login')} style={{ fontSize: 12, padding: '6px 14px', background: '#F97316', color: '#fff', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer' }}>
          Try DocIQ free
        </button>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>
        {/* Document info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <div style={{ width: 36, height: 36, background: '#E6F1FB', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <BookOpen size={18} style={{ color: '#185FA5' }} />
          </div>
          <div>
            <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{session.documentName}</p>
            {session.pageCount && <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{session.pageCount} pages</p>}
          </div>
        </div>

        {/* Question */}
        <div style={{ background: '#FFF7ED', border: '0.5px solid #FED7AA', borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 500, color: '#C2560B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Question</p>
          <p style={{ fontSize: 16, color: '#1A1A18', fontWeight: 500, lineHeight: 1.5 }}>{session.question}</p>
        </div>

        {/* Answer */}
        <div style={{ background: 'var(--surface-1)', border: '0.5px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Answer</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {session.faithfulnessScore != null && <FaithfulnessBadge score={session.faithfulnessScore} />}
              {session.latencyMs != null && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Clock size={11} />{(session.latencyMs / 1000).toFixed(1)}s
                </span>
              )}
            </div>
          </div>
          <div className="prose-chat" style={{ fontSize: 14, color: 'var(--text-primary)', lineHeight: 1.75 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{session.answer}</ReactMarkdown>
          </div>
        </div>

        {/* Sub-queries debug */}
        {session.rewrittenQueries && session.rewrittenQueries.length > 0 && (
          <details style={{ marginBottom: 16 }}>
            <summary style={{ fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', padding: '8px 0', listStyle: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>▶</span> Show how DocIQ searched ({session.rewrittenQueries.length} sub-queries)
            </summary>
            <div style={{ paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {session.rewrittenQueries.map((q, i) => (
                <div key={i} style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '6px 12px', background: 'var(--surface-1)', borderRadius: 6, borderLeft: '2px solid #F97316' }}>
                  {q}
                </div>
              ))}
            </div>
          </details>
        )}

        {/* CTA */}
        <div style={{ background: 'linear-gradient(135deg,#EA6C0A 0%,#C2560B 100%)', borderRadius: 12, padding: '24px', textAlign: 'center', marginTop: 32 }}>
          <p style={{ fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 8 }}>Chat with any PDF using AI</p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 18, lineHeight: 1.5 }}>
            Upload documents, ask questions, get faithful answers with citations — free, powered by Groq.
          </p>
          <button onClick={() => navigate('/login')} style={{ fontSize: 14, padding: '10px 24px', background: '#F97316', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 500 }}>
            Try DocIQ free →
          </button>
        </div>
      </div>
    </div>
  )
}
