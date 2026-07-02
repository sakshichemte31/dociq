// src/components/chat/ExportButton.tsx
import { useState } from 'react'
import { Download, FileText, Code } from 'lucide-react'
import type { QueryResult } from '@/types'

interface Props {
  docName: string
  messages: Array<{ role: 'user' | 'assistant'; content: string; faithfulnessScore?: number; createdAt?: string }>
}

export default function ExportButton({ docName, messages }: Props) {
  const [open, setOpen] = useState(false)

  const exportMarkdown = () => {
    const lines = [
      `# DocIQ Chat Export`,
      `**Document:** ${docName}`,
      `**Exported:** ${new Date().toLocaleString()}`,
      `---`,
      '',
    ]
    for (const m of messages) {
      if (m.role === 'user') {
        lines.push(`### 🙋 Question`)
        lines.push(m.content)
      } else {
        lines.push(`### 🤖 Answer`)
        if (m.faithfulnessScore !== undefined) {
          lines.push(`*Faithfulness: ${Math.round(m.faithfulnessScore * 100)}%*`)
        }
        lines.push(m.content)
      }
      lines.push('')
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dociq-chat-${docName.replace(/\.pdf$/i, '')}.md`
    a.click()
    URL.revokeObjectURL(url)
    setOpen(false)
  }

  const exportJson = () => {
    const payload = {
      document: docName,
      exported_at: new Date().toISOString(),
      messages,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dociq-chat-${docName.replace(/\.pdf$/i, '')}.json`
    a.click()
    URL.revokeObjectURL(url)
    setOpen(false)
  }

  if (messages.length === 0) return null

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="p-1.5 rounded hover:bg-[#F0EFE9] text-[#6B6B63] hover:text-[#1A1A18] transition-colors"
        title="Export chat"
      >
        <Download className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-20 bg-white border border-black/10 rounded-xl shadow-xl overflow-hidden w-44">
            <button
              onClick={exportMarkdown}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm text-[#1A1A18] hover:bg-[#F0EFE9] hover:text-[#1A1A18] transition-colors"
            >
              <FileText className="w-4 h-4 text-accent-500" />
              Export as .md
            </button>
            <button
              onClick={exportJson}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm text-[#1A1A18] hover:bg-[#F0EFE9] hover:text-[#1A1A18] transition-colors"
            >
              <Code className="w-4 h-4 text-amber-600" />
              Export as .json
            </button>
          </div>
        </>
      )}
    </div>
  )
}
