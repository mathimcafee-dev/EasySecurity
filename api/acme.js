import acme from 'acme-client'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const SUPABASE_URL = 'https://zwgdpsuvduexcdzcwjau.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const VERCEL_TOKEN = process.env.VERCEL_TOKEN_DNS || ''
const VERCEL_TEAM = process.env.VERCEL_TEAM_ID || 'team_bOUWIT8dmfwi4CPGcRqt7Oq1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

async function addVercelDNS(value) {
  try {
    const listRes = await fetch(`https://api.vercel.com/v2/domains/easysecurity.in/records?teamId=${VERCEL_TEAM}`, {
      headers: { Authorization: `Bearer ${VERCEL_TOKEN}` }
    })
    const list = await listRes.json()
    for (const r of (list.records || [])) {
      if (r.name === '_acme-challenge' && r.type === 'TXT') {
        await fetch(`https://api.vercel.com/v2/domains/easysecurity.in/records/${r.id}?teamId=${VERCEL_TEAM}`, {
          method: 'DELETE', headers: { Authorization: `Bearer ${VERCEL_TOKEN}` }
        })
      }
    }
    const addRes = await fetch(`https://api.vercel.com/v2/domains/easysecurity.in/records?teamId=${VERCEL_TEAM}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '_acme-challenge', type: 'TXT', value, ttl: 60 })
    })
    return addRes.json()
  } catch(e) {
    return { error: e.message }
  }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { Object.entries(cors).forEach(([k,v])=>res.setHeader(k,v)); return res.status(200).end() }
  Object.entries(cors).forEach(([k,v]) => res.setHeader(k, v))

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

  try {
    const { action, sessionId, domain: rawDomain, staging = false } = req.body
    const domain = (rawDomain||'').replace(/^https?:\/\//,'').replace(/\/.*/,'').toLowerCase().trim()
    const directoryUrl = staging ? acme.directory.letsencrypt.staging : acme.directory.letsencrypt.production

    // START — use acme-client to create order and get challenge
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

      // getChallengeKeyAuthorization for dns-01 returns base64url(sha256(token.thumbprint))
      // This IS the DNS TXT value
      const txtValue = await client.getChallengeKeyAuthorization(challenge)

      // Auto-add to Vercel DNS
      const dnsResult = await addVercelDNS(txtValue)
      const autoAdded = !dnsResult.error && !dnsResult.message?.includes('error')
      console.log('DNS add result:', JSON.stringify(dnsResult))

      const challengeDomain = `_acme-challenge.${domain}`
      await sb.from('ec_ssl_orders').delete().eq('session_id', sessionId)
      const { error: de } = await sb.from('ec_ssl_orders').insert({
        session_id: sessionId, domain, status: 'pending_dns',
        challenge_token: challenge.token,
        challenge_key_auth: txtValue,       // store the DNS TXT value
        challenge_domain: challengeDomain,
        order_url: JSON.stringify(order),
        finalize_url: challenge.url,
        account_url: JSON.stringify(auth),
        priv_key: accountKey.toString(),    // PEM string
        pub_key: JSON.stringify(authorizations),
        account_key: accountKey.toString(),
        updated_at: new Date().toISOString()
      })
      if (de) return res.status(500).json({ error: 'DB: ' + de.message })
      return res.json({ ok: true, domain, challengeDomain, txtValue, autoAdded })
    }

    // VERIFY — check DNS then trigger challenge using acme-client with restored key
    if (action === 'verify') {
      const { data: row, error: fe } = await sb.from('ec_ssl_orders').select('*').eq('session_id', sessionId).single()
      if (fe || !row) return res.status(404).json({ error: 'Order not found. Please start again.' })

      // Check DNS
      const dnsData = await (await fetch(`https://dns.google/resolve?name=${encodeURIComponent(row.challenge_domain)}&type=TXT`)).json()
      const txts = (dnsData.Answer||[]).map(r => r.data?.replace(/"/g,''))
      const exp = row.challenge_key_auth  // already the correct DNS TXT value

      console.log('DNS found:', JSON.stringify(txts), 'expected:', exp)

      if (!txts.some(t => t === exp)) {
        // Try re-adding
        await addVercelDNS(row.challenge_key_auth)
        return res.json({ ok: false, verified: false, message: 'TXT record not found yet. Wait 30 seconds and try again.', found: txts, expected: exp })
      }

      // DNS verified — restore client with original account key and trigger challenge
      const accountKey = Buffer.from(row.priv_key)
      const client = new acme.Client({ directoryUrl, accountKey })

      // Re-register account (finds existing by key)
      await client.createAccount({ termsOfServiceAgreed: true, contact: ['mailto:alerts@easysecurity.in'] })

      const auth = JSON.parse(row.account_url)
      const challenge = auth.challenges.find(c => c.type === 'dns-01')
      if (!challenge) return res.status(422).json({ error: 'Challenge not found' })

      await client.verifyChallenge(auth, challenge)
      await client.completeChallenge(challenge)
      await client.waitForValidStatus(challenge)

      await sb.from('ec_ssl_orders').update({ status: 'ready', updated_at: new Date().toISOString() }).eq('session_id', sessionId)
      return res.json({ ok: true, verified: true, ready: true, message: 'Verified! Ready to issue.' })
    }

    // FINALIZE — generate cert
    if (action === 'finalize') {
      const { data: row, error: fe } = await sb.from('ec_ssl_orders').select('*').eq('session_id', sessionId).single()
      if (fe || !row) return res.status(404).json({ error: 'Order not found. Please start again.' })

      const accountKey = Buffer.from(row.priv_key)
      const client = new acme.Client({ directoryUrl, accountKey })
      await client.createAccount({ termsOfServiceAgreed: true, contact: ['mailto:alerts@easysecurity.in'] })

      const order = JSON.parse(row.order_url)
      const [certKey, csr] = await acme.crypto.createCsr({ commonName: row.domain })
      await client.finalizeOrder(order, csr)
      const certPem = await client.getCertificate(order)
      const pems = certPem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g)||[]

      await sb.from('ec_ssl_orders').update({
        status: 'issued', cert_pem: pems[0]||'',
        updated_at: new Date().toISOString()
      }).eq('session_id', sessionId)

      return res.json({
        ok: true, status: 'issued',
        cert: pems[0]||'', chain: pems.slice(1).join('\n'),
        fullchain: certPem, privateKey: certKey.toString(),
        domain: row.domain, message: 'Certificate issued!'
      })
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch (err) {
    console.error('ACME error:', err.message, err.stack?.slice(0,300))
    return res.status(500).json({ error: err.message || String(err) })
  }
}
// deploy trigger
