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

  const inspect = async (fileData, pass) => {
    setLoading(true); setError(''); setResult(null)
    try {
      // Dynamically import jks-js
      const jks = await import('jks-js')
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const buf = e.target.result
          const uint8 = new Uint8Array(buf)
          const keystore = jks.toPem(uint8, pass)
          const aliases = Object.keys(keystore)
          if (aliases.length === 0) throw new Error('No entries found. Check password.')

          const entries = aliases.map(alias => {
            const entry = keystore[alias]
            let certInfo = null
            if (entry.cert) {
              try { certInfo = parseCertPemBasic(entry.cert) } catch {}
            }
            return {
              alias,
              type: entry.key ? 'PrivateKeyEntry' : 'TrustedCertEntry',
              hasKey: !!entry.key,
              hasCert: !!entry.cert,
              certPem: entry.cert || null,
              certInfo,
            }
          })

          setResult({ entries, aliasCount: aliases.length })
          setSelectedAlias(aliases[0])
        } catch (e) {
          setError('Failed to parse keystore: ' + (e.message || 'Wrong password or corrupt file'))
        }
        setLoading(false)
      }
      reader.onerror = () => { setError('Failed to read file'); setLoading(false) }
      reader.readAsArrayBuffer(fileData)
    } catch (e) {
      setError('Failed to load JKS parser: ' + e.message)
      setLoading(false)
    }
  }

  const parseCertPemBasic = (pem) => {
    // Basic cert info extraction without node-forge (already imported in pki.js)
    try {
      const lines = pem.split('\n').filter(l => !l.startsWith('---'))
      const b64 = lines.join('')
      const der = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
      // Just get a fingerprint-like summary from length
      return {
        pemLength: pem.length,
        derSize: der.length,
        pem,
      }
    } catch { return null }
  }

  const handleFile = (f) => {
    setFile(f); setResult(null); setError('')
  }

  const handleDrop = (e) => {
    e.preventDefault(); setDrag(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const selectedEntry = result?.entries?.find(e => e.alias === selectedAlias)

  return (
    <div className="content-wrap">
      <div className="page-header">
        <div className="page-title">☕ JKS Keystore Inspector</div>
        <div className="page-sub">Upload a Java KeyStore (.jks / .keystore) to inspect aliases, certificates and key entries</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Upload card */}
        <div className="card">
          <div className="card-title">Upload Keystore</div>

          <div
            className={`upload-zone ${drag ? 'drag' : ''}`}
            style={{ marginBottom: 14 }}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".jks,.keystore,.p12,.pfx" style={{ display: 'none' }}
              onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
            <div className="upload-zone-icon">
              <span style={{ fontSize: 20 }}>☕</span>
            </div>
            {file ? (
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--teal)' }}>{file.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{(file.size / 1024).toFixed(1)} KB</div>
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Drop .jks or .keystore file</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>JKS · PKCS#12 · .keystore</div>
              </>
            )}
          </div>

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label>Keystore Password</label>
            <input
              type="password"
              placeholder="Enter keystore password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && file && inspect(file, password)}
            />
          </div>

          {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={() => file && inspect(file, password)} disabled={loading || !file}>
              {loading ? <><span className="spinner"></span> Inspecting...</> : '🔍 Inspect Keystore'}
            </button>
            <button className="btn btn-secondary" onClick={() => { setFile(null); setResult(null); setError(''); setPassword('') }}>Clear</button>
          </div>

          <div className="alert alert-teal" style={{ marginTop: 14 }}>
            🔒 Keystore processed entirely in your browser. Password and keys never leave your device.
          </div>
        </div>

        {/* Alias list */}
        <div className="card">
          <div className="card-title">Aliases {result && <span className="badge badge-teal" style={{ marginLeft: 6 }}>{result.aliasCount}</span>}</div>
          {!result ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-4)', fontSize: 13 }}>
              Upload a keystore to see its contents
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {result.entries.map(entry => (
                <div
                  key={entry.alias}
                  onClick={() => setSelectedAlias(entry.alias)}
                  style={{
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${selectedAlias === entry.alias ? 'var(--teal)' : 'var(--border)'}`,
                    background: selectedAlias === entry.alias ? 'var(--teal-light)' : 'var(--slate-10)',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'all .15s'
                  }}
                >
                  <div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: selectedAlias === entry.alias ? 'var(--teal-dark)' : 'var(--text)' }}>
                      {entry.alias}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{entry.type}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {entry.hasKey && <span className="badge badge-teal" style={{ fontSize: 9 }}>🔑 KEY</span>}
                    {entry.hasCert && <span className="badge badge-info" style={{ fontSize: 9 }}>📜 CERT</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Entry detail */}
      {selectedEntry && (
        <div className="card">
          <div className="card-title">
            Entry Details — <span style={{ fontFamily: 'var(--mono)', color: 'var(--teal)' }}>{selectedEntry.alias}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <table className="data-table">
                <thead><tr><th>Property</th><th>Value</th></tr></thead>
                <tbody>
                  <tr><td>Alias</td><td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{selectedEntry.alias}</td></tr>
                  <tr><td>Entry Type</td><td><span className="badge badge-teal">{selectedEntry.type}</span></td></tr>
                  <tr><td>Has Private Key</td><td>{selectedEntry.hasKey ? <span className="badge badge-secure">✓ Yes</span> : <span className="badge badge-neutral">No</span>}</td></tr>
                  <tr><td>Has Certificate</td><td>{selectedEntry.hasCert ? <span className="badge badge-secure">✓ Yes</span> : <span className="badge badge-neutral">No</span>}</td></tr>
                </tbody>
              </table>

              {selectedEntry.hasKey && (
                <div className="alert alert-warning" style={{ marginTop: 12 }}>
                  🔑 Private key present in this entry. Handle with care.
                </div>
              )}

              {selectedEntry.hasCert && (
                <div style={{ marginTop: 16 }}>
                  <div className="section-label">Quick actions</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => {
                      navigator.clipboard.writeText(selectedEntry.certPem)
                    }}>📋 Copy Cert PEM</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => {
                      const a = document.createElement('a')
                      a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(selectedEntry.certPem)
                      a.download = selectedEntry.alias + '.pem'
                      a.click()
                    }}>⬇ Export .pem</button>
                    <button className="btn btn-primary btn-sm" onClick={() => {
                      sessionStorage.setItem('ec_scan_pem', selectedEntry.certPem)
                      window.location.href = '/'
                    }}>🔍 Scan this cert</button>
                  </div>
                </div>
              )}
            </div>

            {selectedEntry.certPem && (
              <div>
                <div className="section-label">Certificate PEM</div>
                <div className="output-box" style={{ fontSize: 10, maxHeight: 260, overflow: 'auto', marginTop: 8 }}>
                  {selectedEntry.certPem}
                  <button className="copy-btn" onClick={() => navigator.clipboard.writeText(selectedEntry.certPem)}>Copy</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* OpenSSL commands */}
      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-title">Useful OpenSSL Commands</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {[
            ['List all aliases', 'keytool -list -keystore keystore.jks -storepass changeit'],
            ['Export cert from JKS', 'keytool -export -alias myalias -keystore keystore.jks -file cert.der\nopenssl x509 -inform der -in cert.der -out cert.pem'],
            ['Convert JKS to PKCS12', 'keytool -importkeystore \\\n  -srckeystore keystore.jks \\\n  -destkeystore keystore.p12 \\\n  -deststoretype PKCS12'],
            ['Import cert into JKS', 'keytool -importcert -alias myca \\\n  -file ca.pem \\\n  -keystore keystore.jks \\\n  -storepass changeit'],
          ].map(([title, cmd]) => (
            <div key={title} style={{ background: 'var(--slate-10)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8 }}>{title}</div>
              <div className="code-block" style={{ position: 'relative', fontSize: 11 }}>
                {cmd}
                <button className="copy-btn" onClick={() => navigator.clipboard.writeText(cmd)}>Copy</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
