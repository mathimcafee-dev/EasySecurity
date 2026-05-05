import { useState, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase, signInWithGoogle } from '../lib/supabase'

const SUPABASE_URL = 'https://zwgdpsuvduexcdzcwjau.supabase.co'

async function subscribePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null
  const reg = await navigator.serviceWorker.ready
  const existing = await reg.pushManager.getSubscription()
  if (existing) return existing
  const res = await fetch('https://easysecurity.in/vapid-public-key.txt').catch(() => null)
  // Use a hardcoded VAPID key - generated for easysecurity.in
  const VAPID_PUBLIC = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjZJmFqM4GXKOjgHHqPpfCN7SBXvc'
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC)
  })
  return subscription
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export default function Notifications() {
  const { user, loading } = useAuth()
  const [settings, setSettings] = useState({
    email_enabled: true,
    email_address: '',
    push_enabled: false,
    notify_days_before: [30, 14, 7, 1],
  })
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pushStatus, setPushStatus] = useState('unknown') // unknown | supported | denied | subscribed
  const [testingEmail, setTestingEmail] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [fetchedSettings, setFetchedSettings] = useState(false)

  useEffect(() => {
    if (user) loadSettings()
    checkPushStatus()
  }, [user])

  const checkPushStatus = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushStatus('unsupported'); return
    }
    const perm = Notification.permission
    if (perm === 'denied') { setPushStatus('denied'); return }
    const reg = await navigator.serviceWorker.ready.catch(() => null)
    if (!reg) { setPushStatus('supported'); return }
    const sub = await reg.pushManager.getSubscription().catch(() => null)
    setPushStatus(sub ? 'subscribed' : 'supported')
  }

  const loadSettings = async () => {
    const { data } = await supabase.from('ec_notification_settings').select('*').eq('user_id', user.id).single()
    if (data) {
      setSettings({
        email_enabled: data.email_enabled ?? true,
        email_address: data.email_address || user.email || '',
        push_enabled: data.push_enabled ?? false,
        notify_days_before: data.notify_days_before || [30, 14, 7, 1],
      })
    } else {
      setSettings(s => ({ ...s, email_address: user.email || '' }))
    }
    setFetchedSettings(true)
  }

  const save = async () => {
    setSaving(true); setSaved(false); setTestResult(null)
    let pushSub = null
    if (settings.push_enabled && pushStatus !== 'subscribed') {
      try {
        // Register service worker first
        if ('serviceWorker' in navigator) {
          await navigator.serviceWorker.register('/sw.js').catch(() => {})
          await navigator.serviceWorker.ready
        }
        const perm = await Notification.requestPermission()
        if (perm === 'granted') {
          pushSub = await subscribePush()
          setPushStatus('subscribed')
        } else {
          setPushStatus('denied')
          setSettings(s => ({ ...s, push_enabled: false }))
        }
      } catch (e) {
        console.error('Push subscribe error:', e)
      }
    }

    const payload = {
      user_id: user.id,
      email_enabled: settings.email_enabled,
      email_address: settings.email_address || user.email,
      push_enabled: settings.push_enabled,
      push_subscription: pushSub ? JSON.parse(JSON.stringify(pushSub)) : null,
      notify_days_before: settings.notify_days_before,
      updated_at: new Date().toISOString(),
    }
    await supabase.from('ec_notification_settings').upsert(payload, { onConflict: 'user_id' })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const sendTestEmail = async () => {
    setTestingEmail(true); setTestResult(null)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'welcome', to: settings.email_address || user.email }),
      })
      const data = await res.json()
      setTestResult(data.ok ? 'success' : 'error')
    } catch {
      setTestResult('error')
    }
    setTestingEmail(false)
  }

  const toggleDay = (day) => {
    setSettings(s => ({
      ...s,
      notify_days_before: s.notify_days_before.includes(day)
        ? s.notify_days_before.filter(d => d !== day)
        : [...s.notify_days_before, day].sort((a, b) => b - a)
    }))
  }

  if (loading) return <div className="content-wrap" style={{ textAlign: 'center', padding: 60 }}><span className="spinner" style={{ width: 32, height: 32 }}></span></div>

  if (!user) return (
    <div className="content-wrap">
      <div style={{ textAlign: 'center', maxWidth: 440, margin: '60px auto' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔔</div>
        <div className="page-title" style={{ marginBottom: 10 }}>Notification Settings</div>
        <div style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 24 }}>Sign in to configure email and push notifications.</div>
        <button className="btn btn-primary btn-lg" onClick={() => signInWithGoogle()}>Sign in with Google →</button>
      </div>
    </div>
  )

  return (
    <div className="content-wrap">
      <div className="page-header">
        <div className="page-title">🔔 Notification Settings</div>
        <div className="page-sub">Configure how you want to be alerted when certificates are expiring</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

        {/* EMAIL */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="card-title" style={{ margin: 0 }}>📧 Email Alerts</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', textTransform: 'none', fontSize: 13, fontWeight: 500, letterSpacing: 0, color: 'var(--text-2)' }}>
              <div style={{ position: 'relative', width: 40, height: 22 }}>
                <input type="checkbox" checked={settings.email_enabled} onChange={e => setSettings(s => ({ ...s, email_enabled: e.target.checked }))} style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
                <div style={{ position: 'absolute', inset: 0, background: settings.email_enabled ? 'var(--teal)' : 'var(--slate-7)', borderRadius: 20, transition: 'background .2s' }}></div>
                <div style={{ position: 'absolute', top: 3, left: settings.email_enabled ? 21 : 3, width: 16, height: 16, background: '#fff', borderRadius: '50%', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }}></div>
              </div>
              {settings.email_enabled ? 'Enabled' : 'Disabled'}
            </label>
          </div>

          <div className="form-group" style={{ marginBottom: 14 }}>
            <label>Alert email address</label>
            <input
              type="email"
              placeholder={user.email}
              value={settings.email_address}
              onChange={e => setSettings(s => ({ ...s, email_address: e.target.value }))}
              disabled={!settings.email_enabled}
            />
            <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>Leave blank to use your sign-in email</div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={sendTestEmail} disabled={testingEmail || !settings.email_enabled}>
              {testingEmail ? <><span className="spinner"></span> Sending...</> : '📨 Send Test Email'}
            </button>
            {testResult === 'success' && <span className="badge badge-secure">✓ Sent!</span>}
            {testResult === 'error' && <span className="badge badge-critical">✕ Failed</span>}
          </div>
        </div>

        {/* BROWSER PUSH */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div className="card-title" style={{ margin: 0 }}>🔔 Browser Push</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: pushStatus === 'unsupported' || pushStatus === 'denied' ? 'not-allowed' : 'pointer', textTransform: 'none', fontSize: 13, fontWeight: 500, letterSpacing: 0, color: 'var(--text-2)' }}>
              <div style={{ position: 'relative', width: 40, height: 22 }}>
                <input type="checkbox"
                  checked={settings.push_enabled}
                  onChange={e => setSettings(s => ({ ...s, push_enabled: e.target.checked }))}
                  disabled={pushStatus === 'unsupported' || pushStatus === 'denied'}
                  style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
                <div style={{ position: 'absolute', inset: 0, background: settings.push_enabled ? 'var(--teal)' : 'var(--slate-7)', borderRadius: 20, transition: 'background .2s', opacity: pushStatus === 'unsupported' || pushStatus === 'denied' ? .5 : 1 }}></div>
                <div style={{ position: 'absolute', top: 3, left: settings.push_enabled ? 21 : 3, width: 16, height: 16, background: '#fff', borderRadius: '50%', transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }}></div>
              </div>
              {settings.push_enabled ? 'Enabled' : 'Disabled'}
            </label>
          </div>

          {pushStatus === 'unsupported' && <div className="alert alert-warning" style={{ marginBottom: 12 }}>⚠ Push notifications not supported in this browser.</div>}
          {pushStatus === 'denied' && <div className="alert alert-error" style={{ marginBottom: 12 }}>🚫 Notifications blocked. Enable in browser settings → Site Settings → Notifications.</div>}
          {pushStatus === 'subscribed' && <div className="alert alert-success" style={{ marginBottom: 12 }}>✓ Browser is subscribed to push notifications.</div>}
          {(pushStatus === 'supported' || pushStatus === 'unknown') && (
            <div className="alert alert-info" style={{ marginBottom: 12 }}>Enable and save to request browser notification permission.</div>
          )}

          <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.7 }}>
            Receive instant alerts in your browser when a certificate is about to expire — even when EasySecurity is not open.
          </div>
        </div>
      </div>

      {/* ALERT SCHEDULE */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-title">📅 When to Alert</div>
        <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>Send alerts when a certificate expires in this many days:</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[90, 60, 30, 21, 14, 7, 3, 1].map(day => (
            <button key={day}
              onClick={() => toggleDay(day)}
              className={settings.notify_days_before.includes(day) ? 'chip ok' : 'chip'}
              style={{ fontSize: 13, fontWeight: 700 }}>
              {settings.notify_days_before.includes(day) ? '✓ ' : ''}{day} day{day !== 1 ? 's' : ''}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 12 }}>
          Selected: alerts at {settings.notify_days_before.sort((a, b) => b - a).join(', ')} days before expiry
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div className="card" style={{ marginBottom: 20, background: 'var(--teal-light)', border: '1px solid var(--teal-border)' }}>
        <div className="card-title" style={{ color: 'var(--teal-dark)' }}>ℹ How alerts work</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          {[
            ['🕗 Daily scan', 'EasySecurity scans all your monitored domains every day at 8am UTC (1:30pm IST).'],
            ['📊 Risk check', 'If a domain\'s cert is within your alert threshold, a notification is triggered.'],
            ['📨 Delivery', 'You receive an email with the cert details, risk score, and one-click renewal link.'],
          ].map(([title, desc]) => (
            <div key={title}>
              <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--teal-dark)', marginBottom: 4 }}>{title}</div>
              <div style={{ fontSize: 12, color: 'var(--teal-darker)', lineHeight: 1.6 }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* SAVE */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className="btn btn-primary btn-lg" onClick={save} disabled={saving}>
          {saving ? <><span className="spinner"></span> Saving...</> : '💾 Save Settings'}
        </button>
        {saved && <span className="badge badge-secure" style={{ fontSize: 13 }}>✓ Settings saved!</span>}
      </div>
    </div>
  )
}
