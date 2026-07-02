import type { QueryResult } from '@/types'
import { formatDistanceToNow } from 'date-fns'

interface QueryStatsTableProps {
  queries: QueryResult[]
}

const scoreColor = (score: number) =>
  score >= 0.85 ? 'text-emerald-600' : score >= 0.7 ? 'text-amber-600' : 'text-red-600'

export function QueryStatsTable({ queries }: QueryStatsTableProps) {
  if (!queries.length) return (
    <p className="text-[#6B6B63] text-sm text-center py-8">No queries yet</p>
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-black/[0.08]">
            <th className="pb-3 pr-4 text-[#6B6B63] font-medium">Question</th>
            <th className="pb-3 pr-4 text-[#6B6B63] font-medium text-right">Faithfulness</th>
            <th className="pb-3 pr-4 text-[#6B6B63] font-medium text-right">Latency</th>
            <th className="pb-3 text-[#6B6B63] font-medium text-right">When</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/[0.06]">
          {queries.map(q => (
            <tr key={q.id} className="hover:bg-black/5 transition-colors">
              <td className="py-3 pr-4 text-[#1A1A18] max-w-xs">
                <p className="truncate">{q.question}</p>
                {q.status === 'PENDING' && (
                  <span className="text-xs text-amber-600">Processing…</span>
                )}
              </td>
              <td className="py-3 pr-4 text-right">
                {q.faithfulnessScore != null ? (
                  <span className={`font-mono font-medium ${scoreColor(q.faithfulnessScore)}`}>
                    {(q.faithfulnessScore * 100).toFixed(0)}%
                  </span>
                ) : <span className="text-[#A8A89C]">—</span>}
              </td>
              <td className="py-3 pr-4 text-right text-[#6B6B63] font-mono">
                {q.latencyMs ? `${q.latencyMs}ms` : '—'}
              </td>
              <td className="py-3 text-right text-[#A8A89C] text-xs">
                {formatDistanceToNow(new Date(q.createdAt), { addSuffix: true })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
