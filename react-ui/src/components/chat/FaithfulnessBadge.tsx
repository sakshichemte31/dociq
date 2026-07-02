// src/components/chat/FaithfulnessBadge.tsx
interface FaithfulnessBadgeProps {
  score: number
  showLabel?: boolean
}

export default function FaithfulnessBadge({ score, showLabel = true }: FaithfulnessBadgeProps) {
  const pct = Math.round(score * 100)

  const config =
    score >= 0.85
      ? { label: 'High', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' }
      : score >= 0.7
      ? { label: 'Medium', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' }
      : { label: 'Low', color: 'bg-red-500/10 text-red-600 border-red-500/20' }

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${config.color}`}
      title={`Faithfulness score: ${pct}%`}
    >
      <span className="font-mono">{pct}%</span>
      {showLabel && <span>faithful</span>}
    </span>
  )
}
