import { useNavigate } from 'react-router-dom'

export default function Footer() {
  const nav = useNavigate()
  return (
    <footer className="footer">
      <div className="footer-grid">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div className="logo-mark" style={{ width: 28, height: 28, background: 'var(--teal)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg viewBox="0 0 18 18" fill="none" width="16" height="16">
                <rect x="2" y="2" width="6" height="6" rx="1.5" fill="white" opacity=".9"/>
                <rect x="10" y="2" width="6" height="6" rx="1.5" fill="white" opacity=".6"/>
                <rect x="2" y="10" width="6" height="6" rx="1.5" fill="white" opacity=".6"/>
                <rect x="10" y="10" width="6" height="6" rx="1.5" fill="white" opacity=".25"/>
              </svg>
            </div>
            <span style={{ fontWeight: 700, fontSize: 15 }}>EasyCerts</span>
          </div>
          <div className="footer-brand">Certificate intelligence for engineers who can't afford downtime.<br />All crypto runs locally in your browser — nothing is ever stored or transmitted.</div>
        </div>
        <div>
          <div className="footer-col-title">Tools</div>
          {[['/', 'Certificate Scanner'], ['/decode', 'Decode CSR'], ['/match', 'Key Matcher'], ['/convert', 'Cert Conversion'], ['/dns', 'DNS Checker']].map(([p,l]) => (
            <span key={p} className="footer-link" onClick={() => nav(p)}>{l}</span>
          ))}
        </div>
        <div>
          <div className="footer-col-title">Account</div>
          {[['/compare', 'Compare Certs'], ['/renew', 'Renewal Wizard'], ['/monitor', 'Expiry Monitor'], ['/api-keys', 'CI/CD API'], ['/docs', 'Documentation']].map(([p,l]) => (
            <span key={p} className="footer-link" onClick={() => nav(p)}>{l}</span>
          ))}
        </div>
        <div>
          <div className="footer-col-title">Formats</div>
          <span className="footer-link">PEM / CRT / CER</span>
          <span className="footer-link">JKS Keystores</span>
          <span className="footer-link">PKCS#12 / P12 / PFX</span>
          <span className="footer-link">DER Binary</span>
          <span className="footer-link">Live TLS Endpoints</span>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 EasyCerts · easysecurity.in · Built for SSL engineers</span>
        <span>🔒 Files processed in-browser — never stored or logged</span>
      </div>
    </footer>
  )
}
