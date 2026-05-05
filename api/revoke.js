import { createClient } from '@supabase/supabase-js'
import acme from 'acme-client'

const SUPABASE_URL = 'https://zwgdpsuvduexcdzcwjau.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const RESEND_KEY = 're_5ZwzjnuV_6DLv3XV3iiiZouCJdZfV8ycs'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

// CA revocation URLs for common issuers
const CA_REVOCATION_URLS = {
  'digicert': { name: 'DigiCert', url: 'https://www.digicert.com/support/certificate-revocation', portal: 'https://www.digicert.com/account/login' },
  'sectigo': { name: 'Sectigo', url: 'https://sectigo.com/support/certificate-revocation', portal: 'https://cert-manager.com' },
  'comodo': { name: 'Comodo/Sectigo', url: 'https://sectigo.com/support/certificate-revocation', portal: 'https://cert-manager.com' },
  'globalsign': { name: 'GlobalSign', url: 'https://www.globalsign.com/en/support/revoke-certificate', portal: 'https://www.globalsign.com/en/account' },
  'entrust': { name: 'Entrust', url: 'https://www.entrust.com/certificate-solutions/pki-revocation', portal: 'https://www.entrust.com/digital-security/certificate-solutions/products/digital-signing/digital-certificate-management' },
  "let's encrypt": { name: "Let's Encrypt", url: 'https://letsencrypt.org/docs/revoking/', portal: null },
  'godaddy': { name: 'GoDaddy', url: 'https://www.godaddy.com/help/revoke-my-ssl-certificate-4747', portal: 'https://dcc.godaddy.com' },
  'default': { name: 'your Certificate Authority', url: 'https://www.ssl.com/faqs/how-do-i-revoke-a-certificate/', portal: null }
}

function getCAInfo(issuer = '') {
  const lower = issuer.toLowerCase()
  for (const [key, val] of Object.entries(CA_REVOCATION_URLS)) {
    if (lower.includes(key)) return val
  }
  return CA_REVOCATION_URLS.default
}

async function sendRevocationEmail(to, domain, issuer, reason, caInfo) {
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body { font-family: -apple-system, sans-serif; color: #0f172a; margin: 0; padding: 0; background: #f8fafc; }
  .wrapper { max-width: 580px; margin: 40px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,.08); }
  .header { background: linear-gradient(135deg, #dc2626, #b91c1c); padding: 28px 32px; }
  .header h1 { color: #fff; margin: 0; font-size: 20px; font-weight: 700; }
  .header p { color: rgba(255,255,255,.8); margin: 6px 0 0; font-size: 13px; }
  .body { padding: 28px 32px; }
  .alert-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 20px; }
  .alert-box p { margin: 0; color: #dc2626; font-size: 13px; font-weight: 600; }
  .info-row { display: flex; gap: 12px; margin-bottom: 12px; }
  .info-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #64748b; min-width: 80px; padding-top: 2px; }
  .info-value { font-size: 13px; color: #0f172a; font-weight: 500; }
  .steps { background: #f8fafc; border-radius: 8px; padding: 16px 20px; margin: 20px 0; }
  .steps h3 { font-size: 13px; font-weight: 700; margin: 0 0 12px; color: #0f172a; }
  .step { display: flex; gap: 10px; margin-bottom: 10px; align-items: flex-start; }
  .step-num { background: #dc2626; color: #fff; width: 20px; height: 20px; border-radius: 50%; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 1px; }
  .step-text { font-size: 13px; color: #334155; }
  .btn { display: inline-block; background: #dc2626; color: #fff; padding: 10px 22px; border-radius: 8px; font-weight: 600; font-size: 13px; text-decoration: none; margin-top: 8px; }
  .footer { padding: 16px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; }
</style></head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>🔴 Certificate Revocation Request</h1>
    <p>Action required for <strong>${domain}</strong></p>
  </div>
  <div class="body">
    <div class="alert-box">
      <p>⚠ A revocation request has been initiated for the SSL certificate on <strong>${domain}</strong>. Immediate action is required.</p>
    </div>
    <div class="info-row"><span class="info-label">Domain</span><span class="info-value">${domain}</span></div>
    <div class="info-row"><span class="info-label">Issued by</span><span class="info-value">${issuer || 'Unknown CA'}</span></div>
    <div class="info-row"><span class="info-label">Reason</span><span class="info-value">${reason || 'Key compromise / Security incident'}</span></div>
    <div class="info-row"><span class="info-label">Requested</span><span class="info-value">${new Date().toUTCString()}</span></div>
    <div class="steps">
      <h3>Steps to revoke with ${caInfo.name}:</h3>
      <div class="step"><div class="step-num">1</div><div class="step-text">Log in to your ${caInfo.name} account portal</div></div>
      <div class="step"><div class="step-num">2</div><div class="step-text">Navigate to SSL/TLS Certificates → Find certificate for ${domain}</div></div>
      <div class="step"><div class="step-num">3</div><div class="step-text">Click "Revoke Certificate" and select reason: ${reason || 'Key Compromise'}</div></div>
      <div class="step"><div class="step-num">4</div><div class="step-text">Confirm the revocation — it takes effect within minutes globally</div></div>
      <div class="step"><div class="step-num">5</div><div class="step-text">Issue a new certificate immediately to avoid downtime</div></div>
      ${caInfo.portal ? `<a href="${caInfo.portal}" class="btn">Go to ${caInfo.name} Portal →</a>` : ''}
    </div>
    <p style="font-size:13px;color:#64748b;">If you did not request this revocation, please secure your certificate immediately and contact your CA. <a href="${caInfo.url}" style="color:#0d9488;">Learn more about revocation →</a></p>
  </div>
  <div class="footer">Sent by EasyCerts · easysecurity.in · This is an automated security notification</div>
</div>
</body>
</html>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'EasyCerts Security <alerts@easysecurity.in>',
      to: [to],
      subject: `🔴 Certificate Revocation Required — ${domain}`,
      html
    })
  })
  return res.ok
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') { Object.entries(cors).forEach(([k,v])=>res.setHeader(k,v)); return res.status(200).end() }
  Object.entries(cors).forEach(([k,v]) => res.setHeader(k, v))

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

  try {
    const { domain, reason, userId, userEmail } = req.body
    if (!domain || !userId) return res.status(400).json({ error: 'domain and userId required' })

    // Get domain record
    const { data: domainRow } = await sb.from('ec_monitored_domains')
      .select('*').eq('user_id', userId).eq('domain', domain).single()

    let method = 'email_notification'
    let revoked = false
    let details = ''

    // Check if this is an LE cert issued through our portal
    const isLECert = domainRow?.cert_private_key && 
      (domainRow?.last_algorithm?.includes('ECDSA') || domainRow?.cert_pem?.includes('Let'))

    if (isLECert && domainRow?.cert_pem) {
      // Try ACME revocation
      try {
        const { data: orderRow } = await sb.from('ec_ssl_orders')
          .select('*').eq('domain', domain).eq('status', 'issued')
          .order('created_at', { ascending: false }).limit(1).single()

        if (orderRow?.priv_key) {
          const accountKey = Buffer.from(orderRow.priv_key)
          const client = new acme.Client({
            directoryUrl: acme.directory.letsencrypt.production,
            accountKey
          })
          await client.createAccount({ termsOfServiceAgreed: true, contact: [`mailto:${userEmail}`] })

          // Parse cert PEM
          const certDer = Buffer.from(
            domainRow.cert_pem.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----|\n/g, ''),
            'base64'
          )
          await client.revokeCertificate(certDer, 0) // reason 0 = unspecified
          revoked = true
          method = 'acme'
          details = "Let's Encrypt certificate successfully revoked via ACME API. It will propagate globally within minutes."
        }
      } catch(e) {
        console.log('ACME revoke failed:', e.message)
        // Fall through to email notification
      }
    }

    // Always send email notification regardless
    const issuer = domainRow?.last_algorithm?.includes('ECDSA') ? "Let's Encrypt" : (domainRow?.cert_issuer || '')
    const caInfo = getCAInfo(issuer)
    const emailSent = await sendRevocationEmail(userEmail, domain, issuer, reason, caInfo)

    if (!details) {
      details = emailSent
        ? `Revocation instructions sent to ${userEmail} with steps for ${caInfo.name}.`
        : 'Email notification failed. Please contact your CA directly.'
    }

    // Log revocation
    await sb.from('ec_revocation_log').insert({
      user_id: userId, domain, reason,
      method, status: revoked ? 'revoked' : (emailSent ? 'notified' : 'failed'),
      notified_at: emailSent ? new Date().toISOString() : null
    })

    // Mark domain as revoked
    await sb.from('ec_monitored_domains').update({
      cert_revoked_at: new Date().toISOString(),
      cert_revoke_reason: reason
    }).eq('user_id', userId).eq('domain', domain)

    return res.json({
      ok: true,
      revoked,
      emailSent,
      method,
      details,
      message: revoked
        ? '✅ Certificate revoked via ACME and notification sent.'
        : `📧 Revocation notification sent to ${userEmail}.`
    })
  } catch(err) {
    console.error('Revoke error:', err)
    return res.status(500).json({ error: err.message })
  }
}
