const PHOTO = "data:image/jpeg;base64,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"

const SKILLS = ['PKI Architecture', 'SSL/TLS Engineering', 'Certificate Lifecycle Management', 'DigiCert Platform', 'Enterprise Account Management', 'React & Full-Stack Development']

const CERTS = [
  { title: 'DigiCert Certified Engineer', issuer: 'DigiCert Inc', year: '2024', icon: '🏆' },
  { title: 'PAM DigiCert Certification', issuer: 'DigiCert Inc', year: '2024', icon: '🔐' },
]

export default function About() {
  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh', fontFamily: "'Inter', sans-serif" }}>

      {/* TOP HERO STRIP */}
      <div style={{ background: '#0f172a', color: '#fff' }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '64px 32px', display: 'flex', gap: 48, alignItems: 'center' }}>

          {/* Photo */}
          <div style={{ flexShrink: 0 }}>
            <img
              src={PHOTO}
              alt="Mathivanan K"
              style={{ width: 120, height: 120, borderRadius: '50%', objectFit: 'cover', objectPosition: 'center top', border: '3px solid rgba(13,148,136,.6)', display: 'block' }}
            />
          </div>

          {/* Name + title */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#0d9488', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 10 }}>
              Developer & Engineer
            </div>
            <h1 style={{ fontSize: 36, fontWeight: 700, margin: '0 0 8px', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
              Mathivanan K
            </h1>
            <div style={{ fontSize: 15, color: '#94a3b8', marginBottom: 16, fontWeight: 400 }}>
              Account Manager, APAC · DigiCert Inc
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {[
                { label: 'mathivanan@easysecurity.in', href: 'mailto:mathivanan@easysecurity.in', icon: '✉' },
                { label: 'GitHub', href: 'https://github.com/mathimcafee-dev', icon: '⌥' },
                { label: 'LinkedIn', href: 'https://www.linkedin.com/in/mathivanan-k-a90803108/', icon: '↗' },
              ].map(l => (
                <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8', textDecoration: 'none', padding: '5px 12px', border: '1px solid rgba(255,255,255,.1)', borderRadius: 6, transition: 'all .15s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#5eead4'; e.currentTarget.style.borderColor = 'rgba(94,234,212,.3)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.borderColor = 'rgba(255,255,255,.1)' }}
                >
                  <span>{l.icon}</span>{l.label}
                </a>
              ))}
            </div>
          </div>

          {/* Location pill */}
          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>Based in</div>
            <div style={{ fontSize: 14, color: '#e2e8f0', fontWeight: 600 }}>Coimbatore, India 🇮🇳</div>
            <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(13,148,136,.15)', border: '1px solid rgba(13,148,136,.3)', borderRadius: 20, padding: '3px 10px' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#0d9488' }}></div>
              <span style={{ fontSize: 11, color: '#5eead4', fontWeight: 600 }}>Open to connect</span>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '48px 32px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 40 }}>

          {/* LEFT */}
          <div>

            {/* About */}
            <section style={{ marginBottom: 40 }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: '#0d9488', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 14 }}>About</h2>
              <p style={{ fontSize: 15, color: '#334155', lineHeight: 1.85, margin: 0 }}>
                I'm a PKI engineer and Account Manager at DigiCert Inc, covering the Asia-Pacific region. With deep expertise in certificate lifecycle management, SSL/TLS infrastructure, and enterprise trust solutions, I help organisations build and maintain secure digital identities at scale.
              </p>
              <p style={{ fontSize: 15, color: '#334155', lineHeight: 1.85, margin: '14px 0 0' }}>
                Outside of work, I build open-source security tools. EasySecurity.in is my flagship project — a full-stack certificate intelligence platform used by engineers to diagnose cert issues, decode CSRs, monitor expiry, and automate renewal workflows.
              </p>
            </section>

            {/* Experience */}
            <section style={{ marginBottom: 40 }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: '#0d9488', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 20 }}>Experience</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
                {[
                  {
                    role: 'Account Manager, APAC',
                    company: 'DigiCert Inc',
                    period: '2024 — Present',
                    desc: 'Managing enterprise PKI accounts across Asia-Pacific. Driving certificate lifecycle automation, digital trust solutions, and long-term client partnerships.',
                  },
                  {
                    role: 'PKI Engineer',
                    company: 'DigiCert Inc',
                    period: 'Prior',
                    desc: 'Worked on SSL/TLS infrastructure, certificate issuance pipelines, enterprise integrations, and support for complex PKI deployments.',
                  },
                  {
                    role: 'Founder & Lead Developer',
                    company: 'EasySecurity.in',
                    period: 'Side Project',
                    desc: 'Built a full-stack certificate intelligence platform: X.509 scanner, CSR tools, DNS checker, expiry monitor, and AI copilot — using React, Supabase, and Vercel.',
                  },
                ].map((e, i) => (
                  <div key={i} style={{ display: 'flex', gap: 20 }}>
                    <div style={{ width: 1, background: '#e2e8f0', flexShrink: 0, marginTop: 6, marginLeft: 4 }}></div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 3, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{e.role}</span>
                        <span style={{ fontSize: 13, color: '#0d9488', fontWeight: 600 }}>@ {e.company}</span>
                        <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>{e.period}</span>
                      </div>
                      <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7, margin: 0 }}>{e.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Project */}
            <section style={{ marginBottom: 40 }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: '#0d9488', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 20 }}>Featured Project</h2>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '20px 24px', background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>EasySecurity.in</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>Certificate Intelligence Platform</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <a href="https://easysecurity.in" target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 12, fontWeight: 600, color: '#0d9488', textDecoration: 'none', padding: '5px 12px', border: '1px solid #0d9488', borderRadius: 6 }}>
                      Live Site →
                    </a>
                    <a href="https://github.com/mathimcafee-dev/EasySecurity" target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 12, fontWeight: 600, color: '#64748b', textDecoration: 'none', padding: '5px 12px', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                      GitHub
                    </a>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.7, margin: '0 0 14px' }}>
                  A free, browser-side certificate tool for engineers. Analyse X.509 certs, decode CSRs, match private keys, convert formats, check DNS, monitor expiry, and get AI-powered PKI guidance.
                </p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['React 18', 'Supabase', 'Vercel', 'node-forge', 'Claude AI', 'TypeScript'].map(t => (
                    <span key={t} style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 4, background: '#f1f5f9', color: '#475569' }}>{t}</span>
                  ))}
                </div>
              </div>
            </section>

          </div>

          {/* RIGHT SIDEBAR */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

            {/* Certifications */}
            <div>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: '#0d9488', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 14 }}>Certifications</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {CERTS.map((c, i) => (
                  <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ width: 34, height: 34, background: '#f0fdfa', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0, border: '1px solid #ccfbf1' }}>{c.icon}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{c.title}</div>
                      <div style={{ fontSize: 11, color: '#64748b' }}>{c.issuer} · {c.year}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Skills */}
            <div>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: '#0d9488', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 14 }}>Skills</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {SKILLS.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#334155', padding: '7px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#0d9488', flexShrink: 0 }}></div>
                    {s}
                  </div>
                ))}
              </div>
            </div>

            {/* Contact card */}
            <div style={{ background: '#0f172a', borderRadius: 10, padding: '20px', color: '#fff' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Get in touch</div>
              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6, marginBottom: 14 }}>
                For enterprise PKI engagements, consulting, or open-source collaboration.
              </div>
              <a href="mailto:mathivanan@easysecurity.in"
                style={{ display: 'block', textAlign: 'center', background: '#0d9488', color: '#fff', padding: '10px', borderRadius: 7, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                Send an email →
              </a>
            </div>

          </div>
        </div>
      </div>

    </div>
  )
}
