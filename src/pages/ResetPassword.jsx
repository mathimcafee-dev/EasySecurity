import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, updatePassword } from '../lib/supabase'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [validSession, setValidSession] = useState(false)

  useEffect(() => {
    // Check if we have a valid recovery session from email link
    supabase.auth.onAuthStateChange(async (event) => {
      if (event === 'PASSWORD_RECOVERY') setValidSession(true)
    })
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setValidSession(true)
    })
  }, [])

  const handleReset = async () => {
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    const { error: e } = await updatePassword(password)
    setLoading(false)
    if (e) { setError(e.message); return }
    setSuccess(true)
    setTimeout(() => navigate('/auth'), 2000)
  }

  if (!validSession) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="card" style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Invalid or expired link</div>
        <div style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 16 }}>This password reset link has expired or already been used.</div>
        <button className="btn btn-primary" onClick={() => navigate('/auth')}>Go to Sign In</button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--teal)' }}>🔐 EasyCerts</div>
        </div>
        <div className="card">
          {success ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Password updated!</div>
              <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Redirecting to sign in...</div>
            </div>
          ) : (
            <>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Set New Password</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>Choose a strong password for your account.</div>
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label>New Password</label>
                <input type="password" placeholder="Min 8 characters" value={password}
                  onChange={e => setPassword(e.target.value)} autoFocus />
              </div>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label>Confirm Password</label>
                <input type="password" placeholder="Repeat password" value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleReset()} />
              </div>
              {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleReset} disabled={loading}>
                {loading ? <><span className="spinner"></span> Updating...</> : '🔑 Update Password'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
