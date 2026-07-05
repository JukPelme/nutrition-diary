// Service Worker v3: network-first API, cache-first static, Background Sync queue, notifications.
try { importScripts('/static/js/dexie.min.js'); } catch (e) { console.warn('[sw] dexie load failed:', e); }

const CACHE_NAME = 'nutrition-diary-v26';
const STATIC_ASSETS = [
    '/',
    '/static/css/style.css',
    '/static/js/api.js',
    '/static/js/app.js',
    '/static/js/i18n.js',
    '/static/js/db.js',
    '/static/js/sync.js',
    '/static/js/dexie.min.js',
];

// Same schema as in main thread db.js (must match!)
// Dexie is loaded from a CDN which may be blocked/slow (e.g. in RU). If it's
// unavailable, keep the SW alive without the offline queue instead of crashing
// the entire worker (which would also break Web Push).
let dexieSW = null;
try {
    if (typeof Dexie !== 'undefined') {
        dexieSW = new Dexie('NutritionDiary');
        dexieSW.version(1).stores({
            products:  'id,name,category,source',
            syncQueue: '++id,timestamp,method,path,status',
            meta:      'key',
        });
    } else {
        console.warn('[sw] Dexie unavailable — offline queue disabled, SW continues');
    }
} catch (e) {
    console.warn('[sw] Dexie init failed — offline queue disabled:', e);
    dexieSW = null;
}

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(c => c.addAll(STATIC_ASSETS)).catch(()=>{})
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
    const url = new URL(event.request.url);

    // Don't intercept opaque cross-origin (e.g. Dexie CDN)
    if (url.origin !== self.location.origin) return;

    // Network-first for API; fall back to cache if any
    if (url.pathname.startsWith('/api/v1/version')) {
        event.respondWith(fetch(event.request));
        return;
    }
    if (url.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request)
                .then(resp => {
                    // Only cache GETs
                    if (event.request.method === 'GET' && resp.ok) {
                        const copy = resp.clone();
                        caches.open(CACHE_NAME).then(c => c.put(event.request, copy)).catch(()=>{});
                    }
                    return resp;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Cache-first for static
    event.respondWith(
        caches.match(event.request).then(cached =>
            cached || fetch(event.request).then(resp => {
                if (resp.ok && event.request.method === 'GET') {
                    const copy = resp.clone();
                    caches.open(CACHE_NAME).then(c => c.put(event.request, copy)).catch(()=>{});
                }
                return resp;
            })
        )
    );
});

// === Background Sync API ===
// Client registers `sync` task with tag "flush-queue"; browser fires this event
// when network is available, even if the tab is closed.
self.addEventListener('sync', event => {
    if (event.tag === 'flush-queue') {
        event.waitUntil(flushQueueFromSW());
    }
});

async function getAuthHeader() {
    if (!dexieSW) return {};
    const row = await dexieSW.meta.get('auth_token');
    return row?.value ? { 'Authorization': `Bearer ${row.value}` } : {};
}

async function flushQueueFromSW() {
    if (!dexieSW) return;
    const items = await dexieSW.syncQueue.where('status').equals('pending').sortBy('timestamp');
    const auth = await getAuthHeader();
    for (const item of items) {
        try {
            const resp = await fetch(`/api/v1${item.path}`, {
                method: item.method,
                headers: { 'Content-Type': 'application/json', ...auth },
                body: item.body || undefined,
            });
            if (resp.ok || resp.status === 404) {
                await dexieSW.syncQueue.delete(item.id);
            } else if (resp.status >= 400 && resp.status < 500) {
                // Client error — server rejected; mark failed, don't retry forever
                await dexieSW.syncQueue.update(item.id, { status: 'failed', error: `HTTP ${resp.status}` });
            } else {
                throw new Error(`server ${resp.status}`); // retry later
            }
        } catch (e) {
            console.warn('[sw] sync deferred:', e);
            throw e; // browser will retry sync with exponential backoff
        }
    }
    // Notify any open clients to refresh queue counter
    const clientList = await self.clients.matchAll({ type: 'window' });
    clientList.forEach(c => c.postMessage({ type: 'QUEUE_FLUSHED' }));
}

// === Notifications (unchanged) ===
self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(windowClients => {
            if (windowClients.length > 0) windowClients[0].focus();
            else clients.openWindow('/');
        })
    );
});

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
        });
    }
});

self.addEventListener('periodicsync', event => {
    if (event.tag === 'check-reminders') {
        event.waitUntil(checkBackgroundReminders());
    }
});

async function checkBackgroundReminders() {
    const hour = new Date().getHours();
    const meals = [
        { hour: 10, title: '🌅 Завтрак', body: 'Ты не записал завтрак', tag: 'bg_breakfast' },
        { hour: 14, title: '☀️ Обед',    body: 'Ты не записал обед',     tag: 'bg_lunch' },
        { hour: 21, title: '🌙 Ужин',    body: 'Ты не записал ужин',     tag: 'bg_dinner' },
    ];
    for (const m of meals) {
        if (hour === m.hour) {
            self.registration.showNotification(m.title, { body: m.body, tag: m.tag, icon: '/static/icon-192.png' });
        }
    }
}


// === Web Push ===
self.addEventListener('push', event => {
    let data = { title: 'Nutrition Diary', body: 'Новое уведомление' };
    try { if (event.data) data = event.data.json(); } catch(e){}
    event.waitUntil(
        self.registration.showNotification(data.title || 'Nutrition Diary', {
            body: data.body || '',
            icon: data.icon || '/static/icon-192.png',
            badge: '/static/icon-192.png',
            tag: data.tag || 'push-' + Date.now(),
            data: data.url ? { url: data.url } : {},
        })
    );
});
