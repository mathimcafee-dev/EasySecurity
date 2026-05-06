import acme from 'acme-client'

export const config = { api: { bodyParser: true } }
export const maxDuration = 60

const SUPABASE_URL = 'https://zwgdpsuvduexcdzcwjau.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3Z2Rwc3V2ZHVleGNkemN3amF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NTkzMTMsImV4cCI6MjA5MzUzNTMxM30.p_tMALKCRZeqQX7jO3jfwhGSYIbjoVKRpGhvJjMdlcs'

// Simple Supabase REST helper using anon JWT key
async function dbQuery(path, method = 'GET', body = null) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      'apikey': SUPABASE_ANON,
      'Authorization': `Bearer ${SUPABASE_ANON}`,
      'Content-Type': 'application/json',
      'Prefer': method === 'POST' ? 'return=minimal' : 'return=representation',
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  })
  if (method === 'GET') return res.json()
  return res
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { action, domain: rawDomain, sessionId, staging = false } = req.body
    const domain = (rawDomain || '').replace(/^https?:\/\//, '').replace(/\/.*/, '').toLowerCase().trim()

    const directoryUrl = staging
      ? acme.directory.letsencrypt.staging
      : acme.directory.letsencrypt.production

    if (action === 'start') {
      if (!domain || !sessionId) return res.status(400).json({ error: 'domain and sessionId required' })

      const accountKey = await acme.crypto.createPrivateKey()
      const client = new acme.Client({ directoryUrl, accountKey })
      const order = await client.createOrder({ identifiers: [{ type: 'dns', value: domain }] })
      const authorizations = await client.getAuthorizations(order)
      const auth = authorizations[0]
      const challenge = auth.challenges.find(c => c.type === 'dns-01')
      if (!challenge) return res.status(422).json({ error: 'DNS-01 challenge not available' })
      const keyAuthorization = await client.getChallengeKeyAuthorization(challenge)
      const challengeDomain = `_acme-challenge.${domain}`
      const accountKeyPem = accountKey.toString()

      // Delete existing row first
      await dbQuery(`ec_ssl_orders?session_id=eq.${sessionId}`, 'DELETE')
      // Insert new row
      const insertRes = await dbQuery('ec_ssl_orders', 'POST', {
        session_id: sessionId, domain, status: 'pending_dns',
        challenge_token: challenge.token, challenge_key_auth: keyAuthorization,
        challenge_domain: challengeDomain, order_url: JSON.stringify(order),
        finalize_url: JSON.stringify(auth), account_url: JSON.stringify(authorizations),
        priv_key: accountKeyPem, pub_key: challenge.url, account_key: accountKeyPem,
        updated_at: new Date().toISOString()
      })
      if (!insertRes.ok) {
        const err = await insertRes.text()
        return res.status(500).json({ error: 'DB insert failed: ' + err })
      }
      return res.status(200).json({ ok: true, domain, challengeDomain, txtValue: keyAuthorization })
    }

    if (action === 'verify' || action === 'finalize') {
      const rows = await dbQuery(`ec_ssl_orders?session_id=eq.${sessionId}&limit=1`)
      const row = rows?.[0]
      if (!row) return res.status(404).json({ error: 'Order not found. Please start again.' })

      if (action === 'verify') {
        const enc = s => new TextEncoder().encode(s)
        const b64u = b => { const a = new Uint8Array(b); let s = ''; a.forEach(x => s += String.fromCharCode(x)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '') }
        const dns = await (await fetch(`https://dns.google/resolve?name=${encodeURIComponent(row.challenge_domain)}&type=TXT`)).json()
        const txts = (dns.Answer || []).map(r => r.data?.replace(/"/g, ''))
        const exp = b64u(await crypto.subtle.digest('SHA-256', enc(row.challenge_key_auth)))
        if (!txts.some(t => t === exp)) return res.status(200).json({ ok: false, verified: false, message: 'TXT record not found yet. Wait a few minutes.', found: txts, expected: exp })
        const accountKey = await acme.crypto.createPrivateKey()
        const client = new acme.Client({ directoryUrl, accountKey })
        const auth = JSON.parse(row.finalize_url)
        const challenge = auth.challenges.find(c => c.type === 'dns-01')
        await client.verifyChallenge(auth, challenge)
        await client.completeChallenge(challenge)
        await client.waitForValidStatus(challenge)
        await dbQuery(`ec_ssl_orders?session_id=eq.${sessionId}`, 'PATCH', { status: 'ready', updated_at: new Date().toISOString() })
        return res.status(200).json({ ok: true, verified: true, ready: true, message: 'Verified! Ready to issue.' })
      }

      if (action === 'finalize') {
        const accountKey = await acme.crypto.createPrivateKey()
        const client = new acme.Client({ directoryUrl, accountKey })
        const order = JSON.parse(row.order_url)
        const [certKey, csr] = await acme.crypto.createCsr({ commonName: row.domain })
        const certPem = await client.finalizeOrder(order, csr)
        const privateKeyPem = certKey.toString()
        await dbQuery(`ec_ssl_orders?session_id=eq.${sessionId}`, 'PATCH', { status: 'issued', cert_pem: certPem, updated_at: new Date().toISOString() })
        const pems = certPem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || []
        return res.status(200).json({ ok: true, status: 'issued', cert: pems[0] || '', chain: pems.slice(1).join('\n'), fullchain: certPem, privateKey: privateKeyPem, domain: row.domain, message: 'Certificate issued!' })
      }
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch (err) {
    console.error('ACME error:', err.message, err.stack?.slice(0, 300))
    return res.status(500).json({ error: err.message })
  }
}
