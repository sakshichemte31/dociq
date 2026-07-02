import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText, Upload, Layers, GitCompare, BarChart3,
  LogOut, ChevronLeft, ChevronRight, Plus,
} from 'lucide-react'
import { useAuthStore } from '@/store'
import { authApi } from '@/lib/api'

interface LayoutProps {
  children: React.ReactNode
  fullscreen?: boolean
}

const NAV = [
  { path: '/',            label: 'Documents',  icon: FileText  },
  { path: '/upload',      label: 'Upload',     icon: Upload    },
  { path: '/multi-query', label: 'Multi-Doc',  icon: Layers    },
  { path: '/diff',        label: 'Diff',       icon: GitCompare},
  { path: '/analytics',   label: 'Analytics',  icon: BarChart3 },
]

function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { fullName, email, clearAuth } = useAuthStore()
  const [collapsed, setCollapsed] = useState(false)
  const initials = (fullName || email || '?')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <motion.aside
      animate={{ width: collapsed ? 60 : 240 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="relative flex flex-col h-screen bg-[#F0EFE9] border-r border-black/8 shrink-0 overflow-hidden z-10"
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-black/6">
        <motion.div
          whileHover={{ rotate: -5, scale: 1.08 }}
          className="w-7 h-7 bg-accent-500 rounded-lg flex items-center justify-center shadow-accent shrink-0 cursor-pointer"
          onClick={() => navigate('/')}
        >
          <FileText className="w-3.5 h-3.5 text-white" />
        </motion.div>
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.15 }}
              className="font-semibold text-[#1A1A18] text-sm tracking-tight"
            >
              DocIQ
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* New upload shortcut */}
      <div className="px-3 pt-3 pb-2">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate('/upload')}
          className={`flex items-center gap-2 w-full px-3 py-2 bg-accent-500 hover:bg-accent-600 text-white text-sm font-medium rounded-lg shadow-accent transition-colors ${collapsed ? 'justify-center' : ''}`}
        >
          <Plus className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Upload PDF</span>}
        </motion.button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-1 space-y-0.5 overflow-y-auto">
        {NAV.map(({ path, label, icon: Icon }) => {
          const active = location.pathname === path
          return (
            <motion.button
              key={path}
              onClick={() => navigate(path)}
              whileHover={{ x: 2 }}
              whileTap={{ scale: 0.97 }}
              className={`relative flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? 'text-[#1A1A18] font-medium'
                  : 'text-[#6B6B63] hover:bg-black/5 hover:text-[#1A1A18]'
              } ${collapsed ? 'justify-center' : ''}`}
            >
              {active && (
                <motion.div
                  layoutId="sidebar-active-pill"
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  className="absolute inset-0 bg-white/70 rounded-lg shadow-soft"
                />
              )}
              <Icon className="w-4 h-4 shrink-0 relative" />
              {!collapsed && <span className="relative">{label}</span>}
            </motion.button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-3 space-y-1 border-t border-black/6 pt-2">
        <div className={`flex items-center gap-2.5 px-2 py-2 ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-7 h-7 rounded-full bg-accent-500/15 flex items-center justify-center text-accent-600 text-xs font-semibold shrink-0">
            {initials}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#1A1A18] truncate">{fullName || email}</p>
              <p className="text-[10px] text-[#6B6B63] truncate">{fullName ? email : ''}</p>
            </div>
          )}
          {!collapsed && (
            <motion.button
              whileHover={{ scale: 1.1, color: '#ef4444' }}
              whileTap={{ scale: 0.9 }}
              onClick={async () => { await authApi.logout(); clearAuth(); navigate('/login') }}
              className="text-[#6B6B63] transition-colors"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </motion.button>
          )}
        </div>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="absolute top-[52px] -right-3 w-6 h-6 bg-white border border-black/10 rounded-full flex items-center justify-center shadow-soft hover:shadow-card transition-shadow z-20"
      >
        {collapsed
          ? <ChevronRight className="w-3 h-3 text-[#6B6B63]" />
          : <ChevronLeft  className="w-3 h-3 text-[#6B6B63]" />
        }
      </button>
    </motion.aside>
  )
}

export function Layout({ children, fullscreen = false }: LayoutProps) {
  const location = useLocation()
  if (fullscreen) return <>{children}</>
  return (
    <div className="flex h-screen bg-[#FAFAF8] overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
