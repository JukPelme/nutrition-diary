// IndexedDB persistence layer via Dexie.
// Schema:
//   products:  cached catalog (after first load — works offline)
//   syncQueue: writes pending to send when back online
//   meta:      key/value for last sync time and similar
//
// Window globals: dexieDB (singleton), offlineState (online/queueCount).

const dexieDB = new Dexie('NutritionDiary');
dexieDB.version(1).stores({
    products:  'id,name,category,source',
    syncQueue: '++id,timestamp,method,path,status',
    meta:      'key',
});

const offlineState = {
    online: navigator.onLine,
    queueCount: 0,
    listeners: [],
    notify() { this.listeners.forEach(fn => { try { fn(this); } catch(e){} }); },
};

async function getMeta(key, fallback = null) {
    const row = await dexieDB.meta.get(key);
    return row ? row.value : fallback;
}

async function setMeta(key, value) {
    await dexieDB.meta.put({ key, value });
}

async function refreshQueueCount() {
    offlineState.queueCount = await dexieDB.syncQueue.where('status').equals('pending').count();
    offlineState.notify();
}

// Cache catalog products in batches (called once after login).
// Keeps a freshness mark in meta; re-runs no more than once a day.
async function cacheProductCatalog(force = false) {
    const lastSync = await getMeta('products_synced_at', 0);
    if (!force && Date.now() - lastSync < 24 * 60 * 60 * 1000) return { skipped: true };

    let total = 0;
    for (let offset = 0; offset < 5000; offset += 100) {
        try {
            const batch = await api(`/products?limit=100&offset=${offset}`);
            if (!Array.isArray(batch) || batch.length === 0) break;
            await dexieDB.products.bulkPut(batch);
            total += batch.length;
            if (batch.length < 100) break;
        } catch (e) {
            console.warn('[db] product cache stopped:', e);
            break;
        }
    }
    await setMeta('products_synced_at', Date.now());
    console.log(`[db] cached ${total} products`);
    return { total };
}

// Offline product search (used as fallback when network fails)
async function searchProductsLocal(query, limit = 20) {
    const q = (query || '').toLowerCase().trim();
    if (!q) return await dexieDB.products.limit(limit).toArray();
    return await dexieDB.products
        .filter(p => (p.name || '').toLowerCase().includes(q))
        .limit(limit)
        .toArray();
}
