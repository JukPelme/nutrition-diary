// Offline write queue + auto-sync on reconnect.
// Pattern: wrap mutating fetches in apiQueued().
// If network fails OR offline, the request is persisted to syncQueue
// and flushed once we're back online (or on every focus).

async function apiQueued(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    // Reads always go through normal api() (use local fallbacks separately if needed)
    if (method === 'GET') return api(path, options);

    // Stable idempotency key for diary writes: the immediate attempt and any
    // queued replay (lost response / background sync / second tab) share it,
    // so the server dedupes instead of creating a duplicate entry.
    if (path.startsWith('/diary') && options.body) {
        try {
            const parsed = JSON.parse(options.body);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && !parsed.client_op_id) {
                parsed.client_op_id = (self.crypto && crypto.randomUUID)
                    ? crypto.randomUUID()
                    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
                options = { ...options, body: JSON.stringify(parsed) };
            }
        } catch (_) { /* non-JSON body — leave as-is */ }
    }

    if (!navigator.onLine) {
        await dexieDB.syncQueue.add({
            method, path,
            body: options.body || null,
            timestamp: Date.now(),
            status: 'pending',
        });
        await refreshQueueCount();
        registerBackgroundSync();
        return { _offline: true, _queued: true };
    }

    try {
        const result = await api(path, options);
        // If api returned an error object (we use detail field convention), don't queue —
        // server saw the request and rejected it.
        return result;
    } catch (err) {
        // Likely a TypeError from fetch (network down between online checks)
        await dexieDB.syncQueue.add({
            method, path,
            body: options.body || null,
            timestamp: Date.now(),
            status: 'pending',
            error: String(err).slice(0, 200),
        });
        await refreshQueueCount();
        registerBackgroundSync();
        return { _offline: true, _queued: true };
    }
}

let _syncing = false;
async function flushSyncQueue() {
    // Cross-tab guard: only one tab flushes the shared IndexedDB queue at a time.
    if (navigator.locks && navigator.locks.request) {
        return navigator.locks.request('nd-sync-flush', { ifAvailable: true }, (lock) =>
            lock ? _flushSyncQueueInner() : 0);
    }
    return _flushSyncQueueInner();
}
async function _flushSyncQueueInner() {
    if (_syncing || !navigator.onLine) return;
    _syncing = true;
    let synced = 0;
    try {
        const items = await dexieDB.syncQueue.where('status').equals('pending').sortBy('timestamp');
        for (const item of items) {
            try {
                const result = await api(item.path, { method: item.method, body: item.body });
                if (result && result.detail) {
                    // Server rejected — mark as failed so we don't retry forever
                    await dexieDB.syncQueue.update(item.id, { status: 'failed', error: result.detail });
                } else {
                    await dexieDB.syncQueue.delete(item.id);
                    synced += 1;
                }
            } catch (e) {
                console.warn('[sync] retry later:', item.path, e);
                break; // network probably died again — stop loop, wait for next online event
            }
        }
    } finally {
        _syncing = false;
        await refreshQueueCount();
    }
    if (synced > 0) {
        showToast(`Синхронизировано: ${synced} ${synced === 1 ? 'изменение' : 'изменений'}`);
    }
    const failedCount = await dexieDB.syncQueue.where('status').equals('failed').count();
    if (failedCount > 0) {
        showActionToast(`${failedCount} не синхронизировано`, 'Повторить', retryFailedSync);
    }
    return synced;
}

async function retryFailedSync() {
    const failed = await dexieDB.syncQueue.where('status').equals('failed').toArray();
    for (const it of failed) await dexieDB.syncQueue.update(it.id, { status: 'pending', error: null });
    await refreshQueueCount();
    await flushSyncQueue();
}

function showToast(msg) {
    let el = document.getElementById('toast-stack');
    if (!el) {
        el = document.createElement('div');
        el.id = 'toast-stack';
        el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:200;pointer-events:none;';
        document.body.appendChild(el);
    }
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    el.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

// Toast with a tappable action button (e.g. Undo). toast-stack itself has
// pointer-events:none, so the toast must re-enable them to be clickable.
function showActionToast(msg, actionLabel, onAction) {
    let el = document.getElementById('toast-stack');
    if (!el) {
        el = document.createElement('div');
        el.id = 'toast-stack';
        el.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:200;pointer-events:none;';
        document.body.appendChild(el);
    }
    const t = document.createElement('div');
    t.className = 'toast';
    t.style.pointerEvents = 'auto';
    const span = document.createElement('span');
    span.textContent = msg + '  ';
    t.appendChild(span);
    const btn = document.createElement('button');
    btn.textContent = actionLabel;
    btn.style.cssText = 'background:none;border:none;color:var(--orange,#ff9800);font-weight:700;cursor:pointer;padding:0 4px';
    btn.onclick = () => { t.remove(); try { onAction(); } catch (e) { console.error(e); } };
    t.appendChild(btn);
    el.appendChild(t);
    setTimeout(() => t.remove(), 6000);
}

// Network listeners
window.addEventListener('online', async () => {
    offlineState.online = true;
    offlineState.notify();
    showToast('Связь восстановлена');
    await flushSyncQueue();
});
window.addEventListener('offline', () => {
    offlineState.online = false;
    offlineState.notify();
    showToast('Офлайн — изменения сохраняются локально');
});

// On focus check: flush queue when user returns to the tab
window.addEventListener('focus', () => {
    if (navigator.onLine) flushSyncQueue();
});


async function registerBackgroundSync() {
    if (!('serviceWorker' in navigator) || !('SyncManager' in window)) return;
    try {
        const reg = await navigator.serviceWorker.ready;
        await reg.sync.register('flush-queue');
    } catch (e) { /* unsupported (Firefox/Safari) — fallback to focus/online events */ }
}

// Mirror auth token into IndexedDB so the SW can use it during Background Sync
async function persistTokenForSW(token) {
    try {
        if (token) await setMeta('auth_token', token);
        else await dexieDB.meta.delete('auth_token');
    } catch (e) {}
}

// Listen for SW telling us queue was flushed in background
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', e => {
        if (e.data?.type === 'QUEUE_FLUSHED') {
            refreshQueueCount();
            if (typeof loadDiary === 'function') loadDiary();
        }
    });
}
