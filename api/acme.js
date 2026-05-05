import acme from 'acme-client'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  'https://zwgdpsuvduexcdzcwjau.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3Z2Rwc3V2ZHVleGNkemN3amF1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NTc0MzUzMywiZXhwIjoyMDYxMzE5NTMzfQ.nWLBVDsT_9VEBtqt5wEEJh7DEI0JMmrQKTv5mJNnSEg'
)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).json({})
  Object.entries(cors).forEach(([k,v]) => res.setHeader(k, v))

  try {
    const { action, sessionId, domain: rawDomain, staging = false } = req.body
    const domain = (rawDomain || '').replace(/^https?:\/\//, '').replace(/\/.*/, '').toLowerCase().trim()
    const directoryUrl = staging
      ? acme.directory.letsencrypt.staging
      : acme.directory.letsencrypt.production

    // START
    if (action === 'start') {
      if (!domain || !sessionId) return res.status(400).json({ error: 'domain and sessionId required' })
      const accountKey = await acme.crypto.createPrivateKey()
      const client = new acme.Client({ directoryUrl, accountKey })
      await client.createAccount({ termsOfServiceAgreed: true, contact: ['mailto:alerts@easysecurity.in'] })
      const order = await client.createOrder({ identifiers: [{ type: 'dns', value: domain }] })
      const authorizations = await client.getAuthorizations(order)
      const auth = authorizations[0]
      const challenge = auth.challenges.find(c => c.type === 'dns-01')
      if (!challenge) return res.status(422).json({ error: 'DNS-01 not available' })
      const keyAuth = await client.getChallengeKeyAuthorization(challenge)
      const challengeDomain = `_acme-challenge.${domain}`
      await sb.from('ec_ssl_orders').delete().eq('session_id', sessionId)
      const { error: de } = await sb.from('ec_ssl_orders').insert({
        session_id: sessionId, domain, status: 'pending_dns',
        challenge_token: challenge.token,
        challenge_key_auth: keyAuth,
        challenge_domain: challengeDomain,
        order_url: JSON.stringify(order),
        finalize_url: challenge.url,
        account_url: JSON.stringify(auth),
        priv_key: accountKey.toString(),
        pub_key: JSON.stringify(authorizations),
        account_key: accountKey.toString(),
        updated_at: new Date().toISOString()
      })
      if (de) return res.status(500).json({ error: 'DB: ' + de.message })
      return res.json({ ok: true, domain, challengeDomain, txtValue: keyAuth })
    }

    // VERIFY
    if (action === 'verify') {
      const { data: row, error: fe } = await sb.from('ec_ssl_orders').select('*').eq('session_id', sessionId).single()
      if (fe || !row) return res.status(404).json({ error: 'Order not found. Please start again.' })
      // Check DNS
      const dnsRes = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(row.challenge_domain)}&type=TXT`)
      const dnsData = await dnsRes.json()
      const txts = (dnsData.Answer || []).map(r => r.data?.replace(/"/g, ''))
      const crypto = await import('crypto')
      const exp = crypto.createHash('sha256').update(row.challenge_key_auth).digest('base64url')
      if (!txts.some(t => t === exp)) {
        return res.json({ ok: false, verified: false, message: 'TXT record not found yet. Wait a few minutes.', found: txts, expected: exp })
      }
      const accountKey = Buffer.from(row.priv_key)
      const client = new acme.Client({ directoryUrl, accountKey })
      const auth = JSON.parse(row.account_url)
      const challenge = auth.challenges.find(c => c.type === 'dns-01')
      await client.verifyChallenge(auth, challenge)
      await client.completeChallenge(challenge)
      await client.waitForValidStatus(challenge)
      await sb.from('ec_ssl_orders').update({ status: 'ready', updated_at: new Date().toISOString() }).eq('session_id', sessionId)
      return res.json({ ok: true, verified: true, ready: true, message: 'Verified! Ready to issue.' })
    }

    // FINALIZE
    if (action === 'finalize') {
      const { data: row, error: fe } = await sb.from('ec_ssl_orders').select('*').eq('session_id', sessionId).single()
      if (fe || !row) return res.status(404).json({ error: 'Order not found. Please start again.' })
      const accountKey = Buffer.from(row.priv_key)
      const client = new acme.Client({ directoryUrl, accountKey })
      const order = JSON.parse(row.order_url)
      const [certKey, csr] = await acme.crypto.createCsr({ commonName: row.domain })
      await client.finalizeOrder(order, csr)
      const certPem = await client.getCertificate(order)
      const pems = certPem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || []
      await sb.from('ec_ssl_orders').update({ status: 'issued', cert_pem: pems[0] || '', updated_at: new Date().toISOString() }).eq('session_id', sessionId)
      return res.json({
        ok: true, status: 'issued',
        cert: pems[0] || '', chain: pems.slice(1).join('\n'),
        fullchain: certPem, privateKey: certKey.toString(),
        domain: row.domain, message: 'Certificate issued!'
      })
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch (err) {
    console.error('ACME error:', err)
    return res.status(500).json({ error: err.message || String(err) })
  }
}
