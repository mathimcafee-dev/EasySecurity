import acme from 'acme-client'

export const config = { api: { bodyParser: true } }
export const maxDuration = 60

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { action, domain: rawDomain, sessionId, staging = false } = req.body
    const domain = (rawDomain || '').replace(/^https?:\/\//, '').replace(/\/.*/, '').toLowerCase().trim()

    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(
      'https://zwgdpsuvduexcdzcwjau.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
    )

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
      await sb.from('ec_ssl_orders').delete().eq('session_id', sessionId)
      const { error: de } = await sb.from('ec_ssl_orders').insert({
        session_id: sessionId, domain, status: 'pending_dns',
        challenge_token: challenge.token, challenge_key_auth: keyAuthorization,
        challenge_domain: challengeDomain, order_url: JSON.stringify(order),
        finalize_url: JSON.stringify(auth), account_url: JSON.stringify(authorizations),
        priv_key: accountKeyPem, pub_key: challenge.url, account_key: accountKeyPem,
        updated_at: new Date().toISOString()
      })
      if (de) return res.status(500).json({ error: 'DB: ' + de.message })
      return res.status(200).json({ ok: true, domain, challengeDomain, txtValue: keyAuthorization })
    }

    if (action === 'verify' || action === 'finalize') {
      const { data: row, error: fe } = await sb.from('ec_ssl_orders').select('*').eq('session_id', sessionId).single()
      if (fe || !row) return res.status(404).json({ error: 'Order not found. Please start again.' })

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
        await sb.from('ec_ssl_orders').update({ status: 'ready', updated_at: new Date().toISOString() }).eq('session_id', sessionId)
        return res.status(200).json({ ok: true, verified: true, ready: true, message: 'Verified! Ready to issue.' })
      }

      if (action === 'finalize') {
        const accountKey = await acme.crypto.createPrivateKey()
        const client = new acme.Client({ directoryUrl, accountKey })
        const order = JSON.parse(row.order_url)
        const [certKey, csr] = await acme.crypto.createCsr({ commonName: row.domain })
        const certPem = await client.finalizeOrder(order, csr)
        const privateKeyPem = certKey.toString()
        await sb.from('ec_ssl_orders').update({ status: 'issued', cert_pem: certPem, updated_at: new Date().toISOString() }).eq('session_id', sessionId)
        const pems = certPem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || []
        return res.status(200).json({ ok: true, status: 'issued', cert: pems[0] || '', chain: pems.slice(1).join('\n'), fullchain: certPem, privateKey: privateKeyPem, domain: row.domain, message: 'Certificate issued!' })
      }
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch (err) {
    console.error('ACME error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
