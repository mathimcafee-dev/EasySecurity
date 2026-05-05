import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  try {
    // Get all monitored domains that are due for scanning
    const { data: domains } = await supabase
      .from('ec_monitored_domains')
      .select('*, ec_notification_settings!inner(email_enabled, email_address, push_enabled, push_subscription, notify_days_before)')
      .or(`last_scanned_at.is.null,last_scanned_at.lt.${new Date(Date.now() - 6 * 3600000).toISOString()}`)

    const results = []

    for (const domain of (domains || [])) {
      try {
        // DNS lookup to verify domain is alive
        const dnsRes = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain.domain)}&type=1`)
        const dns = await dnsRes.json()
        const alive = dns.Status === 0 && dns.Answer?.length > 0

        // Simulate cert check (in production this would use a cert-checking API)
        const daysLeft = domain.last_days_left ?? 90
        const risk = daysLeft <= 0 ? 'CRITICAL' : daysLeft <= 7 ? 'CRITICAL' : daysLeft <= 30 ? 'HIGH' : daysLeft <= 90 ? 'MEDIUM' : 'SECURE'
        const score = daysLeft <= 0 ? 0 : daysLeft <= 7 ? 20 : daysLeft <= 30 ? 50 : daysLeft <= 90 ? 75 : 90

        // Update scan record
        await supabase.from('ec_monitored_domains').update({
          last_scanned_at: new Date().toISOString(),
          last_risk_level: risk,
          last_score: score,
          last_days_left: daysLeft,
        }).eq('id', domain.id)

        // Check if we should send an alert
        const threshold = domain.alert_threshold_days || 30
        const notifyDays = domain.ec_notification_settings?.notify_days_before || [30, 14, 7, 1]
        const shouldAlert = daysLeft <= threshold && notifyDays.some((d: number) => Math.abs(daysLeft - d) <= 1)

        if (shouldAlert) {
          // Get user email
          const { data: userData } = await supabase.auth.admin.getUserById(domain.user_id)
          const userEmail = domain.ec_notification_settings?.email_address || userData?.user?.email

          if (userEmail && domain.ec_notification_settings?.email_enabled !== false) {
            // Call send-notification function
            await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                type: 'expiry_alert',
                to: userEmail,
                domain: domain.domain,
                daysLeft,
                risk,
                score,
                userId: domain.user_id,
              }),
            })
          }

          // Web push notification
          if (domain.ec_notification_settings?.push_enabled && domain.ec_notification_settings?.push_subscription) {
            await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                subscription: domain.ec_notification_settings.push_subscription,
                domain: domain.domain,
                daysLeft,
                risk,
              }),
            })
          }

          results.push({ domain: domain.domain, alerted: true, daysLeft, risk })
        } else {
          results.push({ domain: domain.domain, alerted: false, daysLeft })
        }
      } catch (e) {
        results.push({ domain: domain.domain, error: e.message })
      }
    }

    return new Response(JSON.stringify({ ok: true, scanned: results.length, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders })
  }
})
