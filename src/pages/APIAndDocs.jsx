import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

// ─── API KEYS PAGE ────────────────────────────────────────────────────────────
export function APIKeys() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [keys, setKeys] = useState([])
  const [label, setLabel] = useState('')
  const [newKey, setNewKey] = useState(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => { if (user) loadKeys() }, [user])

  const loadKeys = async () => {
    const { data } = await supabase.from('ec_api_keys').select('id,label,key_prefix,last_used_at,created_at').order('created_at', { ascending: false })
    setKeys(data || [])
  }

  const generateKey = async () => {
    if (!user || !label.trim()) return
    const raw = 'eck_' + crypto.randomUUID().replace(/-/g, '')
    const prefix = raw.slice(0, 12)
    const encoder = new TextEncoder()
    const data = encoder.encode(raw)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
    await supabase.from('ec_api_keys').insert({ user_id: user.id, label: label.trim(), key_hash: hashHex, key_prefix: prefix })
    setNewKey(raw); setLabel(''); loadKeys()
  }

  const revokeKey = async (id) => {
    await supabase.from('ec_api_keys').delete().eq('id', id)
    setKeys(k => k.filter(x => x.id !== id))
  }

  const copy = (text) => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  const ENDPOINTS = [
    { method: 'GET', path: '/api/v1/status', desc: 'Health check', auth: 'None' },
    { method: 'POST', path: '/api/v1/scan/domain', desc: 'Scan a live TLS domain', auth: 'X-API-Key' },
    { method: 'POST', path: '/api/v1/scan/file', desc: 'Upload and scan a cert/keystore', auth: 'X-API-Key' },
  ]

  const EXAMPLES = {
    curl: `curl -X POST https://easysecurity.in/api/v1/scan/domain \\
  -H "X-API-Key: eck_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"domain":"app.example.com","fail_if_days_below":30}'`,
    github: `- name: Check certificate
  run: |
    curl -sf -X POST \\
      https://easysecurity.in/api/v1/scan/domain \\
      -H "X-API-Key: \${{ secrets.EASYCERTS_API_KEY }}" \\
      -H "Content-Type: application/json" \\
      -d '{"domain":"\${{ env.DOMAIN }}","fail_if_days_below":30}'`,
    response: `{
  "passed": true,
  "risk_level": "SECURE",
  "security_score": 91,
  "days_left": 287,
  "expires": "2027-01-15 10:30 UTC",
  "common_name": "app.example.com",
  "issuer": "DigiCert TLS CA",
  "key_type": "RSA-2048",
  "sig_algo": "SHA256",
  "fail_reasons": [],
  "scanned_at": "2026-05-05T08:00:00Z"
}`
  }
  const [exTab, setExTab] = useState('curl')

  if (!user) return (
    <div className="content-wrap">
      <div style={{ textAlign: 'center', maxWidth: 440, margin: '60px auto' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚙️</div>
        <div className="page-title" style={{ marginBottom: 10 }}>CI/CD API Keys</div>
        <div style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 24 }}>Sign in to generate API keys for GitHub Actions, GitLab CI, and Jenkins pipelines.</div>
        <button className="btn btn-primary btn-lg" onClick={() => navigate('/auth', { state: { from: '/api-keys' } })}>Sign In / Create Account →</button>
      </div>
    </div>
  )

  return (
    <div className="content-wrap">
      <div className="page-header"><div className="page-title">⚙️ CI/CD API Keys</div><div className="page-sub">Integrate certificate scanning into your deployment pipelines</div></div>

      {newKey && (
        <div className="alert alert-success" style={{ marginBottom: 16 }}>
          <div><strong>New API key generated — copy it now. It won't be shown again.</strong><div className="output-box" style={{ marginTop: 8, fontSize: 13 }}>{newKey}<button className="copy-btn" onClick={() => copy(newKey)}>{copied ? '✓' : 'Copy'}</button></div></div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Generate New Key</div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div className="form-group" style={{ flex: 1 }}><label>Key Label</label><input placeholder="e.g. GitHub Actions — Production" value={label} onChange={e => setLabel(e.target.value)} onKeyDown={e => e.key === 'Enter' && generateKey()} /></div>
          <div style={{ alignSelf: 'flex-end' }}><button className="btn btn-primary" onClick={generateKey} disabled={!label.trim()}>Generate Key</button></div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>Your API Keys ({keys.length} / 5)</div>
        {keys.length === 0 ? <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No API keys yet</div> : (
          <table className="data-table">
            <thead><tr><th>Label</th><th>Key Prefix</th><th>Last Used</th><th>Created</th><th></th></tr></thead>
            <tbody>
              {keys.map(k => (
                <tr key={k.id}>
                  <td>{k.label}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{k.key_prefix}…</td>
                  <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{new Date(k.created_at).toLocaleDateString()}</td>
                  <td><button className="btn btn-danger btn-sm" onClick={() => revokeKey(k.id)}>Revoke</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">API Endpoints</div>
        <table className="data-table">
          <thead><tr><th>Method</th><th>Path</th><th>Description</th><th>Auth</th></tr></thead>
          <tbody>{ENDPOINTS.map(e => <tr key={e.path}><td><span className={`badge ${e.method === 'GET' ? 'badge-info' : 'badge-teal'}`} style={{ fontSize: 10 }}>{e.method}</span></td><td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{e.path}</td><td>{e.desc}</td><td>{e.auth}</td></tr>)}</tbody>
        </table>
      </div>

      <div className="card">
        <div className="card-title">Code Examples</div>
        <div className="tab-bar" style={{ marginBottom: 14, maxWidth: 300 }}>
          {[['curl','cURL'],['github','GitHub Actions'],['response','Response']].map(([k,l]) => <button key={k} className={`tab-btn ${exTab === k ? 'active' : ''}`} onClick={() => setExTab(k)}>{l}</button>)}
        </div>
        <div className="code-block" style={{ position: 'relative' }}>
          {EXAMPLES[exTab]}
          <button className="copy-btn" onClick={() => copy(EXAMPLES[exTab])}>Copy</button>
        </div>
      </div>
    </div>
  )
}

// ─── DOCS PAGE ────────────────────────────────────────────────────────────────
export function Docs() {
  const sections = [
    { id: 'overview', label: 'Overview' },
    { id: 'formats', label: 'Supported Formats' },
    { id: 'scanner', label: 'Certificate Scanner' },
    { id: 'tls', label: 'TLS Scanner' },
    { id: 'results', label: 'Understanding Results' },
    { id: 'monitor', label: 'Expiry Monitor' },
    { id: 'compare', label: 'Cert Comparison' },
    { id: 'renew', label: 'Renewal Wizard' },
    { id: 'api', label: 'CI/CD API' },
    { id: 'copilot', label: 'AI Copilot' },
    { id: 'risk', label: 'Risk Levels' },
    { id: 'privacy', label: 'Privacy' },
  ]
  const [active, setActive] = useState('overview')

  return (
    <div style={{ display: 'flex', maxWidth: 1100, margin: '0 auto', padding: '32px 24px', gap: 32 }}>
      <div style={{ width: 200, flexShrink: 0, position: 'sticky', top: 80, height: 'fit-content' }}>
        <div className="section-label" style={{ marginBottom: 10 }}>Documentation</div>
        {sections.map(s => (
          <button key={s.id} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 12px', borderRadius: 'var(--radius-sm)', border: 'none', background: active === s.id ? 'var(--teal-light)' : 'none', color: active === s.id ? 'var(--teal-dark)' : 'var(--text-3)', fontWeight: active === s.id ? 600 : 400, fontSize: 13, cursor: 'pointer', fontFamily: 'var(--font)' }} onClick={() => { setActive(s.id); document.getElementById('doc-' + s.id)?.scrollIntoView({ behavior: 'smooth' }) }}>{s.label}</button>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {[
          ['overview', 'Overview', 'CertGuard is a professional certificate intelligence platform for engineers, security teams, and DevOps. It analyses X.509 certificates, live TLS endpoints, decodes CSRs, matches keys, converts formats, checks DNS, and monitors expiry — all in one tool.'],
          ['formats', 'Supported Formats', 'PEM (.pem, .crt, .cer) — Base64 X.509, single or chain bundle. PKCS#12 (.p12, .pfx) — key + cert + chain bundle, password optional. DER (.der) — Binary X.509. Live TLS — hostname, port 443 default.'],
          ['scanner', 'Certificate Scanner', 'Upload PEM, paste cert text, or use sample certificates. CertGuard detects: trust chain gaps, expiry risk, weak algorithms (SHA-1, RSA<2048), SAN mismatches, self-signed certs, wildcard flags. Every finding includes WHY, IMPACT, and exact fix commands.'],
          ['tls', 'TLS Scanner', 'Enter any domain (e.g. api.example.com or host:8443). CertGuard resolves DNS and analyses the connection. For expired/self-signed certs, CertGuard still retrieves certificate details. Note: deep TLS handshake chain retrieval requires server-side proxy; use openssl s_client for full chain verification.'],
          ['results', 'Understanding Results', 'Risk banner: SECURE/LOW/MEDIUM/HIGH/CRITICAL with 0-100 score. Chain diagram: visual Leaf → Intermediate → Root. Findings cards: each issue has WHY + IMPACT + FIX terminal commands. Certificate accordion: full details per cert. PDF/text report download.'],
          ['monitor', 'Expiry Monitor', 'Requires account sign-in (free). Add domains with alert threshold (default 30 days) and scan interval (default 24h). Dashboard shows Days Left, Risk, Score, Algorithm. Actions: Scan now, Renew, Remove. Alerts panel for at-risk domains.'],
          ['compare', 'Certificate Comparison', 'Diff two certificates across 14 fields: CN, Subject, Issuer, SANs, Valid From/To, Days Remaining, Serial, Key Type, Sig Algorithm, Fingerprint, X.509 Version. Changed rows highlighted in amber. Risk scores shown side by side.'],
          ['renew', 'Renewal Wizard', '4-step guided process: (1) Verify details — CN, O, OU, L, ST, C, SANs, key type. (2) Generate CSR + private key — browser-side via node-forge, never transmitted. (3) CA submission guide — DigiCert, Sectigo, Let\'s Encrypt, Internal CA. (4) Deploy commands — Nginx, Apache, JKS, Kubernetes, Node.js.'],
          ['api', 'CI/CD API', 'REST API for pipeline integration. Endpoints: GET /api/v1/status (health), POST /api/v1/scan/domain (scan TLS), POST /api/v1/scan/file (upload cert). Returns passed boolean + risk_level + score + days_left. HTTP 200 = passed, 422 = failed. Requires account API key.'],
          ['copilot', 'AI Copilot', 'Floating chat widget (bottom-right). Powered by Claude Haiku. Knows about: PKIX errors, JKS keystores, trust chains, OpenSSL commands, SWIFT PKI, renewal guidance. When a scan result is active, answers are specific to your actual certificate.'],
          ['risk', 'Risk Levels', 'SECURE (90-100): >180 days, full chain, RSA-2048+, SHA-256+. LOW (80-89): 90-180 days, minor issues. MEDIUM (56-79): 30-90 days, self-signed, or wildcard. HIGH (31-55): 7-30 days, RSA-1024, missing intermediate. CRITICAL (0-30): expired, <7 days, SHA-1/MD5, RSA<1024.'],
          ['privacy', 'Privacy & Security', 'Uploaded certificates processed in-memory and discarded immediately. No certificates, keys, or passwords are stored, logged, or transmitted. Keystore passwords used only during the scan. Browser-side key generation never reaches the server. Email/password auth — credentials stored encrypted. Monitor data stored securely under your account. Email/password auth — no third-party OAuth required.'],
        ].map(([id, title, content]) => (
          <div key={id} id={`doc-${id}`} style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>{title}</h2>
            <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.8 }}>{content}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
