import { useState, useEffect } from 'react'
import { downloadText } from '../lib/pki'

const SUPABASE_URL = 'https://zwgdpsuvduexcdzcwjau.supabase.co'
const ACME_FN = `${SUPABASE_URL}/functions/v1/acme-ssl`

function genSessionId() {
  return crypto.randomUUID().replace(/-/g, '')
}

const STEPS = ['Enter Domain', 'Add DNS Record', 'Verify & Issue', 'Download']

const DNS_GUIDES = {
  vercel: {
    label: 'Vercel DNS',
    icon: '▲',
    steps: [
      'Go to vercel.com/mathivspartan/domains/easysecurity.in',
      'Click Add Record',
      'Type: TXT, Name: _acme-challenge, Value: (paste TXT value), TTL: 60',
      'Click Save — changes are instant, no wait needed',
      'Come back and click Verify DNS',
    ]
  },
  godaddy: {
    label: 'GoDaddy',
    icon: '🐐',
    steps: [
      'Go to dcc.godaddy.com → DNS Management',
      'Click Add New Record',
      'Type: TXT, Name: _acme-challenge, Value: (paste below), TTL: 600',
      'Click Save',
    ]
  },
  cloudflare: {
    label: 'Cloudflare',
    icon: '🟠',
    steps: [
      'Go to dash.cloudflare.com → your domain → DNS',
      'Click Add Record',
      'Type: TXT, Name: _acme-challenge, Content: (paste below), TTL: Auto',
      'Click Save',
    ]
  },
  namecheap: {
    label: 'Namecheap',
    icon: '🔷',
    steps: [
      'Go to namecheap.com → Domain List → Manage → Advanced DNS',
      'Click Add New Record',
      'Type: TXT, Host: _acme-challenge, Value: (paste below), TTL: 300',
      'Click Save',
    ]
  },
  other: {
    label: 'Other',
    icon: '🌐',
    steps: [
      'Log in to your DNS provider',
      'Add a new TXT record',
      'Name/Host: _acme-challenge (or _acme-challenge.yourdomain.com)',
      'Value: (paste the TXT value below)',
      'TTL: 300-600 seconds',
      'Save the record',
    ]
  }
}

export default function FreeSSL() {
  const [step, setStep] = useState(0)
  const [domain, setDomain] = useState('')
  const [sessionId] = useState(() => {
    const stored = localStorage.getItem('ec_ssl_session')
    if (stored) return stored
    const id = genSessionId()
    localStorage.setItem('ec_ssl_session', id)
    return id
  })
  const [staging, setStaging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [challengeInfo, setChallengeInfo] = useState(null)
  const [dnsGuide, setDnsGuide] = useState('vercel')
  const [verifyStatus, setVerifyStatus] = useState(null)
  const [certResult, setCertResult] = useState(null)
  const [copied, setCopied] = useState('')
  const [polling, setPolling] = useState(false)

  // Restore state on refresh
  useEffect(() => {
    const saved = localStorage.getItem('ec_ssl_state')
    if (saved) {
      try {
        const s = JSON.parse(saved)
        if (s.step && s.step > 0) {
          if (s.domain) setDomain(s.domain)
          if (s.challengeInfo) setChallengeInfo(s.challengeInfo)
          if (s.step <= 2) setStep(s.step)
          setAgreed(true)
        }
      } catch {}
    }
  }, [])
  const [dnsCheckResult, setDnsCheckResult] = useState(null)
  const [agreed, setAgreed] = useState(false)

  const copy = (text, id) => {
    navigator.clipboard.writeText(text)
    setCopied(id)
    setTimeout(() => setCopied(''), 2000)
  }

  const call = async (action, extra = {}) => {
    const res = await fetch(ACME_FN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, sessionId, domain: domain.trim(), staging, ...extra })
    })
    return res.json()
  }

  // Step 1 → Start order
  const startOrder = async () => {
    const d = domain.trim().replace(/^https?:\/\//, '').replace(/\/.*/, '')
    if (!d) { setError('Enter a domain name'); return }
    if (!agreed) { setError('Please agree to the Let\'s Encrypt terms of service'); return }
    setError(''); setLoading(true)
    const data = await call('start', { domain: d }).catch(e => ({ error: e.message }))
    setLoading(false)
    if (data.error) { setError(data.error); return }
    setChallengeInfo(data)
    localStorage.setItem('ec_ssl_state', JSON.stringify({ step: 1, domain: domain.trim().replace(/^https?:\/\//, '').replace(/\/.*/, ''), challengeInfo: data }))
    setStep(1)
  }

  // Step 2 → Verify DNS
  const verifyDNS = async () => {
    setError(''); setLoading(true); setDnsCheckResult(null)
    const data = await call('verify').catch(e => ({ error: e.message }))
    setLoading(false)
    if (data.error) { setError(data.error); return }
    setDnsCheckResult(data)
    if (data.verified) {
      setVerifyStatus('verified')
      localStorage.setItem('ec_ssl_state', JSON.stringify({ step: 2, domain: domain.trim().replace(/^https?:\/\//, '').replace(/\/.*/, '') }))
      setStep(2)
    } else {
      setVerifyStatus('not_found')
    }
  }

  // Step 3 → Finalize + download cert
  const finalizeCert = async () => {
    setError(''); setLoading(true); setPolling(true)
    // Poll finalize up to 5 times
    let result = null
    for (let i = 0; i < 5; i++) {
      const data = await call('finalize').catch(e => ({ error: e.message }))
      if (data.error) { setError(data.error); setLoading(false); setPolling(false); return }
      if (data.ok && data.status === 'issued') { result = data; break }
      if (data.status === 'invalid') { setError(data.error || 'Validation failed'); setLoading(false); setPolling(false); return }
      await new Promise(r => setTimeout(r, 3000))
    }
    setLoading(false); setPolling(false)
    if (!result) { setError('Certificate not ready yet. Wait a moment and try again.'); return }
    setCertResult(result)
    setStep(3)
  }

  const guide = DNS_GUIDES[dnsGuide]

  return (
    <div className="content-wrap">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <div className="page-title">🔒 Free SSL Generator</div>
              <span className="badge badge-secure">Powered by Let's Encrypt</span>
            </div>
            <div className="page-sub">Get a free 90-day SSL certificate for any domain. Renew anytime.</div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-3)', cursor: 'pointer', textTransform: 'none', fontWeight: 500, letterSpacing: 0 }}>
            <input type="checkbox" checked={staging} onChange={e => setStaging(e.target.checked)} />
            Use staging (test mode)
          </label>
        </div>
      </div>

      {/* Stepper */}
      <div className="stepper" style={{ marginBottom: 28 }}>
        {STEPS.map((s, i) => (
          <div key={s} className={`step ${i < step ? 'done' : i === step ? 'active' : ''}`}>
            <div className="step-circle">{i < step ? '✓' : i + 1}</div>
            <div className="step-label">{s}</div>
            {i < STEPS.length - 1 && <div className="step-line"></div>}
          </div>
        ))}
      </div>

      {/* STEP 0 — Enter domain */}
      {step === 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="card">
            <div className="card-title">🌐 Domain Details</div>

            <div className="form-group" style={{ marginBottom: 14 }}>
              <label>Domain Name</label>
              <input
                placeholder="example.com or subdomain.example.com"
                value={domain}
                onChange={e => setDomain(e.target.value.replace(/^https?:\/\//, '').replace(/\/.*/, ''))}
                onKeyDown={e => e.key === 'Enter' && startOrder()}
                autoFocus
              />
              <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>
                Wildcards (*.example.com) supported via DNS-01
              </div>
            </div>

            <div style={{ background: 'var(--slate-9)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>What you'll need:</div>
              {[
                ['📝', 'Access to your domain\'s DNS settings (GoDaddy, Cloudflare, etc.)'],
                ['⏱', '2–5 minutes for DNS propagation'],
                ['🔑', 'The private key stays in your browser — never sent to us'],
              ].map(([icon, text]) => (
                <div key={text} style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--text-2)', marginBottom: 6 }}>
                  <span>{icon}</span><span>{text}</span>
                </div>
              ))}
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', marginBottom: 16, textTransform: 'none', fontSize: 13, fontWeight: 400, color: 'var(--text-2)', letterSpacing: 0 }}>
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} style={{ marginTop: 2, width: 'auto' }} />
              <span>I agree to the <a href="https://letsencrypt.org/documents/LE-SA-v1.3-September-21-2022.pdf" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal)' }}>Let's Encrypt Subscriber Agreement</a> and confirm I control this domain.</span>
            </label>

            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

            <button className="btn btn-primary btn-lg" onClick={startOrder} disabled={loading || !domain.trim()}>
              {loading ? <><span className="spinner"></span> Preparing...</> : '🔒 Generate Free SSL →'}
            </button>
          </div>

          <div className="card">
            <div className="card-title">ℹ️ About Free SSL</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                ['🏛', "Let's Encrypt", "The world's largest free CA. Trusted by all browsers. Issues 3 million certs per day."],
                ['📅', '90-day validity', 'Free certs last 90 days. Use EasySecurity Monitor to get reminded before expiry.'],
                ['🔁', 'Renewals are free', 'Come back anytime to renew. The process takes under 5 minutes.'],
                ['🔒', 'DNS-01 validation', 'You prove domain ownership by adding a TXT record. No server access needed.'],
                ['✅', 'Wildcard support', 'Get a cert for *.example.com covering all subdomains.'],
                ['📦', 'All formats', 'Download as PEM, PFX, or JKS. Compatible with all web servers.'],
              ].map(([icon, title, desc]) => (
                <div key={title} style={{ display: 'flex', gap: 12 }}>
                  <div style={{ fontSize: 18, flexShrink: 0 }}>{icon}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>{title}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* STEP 1 — Add DNS record */}
      {step === 1 && !challengeInfo && (
        <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Session expired</div>
          <div style={{ color: 'var(--text-3)', fontSize: 13, marginBottom: 16 }}>Please start again to get a new DNS challenge value.</div>
          <button className="btn btn-primary" onClick={() => { localStorage.removeItem('ec_ssl_state'); localStorage.removeItem('ec_ssl_session'); setStep(0); }}>← Start Over</button>
        </div>
      )}
      {step === 1 && challengeInfo && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="card">
            <div className="card-title">📋 Add This DNS TXT Record</div>

            <div style={{ background: 'var(--teal-light)', border: '1px solid var(--teal-border)', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal-dark)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: 10 }}>
                Add this TXT record to your DNS:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  ['Type', 'TXT'],
                  ['Name / Host', challengeInfo.challengeDomain?.replace(`.${domain.replace(/^https?:\/\//, '').replace(/\/.*/, '')}`, '') || '_acme-challenge'],
                  ['Value', challengeInfo.txtValue],
                  ['TTL', '300'],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff', borderRadius: 6, padding: '8px 12px', border: '1px solid var(--teal-border)' }}>
                    <div style={{ width: 60, fontSize: 11, fontWeight: 700, color: 'var(--text-3)', flexShrink: 0 }}>{label}</div>
                    <div style={{ flex: 1, fontFamily: label === 'Value' ? 'var(--mono)' : 'inherit', fontSize: label === 'Value' ? 11 : 13, fontWeight: 600, wordBreak: 'break-all' }}>{value}</div>
                    <button className="btn btn-ghost btn-sm" style={{ padding: '3px 8px', flexShrink: 0 }} onClick={() => copy(value, label)}>
                      {copied === label ? '✓' : '📋'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="alert alert-warning" style={{ marginBottom: 16 }}>
              ⚠ Some DNS providers want just <strong>_acme-challenge</strong> as the name, others want the full <strong>_acme-challenge.{domain}</strong>. Use the short form first.
            </div>

            {dnsCheckResult?.verified === false && (
              <div className="alert alert-error" style={{ marginBottom: 12 }}>
                TXT record not found yet. DNS takes 1–5 minutes to propagate. Wait and try again.
              </div>
            )}

            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-lg" onClick={verifyDNS} disabled={loading}>
                {loading ? <><span className="spinner"></span> Checking DNS...</> : '✅ Verify DNS & Continue →'}
              </button>
              <button className="btn btn-secondary" onClick={() => { localStorage.removeItem('ec_ssl_state'); setStep(0); setChallengeInfo(null); }}>← Back</button>
            </div>
          </div>

          <div className="card">
            <div className="card-title">📖 DNS Setup Guide</div>
            <div className="tab-bar" style={{ marginBottom: 14 }}>
              {Object.entries(DNS_GUIDES).map(([key, g]) => (
                <button key={key} className={`tab-btn ${dnsGuide === key ? 'active' : ''}`} onClick={() => setDnsGuide(key)}>
                  {g.icon} {g.label}
                </button>
              ))}
            </div>
            <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {guide.steps.map((s, i) => (
                <li key={i} style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>{s}</li>
              ))}
            </ol>
            <div className="alert alert-teal" style={{ marginTop: 14 }}>
              💡 After saving, wait 1–5 minutes before clicking Verify. You can check propagation at{' '}
              <a href={`https://dnschecker.org/#TXT/${challengeInfo.challengeDomain}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--teal-dark)', fontWeight: 600 }}>
                dnschecker.org
              </a>
            </div>
          </div>
        </div>
      )}

      {/* STEP 2 — Finalize */}
      {step === 2 && (
        <div className="card" style={{ maxWidth: 600 }}>
          <div className="card-title">🎉 DNS Verified — Ready to Issue</div>
          <div className="alert alert-success" style={{ marginBottom: 16 }}>
            ✅ TXT record confirmed. Let's Encrypt has verified your domain ownership.
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 20 }}>
            Click below to generate your certificate. This will:
            <ul style={{ paddingLeft: 20, marginTop: 8 }}>
              <li>Generate a 2048-bit RSA key pair in your browser</li>
              <li>Submit a CSR to Let's Encrypt</li>
              <li>Download your signed certificate</li>
            </ul>
          </div>

          {polling && (
            <div className="alert alert-teal" style={{ marginBottom: 14 }}>
              <span className="spinner" style={{ marginRight: 8 }}></span>
              Waiting for Let's Encrypt to sign your certificate... (up to 30 seconds)
            </div>
          )}

          {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-primary btn-lg" onClick={finalizeCert} disabled={loading}>
              {loading ? <><span className="spinner"></span> Issuing...</> : '🔐 Issue My Certificate →'}
            </button>
            <button className="btn btn-secondary" onClick={() => { localStorage.removeItem('ec_ssl_state'); setStep(0); setChallengeInfo(null); }}>← Start Over</button>
          </div>
        </div>
      )}

      {/* STEP 3 — Download */}
      {step === 3 && certResult && (
        <div>
          <div className="alert alert-success" style={{ marginBottom: 20, fontSize: 15, fontWeight: 600 }}>
            🎉 SSL Certificate issued successfully for <strong>{certResult.domain}</strong>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div className="card">
              <div className="card-title">📜 Certificate (cert.pem)</div>
              <div className="output-box" style={{ fontSize: 10, maxHeight: 180, overflow: 'auto' }}>
                {certResult.cert}
                <button className="copy-btn" onClick={() => copy(certResult.cert, 'cert')}>{copied === 'cert' ? '✓' : 'Copy'}</button>
              </div>
              <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={() => downloadText(certResult.cert, `${certResult.domain}-cert.pem`)}>⬇ Download cert.pem</button>
            </div>

            <div className="card">
              <div className="card-title">🔑 Private Key (key.pem)</div>
              <div className="alert alert-warning" style={{ marginBottom: 8 }}>⚠ Save this now. Never share it. It was generated in your browser.</div>
              <div className="output-box" style={{ fontSize: 10, maxHeight: 140, overflow: 'auto' }}>
                {certResult.privateKey}
                <button className="copy-btn" onClick={() => copy(certResult.privateKey, 'key')}>{copied === 'key' ? '✓' : 'Copy'}</button>
              </div>
              <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={() => downloadText(certResult.privateKey, `${certResult.domain}-key.pem`)}>⬇ Download key.pem</button>
            </div>
          </div>

          {certResult.chain && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-title">🔗 Full Chain (fullchain.pem) — use this for most servers</div>
              <div className="output-box" style={{ fontSize: 10, maxHeight: 120, overflow: 'auto' }}>
                {certResult.fullchain}
                <button className="copy-btn" onClick={() => copy(certResult.fullchain, 'chain')}>{copied === 'chain' ? '✓' : 'Copy'}</button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => downloadText(certResult.fullchain, `${certResult.domain}-fullchain.pem`)}>⬇ fullchain.pem</button>
                <button className="btn btn-secondary btn-sm" onClick={() => downloadText(certResult.chain, `${certResult.domain}-chain.pem`)}>⬇ chain.pem</button>
              </div>
            </div>
          )}

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-title">🚀 Install on Your Server</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {[
                ['Nginx', `ssl_certificate /etc/ssl/${certResult.domain}-fullchain.pem;\nssl_certificate_key /etc/ssl/${certResult.domain}-key.pem;\n\n# Reload\nnginx -t && systemctl reload nginx`],
                ['Apache', `SSLCertificateFile /etc/ssl/${certResult.domain}-cert.pem\nSSLCertificateKeyFile /etc/ssl/${certResult.domain}-key.pem\nSSLCertificateChainFile /etc/ssl/${certResult.domain}-chain.pem\n\n# Reload\napachectl configtest && systemctl reload apache2`],
                ['Node.js', `const https = require('https'), fs = require('fs')\nhttps.createServer({\n  cert: fs.readFileSync('fullchain.pem'),\n  key: fs.readFileSync('key.pem')\n}, app).listen(443)`],
                ['Certbot import', `sudo cp ${certResult.domain}-fullchain.pem /etc/letsencrypt/live/${certResult.domain}/fullchain.pem\nsudo cp ${certResult.domain}-key.pem /etc/letsencrypt/live/${certResult.domain}/privkey.pem`],
              ].map(([title, cmd]) => (
                <div key={title} style={{ background: 'var(--slate-10)', borderRadius: 'var(--radius-sm)', padding: 12, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{title}</div>
                  <div className="code-block" style={{ fontSize: 10, position: 'relative' }}>
                    {cmd}
                    <button className="copy-btn" onClick={() => copy(cmd, title)}>Copy</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => {
              // Download all as zip bundle
              downloadText(certResult.cert, `${certResult.domain}-cert.pem`)
              setTimeout(() => downloadText(certResult.privateKey, `${certResult.domain}-key.pem`), 300)
              setTimeout(() => downloadText(certResult.fullchain, `${certResult.domain}-fullchain.pem`), 600)
            }}>⬇ Download All Files</button>
            <button className="btn btn-secondary" onClick={() => window.open('/convert', '_blank')}>🔄 Convert to PFX/JKS</button>
            <button className="btn btn-secondary" onClick={() => window.open('/monitor', '_blank')}>📅 Add to Monitor</button>
            <button className="btn btn-secondary" onClick={() => { localStorage.removeItem('ec_ssl_session'); setStep(0); setDomain(''); setCertResult(null); setChallengeInfo(null); window.location.reload() }}>🔄 Issue Another</button>
          </div>

          <div className="alert alert-teal" style={{ marginTop: 16 }}>
            📅 This certificate expires in <strong>90 days</strong>. Add your domain to the <a href="/monitor" style={{ color: 'var(--teal-dark)', fontWeight: 600 }}>Expiry Monitor</a> to get an email reminder when it's time to renew.
          </div>
        </div>
      )}
    </div>
  )
}

