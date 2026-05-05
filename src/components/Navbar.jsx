import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { signInWithGoogle, signOut } from '../lib/supabase'

export default function Navbar() {
  const nav = useNavigate()
  const loc = useLocation()
  const { user } = useAuth()
  const active = (p) => loc.pathname === p ? 'nav-link active' : 'nav-link'

  return (
    <nav className="nav">
      <a className="nav-logo" href="/" onClick={e => { e.preventDefault(); nav('/') }}>
        <div className="logo-mark">
          <svg viewBox="0 0 18 18" fill="none">
            <rect x="2" y="2" width="6" height="6" rx="1.5" fill="white" opacity=".9"/>
            <rect x="10" y="2" width="6" height="6" rx="1.5" fill="white" opacity=".6"/>
            <rect x="2" y="10" width="6" height="6" rx="1.5" fill="white" opacity=".6"/>
            <rect x="10" y="10" width="6" height="6" rx="1.5" fill="white" opacity=".25"/>
          </svg>
        </div>
        <span className="logo-text">EasyCerts</span>
        <span className="logo-badge">easysecurity.in</span>
      </a>

      <div className="nav-links">
        {[['/', 'Scanner'], ['/decode', 'Decode CSR'], ['/jks', 'JKS Inspector'], ['/match', 'Key Match'], ['/convert', 'Convert'], ['/dns', 'DNS'], ['/compare', 'Compare'], ['/renew', 'Renew'], ['/monitor', 'Monitor'], ['/api-keys', 'API'], ['/docs', 'Docs'], ['/notifications', '🔔 Alerts'], ['/about', 'About']].map(([path, label]) => (
          <button key={path} className={active(path)} onClick={() => nav(path)}>{label}</button>
        ))}
      </div>

      <div className="nav-right">
        {user ? (
          <>
            <div className="nav-user" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="user-avatar">{user.email?.[0]?.toUpperCase()}</div>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{user.email?.split('@')[0]}</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => signOut()}>Sign out</button>
          </>
        ) : (
          <button className="btn btn-secondary btn-sm" onClick={() => signInWithGoogle()}>Sign in →</button>
        )}
      </div>
    </nav>
  )
}
