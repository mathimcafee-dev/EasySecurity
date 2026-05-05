import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const SUPABASE_URL = 'https://zwgdpsuvduexcdzcwjau.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const ENC_KEY = process.env.DNS_CRED_ENC_KEY || 'easysecurity-dns-key-32byteslong!!'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

// AES-256-GCM encryption
function encrypt(text) {
  const key = crypto.scryptSync(ENC_KEY, 'easysec-salt', 32)
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + enc.toString('hex')
}

function decrypt(data) {
  const [ivHex, tagHex, encHex] = data.split(':')
  const key = crypto.scryptSync(ENC_KEY, 'easysec-salt', 32)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8')
}

// Cloudflare
async function cfGetZoneId(apiKey, domain) {
  const root = domain.split('.').slice(-2).join('.')
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones?name=${root}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  })
  const data = await res.json()
  if (!data.success || !data.result?.length) throw new Error(`Cloudflare zone not found for ${root}. Ensure API token has Zone:DNS:Edit permission.`)
  return { zoneId: data.result[0].id, zoneName: data.result[0].name }
}

async function cfAddTXT(apiKey, domain, name, value) {
  const { zoneId } = await cfGetZoneId(apiKey, domain)
  const listRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?type=TXT&name=${name}.${domain}`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  })
  const list = await listRes.json()
  for (const r of (list.result || [])) {
    await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${r.id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${apiKey}` }
    })
  }
  const addRes = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'TXT', name: `${name}.${domain}`, content: value, ttl: 60 })
  })
  const addData = await addRes.json()
  if (!addData.success) throw new Error('Cloudflare error: ' + JSON.stringify(addData.errors))
  return { ok: true, provider: 'cloudflare' }
}

// GoDaddy
async function gdAddTXT(apiKey, apiSecret, domain, name, value) {
  const root = domain.split('.').slice(-2).join('.')
  const auth = `sso-key ${apiKey}:${apiSecret}`
  await fetch(`https://api.godaddy.com/v1/domains/${root}/records/TXT/${name}`, {
    method: 'DELETE', headers: { Authorization: auth }
  })
  const res = await fetch(`https://api.godaddy.com/v1/domains/${root}/records/TXT/${name}`, {
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

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { Object.entries(cors).forEach(([k,v])=>res.setHeader(k,v)); return res.status(200).end() }
  Object.entries(cors).forEach(([k,v]) => res.setHeader(k, v))

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

  try {
    const { action, provider, apiKey, apiSecret, domain, txtName, txtValue, userId } = req.body

    // Must have userId for all actions involving stored creds
    if (!userId && ['save','add_txt','load','delete'].includes(action)) {
      return res.status(401).json({ error: 'Authentication required. Please sign in.' })
    }

    // VERIFY — test credentials
    if (action === 'verify') {
      if (!apiKey) return res.status(400).json({ error: 'API key required' })
      if (provider === 'cloudflare') {
        const { zoneId, zoneName } = await cfGetZoneId(apiKey, domain)
        return res.json({ ok: true, zoneId, zoneName })
      }
      if (provider === 'godaddy') {
        const root = domain.split('.').slice(-2).join('.')
        const r = await fetch(`https://api.godaddy.com/v1/domains/${root}`, {
          headers: { Authorization: `sso-key ${apiKey}:${apiSecret}` }
        })
        if (!r.ok) { const e = await r.json().catch(()=>({})); throw new Error(e.message || 'Invalid credentials') }
        const d = await r.json()
        return res.json({ ok: true, domain: d.domain, status: d.status })
      }
      return res.status(400).json({ error: 'Unknown provider' })
    }

    // SAVE — encrypt and store credentials
    if (action === 'save') {
      const encKey = encrypt(apiKey)
      const encSecret = apiSecret ? encrypt(apiSecret) : null
      const { error } = await sb.from('ec_dns_credentials').upsert({
        user_id: userId, provider,
        api_key_enc: encKey,
        api_secret_enc: encSecret,
        label: provider === 'cloudflare' ? 'Cloudflare' : 'GoDaddy',
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,provider' })
      if (error) return res.status(500).json({ error: error.message })
      return res.json({ ok: true, message: 'Credentials saved securely' })
    }

    // LOAD — return masked credentials info (not the actual keys)
    if (action === 'load') {
      const { data } = await sb.from('ec_dns_credentials')
        .select('provider, label, updated_at').eq('user_id', userId)
      return res.json({ ok: true, providers: data || [] })
    }

    // DELETE — remove stored credentials
    if (action === 'delete') {
      await sb.from('ec_dns_credentials').delete().eq('user_id', userId).eq('provider', provider)
      return res.json({ ok: true })
    }

    // ADD_TXT — use provided or stored encrypted credentials
    if (action === 'add_txt') {
      let key = apiKey, secret = apiSecret
      if (!key) {
        const { data: creds } = await sb.from('ec_dns_credentials')
          .select('api_key_enc, api_secret_enc').eq('user_id', userId).eq('provider', provider).single()
        if (!creds) return res.status(404).json({ error: 'No saved credentials found for ' + provider })
        key = decrypt(creds.api_key_enc)
        secret = creds.api_secret_enc ? decrypt(creds.api_secret_enc) : null
      }
      if (provider === 'cloudflare') return res.json(await cfAddTXT(key, domain, txtName || '_acme-challenge', txtValue))
      if (provider === 'godaddy') return res.json(await gdAddTXT(key, secret, domain, txtName || '_acme-challenge', txtValue))
      return res.status(400).json({ error: 'Unknown provider' })
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch(err) {
    console.error('DNS provider error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
