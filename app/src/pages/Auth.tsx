import { useState } from 'react'
import { useStore } from '../store'
import { hasSupabase } from '../lib/supabase'

export function AuthPage() {
  const { login, signup } = useStore()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [signupDone, setSignupDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.')
      return
    }
    setLoading(true)
    try {
      if (mode === 'login') {
        await login(email.trim(), password)
      } else {
        await signup(email.trim(), password)
        setSignupDone(true)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0d0f1a] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold">L</div>
          <span className="text-white font-semibold text-lg tracking-tight">LabelKit</span>
        </div>

        {!hasSupabase ? (
          <div className="bg-[#141624] border border-amber-700/40 rounded-xl px-6 py-8 text-center space-y-3">
            <p className="text-amber-400 text-sm font-medium">Supabase not configured</p>
            <p className="text-slate-400 text-xs">
              Add <code className="text-indigo-400">VITE_SUPABASE_URL</code> and{' '}
              <code className="text-indigo-400">VITE_SUPABASE_ANON_KEY</code> to your{' '}
              <code className="text-slate-300">.env</code> file, then restart the dev server.
            </p>
          </div>
        ) : signupDone ? (
          <div className="bg-[#141624] border border-[#2a2d42] rounded-xl px-6 py-8 text-center space-y-3">
            <div className="text-3xl">✉️</div>
            <p className="text-white font-medium">Check your email</p>
            <p className="text-slate-400 text-sm">
              We sent a confirmation link to <span className="text-slate-200">{email}</span>.
              Click it to activate your account, then sign in.
            </p>
            <button
              onClick={() => { setMode('login'); setSignupDone(false) }}
              className="text-indigo-400 hover:text-indigo-300 text-sm"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <div className="bg-[#141624] border border-[#2a2d42] rounded-xl shadow-2xl overflow-hidden">
            {/* Tab toggle */}
            <div className="flex border-b border-[#2a2d42]">
              <button
                onClick={() => { setMode('login'); setError('') }}
                className={`flex-1 py-3 text-sm font-medium transition-colors ${mode === 'login' ? 'text-white bg-[#1c1f33]' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Sign in
              </button>
              <button
                onClick={() => { setMode('signup'); setError('') }}
                className={`flex-1 py-3 text-sm font-medium border-l border-[#2a2d42] transition-colors ${mode === 'signup' ? 'text-white bg-[#1c1f33]' : 'text-slate-500 hover:text-slate-300'}`}
              >
                Create account
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoFocus
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 rounded-md border border-[#2a2d42] bg-[#0d0f1a] text-slate-200 text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 rounded-md border border-[#2a2d42] bg-[#0d0f1a] text-slate-200 text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              {error && <p className="text-red-400 text-xs">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-md transition-colors"
              >
                {loading
                  ? (mode === 'login' ? 'Signing in…' : 'Creating account…')
                  : (mode === 'login' ? 'Sign in' : 'Create account')}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
