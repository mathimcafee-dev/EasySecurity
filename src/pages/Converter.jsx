import { useState, useRef } from 'react'
import forge from 'node-forge'
import { makePFX, makeDER, pemToBase64, downloadBytes, downloadText } from '../lib/pki'

// ── Helpers ───────────────────────────────────────────────────────────────────
function readFileAsBuffer(file) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = e => res(new Uint8Array(e.target.result))
    r.onerror = rej
    r.readAsArrayBuffer(file)
  })
}

function readFileAsText(file) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = e => res(e.target.result)
    r.onerror = rej
    r.readAsText(file)
  })
}

async function parsePFXFile(file, password) {
  const buf = await readFileAsBuffer(file)
  const b64 = btoa(String.fromCharCode(...buf))
  const p12Asn1 = forge.asn1.fromDer(forge.util.decode64(b64))
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password || '')
  const certs = [], keys = []
  p12.safeContents.forEach(sc => {
    sc.safeBags.forEach(bag => {
      if (bag.type === forge.pki.oids.certBag && bag.cert) {
        certs.push(forge.pki.certificateToPem(bag.cert))
      }
      if (bag.type === forge.pki.oids.pkcs8ShroudedKeyBag && bag.key) {
        keys.push(forge.pki.privateKeyToPem(bag.key))
      }
      if (bag.type === forge.pki.oids.keyBag && bag.key) {
        keys.push(forge.pki.privateKeyToPem(bag.key))
      }
    })
  })
  return { certs, key: keys[0] || null }
}

async function parseJKSFile(file, password) {
  const buf = await readFileAsBuffer(file)
  const jks = await import('jks-js')
  const keystore = jks.toPem(buf, password || '')
  const aliases = Object.keys(keystore)
  const certs = [], keys = []
  aliases.forEach(alias => {
    const entry = keystore[alias]
    if (entry.cert) {
      // split chain if multiple certs
      const pemRe = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g
      const matches = entry.cert.match(pemRe) || [entry.cert]
      certs.push(...matches)
    }
    if (entry.key) keys.push(entry.key)
    if (entry.ca) certs.push(entry.ca)
  })
  return { certs, key: keys[0] || null, aliases }
}

// ── Format card with file or text input ──────────────────────────────────────
function InputCard({ title, icon, accepts, onFile, onText, textValue, textPlaceholder, passwordLabel, password, onPassword, fileLabel, hint }) {
  const [drag, setDrag] = useState(false)
  const [fileName, setFileName] = useState(null)
  const ref = useRef()
  const handleFile = (f) => { setFileName(f.name); onFile?.(f) }
  return (
    <div className="card" style={{ height: '100%' }}>
      <div className="card-title">{icon} {title}</div>
      {accepts && (
        <div
          className={`upload-zone ${drag ? 'drag' : ''}`}
          style={{ marginBottom: 12, padding: '16px 12px' }}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          onClick={() => ref.current?.click()}
        >
          <input ref={ref} type="file" accept={accepts} style={{ display: 'none' }} onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
          {fileName
            ? <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--teal)' }}>📎 {fileName}</div>
            : <><div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-3)', marginBottom: 3 }}>{fileLabel || 'Drop file or click to browse'}</div><div style={{ fontSize: 11, color: 'var(--text-4)' }}>{accepts}</div></>
          }
        </div>
      )}
      {onText && (
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label>Or paste PEM</label>
          <textarea rows={5} placeholder={textPlaceholder} value={textValue} onChange={e => onText(e.target.value)} />
        </div>
      )}
      {passwordLabel && (
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>{passwordLabel}</label>
          <input type="password" placeholder="Leave blank if no password" value={password} onChange={e => onPassword(e.target.value)} />
        </div>
      )}
      {hint && <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 8 }}>{hint}</div>}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
const CONVERSIONS = [
  { id: 'pem-to-pfx',   from: 'PEM/CRT + KEY',   to: 'PFX / P12',   icon: '🔄', desc: 'Bundle cert + key + chain into PKCS#12' },
  { id: 'pem-to-jks',   from: 'PEM/CRT + KEY',   to: 'JKS',         icon: '☕', desc: 'Create Java KeyStore from PEM files' },
  { id: 'pem-to-der',   from: 'PEM / CRT',        to: 'DER',         icon: '📦', desc: 'Binary DER format for Java/Android' },
  { id: 'pem-to-p7b',   from: 'PEM / Chain',      to: 'P7B / PKCS7', icon: '🗂', desc: 'PKCS#7 format for Windows/IIS import' },
  { id: 'pfx-to-pem',   from: 'PFX / P12',        to: 'PEM',         icon: '📄', desc: 'Extract cert + key + chain from PFX' },
  { id: 'pfx-to-jks',   from: 'PFX / P12',        to: 'JKS',         icon: '☕', desc: 'Convert PKCS#12 to Java KeyStore' },
  { id: 'jks-to-pem',   from: 'JKS / KeyStore',   to: 'PEM',         icon: '📄', desc: 'Extract certs and keys from JKS' },
  { id: 'jks-to-pfx',   from: 'JKS / KeyStore',   to: 'PFX / P12',   icon: '🔄', desc: 'Convert Java KeyStore to PKCS#12' },
]

export default function Converter() {
  const [selected, setSelected] = useState('pem-to-pfx')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [outputs, setOutputs] = useState([])

  // shared inputs
  const [certPem, setCertPem] = useState('')
  const [certFile, setCertFile] = useState(null)
  const [chainPem, setChainPem] = useState('')
  const [keyPem, setKeyPem] = useState('')
  const [pfxFile, setPfxFile] = useState(null)
  const [jksFile, setJksFile] = useState(null)
  const [srcPass, setSrcPass] = useState('')
  const [dstPass, setDstPass] = useState('')
  const [alias, setAlias] = useState('mykey')
  const [outName, setOutName] = useState('certificate')

  const reset = () => { setError(''); setSuccess(''); setOutputs([]) }

  const run = async () => {
    setLoading(true); reset()
    try {
      switch (selected) {

        case 'pem-to-pfx': {
          const cert = certFile ? await readFileAsText(certFile) : certPem
          if (!cert.trim()) throw new Error('Certificate PEM required')
          if (!keyPem.trim()) throw new Error('Private key PEM required')
          const bytes = makePFX(cert.trim(), keyPem.trim(), chainPem, dstPass)
          downloadBytes(bytes, outName + '.pfx')
          setSuccess('PFX downloaded successfully!')
          break
        }

        case 'pem-to-jks': {
          const cert = certFile ? await readFileAsText(certFile) : certPem
          if (!cert.trim()) throw new Error('Certificate PEM required')
          if (!keyPem.trim()) throw new Error('Private key PEM required')
          // JKS = PKCS12 with JKS magic — create P12 first then note conversion
          const bytes = makePFX(cert.trim(), keyPem.trim(), chainPem, dstPass)
          downloadBytes(bytes, outName + '.p12')
          setSuccess('PKCS#12 created. Use keytool to convert to JKS:')
          setOutputs([{
            label: 'Convert P12 → JKS with keytool',
            value: `keytool -importkeystore \\\n  -srckeystore ${outName}.p12 \\\n  -srcstoretype PKCS12 \\\n  -srcstorepass "${dstPass || 'changeit'}" \\\n  -destkeystore ${outName}.jks \\\n  -deststoretype JKS \\\n  -deststorepass "${dstPass || 'changeit'}" \\\n  -destkeypass "${dstPass || 'changeit'}" \\\n  -alias "${alias}"`,
            type: 'cmd'
          }])
          break
        }

        case 'pem-to-der': {
          const cert = certFile ? await readFileAsText(certFile) : certPem
          if (!cert.trim()) throw new Error('Certificate PEM required')
          downloadBytes(makeDER(cert.trim()), outName + '.der')
          setSuccess('DER file downloaded!')
          break
        }

        case 'pem-to-p7b': {
          const cert = certFile ? await readFileAsText(certFile) : certPem
          if (!cert.trim()) throw new Error('Certificate PEM required')
          const b64 = pemToBase64(cert.trim())
          downloadText(`-----BEGIN PKCS7-----\n${b64}\n-----END PKCS7-----`, outName + '.p7b')
          setSuccess('P7B file downloaded!')
          break
        }

        case 'pfx-to-pem': {
          if (!pfxFile) throw new Error('PFX / P12 file required')
          const { certs, key } = await parsePFXFile(pfxFile, srcPass)
          if (certs.length === 0) throw new Error('No certificates found in PFX')
          const outs = []
          outs.push({ label: 'Certificate (cert.pem)', value: certs[0], type: 'pem', filename: outName + '-cert.pem' })
          if (certs.length > 1) outs.push({ label: 'CA Chain (chain.pem)', value: certs.slice(1).join('\n'), type: 'pem', filename: outName + '-chain.pem' })
          if (key) outs.push({ label: 'Private Key (key.pem)', value: key, type: 'pem', filename: outName + '-key.pem' })
          setOutputs(outs)
          setSuccess(`Extracted ${certs.length} cert(s)${key ? ' + private key' : ''} from PFX`)
          break
        }

        case 'pfx-to-jks': {
          if (!pfxFile) throw new Error('PFX / P12 file required')
          await parsePFXFile(pfxFile, srcPass) // validate first
          setSuccess('PFX validated! Use keytool to convert:')
          setOutputs([{
            label: 'Convert PFX → JKS with keytool',
            value: `keytool -importkeystore \\\n  -srckeystore ${pfxFile.name} \\\n  -srcstoretype PKCS12 \\\n  -srcstorepass "${srcPass || 'changeit'}" \\\n  -destkeystore ${outName}.jks \\\n  -deststorepass "${dstPass || 'changeit'}" \\\n  -alias "${alias}"`,
            type: 'cmd'
          }])
          break
        }

        case 'jks-to-pem': {
          if (!jksFile) throw new Error('JKS / KeyStore file required')
          const { certs, key, aliases } = await parseJKSFile(jksFile, srcPass)
          if (certs.length === 0 && !key) throw new Error('No entries found. Check password.')
          const outs = []
          if (certs.length > 0) outs.push({ label: `Certificate chain (${certs.length} cert${certs.length > 1 ? 's' : ''})`, value: certs.join('\n'), type: 'pem', filename: outName + '-chain.pem' })
          if (certs[0]) outs.push({ label: 'Leaf cert only', value: certs[0], type: 'pem', filename: outName + '-cert.pem' })
          if (key) outs.push({ label: 'Private key', value: key, type: 'pem', filename: outName + '-key.pem' })
          setOutputs(outs)
          setSuccess(`Extracted from JKS (${aliases?.length} alias${aliases?.length !== 1 ? 'es' : ''})`)
          break
        }

        case 'jks-to-pfx': {
          if (!jksFile) throw new Error('JKS / KeyStore file required')
          const { certs, key } = await parseJKSFile(jksFile, srcPass)
          if (certs.length === 0) throw new Error('No certificates found in JKS')
          if (!key) throw new Error('No private key found in JKS. JKS may only contain trusted certs.')
          const bytes = makePFX(certs[0], key, certs.slice(1).join('\n'), dstPass)
          downloadBytes(bytes, outName + '.pfx')
          setSuccess('PFX downloaded from JKS!')
          break
        }

        default: throw new Error('Unknown conversion')
      }
    } catch (e) {
      setError(e.message)
    }
    setLoading(false)
  }

  const conv = CONVERSIONS.find(c => c.id === selected)

  return (
    <div className="content-wrap">
      <div className="page-header">
        <div className="page-title">🔄 Certificate Converter</div>
        <div className="page-sub">Convert between any certificate format — PEM, PFX/P12, JKS, DER, P7B. All processing in-browser.</div>
      </div>

      {/* Conversion selector */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">Select Conversion</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {CONVERSIONS.map(c => (
            <button key={c.id} onClick={() => { setSelected(c.id); reset() }}
              style={{
                padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: `1px solid ${selected === c.id ? 'var(--teal)' : 'var(--border)'}`,
                background: selected === c.id ? 'var(--teal-light)' : 'var(--surface)',
                cursor: 'pointer', textAlign: 'left', transition: 'all .15s', fontFamily: 'var(--font)'
              }}>
              <div style={{ fontSize: 16, marginBottom: 4 }}>{c.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: selected === c.id ? 'var(--teal-dark)' : 'var(--text)', marginBottom: 2 }}>
                {c.from} → {c.to}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-4)', lineHeight: 1.4 }}>{c.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Inputs */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* LEFT — source inputs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {['pem-to-pfx','pem-to-jks','pem-to-der','pem-to-p7b'].includes(selected) && (
            <InputCard title="Certificate" icon="📜" accepts=".pem,.crt,.cer" onFile={setCertFile} onText={setCertPem} textValue={certPem}
              textPlaceholder="-----BEGIN CERTIFICATE-----&#10;..." fileLabel="Drop .pem / .crt file" />
          )}

          {['pem-to-pfx','pem-to-jks'].includes(selected) && (
            <div className="card">
              <div className="card-title">🔗 CA Chain <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-4)' }}>(optional)</span></div>
              <textarea rows={4} placeholder="-----BEGIN CERTIFICATE-----&#10;Intermediate + Root certs..." value={chainPem} onChange={e => setChainPem(e.target.value)} />
            </div>
          )}

          {['pem-to-pfx','pem-to-jks'].includes(selected) && (
            <div className="card">
              <div className="card-title">🔑 Private Key</div>
              <textarea rows={5} placeholder="-----BEGIN RSA PRIVATE KEY-----&#10;or&#10;-----BEGIN PRIVATE KEY-----" value={keyPem} onChange={e => setKeyPem(e.target.value)} />
            </div>
          )}

          {['pfx-to-pem','pfx-to-jks'].includes(selected) && (
            <InputCard title="PFX / P12 File" icon="🔄" accepts=".pfx,.p12"
              onFile={setPfxFile} fileLabel="Drop .pfx or .p12 file"
              passwordLabel="PFX Password" password={srcPass} onPassword={setSrcPass} />
          )}

          {['jks-to-pem','jks-to-pfx'].includes(selected) && (
            <InputCard title="JKS / KeyStore File" icon="☕" accepts=".jks,.keystore"
              onFile={setJksFile} fileLabel="Drop .jks or .keystore file"
              passwordLabel="Keystore Password" password={srcPass} onPassword={setSrcPass} />
          )}
        </div>

        {/* RIGHT — output options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card">
            <div className="card-title">⚙️ Output Options</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group">
                <label>Output filename (without extension)</label>
                <input placeholder="certificate" value={outName} onChange={e => setOutName(e.target.value)} />
              </div>
              {['pem-to-pfx','pem-to-jks','pfx-to-jks','jks-to-pfx'].includes(selected) && (
                <div className="form-group">
                  <label>{selected.includes('to-jks') || selected === 'pem-to-jks' ? 'JKS' : 'PFX'} Password {selected.includes('pfx-to') || selected.includes('jks-to') ? '(destination)' : ''}</label>
                  <input type="password" placeholder="Set output password (optional)" value={dstPass} onChange={e => setDstPass(e.target.value)} />
                </div>
              )}
              {['pem-to-jks','pfx-to-jks'].includes(selected) && (
                <div className="form-group">
                  <label>Alias name</label>
                  <input placeholder="mykey" value={alias} onChange={e => setAlias(e.target.value)} />
                </div>
              )}
            </div>
          </div>

          {/* What this conversion does */}
          <div className="card" style={{ background: 'var(--teal-light)', border: '1px solid var(--teal-border)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--teal-dark)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.6px' }}>
              {conv?.from} → {conv?.to}
            </div>
            <div style={{ fontSize: 13, color: 'var(--teal-darker)', lineHeight: 1.7 }}>
              {{
                'pem-to-pfx': 'Bundles your certificate, private key, and CA chain into a PKCS#12 file. Used for Windows IIS, Azure, F5, Citrix, and Nginx.',
                'pem-to-jks': 'Creates a PKCS#12 first, then provides the keytool command to import into a JKS. Required for Tomcat, WebLogic, JBoss, and Spring Boot.',
                'pem-to-der': 'Converts PEM to binary DER format. Required for Java, Android, and some legacy systems.',
                'pem-to-p7b': 'Creates a PKCS#7 bundle. Used for Windows certificate store and IIS chain import.',
                'pfx-to-pem': 'Extracts the leaf certificate, CA chain, and private key from a PKCS#12 file into separate PEM files.',
                'pfx-to-jks': 'Validates your PFX and provides the keytool command to convert to JKS.',
                'jks-to-pem': 'Reads all aliases from the JKS and exports certificates and keys as PEM files.',
                'jks-to-pfx': 'Extracts the certificate and key from JKS and bundles into a PKCS#12 / PFX file.',
              }[selected]}
            </div>
          </div>
        </div>
      </div>

      {/* Convert button */}
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20 }}>
        <button className="btn btn-primary btn-lg" onClick={run} disabled={loading}>
          {loading ? <><span className="spinner"></span> Converting...</> : `${conv?.icon} Convert ${conv?.from} → ${conv?.to}`}
        </button>
        <button className="btn btn-secondary" onClick={() => { reset(); setCertPem(''); setChainPem(''); setKeyPem(''); setSrcPass(''); setDstPass(''); setCertFile(null); setPfxFile(null); setJksFile(null) }}>Clear</button>
      </div>

      {/* Outputs */}
      {success && (
        <div className="alert alert-success" style={{ marginBottom: outputs.length ? 12 : 0 }}>✓ {success}</div>
      )}

      {outputs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {outputs.map((out, i) => (
            <div key={i} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div className="card-title" style={{ margin: 0 }}>{out.label}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard.writeText(out.value)}>📋 Copy</button>
                  {out.filename && (
                    <button className="btn btn-primary btn-sm" onClick={() => {
                      const a = document.createElement('a')
                      a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(out.value)
                      a.download = out.filename; a.click()
                    }}>⬇ Download</button>
                  )}
                </div>
              </div>
              <div className={out.type === 'cmd' ? 'code-block' : 'output-box'} style={{ fontSize: 11, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {out.value}
              </div>
              {out.type === 'pem' && out.label.includes('key') && (
                <div className="alert alert-warning" style={{ marginTop: 8 }}>⚠ This is a private key. Keep it secure and never share it.</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Privacy notice */}
      <div className="alert alert-teal" style={{ marginTop: 20 }}>
        🔒 All conversions run entirely in your browser using node-forge. Certificates, private keys, and passwords never leave your device.
      </div>
    </div>
  )
}
