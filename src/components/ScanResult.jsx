import { useState } from 'react'
import { downloadText } from '../lib/pki'

const RISK_COLORS = {
  SECURE: { bg: '#f0fdf4', border: '#bbf7d0', color: '#16a34a', dot: '#16a34a' },
  LOW: { bg: '#eff6ff', border: '#bfdbfe', color: '#2563eb', dot: '#2563eb' },
  MEDIUM: { bg: '#fffbeb', border: '#fde68a', color: '#d97706', dot: '#d97706' },
  HIGH: { bg: '#fff7ed', border: '#fed7aa', color: '#ea580c', dot: '#ea580c' },
  CRITICAL: { bg: '#fef2f2', border: '#fecaca', color: '#dc2626', dot: '#dc2626' },
}

const NODE_CLASS = { leaf: 'leaf', intermediate: 'intermediate', root: 'root', missing: 'missing' }
const NODE_COLOR = { leaf: 'var(--teal)', intermediate: 'var(--amber)', root: 'var(--purple)', missing: 'var(--red)' }

function CertAccordion({ cert, index }) {
  const [open, setOpen] = useState(index === 0)
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: 8 }}>
      <div style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--slate-10)', borderRadius: 'var(--radius-sm)' }} onClick={() => setOpen(o => !o)}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 13 }}>{cert.commonName || 'Unknown'}</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 10 }}>{cert.issuerCN}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`badge badge-${cert.daysLeft < 0 ? 'critical' : cert.daysLeft < 30 ? 'high' : cert.daysLeft < 90 ? 'medium' : 'secure'}`}>
            {cert.daysLeft < 0 ? 'EXPIRED' : `${cert.daysLeft}d`}
          </span>
          <span style={{ color: 'var(--text-4)' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>
      {open && (
        <div style={{ padding: '14px', borderTop: '1px solid var(--border)' }}>
          <table className="data-table" style={{ fontSize: 12 }}>
            <tbody>
              {[
                ['Common Name', cert.commonName],
                ['Organisation', cert.org],
                ['Org Unit', cert.ou],
                ['Issuer', cert.issuerCN],
                ['Issuer Org', cert.issuerOrg],
                ['Valid From', cert.notBefore?.toLocaleDateString()],
                ['Valid To', cert.notAfter?.toLocaleDateString()],
                ['Days Remaining', cert.daysLeft],
                ['Serial', cert.serial],
                ['Key Type', cert.keyType],
                ['Signature Algorithm', cert.sigAlgo],
                ['X.509 Version', cert.version],
                ['SANs', cert.sans?.join(', ') || '—'],
                ['Key Usage', cert.keyUsage?.join(', ')],
                ['Self-Signed', cert.isSelfSigned ? 'Yes' : 'No'],
                ['Wildcard', cert.isWildcard ? 'Yes' : 'No'],
                ['Fingerprint (SHA-256)', cert.fingerprint],
              ].map(([k, v]) => v != null && v !== '' && (
                <tr key={k}><td style={{ width: 160, fontFamily: 'var(--font)' }}>{k}</td><td style={{ fontFamily: k === 'Fingerprint (SHA-256)' ? 'var(--mono)' : 'inherit', fontSize: k === 'Fingerprint (SHA-256)' ? 10 : 12, wordBreak: 'break-all' }}>{v}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function ScanResult({ result, onReset }) {
  const { certs = [], risk, score, findings = [], source } = result
  const rc = RISK_COLORS[risk] || RISK_COLORS.MEDIUM
  const [copied, setCopied] = useState(false)

  const copy = (text) => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000) }

  const chainNodes = () => {
    if (!certs.length) return []
    const nodes = []
    certs.forEach((c, i) => {
      const type = i === 0 ? 'leaf' : c.isCA && i === certs.length - 1 ? 'root' : 'intermediate'
      nodes.push({ ...c, nodeType: type })
    })
    return nodes
  }

  return (
    <div>
      <div className="risk-banner" style={{ background: rc.bg, border: `1px solid ${rc.border}` }}>
        <div className="risk-info">
          <div className="risk-level-dot" style={{ background: rc.dot }}></div>
          <div>
            <div className="risk-label-big" style={{ color: rc.color }}>{risk}</div>
            <div className="risk-detail">
              {certs[0]?.commonName && `${certs[0].commonName} · `}
              {certs[0]?.daysLeft != null && `${certs[0].daysLeft < 0 ? 'Expired' : certs[0].daysLeft + ' days remaining'} · `}
              {certs[0]?.keyType && `${certs[0].keyType} · `}
              {certs[0]?.sigAlgo && certs[0].sigAlgo}
            </div>
          </div>
        </div>
        <div className="risk-score-wrap">
          <div className="risk-score-num" style={{ color: rc.color }}>{score}</div>
          <div className="risk-score-label">security score</div>
        </div>
      </div>

      {certs.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">🔗 Trust Chain</div>
          <div className="chain-diagram">
            {chainNodes().map((c, i) => (
              <>
                <div key={i} className={`chain-node ${NODE_CLASS[c.nodeType] || 'leaf'}`}>
                  <div className="chain-type" style={{ color: NODE_COLOR[c.nodeType] }}>{c.nodeType}</div>
                  <div className="chain-cn">{c.commonName?.length > 20 ? c.commonName.slice(0, 18) + '…' : c.commonName}</div>
                  <div className="chain-exp">{c.daysLeft < 0 ? 'EXPIRED' : `${c.daysLeft}d`}</div>
                </div>
                {i < chainNodes().length - 1 && <div key={`arr-${i}`} className="chain-arrow">→</div>}
              </>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <span className="badge badge-neutral">Chain depth: {certs.length}</span>
            {certs[0]?.keyType && <span className="badge badge-teal">{certs[0].keyType}</span>}
            {certs[0]?.sigAlgo && <span className="badge badge-teal">{certs[0].sigAlgo}</span>}
            {certs.some(c => c.isSelfSigned) && <span className="badge badge-medium">Self-signed</span>}
            {certs[0]?.isWildcard && <span className="badge badge-info">Wildcard</span>}
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">⚠️ Findings & Fixes</div>
        {findings.map((f, i) => (
          <div key={i} className={`finding-card ${f.type}`}>
            <div className="finding-title">{f.title}</div>
            <div className="finding-why">{f.why}</div>
            {f.impact && <div className="finding-why"><strong>Impact:</strong> {f.impact}</div>}
            {f.fix && (
              <div className="finding-fix" style={{ position: 'relative' }}>
                {f.fix}
                <button style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,.1)', border: 'none', borderRadius: 3, padding: '2px 6px', fontSize: 10, cursor: 'pointer' }} onClick={() => copy(f.fix)}>{copied ? '✓' : 'Copy'}</button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">📋 Certificate Details</div>
        {certs.map((c, i) => <CertAccordion key={i} cert={c} index={i} />)}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-secondary btn-sm" onClick={onReset}>← New Scan</button>
        <button className="btn btn-secondary btn-sm" onClick={() => window.open('/compare', '_blank')}>⚖ Compare</button>
        <button className="btn btn-secondary btn-sm" onClick={() => window.open('/renew', '_blank')}>🔄 Renew</button>
        <button className="btn btn-primary btn-sm" onClick={() => {
          const text = `EasyCerts Scan Report\n${'='.repeat(40)}\nRisk: ${risk} | Score: ${score}\nDomain: ${certs[0]?.commonName}\nExpiry: ${certs[0]?.notAfter?.toLocaleDateString()}\nDays Left: ${certs[0]?.daysLeft}\nKey: ${certs[0]?.keyType}\nAlgo: ${certs[0]?.sigAlgo}\n\nFindings:\n${findings.map(f => `• ${f.title}\n  ${f.why}${f.fix ? '\n  Fix: ' + f.fix : ''}`).join('\n\n')}`
          downloadText(text, 'easycerts-report.txt')
        }}>⬇ Download Report</button>
      </div>
    </div>
  )
}
