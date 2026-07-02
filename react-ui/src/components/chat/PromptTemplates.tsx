/**
 * PromptTemplates — one-click prompt chips above the chat input.
 * Zero backend changes — pure frontend enhancement.
 */
import { Zap } from 'lucide-react'

const TEMPLATES = [
  { label: '📋 Summarize',        prompt: 'Summarize this document in 5 key bullet points.' },
  { label: '⚠️ Find risks',       prompt: 'What are the main risks, limitations, or concerns mentioned in this document?' },
  { label: '✅ Action items',     prompt: 'List all action items, tasks, or recommendations from this document.' },
  { label: '📅 Key dates',        prompt: 'What are all the important dates, deadlines, or timelines mentioned?' },
  { label: '🏢 Organizations',    prompt: 'List all organizations, companies, or institutions mentioned and their roles.' },
  { label: '💡 Core concepts',    prompt: 'What are the 3-5 most important concepts or ideas in this document?' },
  { label: '❓ Key findings',     prompt: 'What are the main findings or conclusions of this document?' },
  { label: '🔍 Methodology',      prompt: 'Describe the methodology or approach used in this document.' },
]

interface PromptTemplatesProps {
  onSelect: (prompt: string) => void
  disabled?: boolean
}

export function PromptTemplates({ onSelect, disabled }: PromptTemplatesProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto', padding: '6px 0 2px', scrollbarWidth: 'none' }}>
      <style>{`.tmpl-scroll::-webkit-scrollbar{display:none}`}</style>
      <Zap size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <div className="tmpl-scroll" style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
        {TEMPLATES.map((t) => (
          <button
            key={t.label}
            onClick={() => !disabled && onSelect(t.prompt)}
            disabled={disabled}
            title={t.prompt}
            style={{
              fontSize: 12,
              padding: '4px 10px',
              borderRadius: 99,
              border: '0.5px solid var(--border)',
              background: 'var(--surface-1)',
              color: 'var(--text-secondary)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'border-color 0.12s, color 0.12s',
              opacity: disabled ? 0.5 : 1,
            }}
            onMouseEnter={e => { if (!disabled) { (e.target as HTMLButtonElement).style.borderColor = '#F97316'; (e.target as HTMLButtonElement).style.color = '#EA6C0A' }}}
            onMouseLeave={e => { (e.target as HTMLButtonElement).style.borderColor = 'var(--border)'; (e.target as HTMLButtonElement).style.color = 'var(--text-secondary)' }}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
