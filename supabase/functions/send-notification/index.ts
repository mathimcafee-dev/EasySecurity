import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'EasySecurity <alerts@easysecurity.in>',
      to: [to],
      subject,
      html,
    }),
  })
  return res.json()
}

function expiryAlertHtml(domain: string, daysLeft: number, risk: string, score: number) {
  const riskColor = risk === 'CRITICAL' ? '#dc2626' : risk === 'HIGH' ? '#ea580c' : '#d97706'
  const urgency = daysLeft <= 0 ? 'has EXPIRED' : daysLeft === 1 ? 'expires TOMORROW' : `expires in ${daysLeft} days`

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Inter',Arial,sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
    
    <!-- Header -->
    <div style="background:#0f172a;padding:28px 32px;display:flex;align-items:center;gap:12px">
      <div style="width:36px;height:36px;background:#0d9488;border-radius:8px;display:flex;align-items:center;justify-content:center">
        <span style="color:#fff;font-size:18px">🔒</span>
      </div>
      <div>
        <div style="color:#fff;font-size:16px;font-weight:700">EasySecurity</div>
        <div style="color:#64748b;font-size:11px;margin-top:1px">Certificate Expiry Alert</div>
      </div>
    </div>

    <!-- Risk Banner -->
    <div style="background:${riskColor}12;border-bottom:3px solid ${riskColor};padding:20px 32px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:11px;font-weight:700;color:${riskColor};text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">${risk} RISK</div>
        <div style="font-size:20px;font-weight:700;color:#0f172a">${domain}</div>
        <div style="font-size:13px;color:#64748b;margin-top:4px">Certificate ${urgency}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:42px;font-weight:800;color:${riskColor};line-height:1">${score}</div>
        <div style="font-size:10px;color:#94a3b8;margin-top:2px">security score</div>
      </div>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px">
      <p style="font-size:14px;color:#334155;line-height:1.7;margin:0 0 20px">
        ${daysLeft <= 0
          ? `<strong>Action required immediately.</strong> The SSL certificate for <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px">${domain}</code> has expired. All TLS connections to this domain are currently failing.`
          : `The SSL certificate for <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px">${domain}</code> will expire in <strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong>. Renew it before it impacts your users.`
        }
      </p>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px 20px;margin-bottom:24px">
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px">Quick Renewal Command</div>
        <code style="font-family:'Courier New',monospace;font-size:12px;color:#0f172a;line-height:1.8">
          openssl s_client -connect ${domain}:443 -showcerts<br>
          openssl req -new -sha256 -key server.key -out server.csr
        </code>
      </div>

      <a href="https://easysecurity.in/renew?cn=${domain}" 
        style="display:block;background:#0d9488;color:#fff;text-align:center;padding:13px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;margin-bottom:12px">
        Start Renewal Wizard →
      </a>
      <a href="https://easysecurity.in/monitor"
        style="display:block;background:#f1f5f9;color:#475569;text-align:center;padding:13px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none">
        View Monitor Dashboard
      </a>
    </div>

    <!-- Footer -->
    <div style="padding:20px 32px;border-top:1px solid #f1f5f9;display:flex;justify-content:space-between;align-items:center">
      <div style="font-size:11px;color:#94a3b8">EasySecurity.in · Certificate Intelligence</div>
      <a href="https://easysecurity.in/monitor" style="font-size:11px;color:#94a3b8;text-decoration:none">Manage alerts</a>
    </div>
  </div>
</body>
</html>`
}

function welcomeHtml(email: string) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Inter',Arial,sans-serif">
  <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
    <div style="background:#0f172a;padding:28px 32px">
      <div style="color:#fff;font-size:20px;font-weight:700">Welcome to EasySecurity 🔒</div>
      <div style="color:#64748b;font-size:13px;margin-top:4px">Your certificate intelligence platform</div>
    </div>
    <div style="padding:32px">
      <p style="font-size:15px;color:#334155;line-height:1.7;margin:0 0 20px">Hi there! You're all set. Here's what you can do with EasySecurity:</p>
      <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:28px">
        ${[
          ['🔍', 'Scan certificates', 'Upload PEM files or scan live TLS domains for risk analysis'],
          ['🔑', 'Generate CSRs', 'Create certificate signing requests with SANs, browser-side'],
          ['📅', 'Monitor expiry', 'Track multiple domains and get alerts before certs expire'],
          ['🔄', 'Renewal wizard', 'Step-by-step cert renewal with deploy commands'],
          ['🤖', 'AI Copilot', 'Ask anything about PKI, TLS errors, or JKS keystores'],
        ].map(([icon, title, desc]) => `
          <div style="display:flex;gap:12px;padding:12px;background:#f8fafc;border-radius:8px">
            <div style="font-size:20px;flex-shrink:0">${icon}</div>
            <div><div style="font-size:13px;font-weight:700;color:#0f172a;margin-bottom:2px">${title}</div><div style="font-size:12px;color:#64748b">${desc}</div></div>
          </div>`).join('')}
      </div>
      <a href="https://easysecurity.in" style="display:block;background:#0d9488;color:#fff;text-align:center;padding:13px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none">
        Get Started →
      </a>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #f1f5f9;font-size:11px;color:#94a3b8;text-align:center">
      EasySecurity.in · Built by Mathivanan K · DigiCert Certified Engineer
    </div>
  </div>
</body>
</html>`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { type, to, domain, daysLeft, risk, score, userId } = await req.json()
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    if (type === 'welcome') {
      const result = await sendEmail(to, 'Welcome to EasySecurity 🔒', welcomeHtml(to))
      return new Response(JSON.stringify({ ok: true, result }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    if (type === 'expiry_alert') {
      // Check user has email notifications enabled
      const { data: settings } = await supabase
        .from('ec_notification_settings')
        .select('email_enabled, email_address')
        .eq('user_id', userId)
        .single()

      if (!settings?.email_enabled) {
        return new Response(JSON.stringify({ ok: false, reason: 'email disabled' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const emailTo = settings.email_address || to
      const subject = daysLeft <= 0
        ? `🚨 EXPIRED: ${domain} certificate has expired`
        : daysLeft <= 7
        ? `🔴 URGENT: ${domain} expires in ${daysLeft} days`
        : `⚠️ ${domain} certificate expires in ${daysLeft} days`

      const result = await sendEmail(emailTo, subject, expiryAlertHtml(domain, daysLeft, risk, score))
      return new Response(JSON.stringify({ ok: true, result }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ error: 'unknown type' }), { status: 400, headers: corsHeaders })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders })
  }
})
