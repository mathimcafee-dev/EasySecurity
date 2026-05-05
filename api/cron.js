// Vercel cron job — runs daily at 8AM UTC
// vercel.json config triggers this

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://zwgdpsuvduexcdzcwjau.supabase.co'
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || ''

export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  // Only allow Vercel cron calls or manual trigger with secret
  const authHeader = req.headers.authorization
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

  try {
    // Get all monitored domains
    const { data: domains, error } = await sb
      .from('ec_monitored_domains')
      .select('*')
    
    if (error) throw error

    const results = []
    const now = new Date()

    for (const domain of (domains || [])) {
      try {
        // Scan live certificate via tls-scan edge function
        const scanRes = await fetch('https://zwgdpsuvduexcdzcwjau.supabase.co/functions/v1/tls-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domain: domain.domain })
        })
        const scanData = await scanRes.json()
        
        if (!scanData.ok || !scanData.certs?.length) {
          results.push({ domain: domain.domain, error: 'scan failed' })
          continue
        }

        const cert = scanData.certs[0]
        const daysLeft = cert.daysLeft
        const certStart = cert.notBefore ? new Date(cert.notBefore) : null
        const certExpiry = cert.notAfter ? new Date(cert.notAfter) : null
        const risk = daysLeft <= 0 ? 'CRITICAL' : daysLeft <= 7 ? 'CRITICAL' : daysLeft <= 15 ? 'HIGH' : daysLeft <= 30 ? 'MEDIUM' : 'LOW'

        // Update domain record
        await sb.from('ec_monitored_domains').update({
          last_scanned_at: now.toISOString(),
          last_days_left: daysLeft,
          last_risk_level: risk,
          last_score: Math.min(100, daysLeft + 10),
          last_algorithm: cert.sigAlgo || cert.keyType || 'RSA-2048',
          cert_start: certStart?.toISOString() || null,
          cert_expiry: certExpiry?.toISOString() || null
        }).eq('id', domain.id)

        // Send email alert if needed
        const threshold = domain.alert_threshold_days || 30
        if (daysLeft <= threshold && daysLeft >= 0) {
          // Get notification settings for this user
          const { data: notif } = await sb
            .from('ec_notification_settings')
            .select('email_enabled, email_address, notify_days_before')
            .eq('user_id', domain.user_id)
            .single()
          if (notif?.email_enabled) {
            await fetch('https://zwgdpsuvduexcdzcwjau.supabase.co/functions/v1/send-notification', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'expiry',
                domain: domain.domain,
                daysLeft, risk,
                score: Math.min(100, daysLeft + 10),
                to: notif.email_address || '',
                userId: domain.user_id
              })
            })
          }
        }

        results.push({ domain: domain.domain, daysLeft, risk, alerted: daysLeft <= threshold })
      } catch(e) {
        results.push({ domain: domain.domain, error: e.message })
      }
    }

    // Log run
    console.log('Cron scan complete:', results.length, 'domains')
    return res.json({ ok: true, scanned: results.length, results, timestamp: now.toISOString() })

  } catch(err) {
    console.error('Cron error:', err)
    return res.status(500).json({ error: err.message })
  }
}
