import { useState } from 'react'
import { certModulus, parseCertPem, makePFX, makeDER, pemToBase64, downloadBytes, downloadText, dnsLookup } from '../lib/pki'

export function CertMatcher() {
  const [cert, setCert] = useState(''); const [key, setKey] = useState(''); const [result, setResult] = useState(null); const [error, setError] = useState('')
  const check = () => {
    setError('')
    try {
      const cm = certModulus(cert.trim(), 'cert'); const km = certModulus(key.trim(), 'key')
      if (!cm) { setError('Could not parse certificate'); return }
      if (!km) { setError('Could not parse private key'); return }
      let info = {}
      try { const c = parseCertPem(cert.trim()); info = { cn: c.commonName, issuer: c.issuerCN, notBefore: c.notBefore?.toLocaleDateString(), notAfter: c.notAfter?.toLocaleDateString(), serial: c.serial, keyType: c.keyType } } catch {}
      setResult({ matched: cm === km, info })
    } catch (e) { setError(e.message) }
  }
  return (
    <div className="content-wrap">
      <div className="page-header"><div className="page-title">🔐 Certificate & Key Matcher</div><div className="page-sub">Verify a certificate and private key are a matching pair via modulus comparison</div></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div className="card"><div className="card-title">📜 Certificate (PEM)</div><textarea rows={9} placeholder="-----BEGIN CERTIFICATE-----&#10;..." value={cert} onChange={e => setCert(e.target.value)} /></div>
        <div className="card"><div className="card-title">🔑 Private Key (PEM)</div><textarea rows={9} placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;or&#10;-----BEGIN PRIVATE KEY-----&#10;..." value={key} onChange={e => setKey(e.target.value)} /></div>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button className="btn btn-primary" onClick={check}>🔗 Check Match</button>
        <button className="btn btn-secondary" onClick={() => { setCert(''); setKey(''); setResult(null); setError('') }}>Clear</button>
      </div>
      {result && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ borderRadius: 'var(--radius)', padding: 24, textAlign: 'center', border: '1px solid', background: result.matched ? 'var(--green-light)' : 'var(--red-light)', borderColor: result.matched ? 'var(--green-border)' : 'var(--red-border)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{result.matched ? '✅' : '❌'}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: result.matched ? 'var(--green)' : 'var(--red)', marginBottom: 8 }}>{result.matched ? 'Certificate & Key Match!' : 'MISMATCH — Do Not Use'}</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>{result.matched ? 'The public key in the certificate matches this private key.' : 'This private key does NOT correspond to the certificate.'}</div>
          </div>
          <div className="card">
            <div className="card-title">Certificate Info</div>
            <table className="data-table"><tbody>
              {[['Common Name', result.info.cn], ['Issuer', result.info.issuer], ['Valid From', result.info.notBefore], ['Valid To', result.info.notAfter], ['Serial', result.info.serial], ['Key Type', result.info.keyType]].map(([k, v]) => v && <tr key={k}><td>{k}</td><td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{v}</td></tr>)}
            </tbody></table>
          </div>
        </div>
      )}
    </div>
  )
}

export function CertConversion() {
  const [tab, setTab] = useState('pfx'); const [cert, setCert] = useState(''); const [chain, setChain] = useState(''); const [key, setKey] = useState(''); const [pass, setPass] = useState(''); const [pem, setPem] = useState(''); const [b64, setB64] = useState(''); const [error, setError] = useState(''); const [success, setSuccess] = useState('')
  const clear = () => { setError(''); setSuccess('') }
  return (
    <div className="content-wrap">
      <div className="page-header"><div className="page-title">🔄 Certificate Conversion</div><div className="page-sub">Convert between PEM, DER, PFX/P12, Base64, and P7B formats — all in-browser</div></div>
      <div className="tab-bar" style={{ marginBottom: 20, maxWidth: 500 }}>
        {[['pfx','PFX / P12'],['der','PEM → DER'],['b64','PEM → Base64'],['p7b','PEM → P7B']].map(([k,l]) => (
          <button key={k} className={`tab-btn ${tab === k ? 'active' : ''}`} onClick={() => { setTab(k); clear() }}>{l}</button>
        ))}
      </div>
      {tab === 'pfx' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div className="card">
            <div className="card-title">Create PFX / P12</div>
            <div className="form-group" style={{ marginBottom: 12 }}><label>Certificate (PEM) *</label><textarea rows={5} placeholder="-----BEGIN CERTIFICATE-----&#10;..." value={cert} onChange={e => setCert(e.target.value)} /></div>
            <div className="form-group" style={{ marginBottom: 12 }}><label>CA Chain (optional)</label><textarea rows={4} placeholder="Intermediate certs..." value={chain} onChange={e => setChain(e.target.value)} /></div>
            <div className="form-group" style={{ marginBottom: 12 }}><label>Private Key (PEM) *</label><textarea rows={5} placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;..." value={key} onChange={e => setKey(e.target.value)} /></div>
            <div className="form-group" style={{ marginBottom: 14 }}><label>PFX Password</label><input type="password" placeholder="Leave blank for no password" value={pass} onChange={e => setPass(e.target.value)} /></div>
            {error && <div className="alert alert-error" style={{ marginBottom: 8 }}>{error}</div>}
            {success && <div className="alert alert-success" style={{ marginBottom: 8 }}>{success}</div>}
            <button className="btn btn-primary" onClick={() => { clear(); try { downloadBytes(makePFX(cert.trim(), key.trim(), chain, pass), 'certificate.pfx'); setSuccess('PFX downloaded!') } catch(e) { setError(e.message) } }}>⬇ Download PFX</button>
          </div>
          <div className="card">
            <div className="card-title">About PFX / P12</div>
            <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.8, marginBottom: 10 }}>PKCS#12 bundles your certificate, private key, and CA chain into a single encrypted file.</p>
            <ul style={{ paddingLeft: 16, lineHeight: 2, fontSize: 12, color: 'var(--text-2)' }}>
              <li>Windows IIS server import</li><li>Azure / AWS certificate upload</li><li>F5 / Citrix / Nginx load balancer</li><li>Java keystores (keytool import)</li>
            </ul>
            <div className="alert alert-teal" style={{ marginTop: 14 }}>🔒 All conversion runs in your browser. No data is sent to any server.</div>
          </div>
        </div>
      )}
      {tab === 'der' && (
        <div className="card" style={{ maxWidth: 700 }}>
          <div className="card-title">PEM → DER Binary</div>
          <div className="form-group" style={{ marginBottom: 14 }}><label>Certificate (PEM)</label><textarea rows={10} placeholder="-----BEGIN CERTIFICATE-----&#10;..." value={pem} onChange={e => setPem(e.target.value)} /></div>
          {error && <div className="alert alert-error" style={{ marginBottom: 8 }}>{error}</div>}
          {success && <div className="alert alert-success" style={{ marginBottom: 8 }}>{success}</div>}
          <button className="btn btn-primary" onClick={() => { clear(); try { downloadBytes(makeDER(pem.trim()), 'certificate.der'); setSuccess('DER downloaded!') } catch(e) { setError(e.message) } }}>⬇ Download .der</button>
        </div>
      )}
      {tab === 'b64' && (
        <div className="card" style={{ maxWidth: 700 }}>
          <div className="card-title">PEM → Base64</div>
          <div className="form-group" style={{ marginBottom: 14 }}><label>Certificate (PEM)</label><textarea rows={8} placeholder="-----BEGIN CERTIFICATE-----&#10;..." value={pem} onChange={e => setPem(e.target.value)} /></div>
          <button className="btn btn-primary" style={{ marginBottom: 14 }} onClick={() => { clear(); try { setB64(pemToBase64(pem.trim())); setSuccess('Converted!') } catch(e) { setError(e.message) } }}>Convert</button>
          {b64 && <div className="output-box">{b64}<button className="copy-btn" onClick={() => navigator.clipboard.writeText(b64)}>Copy</button></div>}
        </div>
      )}
      {tab === 'p7b' && (
        <div className="card" style={{ maxWidth: 700 }}>
          <div className="card-title">PEM → PKCS#7 / P7B</div>
          <div className="form-group" style={{ marginBottom: 14 }}><label>Certificate (PEM)</label><textarea rows={10} placeholder="-----BEGIN CERTIFICATE-----&#10;..." value={pem} onChange={e => setPem(e.target.value)} /></div>
          {error && <div className="alert alert-error" style={{ marginBottom: 8 }}>{error}</div>}
          {success && <div className="alert alert-success" style={{ marginBottom: 8 }}>{success}</div>}
          <button className="btn btn-primary" onClick={() => { clear(); try { const b = pemToBase64(pem.trim()); downloadText(`-----BEGIN PKCS7-----\n${b}\n-----END PKCS7-----`, 'certificate.p7b'); setSuccess('P7B downloaded!') } catch(e) { setError(e.message) } }}>⬇ Download .p7b</button>
        </div>
      )}
    </div>
  )
}

const DNS_TYPES = ['CNAME', 'TXT', 'CAA', 'A', 'MX', 'AAAA']
export function DNSChecker() {
  const [domain, setDomain] = useState(''); const [tab, setTab] = useState('CNAME'); const [results, setResults] = useState({}); const [loading, setLoading] = useState(false); const [error, setError] = useState('')
  const lookup = async (type) => {
    const d = domain.trim().replace(/^https?:\/\//,'').replace(/\/.*/,'')
    if (!d) { setError('Enter a domain'); return }
    setError(''); setLoading(true)
    try { const r = await dnsLookup(d, type); setResults(p => ({ ...p, [type]: { ...r, domain: d, ts: new Date().toLocaleTimeString() } })) } catch(e) { setError(e.message) }
    setLoading(false)
  }
  const lookupAll = async () => {
    const d = domain.trim().replace(/^https?:\/\//,'').replace(/\/.*/,'')
    for (const t of DNS_TYPES) { try { const r = await dnsLookup(d, t); setResults(p => ({ ...p, [t]: { ...r, domain: d, ts: new Date().toLocaleTimeString() } })) } catch {} }
  }
  const cur = results[tab]
  const statusLabel = { 0: ['Resolved', 'success'], 2: ['Server Failed', 'error'], 3: ['NXDOMAIN', 'error'], 5: ['Refused', 'warning'] }
  return (
    <div className="content-wrap">
      <div className="page-header"><div className="page-title">🌐 DNS Checker</div><div className="page-sub">Live DNS lookups via Google Public DNS — CNAME, TXT, CAA, A, MX and more</div></div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, minWidth: 200 }}><label>Domain / Hostname</label><input placeholder="ssl.example.com or _dnsauth.example.com" value={domain} onChange={e => setDomain(e.target.value)} onKeyDown={e => e.key === 'Enter' && lookup(tab)} /></div>
          <button className="btn btn-primary" onClick={() => lookup(tab)} disabled={loading}>{loading ? <span className="spinner"></span> : '🔍 Lookup'}</button>
          <button className="btn btn-secondary" onClick={lookupAll} disabled={loading}>All Records</button>
        </div>
        {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}
      </div>
      <div className="tab-bar" style={{ marginBottom: 16, maxWidth: 500 }}>
        {DNS_TYPES.map(t => <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => { setTab(t); lookup(t) }}>{t}</button>)}
      </div>
      <div className="card">
        <div className="card-title">{tab} Records</div>
        {cur ? (
          <>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              {(() => { const [lbl, cls] = statusLabel[cur.status] || ['Unknown','neutral']; return <span className={`badge badge-${cls}`}>{lbl}</span> })()}
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{cur.domain} at {cur.ts}</span>
            </div>
            {cur.records.length === 0
              ? <div className="alert alert-info">No {tab} records found.</div>
              : cur.records.map((r, i) => (
                <div key={i} style={{ background: 'var(--slate-10)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginBottom: 8 }}>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 12, wordBreak: 'break-all', marginBottom: 6 }}>{r.data}</div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--text-3)', flexWrap: 'wrap', alignItems: 'center' }}>
                    <span>{r.name}</span>
                    <span className={`badge ${r.ttl < 300 ? 'badge-high' : r.ttl < 3600 ? 'badge-info' : 'badge-secure'}`} style={{ fontSize: 9 }}>TTL: {r.ttl}s</span>
                    {tab === 'CAA' && r.data?.includes('digicert') && <span className="badge badge-teal" style={{ fontSize: 9 }}>DigiCert authorized</span>}
                    {tab === 'TXT' && r.data?.includes('digicert') && <span className="badge badge-teal" style={{ fontSize: 9 }}>DigiCert DCV</span>}
                  </div>
                </div>
              ))}
          </>
        ) : <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-4)', fontSize: 13 }}>Enter a domain and click Lookup</div>}
      </div>
      {Object.keys(results).length > 1 && (
        <div style={{ marginTop: 20 }}>
          <div className="section-label">All Records Summary</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))', gap: 10 }}>
            {Object.entries(results).map(([type, data]) => (
              <div key={type} className="card" style={{ padding: '12px 14px', cursor: 'pointer', textAlign: 'center' }} onClick={() => setTab(type)}>
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--teal)', marginBottom: 4 }}>{type}</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{data.records.length}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>record{data.records.length !== 1 ? 's' : ''}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
