import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Loader2, FileText, Clock, Eye, EyeOff, CheckCircle2, Circle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { authApi } from '@/lib/api'
import { useAuthStore } from '@/store'

// Only ever hand back an in-app path — never let an open redirect param
// send someone off-site.
function safeRedirectTarget(raw: string | null): string {
  if (!raw) return '/'
  try {
    const decoded = decodeURIComponent(raw)
    return decoded.startsWith('/') && !decoded.startsWith('//') ? decoded : '/'
  } catch {
    return '/'
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setAuth } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({})
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'login' | 'register'>('login')

  const redirectTo = safeRedirectTarget(searchParams.get('redirect'))
  const sessionExpired = searchParams.get('reason') === 'expired'

  const trimmedEmail = email.trim()
  const emailValid = trimmedEmail.length === 0 || EMAIL_RE.test(trimmedEmail)
  const passwordRules = useMemo(() => ({
    length: password.length >= 8,
    notEmail: password.length === 0 || password.toLowerCase() !== trimmedEmail.toLowerCase(),
  }), [password, trimmedEmail])

  const canSubmit =
    trimmedEmail.length > 0 &&
    EMAIL_RE.test(trimmedEmail) &&
    password.length >= 8 &&
    (mode === 'login' || passwordRules.notEmail) &&
    !loading

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched({ email: true, password: true })
    setError('')

    if (!EMAIL_RE.test(trimmedEmail)) {
      setError('Enter a valid email address')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    try {
      const resp = mode === 'login'
        ? await authApi.login(trimmedEmail, password)
        : await authApi.register(trimmedEmail, password, fullName)
      setAuth({
        accessToken: resp.accessToken,
        refreshToken: resp.refreshToken,
        userId: resp.userId,
        email: resp.email,
        fullName: resp.fullName,
      })
      navigate(redirectTo, { replace: true })
    } catch (err: any) {
      if (!err.response) {
        setError('Can\u2019t reach the server. Check your connection and try again.')
      } else if (err.response.status === 401) {
        setError('Incorrect email or password')
      } else if (err.response.status === 409 || /already registered/i.test(err.response?.data?.detail || '')) {
        setError('An account with this email already exists')
      } else {
        setError(err.response?.data?.detail || err.response?.data?.message || 'Authentication failed')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center p-4">
      {/* Subtle warm radial glow */}
      <div className="fixed inset-0 pointer-events-none" style={{
        background: 'radial-gradient(50% 50% at 50% 40%, rgba(249,115,22,0.06) 0%, transparent 70%)'
      }} />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-sm space-y-6 relative"
      >
        {/* Brand */}
        <div className="text-center space-y-3">
          <motion.div
            whileHover={{ rotate: -5, scale: 1.05 }}
            className="inline-flex w-12 h-12 bg-accent-500 rounded-2xl items-center justify-center shadow-accent mx-auto cursor-default"
          >
            <FileText className="w-6 h-6 text-white" />
          </motion.div>
          <div>
            <h1 className="text-2xl font-bold text-[#1A1A18]">DocIQ</h1>
            <p className="text-sm text-[#6B6B63] mt-0.5">AI Document Intelligence</p>
          </div>
        </div>

        {sessionExpired && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5"
          >
            <Clock className="w-3.5 h-3.5 shrink-0" />
            Your session expired. Please sign in again to continue.
          </motion.div>
        )}

        {/* Card */}
        <div className="bg-white border border-black/8 rounded-2xl shadow-card p-7 space-y-5">
          {/* Mode tabs */}
          <div className="flex bg-[#F0EFE9] rounded-lg p-0.5">
            {(['login', 'register'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(''); setTouched({}) }}
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all capitalize ${
                  mode === m ? 'bg-white text-[#1A1A18] shadow-soft' : 'text-[#6B6B63] hover:text-[#1A1A18]'
                }`}
              >
                {m === 'login' ? 'Sign in' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <AnimatePresence>
              {mode === 'register' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <label htmlFor="fullName" className="block text-xs font-medium text-[#6B6B63] mb-1.5">Full name</label>
                  <input
                    id="fullName"
                    type="text" value={fullName}
                    autoComplete="name"
                    onChange={e => setFullName(e.target.value)}
                    className="w-full bg-[#FAFAF8] border border-black/10 rounded-lg px-3 py-2.5 text-sm text-[#1A1A18] placeholder-[#A8A89C] focus:outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-400/15 transition-all"
                    placeholder="Jane Smith"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <label htmlFor="email" className="block text-xs font-medium text-[#6B6B63] mb-1.5">Email</label>
              <input
                id="email"
                type="email" value={email} required
                autoComplete="email"
                onChange={e => setEmail(e.target.value)}
                onBlur={() => setTouched(t => ({ ...t, email: true }))}
                aria-invalid={touched.email && !emailValid}
                className={`w-full bg-[#FAFAF8] border rounded-lg px-3 py-2.5 text-sm text-[#1A1A18] placeholder-[#A8A89C] focus:outline-none focus:ring-2 transition-all ${
                  touched.email && !emailValid
                    ? 'border-red-300 focus:border-red-400 focus:ring-red-400/15'
                    : 'border-black/10 focus:border-accent-400 focus:ring-accent-400/15'
                }`}
                placeholder="you@example.com"
              />
              {touched.email && !emailValid && (
                <p className="text-xs text-red-600 mt-1">Enter a valid email address</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-medium text-[#6B6B63] mb-1.5">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password} required minLength={8}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  onChange={e => setPassword(e.target.value)}
                  onBlur={() => setTouched(t => ({ ...t, password: true }))}
                  className="w-full bg-[#FAFAF8] border border-black/10 rounded-lg pl-3 pr-10 py-2.5 text-sm text-[#1A1A18] placeholder-[#A8A89C] focus:outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-400/15 transition-all"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  tabIndex={-1}
                  className="absolute right-0 top-0 h-full px-3 flex items-center text-[#A8A89C] hover:text-[#6B6B63] transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {mode === 'register' && password.length > 0 && (
                <div className="mt-2 space-y-1">
                  <PasswordRule ok={passwordRules.length} label="At least 8 characters" />
                  <PasswordRule ok={passwordRules.notEmail} label="Different from your email" />
                </div>
              )}
            </div>

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  role="alert"
                  className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <motion.button
              type="submit" disabled={!canSubmit}
              whileHover={canSubmit ? { scale: 1.015 } : undefined}
              whileTap={canSubmit ? { scale: 0.98 } : undefined}
              className="w-full flex items-center justify-center gap-2 bg-accent-500 hover:bg-accent-600 disabled:bg-[#D4D4C8] disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg shadow-accent transition-all text-sm"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </motion.button>
          </form>
        </div>

        <p className="text-center text-xs text-[#A8A89C]">
          DocIQ · AI-powered document intelligence
        </p>
      </motion.div>
    </div>
  )
}

function PasswordRule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs ${ok ? 'text-emerald-600' : 'text-[#A8A89C]'}`}>
      {ok ? <CheckCircle2 className="w-3 h-3" /> : <Circle className="w-3 h-3" />}
      {label}
    </div>
  )
}
