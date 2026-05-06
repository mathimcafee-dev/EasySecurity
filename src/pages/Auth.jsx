import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { signIn, signUp, resetPassword } from '../lib/supabase'

export default function Auth() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from || '/monitor'
  const [mode, setMode] = useState('login') // login | signup | forgot
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async () => {
    setError(''); setSuccess('')
    if (!email.trim()) { setError('Email is required'); return }

    if (mode === 'forgot') {
      setLoading(true)
      const { error: e } = await resetPassword(email.trim())
      setLoading(false)
      if (e) setError(e.message)
      else setSuccess('Password reset email sent! Check your inbox.')
      return
    }

    if (!password) { setError('Password is required'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }

    if (mode === 'signup') {
      if (!name.trim()) { setError('Full name is required'); return }
      if (password !== confirm) { setError('Passwords do not match'); return }
      setLoading(true)
      const { error: e } = await signUp(email.trim(), password, name.trim())
      setLoading(false)
      if (e) { setError(e.message); return }
      setSuccess('Account created! Please check your email to verify your account, then sign in.')
      setMode('login')
      return
    }

    // Login
    setLoading(true)
    const { error: e } = await signIn(email.trim(), password)
    setLoading(false)
    if (e) { setError(e.message); return }
    navigate(from)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--teal)', letterSpacing: '-1px', marginBottom: 4 }}>
            🔒 EasySecurity
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)' }}>SSL Certificate Management Platform</div>
        </div>

        <div className="card">
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 24, background: 'var(--slate-9)', borderRadius: 8, padding: 4 }}>
            {[['login','Sign In'],['signup','Create Account']].map(([m, label]) => (
              <button key={m} onClick={() => { setMode(m); setError(''); setSuccess('') }}
                style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                  background: mode === m ? 'var(--bg)' : 'transparent',
                  color: mode === m ? 'var(--teal)' : 'var(--text-3)',
                  boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
                  transition: 'all .15s' }}>
                {label}
              </button>
            ))}
          </div>

          {mode === 'forgot' ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Reset Password</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>
                Enter your email and we'll send a reset link.
              </div>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Email Address</label>
                <input type="email" placeholder="you@example.com" value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()} autoFocus />
              </div>
              {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
              {success && <div className="alert alert-success" style={{ marginBottom: 12 }}>{success}</div>}
              <button className="btn btn-primary" style={{ width: '100%', marginBottom: 12 }} onClick={handleSubmit} disabled={loading}>
                {loading ? <><span className="spinner"></span> Sending...</> : '📧 Send Reset Link'}
              </button>
              <button className="btn btn-ghost" style={{ width: '100%' }} onClick={() => { setMode('login'); setError(''); setSuccess('') }}>
                ← Back to Sign In
              </button>
            </>
          ) : (
            <>
              {mode === 'signup' && (
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label>Full Name</label>
                  <input type="text" placeholder="Your full name" value={name}
                    onChange={e => setName(e.target.value)} autoFocus />
                </div>
              )}
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label>Email Address</label>
                <input type="email" placeholder="you@example.com" value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoFocus={mode === 'login'} />
              </div>
              <div className="form-group" style={{ marginBottom: mode === 'signup' ? 14 : 8 }}>
                <label>Password</label>
                <input type="password" placeholder={mode === 'signup' ? 'Min 8 characters' : 'Your password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && mode === 'login' && handleSubmit()} />
              </div>
              {mode === 'signup' && (
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label>Confirm Password</label>
                  <input type="password" placeholder="Repeat password" value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
                </div>
              )}
              {mode === 'login' && (
                <div style={{ textAlign: 'right', marginBottom: 16 }}>
                  <button onClick={() => { setMode('forgot'); setError('') }}
                    style={{ background: 'none', border: 'none', color: 'var(--teal)', fontSize: 12, cursor: 'pointer', padding: 0 }}>
                    Forgot password?
                  </button>
                </div>
              )}
              {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
              {success && <div className="alert alert-success" style={{ marginBottom: 12 }}>{success}</div>}
              <button className="btn btn-primary btn-lg" style={{ width: '100%' }} onClick={handleSubmit} disabled={loading}>
                {loading
                  ? <><span className="spinner"></span> {mode === 'signup' ? 'Creating account...' : 'Signing in...'}</>
                  : mode === 'signup' ? '🚀 Create Account' : '🔑 Sign In'
                }
              </button>
              {mode === 'signup' && (
                <div style={{ fontSize: 11, color: 'var(--text-4)', textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>
                  By creating an account you agree to our Terms of Service and Privacy Policy.
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 12, color: 'var(--text-4)' }}>
          🔒 EasySecurity — Secure Certificate Management
        </div>
      </div>
    </div>
  )
}
