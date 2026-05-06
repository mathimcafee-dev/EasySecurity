import { useState, useRef } from 'react'

export default function JKSInspector() {
  const [file, setFile] = useState(null)
  const [password, setPassword] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [drag, setDrag] = useState(false)
  const [selectedAlias, setSelectedAlias] = useState(null)
  const fileRef = useRef()

  const inspect = async () => {
    if (!file) return
    setLoading(true); setError(''); setResult(null)
    try {
      const buf = await file.arrayBuffer()
      const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
      const res = await fetch('/api/jks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jksBase64: b64, password })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult(data)
      setSelectedAlias(data.entries?.[0]?.alias || null)
    } catch(e) {
      setError('Failed to parse keystore: ' + (e.message || 'Wrong password or corrupt file'))
    }
    setLoading(false)
  }

  const selectedEntry = result?.entries?.find(e => e.alias === selectedAlias)

  return (
    <div className="content-wrap">
      <div className="page-header">
        <div className="page-title">☕ JKS Keystore Inspector</div>
        <div className="page-sub">Upload a Java KeyStore (.jks / .keystore) to inspect aliases, certificates and key entries</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div className="card">
          <div className="card-title">Upload Keystore</div>
          <div className={`upload-zone ${drag ? 'drag' : ''}`} style={{ marginBottom: 14 }}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if(f){setFile(f);setResult(null);setError('')} }}
            onClick={() => fileRef.current?.click()}>
            <input ref={fileRef} type="file" accept=".jks,.keystore,.p12,.pfx" style={{ display:'none' }}
              onChange={e => { if(e.target.files[0]){setFile(e.target.files[0]);setResult(null);setError('')} }} />
            <div className="upload-zone-icon"><span style={{ fontSize:20 }}>☕</span></div>
            {file
              ? <div><div style={{ fontWeight:700, fontSize:13, color:'var(--teal)' }}>{file.name}</div><div style={{ fontSize:11, color:'var(--text-3)', marginTop:2 }}>{(file.size/1024).toFixed(1)} KB</div></div>
              : <><div style={{ fontWeight:700, fontSize:13, marginBottom:4 }}>Drop .jks or .keystore file</div><div style={{ fontSize:11, color:'var(--text-3)' }}>JKS · PKCS#12 · .keystore</div></>
            }
          </div>
          <div className="form-group" style={{ marginBottom:14 }}>
            <label>Keystore Password</label>
            <input type="password" placeholder="Enter keystore password" value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && inspect()} />
          </div>
          {error && <div className="alert alert-error" style={{ marginBottom:12 }}>{error}</div>}
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-primary" onClick={inspect} disabled={loading || !file}>
              {loading ? <><span className="spinner"></span> Inspecting...</> : '🔍 Inspect Keystore'}
            </button>
            <button className="btn btn-secondary" onClick={() => { setFile(null); setResult(null); setError(''); setPassword('') }}>Clear</button>
          </div>
          <div className="alert alert-teal" style={{ marginTop:14 }}>
            🔒 Keystore processed server-side. Only certificate data is returned — private keys are never transmitted.
          </div>
        </div>

        <div className="card">
          <div className="card-title">Aliases {result && <span className="badge badge-teal" style={{ marginLeft:6 }}>{result.count}</span>}</div>
          {!result
            ? <div style={{ textAlign:'center', padding:'40px 0', color:'var(--text-4)', fontSize:13 }}>Upload a keystore to see its contents</div>
            : <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {result.entries.map(entry => (
                  <div key={entry.alias} onClick={() => setSelectedAlias(entry.alias)}
                    style={{ padding:'12px 14px', borderRadius:'var(--radius-sm)', cursor:'pointer', transition:'all .15s',
                      border:`1px solid ${selectedAlias===entry.alias?'var(--teal)':'var(--border)'}`,
                      background: selectedAlias===entry.alias?'var(--teal-light)':'var(--slate-10)',
                      display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <div style={{ fontFamily:'var(--mono)', fontSize:13, fontWeight:700, color:selectedAlias===entry.alias?'var(--teal-dark)':'var(--text)' }}>{entry.alias}</div>
                      <div style={{ fontSize:11, color:'var(--text-3)', marginTop:2 }}>{entry.hasKey ? 'PrivateKeyEntry' : 'TrustedCertEntry'}</div>
                    </div>
                    <div style={{ display:'flex', gap:6 }}>
                      {entry.hasKey && <span className="badge badge-teal" style={{ fontSize:9 }}>🔑 KEY</span>}
                      {entry.hasCert && <span className="badge badge-info" style={{ fontSize:9 }}>📜 CERT</span>}
                    </div>
                  </div>
                ))}
              </div>
          }
        </div>
      </div>

      {selectedEntry && (
        <div className="card">
          <div className="card-title">Entry — <span style={{ fontFamily:'var(--mono)', color:'var(--teal)' }}>{selectedEntry.alias}</span></div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
            <div>
              <table className="data-table">
                <thead><tr><th>Property</th><th>Value</th></tr></thead>
                <tbody>
                  <tr><td>Alias</td><td style={{ fontFamily:'var(--mono)', fontSize:12 }}>{selectedEntry.alias}</td></tr>
                  <tr><td>Has Private Key</td><td>{selectedEntry.hasKey ? <span className="badge badge-secure">✓ Yes</span> : <span className="badge badge-neutral">No</span>}</td></tr>
                  <tr><td>Has Certificate</td><td>{selectedEntry.hasCert ? <span className="badge badge-secure">✓ Yes</span> : <span className="badge badge-neutral">No</span>}</td></tr>
                </tbody>
              </table>
              {selectedEntry.hasKey && <div className="alert alert-warning" style={{ marginTop:12 }}>🔑 Private key present. Handle with care.</div>}
              {selectedEntry.hasCert && selectedEntry.cert && (
                <div style={{ marginTop:16, display:'flex', gap:8, flexWrap:'wrap' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(selectedEntry.cert)}>📋 Copy PEM</button>
                  <button className="btn btn-secondary btn-sm" onClick={() => { const a=document.createElement('a');a.href='data:text/plain,'+encodeURIComponent(selectedEntry.cert);a.download=selectedEntry.alias+'.pem';a.click() }}>⬇ Export .pem</button>
                  <button className="btn btn-primary btn-sm" onClick={() => { sessionStorage.setItem('ec_scan_pem', selectedEntry.cert); window.location.href='/' }}>🔍 Scan this cert</button>
                </div>
              )}
            </div>
            {selectedEntry.cert && (
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:8 }}>Certificate PEM</div>
                <div className="output-box" style={{ fontSize:10, maxHeight:260, overflow:'auto' }}>
                  {selectedEntry.cert}
                  <button className="copy-btn" onClick={() => navigator.clipboard.writeText(selectedEntry.cert)}>Copy</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop:20 }}>
        <div className="card-title">Useful keytool Commands</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          {[
            ['List all aliases', 'keytool -list -keystore keystore.jks -storepass changeit'],
            ['Export cert from JKS', 'keytool -export -alias myalias -keystore keystore.jks -file cert.der\nopenssl x509 -inform der -in cert.der -out cert.pem'],
            ['Convert JKS to PKCS12', 'keytool -importkeystore \\\n  -srckeystore keystore.jks \\\n  -destkeystore keystore.p12 \\\n  -deststoretype PKCS12'],
            ['Import cert into JKS', 'keytool -importcert -alias myca \\\n  -file ca.pem \\\n  -keystore keystore.jks \\\n  -storepass changeit'],
          ].map(([title, cmd]) => (
            <div key={title} style={{ background:'var(--slate-10)', border:'1px solid var(--border)', borderRadius:'var(--radius-sm)', padding:14 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--text-2)', marginBottom:8 }}>{title}</div>
              <div style={{ position:'relative' }}>
                <div className="output-box" style={{ fontSize:11 }}>{cmd}</div>
                <button className="copy-btn" onClick={() => navigator.clipboard.writeText(cmd)}>Copy</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
