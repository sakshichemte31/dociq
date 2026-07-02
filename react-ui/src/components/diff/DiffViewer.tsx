import { useState } from 'react'
import { ChevronDown, ChevronRight, Plus, Minus, Equal, AlertCircle } from 'lucide-react'
import type { DiffSection } from '@/types'

const CHANGE_CONFIG = {
  ADDED:     { icon: <Plus className="w-3 h-3" />,       label: 'Added',     color: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600' },
  REMOVED:   { icon: <Minus className="w-3 h-3" />,      label: 'Removed',   color: 'bg-red-500/10 border-red-500/20 text-red-600' },
  MODIFIED:  { icon: <AlertCircle className="w-3 h-3" />, label: 'Modified',  color: 'bg-amber-500/10 border-amber-500/20 text-amber-600' },
  UNCHANGED: { icon: <Equal className="w-3 h-3" />,       label: 'Unchanged', color: 'bg-black/[0.04] border-black/10 text-[#6B6B63]' },
}

function SectionCard({ section }: { section: DiffSection }) {
  const [open, setOpen] = useState(section.change_type !== 'UNCHANGED')
  const cfg = CHANGE_CONFIG[section.change_type]

  return (
    <div className={`border rounded-lg overflow-hidden ${cfg.color}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 p-3 text-left hover:opacity-80 transition-opacity"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />}
        <span className="flex-shrink-0">{cfg.icon}</span>
        <span className="flex-1 text-sm font-medium truncate">{section.section}</span>
        <span className="text-xs opacity-60 flex-shrink-0">{cfg.label}</span>
        {section.page_old && <span className="text-xs opacity-50 flex-shrink-0">p.{section.page_old}</span>}
        <span className="text-xs opacity-40 font-mono flex-shrink-0">{(section.similarity * 100).toFixed(0)}%</span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-current/10 pt-3">
          {section.semantic_diff && section.change_type !== 'UNCHANGED' && (
            <div className="bg-black/[0.04] rounded p-3">
              <p className="text-xs opacity-60 mb-1 font-semibold uppercase tracking-wide">Semantic change</p>
              <p className="text-sm opacity-90 leading-relaxed">{section.semantic_diff}</p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {section.old_summary && (
              <div>
                <p className="text-xs opacity-50 mb-1 font-medium">Before {section.page_old ? `(p.${section.page_old})` : ''}</p>
                <p className="text-xs opacity-70 line-clamp-4 leading-relaxed">{section.old_summary}</p>
              </div>
            )}
            {section.new_summary && (
              <div>
                <p className="text-xs opacity-50 mb-1 font-medium">After {section.page_new ? `(p.${section.page_new})` : ''}</p>
                <p className="text-xs opacity-70 line-clamp-4 leading-relaxed">{section.new_summary}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface DiffViewerProps {
  sections: DiffSection[]
}

export function DiffViewer({ sections }: DiffViewerProps) {
  const [filter, setFilter] = useState<'ALL' | DiffSection['change_type']>('ALL')

  const counts = {
    ADDED:     sections.filter(s => s.change_type === 'ADDED').length,
    REMOVED:   sections.filter(s => s.change_type === 'REMOVED').length,
    MODIFIED:  sections.filter(s => s.change_type === 'MODIFIED').length,
    UNCHANGED: sections.filter(s => s.change_type === 'UNCHANGED').length,
  }

  const filtered = sections.filter(s => filter === 'ALL' || s.change_type === filter)

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {(['ALL', 'MODIFIED', 'ADDED', 'REMOVED', 'UNCHANGED'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              filter === f
                ? 'bg-accent-600 border-accent-500 text-white'
                : 'bg-white border-black/10 text-[#6B6B63] hover:border-black/10'
            }`}
          >
            {f} {f !== 'ALL' ? `(${counts[f]})` : `(${sections.length})`}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {filtered.map((s, i) => <SectionCard key={i} section={s} />)}
      </div>
    </div>
  )
}
