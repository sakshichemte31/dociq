import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store'
import { Layout } from '@/components/ui/Layout'
import { WebSocketProvider } from '@/hooks/useWebSocket'
import LoginPage from '@/pages/LoginPage'
import DocumentsPage from '@/pages/DocumentsPage'
import UploadPage from '@/pages/UploadPage'
import ChatPage from '@/pages/ChatPage'
import DiffPage from '@/pages/DiffPage'
import AnalyticsPage from '@/pages/AnalyticsPage'
import MultiDocPage from '@/pages/MultiDocPage'
import GraphPage from '@/pages/GraphPage'
import SharePage from '@/pages/SharePage'

function ProtectedRoute({ children, fullscreen = false }: { children: React.ReactNode; fullscreen?: boolean }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated())
  const location = useLocation()
  if (!isAuthenticated) {
    // Remember where the person was headed so login can send them straight
    // back after they sign in, instead of dumping them on the documents list.
    const redirect = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?redirect=${redirect}`} replace />
  }
  return <Layout fullscreen={fullscreen}>{children}</Layout>
}

export default function App() {
  return (
    <WebSocketProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute><DocumentsPage /></ProtectedRoute>} />
          <Route path="/upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
          <Route
            path="/chat/:docId"
            element={<ProtectedRoute fullscreen><ChatPage /></ProtectedRoute>}
          />
          <Route path="/diff" element={<ProtectedRoute><DiffPage /></ProtectedRoute>} />
          <Route path="/analytics" element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />
          <Route path="/multi-query" element={<ProtectedRoute><MultiDocPage /></ProtectedRoute>} />
          <Route path="/graph/:docId" element={<ProtectedRoute fullscreen><GraphPage /></ProtectedRoute>} />
          <Route path="/share/:token" element={<SharePage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </WebSocketProvider>
  )
}
