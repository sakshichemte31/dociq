import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import api from '@/lib/api'

interface GraphNode {
  id: string
  label: string
  type: 'person' | 'organization' | 'concept' | 'date' | 'location' | 'technology' | 'other'
  page?: number
  x?: number
  y?: number
  vx?: number
  vy?: number
}

interface GraphEdge {
  source: string
  target: string
  label: string
}

interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

const NODE_COLORS: Record<GraphNode['type'], { fill: string; stroke: string; text: string }> = {
  person:       { fill: '#CECBF6', stroke: '#534AB7', text: '#26215C' },
  organization: { fill: '#9FE1CB', stroke: '#0F6E56', text: '#04342C' },
  concept:      { fill: '#B5D4F4', stroke: '#185FA5', text: '#042C53' },
  technology:   { fill: '#F5C4B3', stroke: '#993C1D', text: '#4A1B0C' },
  location:     { fill: '#C0DD97', stroke: '#3B6D11', text: '#173404' },
  date:         { fill: '#FAC775', stroke: '#854F0B', text: '#412402' },
  other:        { fill: '#D3D1C7', stroke: '#5F5E5A', text: '#2C2C2A' },
}

const NODE_RADIUS = 28

export default function GraphPage() {
  const { docId } = useParams<{ docId: string }>()
  const navigate = useNavigate()
  const svgRef = useRef<SVGSVGElement>(null)
  const [graph, setGraph] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [selected, setSelected] = useState<GraphNode | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState<{ nodeId: string | null; panStart: { x: number; y: number } | null }>({ nodeId: null, panStart: null })
  const frameRef = useRef<number>(0)
  const simNodes = useRef<GraphNode[]>([])
  const simRunning = useRef(false)

  const fetchGraph = useCallback(async () => {
    if (!docId) return
    setLoading(true); setError('')
    try {
      const res = await api.get<GraphData>(`/api/documents/${docId}/graph`)
      const data = res.data
      const W = 900, H = 600
      // Initialize node positions in a circle
      const initialNodes = data.nodes.map((n, i) => ({
        ...n,
        x: W / 2 + Math.cos((i / data.nodes.length) * 2 * Math.PI) * 220,
        y: H / 2 + Math.sin((i / data.nodes.length) * 2 * Math.PI) * 160,
        vx: 0, vy: 0,
      }))
      setGraph(data)
      simNodes.current = initialNodes
      setNodes([...initialNodes])
      runSimulation(data, initialNodes)
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to generate knowledge graph')
    } finally {
      setLoading(false)
    }
  }, [docId])

  const runSimulation = useCallback((data: GraphData, initNodes: GraphNode[]) => {
    if (simRunning.current) return
    simRunning.current = true
    let tick = 0
    const edgeMap = new Map<string, string[]>()
    data.edges.forEach(e => {
      if (!edgeMap.has(e.source)) edgeMap.set(e.source, [])
      if (!edgeMap.has(e.target)) edgeMap.set(e.target, [])
      edgeMap.get(e.source)!.push(e.target)
      edgeMap.get(e.target)!.push(e.source)
    })

    const W = 900, H = 600
    const step = () => {
      if (tick > 300) { simRunning.current = false; return }
      tick++
      const ns = simNodes.current
      const alpha = Math.max(0.01, 0.4 * Math.pow(0.96, tick))

      // Repulsion
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const dx = (ns[j].x ?? 0) - (ns[i].x ?? 0)
          const dy = (ns[j].y ?? 0) - (ns[i].y ?? 0)
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const force = (7000 / (dist * dist)) * alpha
          const fx = (dx / dist) * force, fy = (dy / dist) * force
          ns[i].vx = (ns[i].vx ?? 0) - fx; ns[i].vy = (ns[i].vy ?? 0) - fy
          ns[j].vx = (ns[j].vx ?? 0) + fx; ns[j].vy = (ns[j].vy ?? 0) + fy
        }
      }
      // Attraction along edges
      data.edges.forEach(e => {
        const s = ns.find(n => n.id === e.source)
        const t = ns.find(n => n.id === e.target)
        if (!s || !t) return
        const dx = (t.x ?? 0) - (s.x ?? 0), dy = (t.y ?? 0) - (s.y ?? 0)
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = (dist - 140) * 0.04 * alpha
        const fx = (dx / dist) * force, fy = (dy / dist) * force
        s.vx = (s.vx ?? 0) + fx; s.vy = (s.vy ?? 0) + fy
        t.vx = (t.vx ?? 0) - fx; t.vy = (t.vy ?? 0) - fy
      })
      // Gravity toward center + integrate
      ns.forEach(n => {
        const cx = W / 2, cy = H / 2
        n.vx = ((n.vx ?? 0) + (cx - (n.x ?? 0)) * 0.008 * alpha) * 0.82
        n.vy = ((n.vy ?? 0) + (cy - (n.y ?? 0)) * 0.008 * alpha) * 0.82
        n.x = Math.max(NODE_RADIUS + 4, Math.min(W - NODE_RADIUS - 4, (n.x ?? 0) + (n.vx ?? 0)))
        n.y = Math.max(NODE_RADIUS + 4, Math.min(H - NODE_RADIUS - 4, (n.y ?? 0) + (n.vy ?? 0)))
      })
      setNodes([...ns])
      frameRef.current = requestAnimationFrame(step)
    }
    frameRef.current = requestAnimationFrame(step)
  }, [])

  useEffect(() => { fetchGraph() }, [fetchGraph])
  useEffect(() => () => { cancelAnimationFrame(frameRef.current); simRunning.current = false }, [])

  const getNodeById = (id: string) => nodes.find(n => n.id === id)

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation()
    setSelected(nodes.find(n => n.id === nodeId) || null)
    setDragging({ nodeId, panStart: null })
  }

  const handleSvgMouseDown = (e: React.MouseEvent) => {
    if ((e.target as SVGElement).tagName === 'svg' || (e.target as SVGElement).tagName === 'rect') {
      setDragging({ nodeId: null, panStart: { x: e.clientX - pan.x, y: e.clientY - pan.y } })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging.nodeId) {
      const svg = svgRef.current!.getBoundingClientRect()
      const nx = (e.clientX - svg.left - pan.x) / zoom
      const ny = (e.clientY - svg.top - pan.y) / zoom
      simNodes.current = simNodes.current.map(n =>
        n.id === dragging.nodeId ? { ...n, x: nx, y: ny, vx: 0, vy: 0 } : n
      )
      setNodes([...simNodes.current])
    } else if (dragging.panStart) {
      setPan({ x: e.clientX - dragging.panStart.x, y: e.clientY - dragging.panStart.y })
    }
  }

  const handleMouseUp = () => setDragging({ nodeId: null, panStart: null })

  const connectedIds = selected
    ? new Set(graph?.edges.filter(e => e.source === selected.id || e.target === selected.id)
        .flatMap(e => [e.source, e.target]))
    : null

  const typeEntries = graph
    ? Object.entries(
        graph.nodes.reduce<Record<string, number>>((acc, n) => {
          acc[n.type] = (acc[n.type] ?? 0) + 1; return acc
        }, {})
      ).sort((a, b) => b[1] - a[1])
    : []

  return (
    <div style={{ minHeight: '100vh', background: 'var(--surface-0)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '0.5px solid var(--border)', background: 'var(--surface-1)' }}>
        <button onClick={() => navigate(`/chat/${docId}`)} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px', borderRadius: 'var(--radius)' }}>
          <ArrowLeft size={15} /> Back to chat
        </button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>
          Knowledge graph
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setZoom(z => Math.min(2.5, z + 0.15))} title="Zoom in" style={{ padding: '6px', background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}><ZoomIn size={15} /></button>
          <button onClick={() => setZoom(z => Math.max(0.3, z - 0.15))} title="Zoom out" style={{ padding: '6px', background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}><ZoomOut size={15} /></button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} title="Reset view" style={{ padding: '6px', background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}><Maximize2 size={15} /></button>
          <button onClick={() => { cancelAnimationFrame(frameRef.current); simRunning.current = false; fetchGraph() }} title="Regenerate" style={{ padding: '6px', background: 'var(--surface-2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--text-secondary)' }}><RefreshCw size={15} /></button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Graph canvas */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: 'var(--text-secondary)' }}>
              <div style={{ width: 40, height: 40, border: '2px solid var(--border)', borderTopColor: '#F97316', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <p style={{ fontSize: 14 }}>Extracting knowledge graph…</p>
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
          )}
          {error && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ background: 'var(--bg-danger)', color: 'var(--text-danger)', padding: '12px 20px', borderRadius: 'var(--radius)', fontSize: 13 }}>{error}</div>
            </div>
          )}
          {!loading && !error && graph && (
            <svg
              ref={svgRef}
              width="100%" height="100%"
              viewBox="0 0 900 600"
              style={{ cursor: dragging.panStart ? 'grabbing' : 'grab', userSelect: 'none' }}
              onMouseDown={handleSvgMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L0,6 L8,3 z" fill="#888780" />
                </marker>
              </defs>
              <rect width="900" height="600" fill="transparent" />
              <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
                {/* Edges */}
                {graph.edges.map((edge, i) => {
                  const s = getNodeById(edge.source)
                  const t = getNodeById(edge.target)
                  if (!s || !t) return null
                  const sx = s.x ?? 0, sy = s.y ?? 0, tx = t.x ?? 0, ty = t.y ?? 0
                  const dx = tx - sx, dy = ty - sy
                  const dist = Math.sqrt(dx * dx + dy * dy) || 1
                  const ex = tx - (dx / dist) * (NODE_RADIUS + 6)
                  const ey = ty - (dy / dist) * (NODE_RADIUS + 6)
                  const mx = (sx + tx) / 2, my = (sy + ty) / 2
                  const highlighted = selected && (selected.id === edge.source || selected.id === edge.target)
                  const dimmed = selected && !highlighted
                  return (
                    <g key={i} opacity={dimmed ? 0.12 : 1}>
                      <line x1={sx} y1={sy} x2={ex} y2={ey}
                        stroke={highlighted ? '#F97316' : '#B4B2A9'}
                        strokeWidth={highlighted ? 1.8 : 1}
                        markerEnd="url(#arrow)"
                      />
                      <text x={mx} y={my - 5} textAnchor="middle" fontSize="9" fill="#888780"
                        style={{ pointerEvents: 'none' }}>
                        {edge.label}
                      </text>
                    </g>
                  )
                })}
                {/* Nodes */}
                {nodes.map(node => {
                  const c = NODE_COLORS[node.type] ?? NODE_COLORS.other
                  const isSelected = selected?.id === node.id
                  const dimmed = selected && !isSelected && !connectedIds?.has(node.id)
                  const lines = node.label.length > 12
                    ? [node.label.slice(0, 12), node.label.slice(12, 22)]
                    : [node.label]
                  return (
                    <g key={node.id} transform={`translate(${node.x ?? 0},${node.y ?? 0})`}
                      style={{ cursor: 'pointer' }}
                      opacity={dimmed ? 0.18 : 1}
                      onMouseDown={e => handleNodeMouseDown(e, node.id)}>
                      <circle r={NODE_RADIUS} fill={c.fill} stroke={isSelected ? c.stroke : c.stroke}
                        strokeWidth={isSelected ? 2.5 : 1.5} />
                      {lines.map((line, li) => (
                        <text key={li} textAnchor="middle" fontSize="10" fontWeight="500"
                          fill={c.text} y={(li - (lines.length - 1) / 2) * 13}
                          style={{ pointerEvents: 'none' }}>
                          {line}
                        </text>
                      ))}
                      {node.page != null && (
                        <text textAnchor="middle" fontSize="8" fill={c.stroke} y={NODE_RADIUS + 11}
                          style={{ pointerEvents: 'none' }}>
                          p.{node.page}
                        </text>
                      )}
                    </g>
                  )
                })}
              </g>
            </svg>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ width: 240, borderLeft: '0.5px solid var(--border)', background: 'var(--surface-1)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Legend */}
          <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--border)' }}>
            <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Entity types</p>
            {typeEntries.map(([type, count]) => {
              const c = NODE_COLORS[type as GraphNode['type']] ?? NODE_COLORS.other
              return (
                <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: c.fill, border: `1.5px solid ${c.stroke}`, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1, textTransform: 'capitalize' }}>{type}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{count}</span>
                </div>
              )
            })}
          </div>

          {/* Stats */}
          {graph && (
            <div style={{ padding: '12px 16px', borderBottom: '0.5px solid var(--border)', display: 'flex', gap: 16 }}>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 20, fontWeight: 500, color: 'var(--text-primary)' }}>{graph.nodes.length}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>entities</p>
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 20, fontWeight: 500, color: 'var(--text-primary)' }}>{graph.edges.length}</p>
                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>relationships</p>
              </div>
            </div>
          )}

          {/* Selected node detail */}
          {selected ? (
            <div style={{ padding: '14px 16px', flex: 1, overflow: 'auto' }}>
              <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Selected</p>
              <div style={{ background: NODE_COLORS[selected.type]?.fill ?? '#F1EFE8', borderRadius: 8, padding: '10px 12px', marginBottom: 12 }}>
                <p style={{ fontSize: 14, fontWeight: 500, color: NODE_COLORS[selected.type]?.text ?? '#2C2C2A' }}>{selected.label}</p>
                <p style={{ fontSize: 11, color: NODE_COLORS[selected.type]?.stroke ?? '#5F5E5A', marginTop: 2, textTransform: 'capitalize' }}>{selected.type}{selected.page != null ? ` · page ${selected.page}` : ''}</p>
              </div>
              <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Connections</p>
              {graph?.edges
                .filter(e => e.source === selected.id || e.target === selected.id)
                .map((e, i) => {
                  const otherId = e.source === selected.id ? e.target : e.source
                  const other = getNodeById(otherId)
                  const isOut = e.source === selected.id
                  return (
                    <div key={i} style={{ marginBottom: 6, padding: '7px 10px', background: 'var(--surface-0)', borderRadius: 6, cursor: 'pointer' }}
                      onClick={() => setSelected(getNodeById(otherId) || null)}>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{isOut ? '→' : '←'} {e.label}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>{other?.label ?? otherId}</p>
                    </div>
                  )
                })}
            </div>
          ) : (
            <div style={{ padding: '20px 16px', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
              <p>Click a node to explore its connections</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
