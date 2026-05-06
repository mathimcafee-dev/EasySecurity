import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'
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
  const navigate = useNavigate()
  const [domains, setDomains] = useState([])
  const [fetching, setFetching] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [certRequest, setCertRequest] = useState({})
  const [selectedDomain, setSelectedDomain] = useState(null)
  const [revokeModal, setRevokeModal] = useState(null) // { domain, issuer }
  const [revokeReason, setRevokeReason] = useState('Key Compromise')
  const [revoking, setRevoking] = useState(false)
  const [revokeResult, setRevokeResult] = useState(null)
  const [dnsProvider, setDnsProvider] = useState('manual')
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkImporting, setBulkImporting] = useState(false)
  const [providerKey, setProviderKey] = useState('')
  const [providerSecret, setProviderSecret] = useState('')
  const [providerStatus, setProviderStatus] = useState(null)
  const [providerMsg, setProviderMsg] = useState('') // { domain: { step, txtValue, challengeDomain, sessionId, loading, error } }
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
      const domainData = domains.find(x => x.domain === d || x.domain === domain)

      if (domainData?.cert_pem) {
        // Portal-issued cert: compute from stored cert, never overwrite with live scan
        const { parseCertPem } = await import('../lib/pki')
        const parsed = parseCertPem(domainData.cert_pem)
        const daysLeft = parsed.daysLeft ?? 0
        const risk = daysLeft <= 0 ? 'CRITICAL' : daysLeft <= 7 ? 'CRITICAL' : daysLeft <= 15 ? 'HIGH' : daysLeft <= 30 ? 'MEDIUM' : 'SECURE'
        const score = Math.min(100, Math.max(0, daysLeft))
        await supabase.from('ec_monitored_domains').update({
          last_scanned_at: new Date().toISOString(),
          last_risk_level: risk,
          last_score: score,
          last_days_left: daysLeft,
          last_algorithm: parsed.keyType || domainData.last_algorithm || 'ECDSA P-256',
          cert_start: new Date(parsed.notBefore).toISOString(),
          cert_expiry: new Date(parsed.notAfter).toISOString(),
        }).eq('user_id', user.id).eq('domain', d)
        await supabase.from('ec_scan_history').insert({ user_id: user.id, domain: d, risk_level: risk, score, days_left: daysLeft, common_name: parsed.commonName || d })
        await load()
        if (daysLeft >= 0 && daysLeft < 30) setAlerts(a => [...a, { id: Date.now(), msg: `${d} expires in ${daysLeft} days`, risk: daysLeft < 7 ? 'CRITICAL' : 'HIGH' }])
        setScanning(s => { const n = { ...s }; delete n[domain]; return n })
        return
      }

      // External cert: live TLS scan
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

  const handleBulkImport = async (text) => {
    // Parse domains from text — support comma, newline, semicolon, space separated
    const raw = text.replace(/[,;\n\r\t]+/g, ' ').split(' ')
    const domains = [...new Set(
      raw.map(d => d.trim().toLowerCase()
        .replace(/^https?:\/\//, '').replace(/\/.*/, '').replace(/^\*\./, ''))
      .filter(d => d && d.includes('.') && d.length > 3 && !d.startsWith('.'))
    )]
    if (!domains.length) { alert('No valid domains found'); return }
    setBulkImporting(true)
    let added = 0, skipped = 0
    for (const domain of domains) {
      const { error } = await supabase.from('ec_monitored_domains').upsert({
        user_id: user.id, domain, alert_threshold_days: 30, scan_interval_hours: 24
      }, { onConflict: 'user_id,domain' })
      if (!error) added++; else skipped++
    }
    setBulkImporting(false)
    setShowBulkImport(false)
    setBulkText('')
    await load()
    alert(`✅ Imported ${added} domain${added !== 1 ? 's' : ''}${skipped > 0 ? ` (${skipped} skipped)` : ''}`)
  }

  const handleFileImport = (file) => {
    const ext = file.name.split('.').pop().toLowerCase()
    if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const { read, utils } = await import('xlsx')
          const wb = read(e.target.result, { type: 'array' })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const data = utils.sheet_to_csv(ws)
          handleBulkImport(data)
        } catch(err) { alert('Error reading Excel file: ' + err.message) }
      }
      reader.readAsArrayBuffer(file)
    } else {
      const reader = new FileReader()
      reader.onload = (e) => handleBulkImport(e.target.result)
      reader.readAsText(file)
    }
  }

  const handleRevoke = async () => {
    if (!revokeModal || !user) return
    setRevoking(true); setRevokeResult(null)
    try {
      const res = await fetch('/api/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: revokeModal.domain,
          reason: revokeReason,
          userId: user.id,
          userEmail: user.email
        })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setRevokeResult(data)
      await load()
    } catch(e) {
      setRevokeResult({ ok: false, message: e.message })
    }
    setRevoking(false)
  }

  const verifyProvider = async (domain) => {
    if (!providerKey) return
    setProviderStatus('verifying'); setProviderMsg('')
    try {
      const res = await fetch('/api/dns-provider', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', provider: dnsProvider, apiKey: providerKey, apiSecret: providerSecret, domain })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setProviderStatus('verified')
      setProviderMsg(dnsProvider === 'cloudflare' ? `✅ Zone: ${data.zoneName}` : `✅ Domain: ${data.domain}`)
    } catch(e) {
      setProviderStatus('error')
      setProviderMsg('❌ ' + e.message)
    }
  }

  const requestCert = async (domain) => {
    if (!user) return
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
      // Auto-add DNS if provider configured and verified
      let autoAdded = data.autoAdded || false
      let autoProvider = 'vercel'
      if (dnsProvider !== 'manual' && providerStatus === 'verified' && providerKey) {
        try {
          const dnsRes = await fetch('/api/dns-provider', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add_txt', provider: dnsProvider, apiKey: providerKey, apiSecret: providerSecret, domain, txtValue: data.txtValue })
          })
          const dnsData = await dnsRes.json()
          if (dnsData.ok) { autoAdded = true; autoProvider = dnsProvider }
        } catch(e) { console.log('Auto DNS failed:', e.message) }
      }
      setCertRequest(r => ({ ...r, [domain]: { step: 'dns', loading: false, txtValue: data.txtValue, challengeDomain: data.challengeDomain, sessionId, autoAdded, autoProvider } }))
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
    <div className="content-wrap" style={{ textAlign: 'center', padding: 60 }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔐</div>
      <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 8 }}>Sign in to access Monitor</div>
      <div style={{ color: 'var(--text-3)', marginBottom: 24 }}>Track certificate expiry and get alerts for all your domains.</div>
      <button className="btn btn-primary btn-lg" onClick={() => navigate('/auth', { state: { from: '/monitor' } })}>
        Sign In / Create Account
      </button>
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
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setShowBulkImport(true)}>📥 Bulk Import</button>
            <button className="btn btn-primary" onClick={() => setShowAdd(true)}>+ Add Domain</button>
          </div>
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
        <div>
          {/* Portal-issued certs */}
          {domains.filter(d => d.source === 'portal' || d.cert_private_key).length > 0 && <>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
              <span style={{ fontSize:11, fontWeight:700, color:'var(--teal)', textTransform:'uppercase', letterSpacing:'.6px' }}>🔒 Issued via CertGuard</span>
              <span className="badge badge-teal">{domains.filter(d=>d.source==='portal'||d.cert_private_key).length}</span>
              <span style={{ fontSize:11, color:'var(--text-4)' }}>— managed certificates, same cert shown on every refresh</span>
            </div>
            <div className="card" style={{ padding:0, overflow:'hidden', marginBottom:20, borderColor:'var(--teal-border)' }}>
            <table className="data-table">
              <thead><tr><th>Domain</th><th>Valid From</th><th>Expires On</th><th>Days Left</th><th>Risk</th><th>Algorithm</th><th>Actions</th></tr></thead>
              <tbody>
              {domains.filter(d=>d.source==='portal'||d.cert_private_key).map(d => (
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
                      <button className="btn btn-ghost btn-sm" onClick={() => triggerScan(d.domain)} disabled={scanning[d.domain]}>{scanning[d.domain] ? <span className="spinner"></span> : '🔄'}</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => window.open(`/?domain=${d.domain}`)}>🔍</button>
                      <button className="btn btn-primary btn-sm"
                        onClick={() => user ? requestCert(d.domain) : alert('Please log in to request certificates')}
                        disabled={certRequest[d.domain]?.loading}>🔒 Request Cert</button>
                      {d.cert_revoked_at
                        ? <span style={{ fontSize: 11, color: 'var(--red)', fontWeight: 700 }}>🔴 Revoked</span>
                        : <button className="btn btn-danger btn-sm"
                            onClick={() => { setRevokeModal({ domain: d.domain, issuer: d.last_algorithm || '' }); setRevokeResult(null) }}>
                            🔴 Revoke
                          </button>
                      }
                      <button className="btn btn-danger btn-sm" onClick={() => removeDomain(d.id)}>✕</button>
                    </div>
                  </td>
                </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>}
          {/* External certs */}
          {domains.filter(d => d.source !== 'portal' && !d.cert_private_key).length > 0 && <>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
              <span style={{ fontSize:11, fontWeight:700, color:'var(--text-2)', textTransform:'uppercase', letterSpacing:'.6px' }}>🌐 External Certificates</span>
              <span className="badge badge-neutral">{domains.filter(d=>d.source!=='portal'&&!d.cert_private_key).length}</span>
              <span style={{ fontSize:11, color:'var(--text-4)' }}>— imported domains, scanned from live server</span>
            </div>
            <div style={{ background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:'var(--radius-lg)', overflow:'hidden' }}>
            <table className="data-table">
              <thead><tr><th>DOMAIN</th><th>VALID FROM</th><th>EXPIRES ON</th><th>DAYS LEFT</th><th>RISK</th><th>ALGORITHM</th><th>ACTIONS</th></tr></thead>
              <tbody>
                {domains.filter(d=>d.source!=='portal'&&!d.cert_private_key).map(d => (
                  <tr key={d.id}>
                    <td style={{ fontFamily:'var(--mono)', fontSize:12 }}>
                      <button style={{ background:'none', border:'none', cursor:'pointer', fontFamily:'var(--mono)', fontSize:12, color:'var(--teal)', textDecoration:'underline', padding:0 }}
                        onClick={() => setSelectedDomain(selectedDomain===d.domain?null:d.domain)}>
                        {d.domain}
                      </button>
                      {d.cert_private_key && <span style={{ marginLeft:6, fontSize:10, color:'var(--green)', fontFamily:'var(--sans)' }}>🔑</span>}
                    </td>
                    <td style={{ fontSize:12, color:'var(--text-3)' }}>{d.cert_start?new Date(d.cert_start).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):'—'}</td>
                    <td style={{ fontSize:12 }}>{d.cert_expiry?(<span style={{ fontWeight:600, color:new Date(d.cert_expiry)<new Date()?'var(--red)':new Date(d.cert_expiry)<new Date(Date.now()+30*86400000)?'var(--orange)':'var(--green)' }}>{new Date(d.cert_expiry).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</span>):'—'}</td>
                    <td>{d.last_days_left!=null?(<span style={{ fontWeight:700, color:d.last_days_left<0?'var(--red)':d.last_days_left<30?'var(--orange)':'var(--green)' }}>{d.last_days_left<0?'EXPIRED':d.last_days_left+'d'}</span>):<span style={{ color:'var(--text-4)' }}>—</span>}</td>
                    <td><RiskBadge risk={d.last_risk_level} /></td>
                    <td style={{ fontSize:12, fontFamily:'var(--mono)' }}>{d.last_algorithm||'—'}</td>
                    <td>
                      <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => triggerScan(d.domain)} disabled={scanning[d.domain]}>{scanning[d.domain]?<span className="spinner"></span>:'🔄'}</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => window.open('/?domain='+d.domain)}>🔍</button>
                        <button className="btn btn-primary btn-sm"
                          onClick={() => user ? requestCert(d.domain) : alert('Please sign in to request certificates')}
                          disabled={certRequest[d.domain]?.loading}>🔒 Request Cert</button>
                        {d.cert_revoked_at
                          ? <span style={{ fontSize:11, color:'var(--red)', fontWeight:700 }}>🔴 Revoked</span>
                          : <button className="btn btn-danger btn-sm" onClick={() => { setRevokeModal({ domain:d.domain, issuer:d.last_algorithm||'' }); setRevokeResult(null) }}>🔴 Revoke</button>
                        }
                        <button className="btn btn-danger btn-sm" onClick={() => removeDomain(d.id)}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </>}
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
                    {/* DNS Provider selector — shown only if not auto-added */}
                    {!req.autoAdded && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>DNS Verification Method</div>
                        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                          {[['manual','✋ Manual'],['cloudflare','🟠 Cloudflare'],['godaddy','🐐 GoDaddy']].map(([val, label]) => (
                            <button key={val} className={`btn btn-sm ${dnsProvider===val?'btn-primary':'btn-secondary'}`}
                              onClick={() => { setDnsProvider(val); setProviderStatus(null); setProviderMsg('') }}>
                              {label}
                            </button>
                          ))}
                        </div>
                        {dnsProvider !== 'manual' && (
                          <div style={{ background: 'var(--slate-10)', border: '1px solid var(--border)', borderRadius: 6, padding: 10, marginBottom: 10 }}>
                            {dnsProvider === 'cloudflare' && (
                              <input placeholder="Cloudflare API Token" value={providerKey} type="password"
                                onChange={e => { setProviderKey(e.target.value); setProviderStatus(null) }}
                                style={{ marginBottom: 6 }} />
                            )}
                            {dnsProvider === 'godaddy' && <>
                              <input placeholder="GoDaddy API Key" value={providerKey}
                                onChange={e => { setProviderKey(e.target.value); setProviderStatus(null) }}
                                style={{ marginBottom: 6 }} />
                              <input placeholder="GoDaddy API Secret" value={providerSecret} type="password"
                                onChange={e => { setProviderSecret(e.target.value); setProviderStatus(null) }}
                                style={{ marginBottom: 6 }} />
                            </>}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <button className="btn btn-secondary btn-sm" onClick={() => verifyProvider(d.domain)}
                                disabled={providerStatus === 'verifying' || !providerKey}>
                                {providerStatus === 'verifying' ? <><span className="spinner"></span> Testing...</> : '🔍 Test & Auto-Add'}
                              </button>
                              {providerMsg && <span style={{ fontSize: 11, color: providerStatus === 'verified' ? 'var(--green)' : 'var(--red)' }}>{providerMsg}</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Auto-added success */}
                    {req.autoAdded
                      ? <div className="alert alert-success" style={{ marginBottom: 12 }}>
                          🚀 DNS record auto-added via {req.autoProvider === 'cloudflare' ? 'Cloudflare' : req.autoProvider === 'godaddy' ? 'GoDaddy' : 'Vercel'}! Click Verify below.
                        </div>
                      : dnsProvider === 'manual' && (
                        <div style={{ marginBottom: 12 }}>
                          <div className="alert alert-teal" style={{ marginBottom: 8 }}>Add this TXT record to your DNS then click Verify:</div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--slate-10)', borderRadius: 6, padding: '10px 12px', border: '1px solid var(--border)', marginBottom: 6 }}>
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
                      )
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
      {/* Revoke Certificate Modal */}
      {revokeModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:400, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={() => !revoking && setRevokeModal(null)}>
          <div className="card" style={{ width:480, boxShadow:'0 20px 60px rgba(0,0,0,.3)' }} onClick={e => e.stopPropagation()}>
            {revokeResult ? (
              <div>
                <div style={{ fontSize: 32, textAlign:'center', marginBottom: 12 }}>
                  {revokeResult.ok ? '✅' : '❌'}
                </div>
                <div className={`alert ${revokeResult.ok ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: 16 }}>
                  {revokeResult.message}
                </div>
                {revokeResult.details && (
                  <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.6 }}>
                    {revokeResult.details}
                  </div>
                )}
                {revokeResult.ok && (
                  <div style={{ background: 'var(--slate-9)', borderRadius: 'var(--radius-sm)', padding: 12, fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>
                    <strong>Next steps:</strong> Issue a new certificate immediately to avoid downtime. Use the <strong>🔒 Request Cert</strong> button on this page.
                  </div>
                )}
                <button className="btn btn-secondary" style={{ width:'100%' }} onClick={() => setRevokeModal(null)}>Close</button>
              </div>
            ) : (
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                  <div style={{ fontSize:24 }}>🔴</div>
                  <div>
                    <div style={{ fontWeight:700, fontSize:15 }}>Revoke Certificate</div>
                    <div style={{ fontSize:12, color:'var(--text-3)' }}>{revokeModal.domain}</div>
                  </div>
                </div>
                <div className="alert alert-error" style={{ marginBottom:16 }}>
                  ⚠ Revoking is permanent and cannot be undone. The certificate will be invalidated globally. Issue a new certificate immediately after.
                </div>
                <div className="form-group" style={{ marginBottom:16 }}>
                  <label>Revocation Reason</label>
                  <select value={revokeReason} onChange={e => setRevokeReason(e.target.value)}>
                    <option>Key Compromise</option>
                    <option>CA Compromise</option>
                    <option>Affiliation Changed</option>
                    <option>Superseded</option>
                    <option>Cessation of Operation</option>
                    <option>Certificate Hold</option>
                  </select>
                </div>
                <div style={{ fontSize:12, color:'var(--text-3)', marginBottom:16, lineHeight:1.6 }}>
                  {revokeModal.issuer?.includes('ECDSA') || !revokeModal.issuer
                    ? "✅ This Let's Encrypt certificate will be revoked via ACME API and you'll receive email instructions."
                    : `📧 You'll receive an email at ${user?.email} with step-by-step instructions to revoke with your CA.`
                  }
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button className="btn btn-danger" onClick={handleRevoke} disabled={revoking} style={{ flex:1 }}>
                    {revoking ? <><span className="spinner"></span> Processing...</> : '🔴 Confirm Revocation'}
                  </button>
                  <button className="btn btn-secondary" onClick={() => setRevokeModal(null)} disabled={revoking}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {/* Bulk Import Modal */}
      {showBulkImport && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={() => setShowBulkImport(false)}>
          <div className="card" style={{ width:520, boxShadow:'0 20px 60px rgba(0,0,0,.2)' }} onClick={e => e.stopPropagation()}>
            <div className="card-title">📥 Bulk Import Domains</div>
            <div style={{ fontSize:13, color:'var(--text-3)', marginBottom:12 }}>
              Paste domains or upload a .txt, .csv, or .xlsx file. Supports comma, newline, or semicolon separated.
            </div>
            {/* File upload */}
            <div style={{ border:'2px dashed var(--border)', borderRadius:8, padding:'16px', textAlign:'center', marginBottom:14, cursor:'pointer', background:'var(--slate-9)' }}
              onClick={() => document.getElementById('bulk-file-input').click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleFileImport(e.dataTransfer.files[0]) }}>
              <input id="bulk-file-input" type="file" accept=".txt,.csv,.xlsx,.xls" style={{ display:'none' }}
                onChange={e => e.target.files[0] && handleFileImport(e.target.files[0])} />
              <div style={{ fontSize:24, marginBottom:6 }}>📂</div>
              <div style={{ fontSize:13, fontWeight:600 }}>Drop file here or click to upload</div>
              <div style={{ fontSize:11, color:'var(--text-4)', marginTop:4 }}>.txt, .csv, .xlsx supported</div>
            </div>
            <div style={{ fontSize:12, fontWeight:600, marginBottom:6, color:'var(--text-3)' }}>OR PASTE DOMAINS</div>
            <textarea
              placeholder="example.com, api.mysite.com, shop.store.com" 
              value={bulkText} onChange={e => setBulkText(e.target.value)}
              style={{ width:'100%', height:120, fontFamily:'var(--mono)', fontSize:12, padding:10, borderRadius:6, border:'1px solid var(--border)', resize:'vertical', marginBottom:14 }} />
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-primary" onClick={() => handleBulkImport(bulkText)} disabled={bulkImporting || !bulkText.trim()}>
                {bulkImporting ? <><span className="spinner"></span> Importing...</> : '📥 Import Domains'}
              </button>
              <button className="btn btn-secondary" onClick={() => { setShowBulkImport(false); setBulkText('') }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {showAdd && <AddDomainModal onAdd={addDomain} onClose={() => setShowAdd(false)} />}
    </div>
  )
}
