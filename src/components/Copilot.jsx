import { useState, useRef, useEffect } from 'react'

const SUGGESTIONS = [
  'Why is PKIX path building failing?',
  'How do I fix a missing intermediate CA?',
  'What does certificate verify failed mean?',
  'How do I import PKCS#12 into a JKS?',
  'SWIFT mTLS handshake help',
]

const SYSTEM = `You are EasyCerts Copilot — an expert PKI and SSL/TLS assistant. You help engineers debug certificate issues, fix trust chain problems, understand JKS keystores, interpret OpenSSL errors, and handle SWIFT/banking PKI requirements.

Be concise and practical. Give exact terminal commands when relevant. Format commands in code blocks.
When a scan result is provided in context, give answers specific to that certificate.`

export default function Copilot({ scanContext }) {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState([{ role: 'bot', text: "Hi! I'm EasyCerts Copilot — ask me anything about certificates, TLS errors, JKS keystores, or trust chain issues." }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  const send = async (text) => {
    if (!text.trim() || loading) return
    const userMsg = text.trim()
    setInput('')
    setMsgs(m => [...m, { role: 'user', text: userMsg }])
    setLoading(true)
    try {
      const systemPrompt = scanContext
        ? `${SYSTEM}\n\nCurrent scan context:\n${JSON.stringify(scanContext, null, 2)}`
        : SYSTEM
      const history = msgs.filter(m => m.role !== 'bot' || msgs.indexOf(m) > 0).map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text
      }))
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          system: systemPrompt,
          messages: [...history, { role: 'user', content: userMsg }]
        })
      })
      const data = await res.json()
      const reply = data.content?.[0]?.text || 'Sorry, I could not get a response.'
      setMsgs(m => [...m, { role: 'bot', text: reply }])
    } catch {
      setMsgs(m => [...m, { role: 'bot', text: 'Connection error. Please try again.' }])
    }
    setLoading(false)
  }

  return (
    <div className="copilot-fab">
      {open && (
        <div className="copilot-panel">
          <div className="copilot-head">
            <div className="copilot-title">
              <div className="copilot-dot"></div>
              EasyCerts Copilot
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>✕</button>
          </div>
          <div className="copilot-msgs">
            {msgs.map((m, i) => <div key={i} className={`msg ${m.role}`} style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>)}
            {loading && <div className="msg bot"><span className="spinner" style={{ width: 12, height: 12 }}></span></div>}
            <div ref={bottomRef} />
          </div>
          {msgs.length <= 1 && (
            <div className="copilot-suggestions">
              {SUGGESTIONS.map(s => <button key={s} className="chip" style={{ fontSize: 10 }} onClick={() => send(s)}>{s}</button>)}
            </div>
          )}
          <div className="copilot-input-row">
            <input className="copilot-input" placeholder="Ask about certs, TLS, JKS..." value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send(input)} />
            <button className="btn btn-primary btn-sm" onClick={() => send(input)} disabled={loading}>→</button>
          </div>
        </div>
      )}
      <button className="copilot-btn" onClick={() => setOpen(o => !o)} title="EasyCerts Copilot">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>
    </div>
  )
}
