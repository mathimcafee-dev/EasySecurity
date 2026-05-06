import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import acme from 'https://esm.sh/acme-client@5.4.0'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}
const R = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

// FIX: use Uint8Array instead of Buffer — Buffer is Node.js only, Deno uses Uint8Array
function pemToUint8Array(pem: string): Uint8Array {
  return new TextEncoder().encode(pem)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const sb = createClient(
    Deno.env.get('SUPABASE_URL') || '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  )

  try {
    const body = await req.json()
    const { action, sessionId, staging = false } = body
    const domain = (body.domain || '')
      .replace(/^https?:\/\//, '')
      .replace(/\/.*/, '')
      .toLowerCase()
      .trim()
    const directoryUrl = staging
      ? acme.directory.letsencrypt.staging
      : acme.directory.letsencrypt.production

    // ── START ──────────────────────────────────────────────────────────────────
    if (action === 'start') {
      if (!domain || !sessionId) return R({ error: 'domain and sessionId required' }, 400)

      const accountKey = await acme.crypto.createPrivateKey()
      const client = new acme.Client({ directoryUrl, accountKey })

      const order = await client.createOrder({ identifiers: [{ type: 'dns', value: domain }] })
      const authorizations = await client.getAuthorizations(order)
      const auth = authorizations[0]
      const challenge = auth.challenges.find((c: any) => c.type === 'dns-01')
      if (!challenge) return R({ error: 'DNS-01 challenge not available' }, 422)

      const keyAuthorization = await client.getChallengeKeyAuthorization(challenge)
      const challengeDomain = `_acme-challenge.${domain}`
      const accountKeyPem: string = accountKey.toString()

      await sb.from('ec_ssl_orders').delete().eq('session_id', sessionId)
      const { error: de } = await sb.from('ec_ssl_orders').insert({
        session_id: sessionId,
        domain,
        status: 'pending_dns',
        challenge_token: challenge.token,
        challenge_key_auth: keyAuthorization,
        challenge_domain: challengeDomain,
        order_url: JSON.stringify(order),
        finalize_url: JSON.stringify(auth),
        account_url: JSON.stringify(authorizations),
        priv_key: accountKeyPem,
        pub_key: challenge.url,
        account_key: accountKeyPem,
        updated_at: new Date().toISOString()
      })
      if (de) return R({ error: 'DB: ' + de.message }, 500)

      return R({ ok: true, domain, challengeDomain, txtValue: keyAuthorization })
    }

    // ── VERIFY / FINALIZE ──────────────────────────────────────────────────────
    if (action === 'verify' || action === 'finalize') {
      const { data: row, error: fe } = await sb
        .from('ec_ssl_orders')
        .select('*')
        .eq('session_id', sessionId)
        .single()
      if (fe || !row) return R({ error: 'Order not found. Please start again.' }, 404)

      if (action === 'verify') {
        const enc = (s: string) => new TextEncoder().encode(s)
        const b64u = (b: ArrayBuffer) => {
          const a = new Uint8Array(b)
          let s = ''
          a.forEach((x) => (s += String.fromCharCode(x)))
          return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
        }
        const dns = await (
          await fetch(`https://dns.google/resolve?name=${encodeURIComponent(row.challenge_domain)}&type=TXT`)
        ).json()
        const txts = (dns.Answer || []).map((r: any) => r.data?.replace(/"/g, ''))
        const exp = b64u(await crypto.subtle.digest('SHA-256', enc(row.challenge_key_auth)))
        if (!txts.some((t: string) => t === exp)) {
          return R({
            ok: false,
            verified: false,
            message: 'TXT record not found yet. Wait a few minutes.',
            found: txts,
            expected: exp
          })
        }

        // FIX: Uint8Array instead of Buffer.from()
        const accountKey = pemToUint8Array(row.priv_key)
        const client = new acme.Client({ directoryUrl, accountKey })
        const order = JSON.parse(row.order_url)
        const authorizations = JSON.parse(row.account_url)
        const auth = authorizations[0]
        const challenge = auth.challenges.find((c: any) => c.type === 'dns-01')

        await client.verifyChallenge(auth, challenge)
        await client.completeChallenge(challenge)
        await client.waitForValidStatus(challenge)

        await sb
          .from('ec_ssl_orders')
          .update({ status: 'ready', updated_at: new Date().toISOString() })
          .eq('session_id', sessionId)

        return R({ ok: true, verified: true, ready: true, message: 'Verified! Ready to issue.' })
      }

      if (action === 'finalize') {
        // FIX: Uint8Array instead of Buffer.from()
        const accountKey = pemToUint8Array(row.priv_key)
        const client = new acme.Client({ directoryUrl, accountKey })
        const order = JSON.parse(row.order_url)

        const [certKey, csr] = await acme.crypto.createCsr({ commonName: row.domain })
        const cert = await client.finalizeOrder(order, csr)
        const certPem = await client.getCertificate(order)
        const privateKeyPem: string = certKey.toString()

        await sb
          .from('ec_ssl_orders')
          .update({ status: 'issued', cert_pem: certPem, updated_at: new Date().toISOString() })
          .eq('session_id', sessionId)

        const pems =
          certPem.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || []

        return R({
          ok: true,
          status: 'issued',
          cert: pems[0] || '',
          chain: pems.slice(1).join('\n'),
          fullchain: certPem,
          privateKey: privateKeyPem,
          domain: row.domain,
          message: 'Certificate issued!'
        })
      }
    }

    return R({ error: 'Unknown action' }, 400)
  } catch (err) {
    console.error('ERR:', String(err), (err as Error)?.stack?.slice(0, 400))
    return R({ error: String((err as Error)?.message || err) }, 500)
  }
})
