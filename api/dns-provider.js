// Auto-DNS API — adds/removes TXT records via Cloudflare or GoDaddy API
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zwgdpsuvduexcdzcwjau.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

// ── Cloudflare ────────────────────────────────────────────────────────────────
async function cfGetZoneId(apiKey, domain) {
  // Try stored zone_id first, else look up by domain
  const rootDomain = domain.split('.').slice(-2).join('.')
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${rootDomain}`, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  })
  const data = await res.json()
  if (!data.success || !data.result?.length) throw new Error(`Cloudflare zone not found for ${rootDomain}. Check your API key has Zone:DNS:Edit permission.`)
  return data.result[0].id
}

async function cfAddTXT(apiKey, domain, name, value) {
  const zoneId = await cfGetZoneId(apiKey, domain)
  // Delete existing _acme-challenge records first
  const listRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?type=TXT&name=${name}.${domain}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  })
  const listData = await listRes.json()
  for (const r of (listData.result || [])) {
    await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${r.id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${apiKey}` }
    })
  }
  // Add new record
  const addRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'TXT', name: `${name}.${domain}`, content: value, ttl: 60 })
  })
  const addData = await addRes.json()
  if (!addData.success) throw new Error('Cloudflare error: ' + JSON.stringify(addData.errors))
  return { ok: true, provider: 'cloudflare', recordId: addData.result?.id }
}

async function cfVerify(apiKey, domain) {
  // Just test if we can list zones — validates the key
  const rootDomain = domain.split('.').slice(-2).join('.')
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${rootDomain}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  })
  const data = await res.json()
  if (!data.success) throw new Error('Invalid Cloudflare API token: ' + JSON.stringify(data.errors))
  if (!data.result?.length) throw new Error(`No Cloudflare zone found for ${rootDomain}`)
  return { ok: true, zoneId: data.result[0].id, zoneName: data.result[0].name }
}

// ── GoDaddy ───────────────────────────────────────────────────────────────────
async function gdAddTXT(apiKey, apiSecret, domain, name, value) {
  const rootDomain = domain.split('.').slice(-2).join('.')
  const auth = `sso-key ${apiKey}:${apiSecret}`
  // Delete old record
  await fetch(`https://api.godaddy.com/v1/domains/${rootDomain}/records/TXT/${name}`, {
    method: 'DELETE', headers: { Authorization: auth }
  })
  // Add new
  const res = await fetch(`https://api.godaddy.com/v1/domains/${rootDomain}/records/TXT/${name}`, {
    method: 'PUT',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ data: value, ttl: 600 }])
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error('GoDaddy error: ' + (err.message || res.status))
  }
  return { ok: true, provider: 'godaddy' }
}

async function gdVerify(apiKey, apiSecret, domain) {
  const rootDomain = domain.split('.').slice(-2).join('.')
  const res = await fetch(`https://api.godaddy.com/v1/domains/${rootDomain}`, {
    headers: { Authorization: `sso-key ${apiKey}:${apiSecret}` }
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error('GoDaddy error: ' + (err.message || 'Invalid API key'))
  }
  const data = await res.json()
  return { ok: true, domain: data.domain, status: data.status }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { Object.entries(cors).forEach(([k,v])=>res.setHeader(k,v)); return res.status(200).end() }
  Object.entries(cors).forEach(([k,v]) => res.setHeader(k, v))

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

  try {
    const { action, provider, apiKey, apiSecret, domain, txtName, txtValue, userId } = req.body

    // VERIFY — test credentials without saving
    if (action === 'verify') {
      if (provider === 'cloudflare') {
        const result = await cfVerify(apiKey, domain)
        return res.json(result)
      }
      if (provider === 'godaddy') {
        const result = await gdVerify(apiKey, apiSecret, domain)
        return res.json(result)
      }
      return res.status(400).json({ error: 'Unknown provider' })
    }

    // SAVE — store credentials for a user
    if (action === 'save') {
      if (!userId) return res.status(400).json({ error: 'userId required' })
      const { error } = await sb.from('ec_dns_credentials').upsert({
        user_id: userId,
        provider,
        api_key: apiKey,
        api_secret: apiSecret || null,
        label: provider === 'cloudflare' ? 'Cloudflare' : 'GoDaddy',
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,provider' })
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ ok: true })
    }

    // ADD_TXT — add DNS record using stored or provided credentials
    if (action === 'add_txt') {
      let key = apiKey, secret = apiSecret
      // If no key provided, load from DB
      if (!key && userId) {
        const { data: creds } = await sb.from('ec_dns_credentials')
          .select('api_key, api_secret').eq('user_id', userId).eq('provider', provider).single()
        if (creds) { key = creds.api_key; secret = creds.api_secret }
      }
      if (!key) return res.status(400).json({ error: 'No API credentials found' })
      if (provider === 'cloudflare') {
        const result = await cfAddTXT(key, domain, txtName || '_acme-challenge', txtValue)
        return res.json(result)
      }
      if (provider === 'godaddy') {
        const result = await gdAddTXT(key, secret, domain, txtName || '_acme-challenge', txtValue)
        return res.json(result)
      }
      return res.status(400).json({ error: 'Unknown provider' })
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch(err) {
    console.error('DNS provider error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
