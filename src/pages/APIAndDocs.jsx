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
    { method: 'GET', path: '/api/v1/status', desc: 'Health check — no auth required', auth: 'None' },
    { method: 'POST', path: '/api/v1/scan/domain', desc: 'Scan a live TLS domain', auth: 'X-API-Key' },
    { method: 'POST', path: '/api/v1/scan/file', desc: 'Upload and scan a cert/keystore', auth: 'X-API-Key' },
  ]

  const EXAMPLES = {
    curl: `curl -X POST https://easysecurity.in/api/v1/scan/domain \\
  -H "X-API-Key: eck_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"domain":"app.example.com","fail_if_days_below":30}'`,
    github: `- name: Check certificate expiry
  run: |
    curl -sf -X POST \\
      https://easysecurity.in/api/v1/scan/domain \\
      -H "X-API-Key: \${{ secrets.EASYSECURITY_API_KEY }}" \\
      -H "Content-Type: application/json" \\
      -d '{"domain":"\${{ env.DOMAIN }}","fail_if_days_below":30}'`,
    gitlab: `check_certificate:
  script:
    - |
      curl -sf -X POST \\
        https://easysecurity.in/api/v1/scan/domain \\
        -H "X-API-Key: $EASYSECURITY_API_KEY" \\
        -H "Content-Type: application/json" \\
        -d '{"domain":"'"$DOMAIN"'","fail_if_days_below":30}'`,
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
      <div className="page-header"><div className="page-title">⚙️ CI/CD API Keys</div><div className="page-sub">Integrate certificate scanning into GitHub Actions, GitLab CI, Jenkins, and more</div></div>

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
        {keys.length === 0 ? <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No API keys yet. Generate one above.</div> : (
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
          <tbody>{ENDPOINTS.map(e => <tr key={e.path}><td><span className={`badge ${e.method === 'GET' ? 'badge-info' : 'badge-teal'}`} style={{ fontSize: 10 }}>{e.method}</span></td><td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{e.path}</td><td>{e.desc}</td><td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{e.auth}</td></tr>)}</tbody>
        </table>
        <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--slate-9)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-3)' }}>
          Pass your API key in the <code style={{ fontFamily: 'var(--mono)', background: 'var(--slate-10)', padding: '1px 5px', borderRadius: 3 }}>X-API-Key</code> header.
          Response HTTP 200 = passed, HTTP 422 = failed threshold.
        </div>
      </div>

      <div className="card">
        <div className="card-title">Code Examples</div>
        <div className="tab-bar" style={{ marginBottom: 14, maxWidth: 400 }}>
          {[['curl','cURL'],['github','GitHub Actions'],['gitlab','GitLab CI'],['response','Response']].map(([k,l]) => <button key={k} className={`tab-btn ${exTab === k ? 'active' : ''}`} onClick={() => setExTab(k)}>{l}</button>)}
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
    { id: 'quickstart', label: 'Quick Start' },
    { id: 'formats', label: 'Supported Formats' },
    { id: 'scanner', label: 'Certificate Scanner' },
    { id: 'tls', label: 'TLS Scanner' },
    { id: 'results', label: 'Risk & Scoring' },
    { id: 'freessl', label: 'Free SSL (ACME)' },
    { id: 'monitor', label: 'Expiry Monitor' },
    { id: 'converter', label: 'Format Conversion' },
    { id: 'jks', label: 'JKS Inspector' },
    { id: 'renew', label: 'Renewal Wizard' },
    { id: 'api', label: 'CI/CD API' },
    { id: 'copilot', label: 'AI Copilot' },
    { id: 'privacy', label: 'Privacy & Security' },
  ]
  const [active, setActive] = useState('overview')

  const scrollTo = (id) => {
    setActive(id)
    document.getElementById('doc-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const Code = ({ children }) => (
    <code style={{ fontFamily: 'var(--mono)', fontSize: 12, background: 'var(--slate-10)', padding: '2px 6px', borderRadius: 4, color: 'var(--teal-dark)', border: '1px solid var(--border)' }}>
      {children}
    </code>
  )

  const Block = ({ children }) => (
    <div style={{ background: 'var(--slate-9)', border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 16, overflowX: 'auto', whiteSpace: 'pre' }}>
      {children}
    </div>
  )

  const H2 = ({ children }) => (
    <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 6, color: 'var(--text)', borderBottom: '2px solid var(--teal)', paddingBottom: 8, marginTop: 0 }}>{children}</h2>
  )

  const H3 = ({ children }) => (
    <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--teal-dark)', marginBottom: 8, marginTop: 20 }}>{children}</h3>
  )

  const P = ({ children }) => (
    <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.8, marginBottom: 14 }}>{children}</p>
  )

  const Table = ({ head, rows }) => (
    <div style={{ overflowX: 'auto', marginBottom: 16 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>{head.map(h => <th key={h} style={{ textAlign: 'left', padding: '8px 12px', background: 'var(--slate-9)', borderBottom: '2px solid var(--teal)', color: 'var(--text-2)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px' }}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
              {row.map((cell, j) => <td key={j} style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text-2)', fontFamily: j === 0 ? 'var(--mono)' : 'var(--font)', fontSize: j === 0 ? 12 : 13 }}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const Badge = ({ color, children }) => {
    const colors = {
      green: { bg: 'rgba(16,185,129,.15)', color: '#059669', border: 'rgba(16,185,129,.3)' },
      red: { bg: 'rgba(239,68,68,.12)', color: '#dc2626', border: 'rgba(239,68,68,.25)' },
      orange: { bg: 'rgba(245,158,11,.12)', color: '#d97706', border: 'rgba(245,158,11,.25)' },
      teal: { bg: 'rgba(20,184,166,.12)', color: 'var(--teal-dark)', border: 'var(--teal-border)' },
    }
    const c = colors[color] || colors.teal
    return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 4, background: c.bg, color: c.color, border: `1px solid ${c.border}`, fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)' }}>{children}</span>
  }

  return (
    <div style={{ display: 'flex', maxWidth: 1140, margin: '0 auto', padding: '32px 24px', gap: 36 }}>
      {/* Sidebar */}
      <div style={{ width: 210, flexShrink: 0, position: 'sticky', top: 80, height: 'fit-content' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-4)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 10 }}>Documentation</div>
        {sections.map(s => (
          <button key={s.id} onClick={() => scrollTo(s.id)}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 12px', borderRadius: 6, border: 'none',
              background: active === s.id ? 'var(--teal-light)' : 'none',
              color: active === s.id ? 'var(--teal-dark)' : 'var(--text-3)',
              fontWeight: active === s.id ? 600 : 400, fontSize: 13, cursor: 'pointer',
              fontFamily: 'var(--font)', borderLeft: active === s.id ? '2px solid var(--teal)' : '2px solid transparent',
              transition: 'all .12s' }}>
            {s.label}
          </button>
        ))}
        <div style={{ marginTop: 20, padding: '12px 14px', background: 'var(--teal-light)', borderRadius: 8, border: '1px solid var(--teal-border)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal-dark)', marginBottom: 6 }}>Need help?</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.5 }}>
            Use the AI Copilot (bottom-right) — it knows your current certificate context.
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>

        <div id="doc-overview" style={{ marginBottom: 48 }}>
          <H2>Overview</H2>
          <P>EasySecurity is a professional SSL/TLS certificate management platform for engineers, security teams, and DevOps. It combines real-time certificate analysis, free certificate issuance, format conversion, expiry monitoring, and CI/CD pipeline integration in a single tool — with all cryptography running locally in your browser.</P>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
            {[
              ['🔍', 'Zero-install', 'No CLI, no config. Paste a cert or enter a domain to get a full security analysis instantly.'],
              ['🔒', 'Browser-native crypto', 'node-forge handles all parsing and key generation in-browser. Private keys never leave your device.'],
              ['🌐', 'Free SSL via ACME', 'Issue real 90-day certificates from Let\'s Encrypt at no cost, via DNS-01 challenge.'],
            ].map(([icon, title, desc]) => (
              <div key={title} style={{ background: 'var(--slate-9)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
                <div style={{ fontSize: 20, marginBottom: 8 }}>{icon}</div>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>{desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div id="doc-quickstart" style={{ marginBottom: 48 }}>
          <H2>Quick Start</H2>
          <H3>Scan a certificate</H3>
          <P>Navigate to the <strong>Scanner</strong> tab. Paste a PEM certificate, upload a file, or enter a domain name. Results appear instantly with risk level, expiry, and detailed findings.</P>
          <H3>Issue a free SSL certificate</H3>
          <P>Go to <strong>Free SSL</strong>, enter your domain, prove DNS ownership by adding a TXT record, then download your certificate bundle (PEM, PFX, or JKS).</P>
          <H3>Monitor multiple domains</H3>
          <P>Sign in and go to <strong>Monitor</strong>. Add domains to track. EasySecurity scans each domain on your chosen interval and alerts you before expiry.</P>
          <H3>Integrate with CI/CD</H3>
          <Block>{`# GitHub Actions example
- name: Verify certificate
  run: |
    curl -sf -X POST https://easysecurity.in/api/v1/scan/domain \\
      -H "X-API-Key: $\{{ secrets.EASYSECURITY_API_KEY }}" \\
      -H "Content-Type: application/json" \\
      -d '{"domain":"app.example.com","fail_if_days_below":30}'`}</Block>
        </div>

        <div id="doc-formats" style={{ marginBottom: 48 }}>
          <H2>Supported Formats</H2>
          <Table
            head={['Format', 'Extensions', 'Description', 'Use Case']}
            rows={[
              ['PEM', '.pem .crt .cer', 'Base64-encoded X.509, plain text', 'Nginx, Apache, OpenSSL'],
              ['PKCS#12', '.p12 .pfx', 'Binary bundle: cert + key + chain', 'Windows IIS, Azure, F5, Citrix'],
              ['JKS', '.jks .keystore', 'Java KeyStore (proprietary)', 'Tomcat, WebLogic, Spring Boot'],
              ['DER', '.der', 'Binary X.509 (no base64)', 'Java, Android, embedded systems'],
              ['PKCS#7', '.p7b .p7c', 'Certificate chain bundle, no key', 'Windows certificate import'],
              ['CSR', '.csr .req', 'Certificate Signing Request', 'CA submission'],
              ['Live TLS', 'hostname[:port]', 'Fetched from running server', 'On-demand monitoring'],
            ]}
          />
          <P>Use the <strong>Converter</strong> page to convert between any of these formats in-browser — no upload to server required.</P>
        </div>

        <div id="doc-scanner" style={{ marginBottom: 48 }}>
          <H2>Certificate Scanner</H2>
          <P>The scanner accepts PEM text, file uploads (PEM, PFX, JKS, DER), or live TLS domain endpoints. It performs a comprehensive X.509 analysis:</P>
          <H3>What gets checked</H3>
          <Table
            head={['Check', 'Severity', 'Notes']}
            rows={[
              ['Expiry', 'CRITICAL if expired or < 7d', 'Days remaining computed from notAfter'],
              ['Signature algorithm', 'HIGH for SHA-1 / MD5', 'SHA-256 or better required'],
              ['Key strength', 'HIGH for RSA < 2048', 'RSA-2048+, ECDSA P-256+ recommended'],
              ['Chain completeness', 'MEDIUM if intermediate missing', 'Leaf → Intermediate → Root validated'],
              ['Self-signed', 'MEDIUM', 'Subject == Issuer detection'],
              ['SAN presence', 'INFO', 'CN-only certs are deprecated in modern browsers'],
              ['Wildcard', 'INFO', '*.example.com flagged for audit visibility'],
            ]}
          />
          <H3>Reading findings</H3>
          <P>Each finding includes: <strong>WHY</strong> (root cause), <strong>IMPACT</strong> (what breaks), and <strong>FIX</strong> (exact OpenSSL / keytool commands). Copy the fix command directly from the card.</P>
        </div>

        <div id="doc-tls" style={{ marginBottom: 48 }}>
          <H2>TLS Scanner</H2>
          <P>Enter any domain (e.g. <Code>api.example.com</Code> or <Code>host:8443</Code>) to retrieve and analyse the live certificate chain. EasySecurity uses a server-side proxy to fetch the TLS handshake since browser CORS policies prevent direct socket connections.</P>
          <H3>Limitations</H3>
          <P>Full TLS protocol analysis (cipher suites, protocol versions, HSTS) is not supported — use <Code>openssl s_client</Code> for deep TLS auditing. The scanner focuses exclusively on certificate metadata and chain validation.</P>
          <Block>{`# Equivalent CLI command
openssl s_client -connect api.example.com:443 -servername api.example.com \\
  -showcerts 2>/dev/null | openssl x509 -noout -text`}</Block>
        </div>

        <div id="doc-results" style={{ marginBottom: 48 }}>
          <H2>Risk & Scoring</H2>
          <P>Every scan produces a 0–100 security score and a risk level. The score starts at 100 and penalties are subtracted:</P>
          <Table
            head={['Condition', 'Penalty', 'Risk impact']}
            rows={[
              ['Expired', '−60', 'Always CRITICAL'],
              ['< 7 days to expiry', '−50', 'CRITICAL'],
              ['< 30 days to expiry', '−30', 'HIGH'],
              ['< 90 days to expiry', '−10', 'MEDIUM'],
              ['SHA-1 signature', '−30', '+1 severity band'],
              ['RSA key < 2048-bit', '−40', '+1 severity band'],
              ['Self-signed certificate', '−20', 'MEDIUM floor'],
              ['Incomplete chain', '−15', 'LOW–MEDIUM'],
            ]}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {[['SECURE', '90–100', 'green'], ['LOW', '80–89', 'teal'], ['MEDIUM', '56–79', 'orange'], ['HIGH', '31–55', 'orange'], ['CRITICAL', '0–30', 'red']].map(([label, range, color]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--slate-9)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
                <Badge color={color}>{label}</Badge>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{range}</span>
              </div>
            ))}
          </div>
        </div>

        <div id="doc-freessl" style={{ marginBottom: 48 }}>
          <H2>Free SSL via ACME (Let's Encrypt)</H2>
          <P>EasySecurity integrates with <strong>Let's Encrypt</strong> via the ACME protocol to issue real, browser-trusted 90-day certificates at no cost. No account registration required.</P>
          <H3>How it works</H3>
          <Table
            head={['Step', 'Action', 'Time']}
            rows={[
              ['1', 'Enter your domain — wildcards (*.example.com) supported', '< 1 min'],
              ['2', 'EasySecurity creates an ACME order and returns a DNS TXT challenge value', '~5 sec'],
              ['3', 'Add _acme-challenge TXT record at your DNS provider', '1–5 min'],
              ['4', 'Click Verify — EasySecurity confirms the TXT record and issues the cert', '< 30 sec'],
              ['5', 'Download cert.pem, key.pem, and fullchain.pem', 'instant'],
            ]}
          />
          <H3>Auto-DNS integration</H3>
          <P>Sign in and connect your <strong>Cloudflare</strong> or <strong>GoDaddy</strong> account to skip the manual DNS step. EasySecurity adds and removes the TXT record automatically.</P>
          <H3>Rate limits</H3>
          <P>Let's Encrypt enforces 5 duplicate certificates per week per domain. Staging mode (toggle in UI) uses the Let's Encrypt staging CA for testing without consuming rate limits — staging certificates are not browser-trusted.</P>
        </div>

        <div id="doc-monitor" style={{ marginBottom: 48 }}>
          <H2>Expiry Monitor</H2>
          <P>The Monitor dashboard tracks multiple domains and alerts you before certificates expire. A free account is required.</P>
          <H3>Certificate types</H3>
          <P>The dashboard shows two separate tables:</P>
          <Table
            head={['Type', 'Source', 'Scan behaviour']}
            rows={[
              ['Issued via EasySecurity', 'Certificates issued through this portal', 'Reads stored cert — consistent on every refresh'],
              ['External certificates', 'Domains you added for monitoring', 'Live TLS scan on each refresh'],
            ]}
          />
          <H3>Scan intervals</H3>
          <P>Configure per-domain scan frequency: every 6h, 12h, 24h (default), or weekly. Alert thresholds are configurable per domain (default: 30 days before expiry).</P>
          <H3>Actions per domain</H3>
          <P>🔄 Scan now · 🔍 View in scanner · 🔒 Request free cert · 🔴 Revoke cert · ✕ Remove from monitor</P>
        </div>

        <div id="doc-converter" style={{ marginBottom: 48 }}>
          <H2>Format Conversion</H2>
          <P>The Converter handles 8 bidirectional conversions entirely in-browser using node-forge. No files are uploaded to any server.</P>
          <Table
            head={['Conversion', 'Input', 'Output', 'Notes']}
            rows={[
              ['PEM → PFX', 'cert + key + chain (optional)', '.pfx', 'Windows IIS, Azure, F5'],
              ['PEM → JKS', 'cert + key', '.p12 + keytool command', 'Tomcat, Spring Boot'],
              ['PEM → DER', 'cert PEM', '.der', 'Binary X.509 for Java/Android'],
              ['PEM → P7B', 'cert PEM', '.p7b', 'Windows certificate store'],
              ['PFX → PEM', '.pfx + password', 'cert.pem + key.pem + chain.pem', 'Extract individual files'],
              ['PFX → JKS', '.pfx', 'keytool command', 'Provide keytool instructions'],
              ['JKS → PEM', '.jks + password', 'cert.pem + key.pem', 'Extract from keystore'],
              ['JKS → PFX', '.jks + password', '.pfx', 'Cross-platform migration'],
            ]}
          />
        </div>

        <div id="doc-jks" style={{ marginBottom: 48 }}>
          <H2>JKS Inspector</H2>
          <P>Upload a <Code>.jks</Code> or <Code>.keystore</Code> file to inspect all aliases, certificate chains, and key entries. The file is sent to a server-side Node.js function using the <Code>jks-js</Code> library — private keys are never returned in the response.</P>
          <H3>Supported entry types</H3>
          <Table
            head={['Type', 'Description']}
            rows={[
              ['PrivateKeyEntry', 'Private key + certificate chain. Used by application servers.'],
              ['TrustedCertEntry', 'CA or trust anchor certificate. No private key.'],
            ]}
          />
          <H3>Common keytool operations</H3>
          <Block>{`# List all aliases
keytool -list -v -keystore keystore.jks -storepass changeit

# Export cert to PEM
keytool -export -alias myalias -keystore keystore.jks -rfc -file cert.pem

# Convert JKS → PKCS12
keytool -importkeystore \\
  -srckeystore keystore.jks -srcstoretype JKS \\
  -destkeystore keystore.p12 -deststoretype PKCS12`}</Block>
        </div>

        <div id="doc-renew" style={{ marginBottom: 48 }}>
          <H2>Renewal Wizard</H2>
          <P>A 4-step guided renewal workflow — from CSR generation to deployment commands.</P>
          <Table
            head={['Step', 'Action']}
            rows={[
              ['1 — Details', 'Enter CN, O, OU, L, ST, C, SANs, key type (RSA-2048 / RSA-4096), hash (SHA-256 / SHA-384)'],
              ['2 — Generate CSR', 'Browser-side RSA key generation via node-forge. Private key never transmitted.'],
              ['3 — Get Certificate', 'Issue via EasySecurity (Let\'s Encrypt, free) or submit CSR to DigiCert / Sectigo / Internal CA'],
              ['4 — Deploy', 'Copy-ready commands for Nginx, Apache, JKS, Kubernetes, Node.js'],
            ]}
          />
          <P>The <strong>EasySecurity Free SSL</strong> option in step 3 redirects to the Free SSL page with your domain pre-filled and your CSR available for reference.</P>
        </div>

        <div id="doc-api" style={{ marginBottom: 48 }}>
          <H2>CI/CD API</H2>
          <P>Integrate certificate scanning into your deployment pipelines via REST API. Generate keys at <strong>API Keys</strong> (requires sign-in).</P>
          <H3>Authentication</H3>
          <P>Include your API key in every request as the <Code>X-API-Key</Code> header. Keys are prefixed <Code>eck_</Code> and hashed before storage — copy yours when generated.</P>
          <H3>Endpoints</H3>
          <Table
            head={['Method', 'Path', 'Auth', 'Description']}
            rows={[
              ['GET', '/api/v1/status', 'None', 'Health check — returns 200 OK'],
              ['POST', '/api/v1/scan/domain', 'X-API-Key', 'Scan a live TLS domain'],
              ['POST', '/api/v1/scan/file', 'X-API-Key', 'Upload and scan a certificate file'],
            ]}
          />
          <H3>Request / Response</H3>
          <Block>{`POST /api/v1/scan/domain
Content-Type: application/json
X-API-Key: eck_your_key_here

{
  "domain": "app.example.com",
  "fail_if_days_below": 30
}

→ 200 OK  (certificate passes threshold)
→ 422     (certificate fails threshold)

{
  "passed": true,
  "risk_level": "SECURE",
  "security_score": 91,
  "days_left": 287,
  "expires": "2027-01-15 10:30 UTC",
  "common_name": "app.example.com",
  "issuer": "DigiCert TLS RSA4096 SHA256 2022 CA1",
  "key_type": "RSA-2048",
  "sig_algo": "SHA256withRSA",
  "fail_reasons": [],
  "scanned_at": "2026-05-06T08:00:00Z"
}`}</Block>
        </div>

        <div id="doc-copilot" style={{ marginBottom: 48 }}>
          <H2>AI Copilot</H2>
          <P>The floating chat widget (bottom-right corner) is powered by Claude (Anthropic). It has deep knowledge of:</P>
          <Table
            head={['Topic', 'Examples']}
            rows={[
              ['X.509 & PKI', 'Certificate chains, OIDs, extensions, trust anchors'],
              ['OpenSSL CLI', 'Parsing, converting, signing, s_client debugging'],
              ['PKIX errors', 'certificate has expired, unable to get issuer certificate, self signed certificate in chain'],
              ['JKS & Java PKI', 'keytool commands, JSSE, TrustManager, SSLContext'],
              ['ACME / Let\'s Encrypt', 'DNS-01/HTTP-01 challenge, rate limits, certbot'],
              ['Renewal guidance', 'CA-specific workflows, DigiCert, Sectigo, internal CAs'],
            ]}
          />
          <P>When a scan is active, the copilot receives your certificate context and can answer questions specific to your actual certificate — e.g. "why is my chain failing?" or "what does this OID mean?".</P>
        </div>

        <div id="doc-privacy" style={{ marginBottom: 48 }}>
          <H2>Privacy & Security</H2>
          <Table
            head={['Data', 'Handling']}
            rows={[
              ['Uploaded certificates', 'Parsed in-memory, never stored or logged'],
              ['Private keys', 'Generated in-browser via node-forge — never transmitted'],
              ['Keystore passwords', 'Used only during scan, not stored anywhere'],
              ['JKS files', 'Sent to server-side Node.js for parsing; private key data stripped before response'],
              ['TLS scan data', 'Fetched server-side and returned; not persisted'],
              ['Account credentials', 'Email + hashed password stored encrypted in Supabase'],
              ['Monitor domain data', 'Stored under your account in Supabase; visible only to you'],
              ['API keys', 'SHA-256 hashed before storage — only the prefix is shown after generation'],
            ]}
          />
          <P>Authentication uses email/password only. No third-party OAuth (Google, GitHub, etc.) is used. Password reset is available via email link.</P>
        </div>

      </div>
    </div>
  )
}
