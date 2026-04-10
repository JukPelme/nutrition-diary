const CACHE_NAME = 'nutrition-diary-v2';
const STATIC_ASSETS = [
  '/',
  '/static/css/style.css',
  '/static/js/api.js',
  '/static/js/app.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Network first for API calls
  if (event.request.url.includes('/api/')) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }
  // Cache first for static assets
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});


// ---- Notifications ----
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      if (windowClients.length > 0) {
        windowClients[0].focus();
      } else {
        clients.openWindow('/');
      }
    })
  );
});

// Handle periodic check messages from main thread
self.addEventListener('message', event => {
  if (event.data?.type === 'SHOW_NOTIFICATION') {
    self.registration.showNotification(event.data.title, {
      body: event.data.body,
      icon: '/static/icon-192.png',
      badge: '/static/icon-192.png',
      tag: event.data.tag || 'nutrition-reminder',
      actions: [
        { action: 'open', title: 'Открыть' },
        { action: 'dismiss', title: 'Позже' }
      ],
      requireInteraction: false,
      silent: false,
    });
  }
});

// Periodic background sync — check reminders even when tab is closed
self.addEventListener('periodicsync', event => {
  if (event.tag === 'check-reminders') {
    event.waitUntil(checkBackgroundReminders());
  }
});

async function checkBackgroundReminders() {
  const now = new Date();
  const hour = now.getHours();
  
  // Simple background check: if it's meal time and no recent notification
  const mealTimes = [
    { hour: 10, title: '🌅 Завтрак', body: 'Ты не записал завтрак', tag: 'bg_breakfast' },
    { hour: 14, title: '☀️ Обед', body: 'Ты не записал обед', tag: 'bg_lunch' },
    { hour: 21, title: '🌙 Ужин', body: 'Ты не записал ужин', tag: 'bg_dinner' },
  ];
  
  for (const m of mealTimes) {
    if (hour === m.hour) {
      self.registration.showNotification(m.title, {
        body: m.body,
        icon: '/static/icon-192.png',
        badge: '/static/icon-192.png',
        tag: m.tag,
      });
    }
  }
}
