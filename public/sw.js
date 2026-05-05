self.addEventListener('push', function(event) {
  const data = event.data ? event.data.json() : {}
  const title = data.title || 'EasySecurity Alert'
  const options = {
    body: data.body || 'A certificate requires your attention.',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    data: { url: data.url || 'https://easysecurity.in/monitor' },
    actions: [
      { action: 'renew', title: 'Renew Now' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    requireInteraction: data.urgent || false,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function(event) {
  event.notification.close()
  if (event.action === 'renew') {
    event.waitUntil(clients.openWindow(event.notification.data.url))
  } else if (event.action !== 'dismiss') {
    event.waitUntil(clients.openWindow('https://easysecurity.in/monitor'))
  }
})

self.addEventListener('install', e => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(clients.claim()))
