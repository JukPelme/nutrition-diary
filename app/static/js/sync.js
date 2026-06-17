// Offline write queue + auto-sync on reconnect.
// Pattern: wrap mutating fetches in apiQueued().
// If network fails OR offline, the request is persisted to syncQueue
// and flushed once we're back online (or on every focus).

async function apiQueued(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    // Reads always go through normal api() (use local fallbacks separately if needed)
    if (method === 'GET') return api(path, options);

    if (!navigator.onLine) {
        await dexieDB.syncQueue.add({
            method, path,
            body: options.body || null,
            timestamp: Date.now(),
            status: 'pending',
        });
        await refreshQueueCount();
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
        return { _offline: true, _queued: true };
    }
}

let _syncing = false;
async function flushSyncQueue() {
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
    return synced;
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
