import { useState } from 'react'
import { generateCSR, decodeCSR, downloadText } from '../lib/pki'

export default function DecodeCSRPage() {
  const [tab, setTab] = useState('generate')
  const [form, setForm] = useState({ cn: '', o: '', ou: '', l: '', st: '', c: 'IN', email: '', san: '', keySize: '2048', hash: 'SHA256' })
  const [result, setResult] = useState(null)
  const [decoded, setDecoded] = useState(null)
  const [csrInput, setCsrInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const copy = (text, id) => { navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(''), 2000) }

  const gen = async () => {
    if (!form.cn) { setError('Common Name is required'); return }
    setError(''); setLoading(true)
    try {
      const r = await generateCSR(form)
      setResult(r)
    } catch (e) { setError(e.message) }
    setLoading(false)
  }

  const decode = () => {
    setError('')
    try {
      const d = decodeCSR(csrInput)
      setDecoded(d)
    } catch (e) { setError('Failed to decode: ' + e.message) }
  }

  return (
    <div className="content-wrap">
      <div className="page-header">
        <div className="page-title">🔑 CSR Tools</div>
        <div className="page-sub">Generate new Certificate Signing Requests or decode and inspect existing ones</div>
      </div>
      <div className="tab-bar" style={{ marginBottom: 20, maxWidth: 300 }}>
        <button className={`tab-btn ${tab === 'generate' ? 'active' : ''}`} onClick={() => setTab('generate')}>Generate CSR</button>
        <button className={`tab-btn ${tab === 'decode' ? 'active' : ''}`} onClick={() => setTab('decode')}>Decode CSR</button>
      </div>

      {tab === 'generate' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="card">
            <div className="card-title">Certificate Details</div>
            <div className="form-grid" style={{ marginBottom: 12 }}>
              <div className="form-group"><label>Common Name (CN) *</label><input placeholder="example.com or *.example.com" value={form.cn} onChange={e => set('cn', e.target.value)} /></div>
              <div className="form-group"><label>Organisation (O)</label><input placeholder="Acme Corp Pvt Ltd" value={form.o} onChange={e => set('o', e.target.value)} /></div>
              <div className="form-group"><label>Org Unit (OU)</label><input placeholder="IT Department" value={form.ou} onChange={e => set('ou', e.target.value)} /></div>
              <div className="form-group"><label>City / Locality (L)</label><input placeholder="Coimbatore" value={form.l} onChange={e => set('l', e.target.value)} /></div>
              <div className="form-group"><label>State (ST)</label><input placeholder="Tamil Nadu" value={form.st} onChange={e => set('st', e.target.value)} /></div>
              <div className="form-group"><label>Country (C)</label><input placeholder="IN" maxLength={2} value={form.c} onChange={e => set('c', e.target.value.toUpperCase())} /></div>
              <div className="form-group"><label>Email</label><input placeholder="admin@example.com" value={form.email} onChange={e => set('email', e.target.value)} /></div>
              <div className="form-group"><label>SANs (comma-separated)</label><input placeholder="www.example.com, api.example.com" value={form.san} onChange={e => set('san', e.target.value)} /></div>
              <div className="form-group"><label>Key Size</label><select value={form.keySize} onChange={e => set('keySize', e.target.value)}><option value="2048">RSA 2048-bit</option><option value="4096">RSA 4096-bit</option></select></div>
              <div className="form-group"><label>Signature Hash</label><select value={form.hash} onChange={e => set('hash', e.target.value)}><option value="SHA256">SHA-256</option><option value="SHA384">SHA-384</option><option value="SHA512">SHA-512</option></select></div>
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="btn btn-primary" onClick={gen} disabled={loading}>{loading ? <><span className="spinner"></span>Generating...</> : '⚡ Generate CSR'}</button>
              <button className="btn btn-secondary" onClick={() => { setForm({ cn:'',o:'',ou:'',l:'',st:'',c:'IN',email:'',san:'',keySize:'2048',hash:'SHA256' }); setResult(null) }}>Reset</button>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card">
              <div className="card-title">📄 CSR Output</div>
              {result ? <div className="output-box">{result.csr}<button className="copy-btn" onClick={() => copy(result.csr, 'csr')}>{copied === 'csr' ? '✓ Copied' : 'Copy'}</button></div> : <div className="output-box"><div className="output-placeholder">CSR will appear here</div></div>}
              {result && <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className="btn btn-secondary btn-sm" onClick={() => downloadText(result.csr, (form.cn || 'cert') + '.csr')}>⬇ .csr</button></div>}
            </div>
            <div className="card">
              <div className="card-title">🔒 Private Key</div>
              <div className="alert alert-warning" style={{ marginBottom: 10 }}>⚠ Save this key immediately. It is shown once and not stored anywhere.</div>
              {result ? <div className="output-box">{result.key}<button className="copy-btn" onClick={() => copy(result.key, 'key')}>{copied === 'key' ? '✓ Copied' : 'Copy'}</button></div> : <div className="output-box"><div className="output-placeholder">Private key will appear here</div></div>}
              {result && <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><button className="btn btn-secondary btn-sm" onClick={() => downloadText(result.key, (form.cn || 'cert') + '.key')}>⬇ .key</button></div>}
            </div>
          </div>
        </div>
      )}

      {tab === 'decode' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="card">
            <div className="card-title">Paste CSR</div>
            <textarea rows={18} placeholder="-----BEGIN CERTIFICATE REQUEST-----&#10;...&#10;-----END CERTIFICATE REQUEST-----" value={csrInput} onChange={e => setCsrInput(e.target.value)} />
            {error && <div className="alert alert-error" style={{ marginTop: 10 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary" onClick={decode}>🔍 Decode</button>
              <button className="btn btn-secondary" onClick={() => { setCsrInput(''); setDecoded(null) }}>Clear</button>
            </div>
          </div>
          <div className="card">
            <div className="card-title">Decoded Fields</div>
            {decoded ? (
              <>
                <div className="badge badge-secure" style={{ marginBottom: 12 }}>✓ Signature verified</div>
                <table className="data-table">
                  <thead><tr><th>Field</th><th>Value</th></tr></thead>
                  <tbody>
                    {[['Common Name', decoded.cn], ['Organisation', decoded.o], ['Org Unit', decoded.ou], ['City', decoded.l], ['State', decoded.st], ['Country', decoded.c], ['Email', decoded.email], ['SANs', decoded.sans?.join(', ') || '—'], ['Key Type', decoded.keyType], ['Signature Algorithm', decoded.sigAlgo]].map(([k, v]) => (
                      <tr key={k}><td>{k}</td><td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{v || '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </>
            ) : <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-4)', fontSize: 13 }}>Paste a CSR and click Decode</div>}
          </div>
        </div>
      )}
    </div>
  )
}
