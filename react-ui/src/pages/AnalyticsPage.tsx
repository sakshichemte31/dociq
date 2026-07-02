import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, Legend, ReferenceLine,
} from 'recharts'
import { TrendingUp, Clock, MessageSquare, ShieldCheck, Info } from 'lucide-react'
import { analyticsApi } from '@/lib/api'
import type { AnalyticsData } from '@/types'

/** Animates a numeric display from 0 up to `value` whenever `value` changes. */
function useCountUp(value: number, duration = 0.6) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    let raf: number
    const start = performance.now()
    const from = 0
    const tick = (now: number) => {
      const t = Math.min((now - start) / (duration * 1000), 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(from + (value - from) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration])
  return display
}

function MetricCard({ icon, label, value, sub, color, numericValue, suffix = '', delay = 0 }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color: string
  numericValue?: number; suffix?: string; delay?: number
}) {
  const animated = useCountUp(numericValue ?? 0)
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35, ease: 'easeOut' }}
      whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.08)' }}
      className="bg-white border border-black/[0.08] rounded-xl p-5 transition-shadow"
    >
      <div className={`inline-flex p-2 rounded-lg mb-3 ${color}`}>{icon}</div>
      <p className="text-2xl font-bold text-[#1A1A18] tabular-nums">
        {numericValue !== undefined ? `${animated.toFixed(suffix === '%' ? 1 : 0)}${suffix}` : value}
      </p>
      <p className="text-sm text-[#6B6B63] mt-0.5">{label}</p>
      {sub && <p className="text-xs text-[#A8A89C] mt-1">{sub}</p>}
    </motion.div>
  )
}

const TOOLTIP_STYLE = {
  contentStyle: { backgroundColor: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: '8px', fontSize: '12px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)' },
  labelStyle: { color: '#1A1A18', fontWeight: 600 },
  itemStyle: { color: '#6B6B63' },
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    analyticsApi.getSummary()
      .then(d => { if (d?.length) setData(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const avg = (fn: (d: AnalyticsData) => number) =>
    data.length ? data.reduce((s, d) => s + fn(d), 0) / data.length : 0
  const avgFaith = avg(d => d.avgFaithfulness)
  const avgP50   = avg(d => d.p50Latency)
  const avgP95   = avg(d => d.p95Latency)
  const total    = data.reduce((s, d) => s + d.queryCount, 0)

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-center h-64">
        <div className="text-[#6B6B63] text-sm">Loading analytics…</div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-xl font-semibold text-[#1A1A18]">Analytics</h2>
            <p className="text-[#6B6B63] text-sm mt-0.5">Last 14 days</p>
          </div>
          <TrendingUp className="w-5 h-5 text-accent-500" />
        </div>
        <div className="bg-white border border-black/[0.08] rounded-xl p-12 text-center">
          <Info className="w-10 h-10 text-[#A8A89C] mx-auto mb-4" />
          <p className="text-[#6B6B63] font-medium">No data yet</p>
          <p className="text-[#A8A89C] text-sm mt-1">
            Upload a document, ask some questions, and analytics will appear here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h2 className="text-xl font-semibold text-[#1A1A18]">Analytics</h2>
          <p className="text-[#6B6B63] text-sm mt-0.5">Last 14 days</p>
        </div>
        <TrendingUp className="w-5 h-5 text-accent-500" />
      </motion.div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={<ShieldCheck className="w-5 h-5 text-emerald-500" />} label="Avg faithfulness"
          value={`${(avgFaith * 100).toFixed(1)}%`} numericValue={avgFaith * 100} suffix="%" sub="Target: ≥ 80%" color="bg-emerald-500/10" delay={0} />
        <MetricCard icon={<Clock className="w-5 h-5 text-accent-500" />} label="P50 latency"
          value={`${Math.round(avgP50)}ms`} numericValue={avgP50} suffix="ms" sub="Median response" color="bg-accent-500/10" delay={0.05} />
        <MetricCard icon={<Clock className="w-5 h-5 text-amber-500" />} label="P95 latency"
          value={`${Math.round(avgP95)}ms`} numericValue={avgP95} suffix="ms" sub="95th percentile" color="bg-amber-500/10" delay={0.1} />
        <MetricCard icon={<MessageSquare className="w-5 h-5 text-purple-500" />} label="Total queries"
          value={total.toString()} numericValue={total} sub="14-day window" color="bg-purple-500/10" delay={0.15} />
      </div>

      {/* Faithfulness trend */}
      <motion.div
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        whileHover={{ boxShadow: '0 8px 24px rgba(0,0,0,0.06)' }}
        className="bg-white border border-black/[0.08] rounded-xl p-6 transition-shadow"
      >
        <h3 className="text-sm font-semibold text-[#1A1A18] mb-4">Faithfulness Score Trend</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="faithGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#F97316" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#F97316" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#EBEBEB" />
            <XAxis dataKey="date" tick={{ fill: '#A8A89C', fontSize: 11 }} />
            <YAxis domain={[0, 1]} tickFormatter={v => `${(v * 100).toFixed(0)}%`} tick={{ fill: '#A8A89C', fontSize: 11 }} />
            <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => `${(v * 100).toFixed(1)}%`} />
            <ReferenceLine y={0.8} stroke="#22c55e" strokeDasharray="4 4" label={{ value: '80% target', fill: '#22c55e', fontSize: 10 }} />
            <Area type="monotone" dataKey="avgFaithfulness" stroke="#F97316" fill="url(#faithGrad)" strokeWidth={2} name="Faithfulness"
              isAnimationActive animationDuration={900} animationEasing="ease-out" />
          </AreaChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Latency + Volume side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.4 }}
          whileHover={{ boxShadow: '0 8px 24px rgba(0,0,0,0.06)' }}
          className="bg-white border border-black/[0.08] rounded-xl p-6 transition-shadow"
        >
          <h3 className="text-sm font-semibold text-[#1A1A18] mb-4">Latency P50 / P95 (ms)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EBEBEB" />
              <XAxis dataKey="date" tick={{ fill: '#A8A89C', fontSize: 10 }} />
              <YAxis tick={{ fill: '#A8A89C', fontSize: 10 }} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v: number) => `${Math.round(v)}ms`} />
              <Legend wrapperStyle={{ fontSize: '11px', color: '#A8A89C' }} />
              <Line type="monotone" dataKey="p50Latency" stroke="#F97316" strokeWidth={2} dot={false} name="P50"
                isAnimationActive animationDuration={900} animationEasing="ease-out" />
              <Line type="monotone" dataKey="p95Latency" stroke="#EA6C0A" strokeWidth={2} dot={false} name="P95"
                isAnimationActive animationDuration={900} animationEasing="ease-out" />
            </LineChart>
          </ResponsiveContainer>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.36, duration: 0.4 }}
          whileHover={{ boxShadow: '0 8px 24px rgba(0,0,0,0.06)' }}
          className="bg-white border border-black/[0.08] rounded-xl p-6 transition-shadow"
        >
          <h3 className="text-sm font-semibold text-[#1A1A18] mb-4">Queries per Day</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EBEBEB" />
              <XAxis dataKey="date" tick={{ fill: '#A8A89C', fontSize: 10 }} />
              <YAxis tick={{ fill: '#A8A89C', fontSize: 10 }} />
              <Tooltip {...TOOLTIP_STYLE} />
              <Bar dataKey="queryCount" fill="#F97316" radius={[3, 3, 0, 0]} name="Queries"
                isAnimationActive animationDuration={900} animationEasing="ease-out" />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      </div>
    </div>
  )
}
