import { createRequire } from 'module'
const _require = createRequire(import.meta.url)
const jksJs = _require('jks-js')

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { Object.entries(cors).forEach(([k,v])=>res.setHeader(k,v)); return res.status(200).end() }
  Object.entries(cors).forEach(([k,v]) => res.setHeader(k, v))
  try {
    const { jksBase64, password } = req.body
    if (!jksBase64) return res.status(400).json({ error: 'jksBase64 required' })
    const buf = Buffer.from(jksBase64, 'base64')
    const toPem = jksJs.toPem || jksJs.toPEM || jksJs.default?.toPem || jksJs.default?.toPEM
    if (typeof toPem !== 'function') return res.status(500).json({ error: 'jks-js module did not export toPem' })
    const result = toPem(buf, password || '')
    const entries = Object.entries(result).map(([alias, data]) => ({
      alias,
      cert: data.cert || null,
      key: data.key ? '(private key present — not returned for security)' : null,
      hasCert: !!data.cert,
      hasKey: !!data.key
    }))
    return res.json({ ok: true, entries, count: entries.length })
  } catch(err) {
    return res.status(500).json({ error: err.message || String(err) })
  }
}
