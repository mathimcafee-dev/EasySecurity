import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { signOut } from '../lib/supabase'

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
            <path d="M9 1.5L2.5 4.2v4.8c0 3.8 2.7 7.2 6.5 8.2 3.8-1 6.5-4.4 6.5-8.2V4.2L9 1.5z" fill="white" opacity=".9"/>
            <rect x="6.5" y="10" width="5" height="4" rx="1" fill="white" opacity=".5"/>
            <path d="M7.5 10V8.5a1.5 1.5 0 013 0V10" stroke="white" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity=".8"/>
          </svg>
        </div>
        <span className="logo-text">EasySecurity</span>
        <span className="logo-badge">easysecurity.in</span>
      </a>

      <div className="nav-links">
        {[['/', 'Scanner'], ['/free-ssl', '🔒 Free SSL'], ['/decode', 'Decode CSR'], ['/jks', 'JKS Inspector'], ['/match', 'Key Match'], ['/convert', 'Convert'], ['/dns', 'DNS'], ['/compare', 'Compare'], ['/renew', 'Renew'], ['/monitor', 'Monitor'], ['/api-keys', 'API'], ['/docs', 'Docs'], ['/notifications', '🔔 Alerts'], ['/about', 'About']].map(([path, label]) => (
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
          <button className="btn btn-secondary btn-sm" onClick={() => nav('/auth')}>Sign in →</button>
        )}
      </div>
    </nav>
  )
}
