import { useState } from 'react'
import { generateCSR, downloadText } from '../lib/pki'

const STEPS = ['Verify Details', 'Generate CSR', 'Submit to CA', 'Deploy']

const CA_GUIDES = {
  letsencrypt: `# Let's Encrypt (Certbot)
certbot certonly --standalone -d YOUR_DOMAIN

# Or with existing CSR:
certbot certonly --csr ./server.csr -d YOUR_DOMAIN`,
  digicert: `# Submit your CSR at:
# https://www.digicert.com/easy-csr/

# After approval, download the certificate bundle
# and install on your server.`,
  sectigo: `# Submit CSR at Sectigo portal:
# https://secure.sectigo.com/

# Select certificate type → paste CSR → complete DCV`,
  internal: `# Sign with internal CA (OpenSSL):
openssl ca -config openssl.cnf \\
  -in server.csr \\
  -out server.crt \\
  -days 365

# Or using a root CA key:
openssl x509 -req -in server.csr \\
  -CA rootCA.crt -CAkey rootCA.key \\
  -CAcreateserial -out server.crt -days 365`
}

const DEPLOY_GUIDES = {
  nginx: (cn) => `# Nginx configuration
ssl_certificate /etc/ssl/${cn}.crt;
ssl_certificate_key /etc/ssl/${cn}.key;
ssl_trusted_certificate /etc/ssl/chain.pem;

# Reload
nginx -t && systemctl reload nginx`,
  apache: (cn) => `# Apache configuration
SSLCertificateFile /etc/ssl/${cn}.crt
SSLCertificateKeyFile /etc/ssl/${cn}.key
SSLCertificateChainFile /etc/ssl/chain.pem

# Reload
apachectl configtest && systemctl reload apache2`,
  jks: (cn) => `# Import to Java KeyStore
# Step 1: Create PKCS#12
openssl pkcs12 -export \\
  -in ${cn}.crt -inkey ${cn}.key \\
  -certfile chain.pem \\
  -out ${cn}.p12 -name "${cn}"

# Step 2: Import to JKS
keytool -importkeystore \\
  -srckeystore ${cn}.p12 \\
  -srcstoretype PKCS12 \\
  -destkeystore keystore.jks \\
  -deststorepass changeit`,
  k8s: (cn) => `# Kubernetes TLS secret
kubectl create secret tls ${cn.replace(/\*/g,'wildcard').replace(/\./g,'-')}-tls \\
  --cert=${cn}.crt \\
  --key=${cn}.key \\
  -n your-namespace

# Ingress annotation
annotations:
  kubernetes.io/tls-acme: "true"
spec:
  tls:
  - hosts:
    - ${cn}
    secretName: ${cn.replace(/\*/g,'wildcard').replace(/\./g,'-')}-tls`,
  nodejs: (cn) => `// Node.js HTTPS server
const https = require('https');
const fs = require('fs');

const options = {
  key: fs.readFileSync('${cn}.key'),
  cert: fs.readFileSync('${cn}.crt'),
  ca: fs.readFileSync('chain.pem')
};

https.createServer(options, app).listen(443);`,
}

export default function RenewWizard() {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState({ cn: '', o: '', ou: '', l: '', st: '', c: 'IN', email: '', san: '', keySize: '2048', hash: 'SHA256' })
  const [csr, setCSR] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [caTab, setCaTab] = useState('digicert')
  const [deployTab, setDeployTab] = useState('nginx')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const genCSR = async () => {
    if (!form.cn) { setError('Common Name required'); return }
    setError(''); setLoading(true)
    try { const r = await generateCSR(form); setCSR(r); setStep(2) } catch(e) { setError(e.message) }
    setLoading(false)
  }

  return (
    <div className="content-wrap">
      <div className="page-header"><div className="page-title">🔄 Certificate Renewal Wizard</div><div className="page-sub">4-step guided renewal — from CSR generation to deployment commands</div></div>

      <div className="stepper" style={{ marginBottom: 28 }}>
        {STEPS.map((s, i) => (
          <div key={s} className={`step ${i < step ? 'done' : i === step ? 'active' : ''}`}>
            <div className="step-circle">{i < step ? '✓' : i + 1}</div>
            <div className="step-label">{s}</div>
            {i < STEPS.length - 1 && <div className="step-line"></div>}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="card">
          <div className="card-title">Step 1 — Verify Certificate Details</div>
          <div className="form-grid">
            <div className="form-group"><label>Common Name (CN) *</label><input placeholder="example.com" value={form.cn} onChange={e => set('cn', e.target.value)} /></div>
            <div className="form-group"><label>Organisation</label><input placeholder="Acme Corp" value={form.o} onChange={e => set('o', e.target.value)} /></div>
            <div className="form-group"><label>Org Unit</label><input value={form.ou} onChange={e => set('ou', e.target.value)} /></div>
            <div className="form-group"><label>City</label><input value={form.l} onChange={e => set('l', e.target.value)} /></div>
            <div className="form-group"><label>State</label><input value={form.st} onChange={e => set('st', e.target.value)} /></div>
            <div className="form-group"><label>Country</label><input maxLength={2} value={form.c} onChange={e => set('c', e.target.value.toUpperCase())} /></div>
            <div className="form-group"><label>Email</label><input value={form.email} onChange={e => set('email', e.target.value)} /></div>
            <div className="form-group form-full"><label>SANs (comma-separated)</label><input placeholder="www.example.com, api.example.com" value={form.san} onChange={e => set('san', e.target.value)} /></div>
            <div className="form-group"><label>Key Type</label><select value={form.keySize} onChange={e => set('keySize', e.target.value)}><option value="2048">RSA 2048-bit</option><option value="4096">RSA 4096-bit</option></select></div>
            <div className="form-group"><label>Hash</label><select value={form.hash} onChange={e => set('hash', e.target.value)}><option value="SHA256">SHA-256</option><option value="SHA384">SHA-384</option></select></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-primary" onClick={() => { if (!form.cn) { setError('CN required'); return } setError(''); setStep(1) }}>Next: Generate CSR →</button>
          </div>
          {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
        </div>
      )}

      {step === 1 && (
        <div className="card">
          <div className="card-title">Step 2 — Generate CSR & Private Key</div>
          <div className="alert alert-teal" style={{ marginBottom: 16 }}>🔒 Private key generated in your browser via node-forge. It never reaches any server.</div>
          {!csr ? (
            <>
              {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
              <button className="btn btn-primary" onClick={genCSR} disabled={loading}>{loading ? <><span className="spinner"></span>Generating...</> : '⚡ Generate CSR + Private Key'}</button>
            </>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}>
                <div className="section-label">CSR</div>
                <div className="output-box">{csr.csr}<button className="copy-btn" onClick={() => navigator.clipboard.writeText(csr.csr)}>Copy</button></div>
                <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => downloadText(csr.csr, form.cn + '.csr')}>⬇ Download .csr</button>
              </div>
              <div className="alert alert-warning" style={{ marginBottom: 12 }}>⚠ Save your private key NOW. It cannot be recovered after leaving this page.</div>
              <div>
                <div className="section-label">Private Key</div>
                <div className="output-box">{csr.key}<button className="copy-btn" onClick={() => navigator.clipboard.writeText(csr.key)}>Copy</button></div>
                <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => downloadText(csr.key, form.cn + '.key')}>⬇ Download .key</button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn btn-secondary" onClick={() => setStep(0)}>← Back</button>
                <button className="btn btn-primary" onClick={() => setStep(2)}>Next: Submit to CA →</button>
              </div>
            </>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <div className="card-title">Step 3 — Submit to Your CA</div>
          <div className="tab-bar" style={{ marginBottom: 16, maxWidth: 450 }}>
            {[['digicert','DigiCert'],['sectigo','Sectigo'],['letsencrypt',"Let's Encrypt"],['internal','Internal CA']].map(([k,l]) => (
              <button key={k} className={`tab-btn ${caTab === k ? 'active' : ''}`} onClick={() => setCaTab(k)}>{l}</button>
            ))}
          </div>
          <div className="code-block">{CA_GUIDES[caTab]?.replace('YOUR_DOMAIN', form.cn || 'example.com')}<button className="copy-btn" style={{ position: 'absolute', top: 8, right: 8 }} onClick={() => navigator.clipboard.writeText(CA_GUIDES[caTab] || '')}>Copy</button></div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-secondary" onClick={() => setStep(1)}>← Back</button>
            <button className="btn btn-primary" onClick={() => setStep(3)}>Next: Deploy →</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="card">
          <div className="card-title">Step 4 — Deploy Your New Certificate</div>
          <div className="tab-bar" style={{ marginBottom: 16, maxWidth: 450 }}>
            {[['nginx','Nginx'],['apache','Apache'],['jks','Java / JKS'],['k8s','Kubernetes'],['nodejs','Node.js']].map(([k,l]) => (
              <button key={k} className={`tab-btn ${deployTab === k ? 'active' : ''}`} onClick={() => setDeployTab(k)}>{l}</button>
            ))}
          </div>
          <div className="code-block" style={{ position: 'relative' }}>
            {DEPLOY_GUIDES[deployTab]?.(form.cn || 'example.com')}
            <button className="copy-btn" onClick={() => navigator.clipboard.writeText(DEPLOY_GUIDES[deployTab]?.(form.cn) || '')}>Copy</button>
          </div>
          <div className="alert alert-success" style={{ marginTop: 16 }}>✅ Certificate renewal complete. Test your deployment with: <code style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>openssl s_client -connect {form.cn || 'example.com'}:443</code></div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-secondary" onClick={() => setStep(2)}>← Back</button>
            <button className="btn btn-primary" onClick={() => { setStep(0); setCSR(null); setForm({ cn:'',o:'',ou:'',l:'',st:'',c:'IN',email:'',san:'',keySize:'2048',hash:'SHA256' }) }}>🔄 Start New Renewal</button>
          </div>
        </div>
      )}
    </div>
  )
}
