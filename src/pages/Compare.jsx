import { useState } from 'react'
import { parsePemBundle, scoreAndRisk, compareCerts } from '../lib/pki'

export default function Compare() {
  const [pemA, setPemA] = useState('')
  const [pemB, setPemB] = useState('')
  const [diff, setDiff] = useState(null)
  const [error, setError] = useState('')
  const [scoreA, setScoreA] = useState(null)
  const [scoreB, setScoreB] = useState(null)

  const compare = () => {
    setError('')
    try {
      const ca = parsePemBundle(pemA)[0]
      const cb = parsePemBundle(pemB)[0]
      if (!ca || !cb) throw new Error('Could not parse one or both certificates')
      setDiff(compareCerts(ca, cb))
      setScoreA(scoreAndRisk([ca]))
      setScoreB(scoreAndRisk([cb]))
    } catch(e) { setError(e.message) }
  }

  return (
    <div className="content-wrap">
      <div className="page-header">
        <div className="page-title">⚖️ Certificate Comparison</div>
        <div className="page-sub">Diff two certificates side by side across 14 fields — spot renewal changes instantly</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card"><div className="card-title">Certificate A</div><textarea rows={10} placeholder="Paste PEM certificate A..." value={pemA} onChange={e => setPemA(e.target.value)} /></div>
        <div className="card"><div className="card-title">Certificate B</div><textarea rows={10} placeholder="Paste PEM certificate B..." value={pemB} onChange={e => setPemB(e.target.value)} /></div>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}
      <button className="btn btn-primary" style={{ marginBottom: 20 }} onClick={compare}>⚖️ Compare Certificates</button>
      {diff && (
        <div className="card">
          <div className="card-title">Comparison Results — {diff.filter(d => d.changed).length} differences found</div>
          <table className="data-table">
            <thead><tr><th>Field</th><th>Certificate A</th><th>Certificate B</th></tr></thead>
            <tbody>
              {diff.map(row => (
                <tr key={row.field} style={{ background: row.changed ? 'var(--amber-light)' : 'inherit' }}>
                  <td>{row.field}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11, wordBreak: 'break-all' }}>{row.a}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11, wordBreak: 'break-all', color: row.changed ? 'var(--amber)' : 'inherit' }}>{row.b}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {scoreA && scoreB && (
            <div style={{ display: 'flex', gap: 16, marginTop: 14 }}>
              {[['A', scoreA], ['B', scoreB]].map(([lbl, s]) => (
                <div key={lbl} style={{ flex: 1, padding: 14, background: 'var(--slate-10)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4 }}>Cert {lbl} Risk</div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{s.risk}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Score: {s.score}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
