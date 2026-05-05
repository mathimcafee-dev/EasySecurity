import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, signInWithGoogle } from '../lib/supabase'
import { dnsLookup } from '../lib/pki'

function RiskBadge({ risk }) {
  const cls = { SECURE: 'badge-secure', LOW: 'badge-low', MEDIUM: 'badge-medium', HIGH: 'badge-high', CRITICAL: 'badge-critical' }
  return <span className={`badge ${cls[risk] || 'badge-neutral'}`}>{risk || '—'}</span>
}

function AddDomainModal({ onAdd, onClose }) {
  const [domain, setDomain] = useState('')
  const [threshold, setThreshold] = useState(30)
  const [interval, setInterval] = useState(24)
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: 420, boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
        <div className="card-title">+ Add Domain to Monitor</div>
        <div className="form-group" style={{ marginBottom: 12 }}><label>Domain / Hostname</label><input placeholder="api.example.com" value={domain} onChange={e => setDomain(e.target.value)} autoFocus /></div>
        <div className="form-grid" style={{ marginBottom: 16 }}>
          <div className="form-group"><label>Alert Threshold (days)</label><input type="number" min={1} max={365} value={threshold} onChange={e => setThreshold(parseInt(e.target.value))} /></div>
          <div className="form-group"><label>Scan Interval (hours)</label><select value={interval} onChange={e => setInterval(parseInt(e.target.value))}><option value={6}>Every 6h</option><option value={12}>Every 12h</option><option value={24}>Every 24h</option><option value={168}>Weekly</option></select></div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" onClick={() => domain.trim() && onAdd({ domain: domain.trim(), threshold, interval })}>Add Domain</button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function Monitor() {
  const { user, loading } = useAuth()
  const [domains, setDomains] = useState([])
  const [fetching, setFetching] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [certRequest, setCertRequest] = useState({})
  const [selectedDomain, setSelectedDomain] = useState(null) // { domain: { step, txtValue, challengeDomain, sessionId, loading, error } }
  const [scanning, setScanning] = useState({})
  const [alerts, setAlerts] = useState([])

  useEffect(() => { if (user) { load(); sendWelcomeEmail() } }, [user])

  const SUPABASE_URL = 'https://zwgdpsuvduexcdzcwjau.supabase.co'

  const sendWelcomeEmail = async () => {
    const key = 'ec_welcome_sent_' + user?.id
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, '1')
    await fetch(SUPABASE_URL + '/functions/v1/send-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'welcome', to: user.email })
    }).catch(() => {})
  }

  const load = async () => {
    setFetching(true)
    const { data } = await supabase.from('ec_monitored_domains').select('*').order('created_at', { ascending: false })
    setDomains(data || [])
    setFetching(false)
  }

  const addDomain = async ({ domain, threshold, interval }) => {
    if (!user) return
    const { error } = await supabase.from('ec_monitored_domains').upsert({ user_id: user.id, domain, alert_threshold_days: threshold, scan_interval_hours: interval }, { onConflict: 'user_id,domain' })
    if (!error) { setShowAdd(false); await load(); triggerScan(domain) }
  }

  const removeDomain = async (id) => {
    await supabase.from('ec_monitored_domains').delete().eq('id', id)
    setDomains(d => d.filter(x => x.id !== id))
  }

  const triggerScan = async (domain) => {
    setScanning(s => ({ ...s, [domain]: true }))
    try {
      const d = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
      // Call real TLS scanner to get actual certificate data
      const res = await fetch('https://zwgdpsuvduexcdzcwjau.supabase.co/functions/v1/tls-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: d })
      })
      const data = await res.json()
      const cert = data.certs?.[0]
      const daysLeft = cert?.daysLeft ?? 0
      const certStart = cert?.notBefore ? new Date(cert.notBefore) : null
      const certExpiry = cert?.notAfter ? new Date(cert.notAfter) : null
      const risk = daysLeft <= 0 ? 'CRITICAL' : daysLeft <= 7 ? 'CRITICAL' : daysLeft <= 15 ? 'HIGH' : daysLeft <= 30 ? 'MEDIUM' : 'SECURE'
      const score = Math.min(100, Math.max(0, daysLeft))
      const algorithm = cert?.sigAlgo || cert?.keyType || 'RSA-2048'
      await supabase.from('ec_monitored_domains').update({
        last_scanned_at: new Date().toISOString(),
        last_risk_level: risk,
        last_score: score,
        last_days_left: daysLeft,
        last_algorithm: algorithm,
        cert_start: certStart?.toISOString() || null,
        cert_expiry: certExpiry?.toISOString() || null
      }).eq('user_id', user.id).eq('domain', d)
      await supabase.from('ec_scan_history').insert({ user_id: user.id, domain: d, risk_level: risk, score, days_left: daysLeft, common_name: cert?.commonName || d })
      await load()
      if (daysLeft >= 0 && daysLeft < 30) setAlerts(a => [...a, { id: Date.now(), msg: `${d} expires in ${daysLeft} days`, risk: daysLeft < 7 ? 'CRITICAL' : 'HIGH' }])
    } catch(e) { console.error('Scan error:', e) }
    setScanning(s => { const n = { ...s }; delete n[domain]; return n })
  }

  const requestCert = async (domain) => {
    const sessionId = crypto.randomUUID().replace(/-/g,'')
    setCertRequest(r => ({ ...r, [domain]: { step: 'loading', loading: true, error: null } }))
    try {
      const res = await fetch('/api/acme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', sessionId, domain, staging: false })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setCertRequest(r => ({ ...r, [domain]: { step: 'dns', loading: false, txtValue: data.txtValue, challengeDomain: data.challengeDomain, sessionId, autoAdded: data.autoAdded } }))
    } catch(e) {
      setCertRequest(r => ({ ...r, [domain]: { step: 'error', loading: false, error: e.message } }))
    }
  }

  const verifyCert = async (domain) => {
    const req = certRequest[domain]
    if (!req) return
    setCertRequest(r => ({ ...r, [domain]: { ...r[domain], loading: true, error: null } }))
    try {
      const res = await fetch('/api/acme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', sessionId: req.sessionId, domain })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (!data.verified) throw new Error(data.message || 'TXT not found yet')
      setCertRequest(r => ({ ...r, [domain]: { ...r[domain], step: 'issuing', loading: true } }))
      // Finalize
      let result = null
      for (let i = 0; i < 5; i++) {
        const fRes = await fetch('/api/acme', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'finalize', sessionId: req.sessionId, domain })
        })
        const fData = await fRes.json()
        if (fData.status === 'issued') { result = fData; break }
        if (fData.error) throw new Error(fData.error)
        await new Promise(r => setTimeout(r, 3000))
      }
      if (!result) throw new Error('Certificate not ready. Try again.')
      // Save private key and cert to DB for later retrieval
      await supabase.from('ec_monitored_domains').update({
        cert_private_key: result.privateKey,
        cert_pem: result.cert,
        cert_issued_at: new Date().toISOString(),
        cert_expiry: new Date(Date.now() + 90 * 86400000).toISOString(),
        cert_start: new Date().toISOString(),
        last_days_left: 90,
        last_algorithm: 'ECDSA P-256'
      }).eq('user_id', user.id).eq('domain', domain)
      await load()
      setCertRequest(r => ({ ...r, [domain]: { ...r[domain], step: 'done', loading: false, cert: result } }))
    } catch(e) {
      setCertRequest(r => ({ ...r, [domain]: { ...r[domain], loading: false, error: e.message } }))
    }
  }

  if (loading) return <div className="content-wrap" style={{ textAlign: 'center', padding: 60 }}><span className="spinner" style={{ width: 32, height: 32 }}></span></div>

  if (!user) return (
    <div className="content-wrap">
      <div style={{ textAlign: 'center', maxWidth: 440, margin: '60px auto' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📅</div>
        <div className="page-title" style={{ marginBottom: 10 }}>Expiry Monitor</div>
        <div style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.7, marginBottom: 24 }}>Watch multiple domains, get email alerts before certs expire. Sign in with Google — free, no password.</div>
        <button className="btn btn-primary btn-lg" onClick={() => signInWithGoogle()}>Sign in with Google →</button>
      </div>
    </div>
  )

  return (
    <div className="content-wrap">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="page-title">📅 Expiry Monitor</div>
            <div className="page-sub">Track {domains.length} domain{domains.length !== 1 ? 's' : ''} — signed in as {user.email}</div>
          </div>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Domain</button>
        </div>
      </div>

      {alerts.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {alerts.map(a => (
            <div key={a.id} className={`alert ${a.risk === 'CRITICAL' ? 'alert-error' : 'alert-warning'}`} style={{ marginBottom: 8 }}>
              ⚠ {a.msg}
              <button style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }} onClick={() => setAlerts(al => al.filter(x => x.id !== a.id))}>✕</button>
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={() => setAlerts([])}>Acknowledge All</button>
        </div>
      )}

      {domains.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🌐</div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>No domains monitored yet</div>
          <div style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 16 }}>Add a domain to start tracking certificate expiry.</div>
          <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Your First Domain</button>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="data-table">
            <thead><tr><th>Domain</th><th>Valid From</th><th>Expires On</th><th>Days Left</th><th>Risk</th><th>Algorithm</th><th>Actions</th></tr></thead>
            <tbody>
              {domains.map(d => (
                <tr key={d.id}>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--teal)', textDecoration: 'underline', padding: 0 }}
                      onClick={() => setSelectedDomain(selectedDomain === d.domain ? null : d.domain)}>
                      {d.domain}
                    </button>
                    {d.cert_private_key && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--green)', fontFamily: 'var(--sans)' }}>🔑</span>}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text-3)' }}>
                    {d.cert_start ? new Date(d.cert_start).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'}) : '—'}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {d.cert_expiry ? (
                      <span style={{ fontWeight: 600, color: new Date(d.cert_expiry) < new Date() ? 'var(--red)' : new Date(d.cert_expiry) < new Date(Date.now() + 30*86400000) ? 'var(--orange)' : 'var(--green)' }}>
                        {new Date(d.cert_expiry).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'})}
                      </span>
                    ) : '—'}
                  </td>
                  <td>
                    {d.last_days_left != null ? (
                      <span style={{ fontWeight: 700, color: d.last_days_left < 0 ? 'var(--red)' : d.last_days_left < 30 ? 'var(--orange)' : 'var(--green)' }}>
                        {d.last_days_left < 0 ? 'EXPIRED' : d.last_days_left + 'd'}
                      </span>
                    ) : <span style={{ color: 'var(--text-4)' }}>—</span>}
                  </td>
                  <td><RiskBadge risk={d.last_risk_level} /></td>
                  <td style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>{d.last_algorithm || '—'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" title="Scan now" onClick={() => triggerScan(d.domain)} disabled={scanning[d.domain]}>{scanning[d.domain] ? <span className="spinner"></span> : '🔄'}</button>
                      <button className="btn btn-ghost btn-sm" title="View in scanner" onClick={() => window.open(`/?domain=${d.domain}`)}>🔍</button>
                      <button className="btn btn-primary btn-sm" title="Request free SSL certificate" onClick={() => requestCert(d.domain)} disabled={certRequest[d.domain]?.loading}>🔒 Request Cert</button>
                      <button className="btn btn-danger btn-sm" onClick={() => removeDomain(d.id)}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Inline cert request panels */}
          {domains.map(d => {
            const req = certRequest[d.domain]
            if (!req) return null
            return (
              <div key={d.domain} style={{ borderTop: '1px solid var(--border)', padding: '16px 20px', background: 'var(--slate-9)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>🔒 Free SSL — {d.domain}</div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setCertRequest(r => { const n={...r}; delete n[d.domain]; return n })}>✕ Close</button>
                </div>
                {req.step === 'loading' && <div style={{ color: 'var(--text-3)', fontSize: 13 }}><span className="spinner" style={{ marginRight: 8 }}></span>Creating ACME order...</div>}
                {req.step === 'error' && <div className="alert alert-error">{req.error}</div>}
                {req.step === 'dns' && (
                  <div>
                    {req.autoAdded
                      ? <div className="alert alert-success" style={{ marginBottom: 12 }}>✅ DNS record auto-added via Vercel! Click Verify below.</div>
                      : <div style={{ marginBottom: 12 }}>
                          <div className="alert alert-teal" style={{ marginBottom: 8 }}>Add this TXT record to your DNS then click Verify:</div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--slate-10)', borderRadius: 6, padding: '10px 12px', border: '1px solid var(--border)', marginBottom: 8 }}>
                            <div style={{ fontSize: 11, color: 'var(--text-3)', minWidth: 60 }}>Name</div>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, flex: 1 }}>_acme-challenge</div>
                            <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText('_acme-challenge')}>📋</button>
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--slate-10)', borderRadius: 6, padding: '10px 12px', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 11, color: 'var(--text-3)', minWidth: 60 }}>Value</div>
                            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, flex: 1, wordBreak: 'break-all' }}>{req.txtValue}</div>
                            <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(req.txtValue)}>📋</button>
                          </div>
                        </div>
                    }
                    {req.error && <div className="alert alert-error" style={{ marginBottom: 8 }}>{req.error}</div>}
                    <button className="btn btn-primary" onClick={() => verifyCert(d.domain)} disabled={req.loading}>
                      {req.loading ? <><span className="spinner"></span> Verifying...</> : '✅ Verify DNS & Issue Certificate'}
                    </button>
                  </div>
                )}
                {req.step === 'issuing' && <div style={{ color: 'var(--text-3)', fontSize: 13 }}><span className="spinner" style={{ marginRight: 8 }}></span>Issuing certificate from Let's Encrypt...</div>}
                {req.step === 'done' && req.cert && (
                  <div>
                    <div className="alert alert-success" style={{ marginBottom: 12 }}>🎉 Certificate issued successfully!</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn btn-primary btn-sm" onClick={() => { const a=document.createElement('a'); a.href='data:text/plain,'+encodeURIComponent(req.cert.cert); a.download=d.domain+'-cert.pem'; a.click() }}>⬇ cert.pem</button>
                      <button className="btn btn-primary btn-sm" onClick={() => { const a=document.createElement('a'); a.href='data:text/plain,'+encodeURIComponent(req.cert.privateKey); a.download=d.domain+'-key.pem'; a.click() }}>⬇ key.pem</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => { const a=document.createElement('a'); a.href='data:text/plain,'+encodeURIComponent(req.cert.fullchain); a.download=d.domain+'-fullchain.pem'; a.click() }}>⬇ fullchain.pem</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setCertRequest(r => { const n={...r}; delete n[d.domain]; return n })}>Close</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Domain detail modal */}
      {selectedDomain && (() => {
        const d = domains.find(x => x.domain === selectedDomain)
        if (!d) return null
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
            onClick={() => setSelectedDomain(null)}>
            <div style={{ background: 'var(--bg)', borderRadius: 'var(--radius)', padding: 24, maxWidth: 600, width: '100%', maxHeight: '80vh', overflow: 'auto' }}
              onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 16 }}>🌐 {d.domain}</div>
                <button className="btn btn-ghost btn-sm" onClick={() => setSelectedDomain(null)}>✕</button>
              </div>
              {/* Cert info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                {[
                  ['Valid From', d.cert_start ? new Date(d.cert_start).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'}) : '—'],
                  ['Expires On', d.cert_expiry ? new Date(d.cert_expiry).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'}) : '—'],
                  ['Days Left', d.last_days_left != null ? d.last_days_left + ' days' : '—'],
                  ['Algorithm', d.last_algorithm || '—'],
                  ['Risk Level', d.last_risk_level || '—'],
                  ['Issued At', d.cert_issued_at ? new Date(d.cert_issued_at).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'}) : '—'],
                ].map(([label, value]) => (
                  <div key={label} style={{ background: 'var(--slate-9)', borderRadius: 6, padding: '10px 14px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{value}</div>
                  </div>
                ))}
              </div>
              {d.cert_private_key ? (
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>🔑 Private Key</div>
                  <div className="alert alert-warning" style={{ marginBottom: 10, fontSize: 12 }}>
                    ⚠ Keep this private. Never share it. This was generated when you requested the cert from this portal.
                  </div>
                  <div style={{ background: 'var(--slate-10)', borderRadius: 6, padding: 12, fontFamily: 'var(--mono)', fontSize: 10, maxHeight: 150, overflow: 'auto', border: '1px solid var(--border)', marginBottom: 10, wordBreak: 'break-all' }}>
                    {d.cert_private_key}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => { const a=document.createElement('a'); a.href='data:text/plain,'+encodeURIComponent(d.cert_private_key); a.download=d.domain+'-key.pem'; a.click() }}>⬇ Download key.pem</button>
                    {d.cert_pem && <button className="btn btn-secondary btn-sm" onClick={() => { const a=document.createElement('a'); a.href='data:text/plain,'+encodeURIComponent(d.cert_pem); a.download=d.domain+'-cert.pem'; a.click() }}>⬇ Download cert.pem</button>}
                    <button className="btn btn-ghost btn-sm" onClick={() => navigator.clipboard.writeText(d.cert_private_key)}>📋 Copy Key</button>
                  </div>
                </div>
              ) : (
                <div className="alert alert-teal" style={{ fontSize: 13 }}>
                  🔒 No private key stored — this domain was not issued through this portal, or the certificate was requested before key storage was added.<br/>
                  Click <strong>🔒 Request Cert</strong> to issue a new free certificate and store the key.
                </div>
              )}
            </div>
          </div>
        )
      })()}
      {showAdd && <AddDomainModal onAdd={addDomain} onClose={() => setShowAdd(false)} />}
    </div>
  )
}
