// src/components/chat/SmartSummary.tsx
import { useState, useEffect } from 'react'
import { Sparkles, BookOpen, Clock, Brain, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react'
import api from '@/lib/api'

interface Summary {
  title: string
  executive_summary: string
  key_topics: string[]
  document_type: string
  estimated_reading_time_minutes: number
  suggested_questions: string[]
  complexity_level: string
  language: string
}

interface Props {
  docId: string
  onQuestionClick: (q: string) => void
}

export default function SmartSummary({ docId, onQuestionClick }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(true)

  useEffect(() => {
    setLoading(true)
    api
      .get<Summary>(`/api/smart/summary/${docId}`)
      .then((r) => setSummary(r.data))
      .catch(() => setError('Summary unavailable'))
      .finally(() => setLoading(false))
  }, [docId])

  if (loading) {
    return (
      <div className="bg-white/90 border border-accent-500/20 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2 text-accent-500 text-sm">
          <Sparkles className="w-4 h-4 animate-pulse" />
          <span>Generating AI summary…</span>
        </div>
      </div>
    )
  }

  if (error || !summary) return null

  const complexityColor =
    summary.complexity_level === 'Advanced'
      ? 'text-red-600 bg-red-500/10'
      : summary.complexity_level === 'Intermediate'
      ? 'text-amber-600 bg-amber-500/10'
      : 'text-emerald-600 bg-emerald-500/10'

  return (
    <div className="bg-white/90 border border-accent-500/20 rounded-xl mb-4 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-black/[0.04] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-accent-500" />
          <span className="text-sm font-semibold text-accent-600">AI Document Summary</span>
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-[#6B6B63]" />
        ) : (
          <ChevronDown className="w-4 h-4 text-[#6B6B63]" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-black/[0.08]">
          {/* Meta badges */}
          <div className="flex flex-wrap gap-2 pt-3">
            <span className="text-xs px-2 py-1 rounded-full bg-[#F0EFE9] text-[#1A1A18] flex items-center gap-1">
              <BookOpen className="w-3 h-3" /> {summary.document_type}
            </span>
            <span className="text-xs px-2 py-1 rounded-full bg-[#F0EFE9] text-[#1A1A18] flex items-center gap-1">
              <Clock className="w-3 h-3" /> ~{summary.estimated_reading_time_minutes} min read
            </span>
            <span className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${complexityColor}`}>
              <Brain className="w-3 h-3" /> {summary.complexity_level}
            </span>
          </div>

          {/* Executive Summary */}
          <div>
            <p className="text-xs font-semibold text-[#6B6B63] uppercase tracking-wide mb-1">Summary</p>
            <p className="text-sm text-[#1A1A18] leading-relaxed">{summary.executive_summary}</p>
          </div>

          {/* Key Topics */}
          <div>
            <p className="text-xs font-semibold text-[#6B6B63] uppercase tracking-wide mb-2">Key Topics</p>
            <div className="flex flex-wrap gap-1.5">
              {summary.key_topics.map((topic) => (
                <span
                  key={topic}
                  className="text-xs px-2 py-1 rounded-full bg-accent-500/10 text-accent-600 border border-accent-500/20"
                >
                  {topic}
                </span>
              ))}
            </div>
          </div>

          {/* Suggested Questions */}
          <div>
            <p className="text-xs font-semibold text-[#6B6B63] uppercase tracking-wide mb-2">
              Suggested Questions
            </p>
            <div className="space-y-1.5">
              {summary.suggested_questions.map((q) => (
                <button
                  key={q}
                  onClick={() => onQuestionClick(q)}
                  className="w-full text-left text-xs text-[#1A1A18] hover:text-[#1A1A18] bg-black/[0.04] hover:bg-[#F0EFE9] rounded-lg px-3 py-2 transition-colors flex items-start gap-2 group"
                >
                  <MessageSquare className="w-3 h-3 mt-0.5 flex-shrink-0 text-accent-500 group-hover:text-accent-600" />
                  <span>{q}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
