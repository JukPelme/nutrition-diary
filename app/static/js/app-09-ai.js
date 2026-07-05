// app-09-ai.js — mechanical split of app.js (Этап 1). Loaded as classic script; all globals stay global.
// === AI Chat ===
let _chatLoaded = false;

async function openChat() {
    document.getElementById('chat-modal').classList.add('active');
    if (!_chatLoaded) { await loadChatHistory(); _chatLoaded = true; }
    setTimeout(() => document.getElementById('chat-input')?.focus(), 100);
}

async function loadChatHistory() {
    const msgs = await api('/chat/history?limit=50');
    const container = document.getElementById('chat-messages');
    if (!msgs || !msgs.length) {
        container.innerHTML = '<div class="chat-empty">Привет! Спроси что-нибудь про твоё питание — я знаю что ты ел за неделю, какие у тебя цели и могу помочь подтянуть рацион.</div>';
        return;
    }
    container.innerHTML = msgs.map(m => renderChatBubble(m.role, m.content)).join('');
    container.scrollTop = container.scrollHeight;
}

function renderChatBubble(role, content) {
    const safe = String(content).replace(/[<>]/g, c => c === '<' ? '&lt;' : '&gt;');
    return `<div class="chat-msg ${role}">${safe}</div>`;
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const container = document.getElementById('chat-messages');
    if (container.querySelector('.chat-empty')) container.innerHTML = '';
    container.insertAdjacentHTML('beforeend', renderChatBubble('user', text));
    const loadingId = 'chat-loading-' + Date.now();
    container.insertAdjacentHTML('beforeend', `<div class="chat-msg assistant loading" id="${loadingId}">Думаю…</div>`);
    container.scrollTop = container.scrollHeight;

    try {
        const resp = await api('/chat', {
            method: 'POST',
            body: JSON.stringify({ message: text, lang: currentLang || 'ru' })
        });
        document.getElementById(loadingId)?.remove();
        if (resp?.reply) {
            container.insertAdjacentHTML('beforeend', renderChatBubble('assistant', resp.reply));
        } else if (resp?.detail) {
            container.insertAdjacentHTML('beforeend', renderChatBubble('assistant', '⚠️ ' + resp.detail));
        }
    } catch (e) {
        document.getElementById(loadingId)?.remove();
        container.insertAdjacentHTML('beforeend', renderChatBubble('assistant', 'Ошибка: ' + (e?.message || e)));
    }
    container.scrollTop = container.scrollHeight;
}

async function clearChat() {
    if (!confirm('Удалить всю историю чата?')) return;
    await api('/chat/clear', { method: 'DELETE' });
    _chatLoaded = false;
    await loadChatHistory();
}


async function loadHeatmap(days=90) {
    const data = await api(`/stats/heatmap?days=${days}`);
    const area = document.getElementById('heatmap-area');
    if (!area || !data?.days) return;
    const max = Math.max(1, ...data.days.map(d => d.count));
    const monthLabels = ['Я','Ф','М','А','М','И','И','А','С','О','Н','Д'];
    const cells = data.days.map(d => {
        const intensity = d.count === 0 ? 0 : Math.min(1, 0.25 + 0.75 * d.count / max);
        const color = d.count === 0 ? 'var(--bg3)' : `rgba(81, 207, 102, ${intensity})`;
        const ds = new Date(d.date);
        const ts = ds.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
        return `<div class="hm-cell" style="background:${color}" title="${ts}: ${d.count} ${d.count===1?'запись':'записей'}"></div>`;
    }).join('');
    const first = new Date(data.start);
    const last = new Date(data.end);
    area.innerHTML = `
        <div class="hm-grid">${cells}</div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--text2);margin-top:8px">
            <span>${first.toLocaleDateString('ru-RU', { day:'numeric', month:'short' })}</span>
            <span>Записей в день: 0 → ${max}</span>
            <span>${last.toLocaleDateString('ru-RU', { day:'numeric', month:'short' })}</span>
        </div>
    `;
}


// === Recipes ===
let _newRecipeIngredients = [];

async function loadRecipes() {
    const list = await api('/recipes');
    const container = document.getElementById('recipes-list');
    if (!container) return;
    if (!list || !list.length) {
        container.innerHTML = '<div style="color:var(--text2);font-size:13px;text-align:center;padding:12px">Пока нет рецептов. Создай первый — потом добавляй в дневник одним тапом.</div>';
        return;
    }
    container.innerHTML = list.map(r => {
        const m = r.macros_per_100g;
        return `<div class="card" style="padding:12px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
                <div style="flex:1">
                    <div style="font-weight:600">${escapeHtml(r.name)}</div>
                    <div style="font-size:12px;color:var(--text2);margin-top:4px">
                        ${r.total_weight_g}г · ${r.servings} порц · ${m.calories} ккал/100г
                    </div>
                    <div style="font-size:11px;color:var(--text2);margin-top:2px">
                        Б${m.protein} Ж${m.fat} У${m.carbohydrates} на 100г
                    </div>
                </div>
                <div style="display:flex;gap:4px">
                    <button class="btn-icon" aria-label="Список покупок" onclick="openShoppingList('${r.id}','${escapeAttr(r.name)}')" title="Список покупок">🛒</button>
                    <button class="btn-icon" aria-label="Добавить рецепт в дневник" onclick="addRecipeToDiary('${r.id}','${escapeAttr(r.name)}',${r.total_weight_g})" title="В дневник">＋</button>
                    <button class="btn-icon" aria-label="Удалить рецепт" onclick="deleteRecipe('${r.id}')" title="Удалить">🗑</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

function escapeHtml(s) { return String(s).replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'})[c]); }
function escapeAttr(s) { return String(s).replace(/[\'"]/g, c => '\\'+c); }

function openCreateRecipe() {
    _newRecipeIngredients = [];
    document.getElementById('recipe-name').value = '';
    document.getElementById('recipe-weight').value = '';
    document.getElementById('recipe-servings').value = '1';
    document.getElementById('recipe-ing-search').value = '';
    document.getElementById('recipe-ing-grams').value = '';
    document.getElementById('recipe-ing-results').innerHTML = '';
    renderRecipeIngList();
    document.getElementById('recipe-modal').classList.add('active');
    document.getElementById('recipe-weight').oninput = updateRecipeMacrosPreview;
}

function renderRecipeIngList() {
    const container = document.getElementById('recipe-ingredients-list');
    if (!_newRecipeIngredients.length) {
        container.innerHTML = '<div style="font-size:12px;color:var(--text2)">Пока пусто. Найди продукт и добавь.</div>';
    } else {
        container.innerHTML = _newRecipeIngredients.map((ing, i) =>
            `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:var(--bg3);border-radius:6px;font-size:13px">
                <span>${escapeHtml(ing.product_name)} · ${ing.amount_g}г</span>
                <button class="btn-icon" onclick="removeRecipeIng(${i})">✕</button>
            </div>`).join('');
    }
    updateRecipeMacrosPreview();
}

function removeRecipeIng(idx) { _newRecipeIngredients.splice(idx,1); renderRecipeIngList(); }

let _recipeSearchTimer = null;
function onRecipeIngSearch(e) {
    clearTimeout(_recipeSearchTimer);
    const q = e.target.value.trim();
    if (!q) { document.getElementById('recipe-ing-results').innerHTML = ''; return; }
    _recipeSearchTimer = setTimeout(async () => {
        const results = await api(`/products?q=${encodeURIComponent(q)}&limit=10`);
        const div = document.getElementById('recipe-ing-results');
        if (!results || !results.length) { div.innerHTML = '<div style="padding:8px;color:var(--text2);font-size:12px">Не найдено</div>'; return; }
        div.innerHTML = results.map(p =>
            `<div style="padding:8px 10px;cursor:pointer;border-radius:6px;font-size:13px" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''" onclick="addRecipeIng('${p.id}','${escapeAttr(p.name)}', ${p.calories||0})">
                ${escapeHtml(p.name)} · ${Math.round(p.calories||0)} ккал/100г
            </div>`).join('');
    }, 300);
}

function addRecipeIng(productId, name, kcal100) {
    const g = parseFloat(document.getElementById('recipe-ing-grams').value);
    if (!g || g <= 0) { alert('Укажи граммы'); return; }
    _newRecipeIngredients.push({ product_id: productId, product_name: name, amount_g: g, _kcal100: kcal100 });
    document.getElementById('recipe-ing-search').value = '';
    document.getElementById('recipe-ing-grams').value = '';
    document.getElementById('recipe-ing-results').innerHTML = '';
    renderRecipeIngList();
}

function updateRecipeMacrosPreview() {
    const weight = parseFloat(document.getElementById('recipe-weight').value) || 0;
    let totalCal = 0;
    _newRecipeIngredients.forEach(i => totalCal += (i._kcal100 || 0) * i.amount_g / 100);
    const el = document.getElementById('recipe-macros-preview');
    if (!_newRecipeIngredients.length) { el.textContent = ''; return; }
    const per100 = weight > 0 ? Math.round(totalCal / weight * 100) : '—';
    el.innerHTML = `Итого: <b>${Math.round(totalCal)} ккал</b> · на 100г: <b>${per100}</b> · ингредиентов: ${_newRecipeIngredients.length}`;
}

async function saveRecipe() {
    const name = document.getElementById('recipe-name').value.trim();
    const weight = parseFloat(document.getElementById('recipe-weight').value);
    const servings = parseInt(document.getElementById('recipe-servings').value) || 1;
    if (!name) { alert('Укажи название'); return; }
    if (!weight || weight <= 0) { alert('Укажи готовый вес'); return; }
    if (!_newRecipeIngredients.length) { alert('Добавь хотя бы 1 ингредиент'); return; }
    const resp = await api('/recipes', {
        method: 'POST',
        body: JSON.stringify({
            name, total_weight_g: weight, servings,
            ingredients: _newRecipeIngredients.map(i => ({ product_id: i.product_id, product_name: i.product_name, amount_g: i.amount_g }))
        })
    });
    if (resp?.detail) { alert(resp.detail); return; }
    closeModal('recipe-modal');
    loadRecipes();
}

async function deleteRecipe(id) {
    if (!confirm('Удалить рецепт?')) return;
    await api(`/recipes/${id}`, { method: 'DELETE' });
    loadRecipes();
}

async function addRecipeToDiary(id, name, totalWeight) {
    const g = prompt(`Сколько грамм "${name}" съел? (всего рецепта ${totalWeight} г)`, '200');
    if (!g) return;
    const grams = parseFloat(g);
    if (!grams || grams <= 0) { alert('Введи число'); return; }
    const meal = meals?.[0];
    const resp = await api(`/recipes/${id}/add-to-diary`, {
        method: 'POST',
        body: JSON.stringify({
            entry_date: currentDate,
            meal_id: meal?.id || null,
            serving_amount: grams,
        })
    });
    if (resp?.detail) { alert(resp.detail); return; }
    if (typeof showToast === 'function') showToast(`+${resp.added_kcal} ккал в дневник`);
    loadDiary();
}


async function exportPDF(days) {
    const url = `/api/v1/export/pdf?days=${days}`;
    try {
        const resp = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
        if (!resp.ok) { alert('Ошибка генерации PDF: HTTP ' + resp.status); return; }
        const blob = await resp.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `nutrition_${days}d_${new Date().toISOString().slice(0,10)}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) { alert('Ошибка: ' + e); }
}


async function uploadCsv(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const status = document.getElementById('csv-import-status');
    status.textContent = `Загружаю ${Math.round(file.size/1024)} КБ...`;
    try {
        const fd = new FormData();
        fd.append('file', file);
        const resp = await fetch('/api/v1/import/csv', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token },
            body: fd,
        });
        const text = await resp.text();
        let data; try { data = JSON.parse(text); } catch(e) { status.textContent = 'HTTP ' + resp.status + ': ' + text.slice(0,150); return; }
        if (data.detail) { status.textContent = '⚠️ ' + (typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail).slice(0,200)); return; }
        status.style.color = '#51cf66';
        status.textContent = `✓ Импортировано: ${data.imported} из ${data.total_rows} (пропущено ${data.skipped})`;
        loadDiary();
    } catch (e) {
        status.textContent = 'Ошибка: ' + (e?.message || e);
    }
}

function downloadCsvTemplate() {
    const url = '/api/v1/import/template.csv';
    fetch(url, { headers: { 'Authorization': 'Bearer ' + token } })
        .then(r => r.blob())
        .then(b => {
            const a = document.createElement('a');
            a.href = URL.createObjectURL(b);
            a.download = 'nutrition_diary_template.csv';
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        });
}


// === 2FA TOTP ===
async function loadTotpStatus() {
    const me = await api('/auth/me').catch(() => null);
    const status = document.getElementById('totp-status');
    const btns = document.getElementById('totp-buttons');
    if (!me || !status) return;
    if (me.totp_enabled) {
        status.innerHTML = '✓ Включена — при входе спрашивается код из приложения';
        status.style.color = '#51cf66';
        btns.innerHTML = '<input type="text" id="totp-disable-code" class="input" placeholder="Код для отключения" maxlength="6" style="margin-bottom:6px"><button class="mode-btn" style="width:100%;padding:10px" onclick="disableTotp()">Отключить 2FA</button>';
    } else {
        status.innerHTML = 'Не включена';
        status.style.color = '';
        btns.innerHTML = '<button class="mode-btn" style="width:100%;padding:10px" onclick="toggleTotp()">Включить 2FA</button>';
    }
}

async function toggleTotp() {
    const resp = await api('/auth/2fa/setup', { method: 'POST' });
    if (resp?.detail) { alert(resp.detail); return; }
    document.getElementById('totp-qr').innerHTML = resp.qr_svg;
    document.getElementById('totp-secret').textContent = resp.secret;
    document.getElementById('totp-setup-area').style.display = 'block';
    document.getElementById('totp-buttons').style.display = 'none';
}

async function verifyTotp() {
    const code = document.getElementById('totp-code-input').value.trim();
    if (!/^\d{6}$/.test(code)) { alert('Введи 6-значный код'); return; }
    const resp = await api('/auth/2fa/verify', { method: 'POST', body: JSON.stringify({ code }) });
    if (resp?.detail) { alert(resp.detail); return; }
    if (typeof showToast === 'function') showToast('2FA включена');
    document.getElementById('totp-setup-area').style.display = 'none';
    document.getElementById('totp-buttons').style.display = 'block';
    loadTotpStatus();
}

async function disableTotp() {
    const code = document.getElementById('totp-disable-code').value.trim();
    if (!/^\d{6}$/.test(code)) { alert('Введи текущий код из приложения'); return; }
    const resp = await api('/auth/2fa/disable', { method: 'POST', body: JSON.stringify({ code }) });
    if (resp?.detail) { alert(resp.detail); return; }
    if (typeof showToast === 'function') showToast('2FA отключена');
    loadTotpStatus();
}

// Hook into openSettings
(function(){
    const prev = window.openSettings;
    if (typeof prev === 'function') {
        window.openSettings = function() {
            prev.apply(this, arguments);
            loadTotpStatus();
        };
    }
})();


// === Web Push subscription ===
function urlBase64ToUint8Array(base64) {
    const padding = '='.repeat((4 - base64.length % 4) % 4);
    const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
    return out;
}

async function loadPushStatus() {
    const el = document.getElementById('push-status');
    if (!el) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        el.textContent = 'Браузер не поддерживает Web Push';
        document.getElementById('push-toggle-btn').disabled = true;
        return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
        el.innerHTML = '<span style="color:#51cf66">✓ Подписка активна</span>';
        document.getElementById('push-toggle-btn').textContent = 'Отключить';
    } else if (Notification.permission === 'denied') {
        el.innerHTML = '<span style="color:#ff6b6b">Разрешение запрещено в браузере</span>';
    } else {
        el.textContent = 'Не подключено';
        document.getElementById('push-toggle-btn').textContent = 'Включить пуши';
    }
}

// Resolve the active Service Worker, but never hang forever: register on demand
// and time out with an actionable message if it won't activate.
async function _swReady(timeoutMs = 4000) {
    try { await navigator.serviceWorker.register('/sw.js', { scope: '/' }); } catch (e) { /* ignore */ }
    return Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(
            () => reject(new Error('Service Worker не активировался. Нажми ↻ в футере, дождись перезагрузки и попробуй снова.')),
            timeoutMs
        )),
    ]);
}

async function togglePush() {
    const btn = document.getElementById('push-toggle-btn');
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        alert('Этот браузер не поддерживает Web Push. На iPhone добавь приложение на экран «Домой» и открой оттуда.');
        return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Подключаю…'; }
    try {
        const reg = await _swReady();
        const existing = await reg.pushManager.getSubscription();
        if (existing) {
            const endpoint = existing.endpoint;
            await existing.unsubscribe();
            await api('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) });
            loadPushStatus();
            return;
        }
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
            alert(perm === 'denied'
                ? 'Уведомления запрещены. Разреши их для сайта в настройках браузера и попробуй снова.'
                : 'Нужно разрешить уведомления.');
            loadPushStatus();
            return;
        }
        const keyResp = await api('/push/key');
        if (!keyResp?.public_key) { alert('Сервер не вернул VAPID-ключ. Попробуй позже.'); return; }
        let sub;
        try {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(keyResp.public_key),
            });
        } catch (subErr) {
            console.error('[push] subscribe failed:', subErr);
            alert('Не удалось подписаться на пуши: ' + (subErr && subErr.message ? subErr.message : subErr) +
                  '\nЧасто помогает: закрыть приложение и открыть заново (обновится Service Worker).');
            loadPushStatus();
            return;
        }
        const subJson = sub.toJSON();
        const saved = await api('/push/subscribe', {
            method: 'POST',
            body: JSON.stringify({
                endpoint: subJson.endpoint,
                p256dh: subJson.keys.p256dh,
                auth: subJson.keys.auth,
            })
        });
        if (saved?._error) {
            alert('Подписка создана, но сервер её не сохранил: ' + (saved.detail || saved.status));
        } else if (typeof showToast === 'function') {
            showToast('Пуши включены');
        }
        loadPushStatus();
    } catch (e) {
        console.error('[push] togglePush error:', e);
        alert('Ошибка при включении пушей: ' + (e && e.message ? e.message : e));
    } finally {
        if (btn) btn.disabled = false;
        loadPushStatus();  // always restore button label
    }
}

async function testPush() {
    const resp = await api('/push/test', { method: 'POST' });
    if (resp?.detail) { alert(resp.detail); return; }
    if (typeof showToast === 'function') showToast(`Отправлено: ${resp.sent}, ошибок: ${resp.failed}`);
}

// Hook into openSettings (chain on top of existing chain)
(function(){
    const prev = window.openSettings;
    if (typeof prev === 'function') {
        window.openSettings = function() {
            prev.apply(this, arguments);
            setTimeout(loadPushStatus, 50);
        };
    }
})();


// === Admin panel ===
async function checkAdmin() {
    try {
        const me = await api('/auth/me');
        const sec = document.getElementById('admin-section');
        if (sec) sec.style.display = (me && me.is_superuser) ? 'block' : 'none';
        return !!(me && me.is_superuser);
    } catch(e) { return false; }
}

function openAdmin() {
    document.getElementById('admin-modal').classList.add('active');
    loadAdminData();
}

async function loadAdminData() {
    const box = document.getElementById('admin-content');
    box.innerHTML = '<div style="text-align:center;color:var(--text2);padding:30px">' + (t('loading') || 'Загрузка…') + '</div>';
    try {
        const [ov, usage, feat] = await Promise.all([
            api('/admin/overview').catch(() => null),
            api('/admin/ai-usage?days=7').catch(() => null),
            api('/admin/feature-usage').catch(() => null),
        ]);
        if (!ov || !ov.users) { box.innerHTML = '<p style="color:var(--text2);padding:20px;text-align:center">Нет доступа или данных</p>'; return; }
        let html = '';
        // Overview cards
        html += '<div class="card-title">' + (t('adminOverview') || 'Обзор') + '</div>';
        html += '<div class="bc-grid" style="margin-bottom:14px">';
        const u = ov.users || {};
        const cards = [
            [t('adminUsers') || 'Юзеров', u.total],
            [t('adminActive24h') || 'Актив 24ч', u.active_24h],
            [t('adminActive7d') || 'Актив 7д', u.active_7d],
            [t('adminActive30d') || 'Актив 30д', u.active_30d],
            [t('adminEntries') || 'Записей', (ov.diary || {}).total_entries],
        ];
        cards.forEach(([label, val]) => {
            html += '<div class="bc-metric"><div class="bc-metric-title">' + label + '</div><div class="bc-metric-value">' + (val ?? 0) + '</div></div>';
        });
        html += '</div>';
        // AI cost
        const cost = ov.ai_cost_usd || {};
        html += '<div class="card-title">' + (t('adminAiCost') || 'AI-косты, $') + '</div>';
        html += '<div class="bc-grid" style="margin-bottom:14px">';
        html += '<div class="bc-metric"><div class="bc-metric-title">24ч</div><div class="bc-metric-value" style="font-size:16px">$' + Number(cost.d1 || 0).toFixed(3) + '</div></div>';
        html += '<div class="bc-metric"><div class="bc-metric-title">7д</div><div class="bc-metric-value" style="font-size:16px">$' + Number(cost.d7 || 0).toFixed(3) + '</div></div>';
        html += '<div class="bc-metric"><div class="bc-metric-title">30д</div><div class="bc-metric-value" style="font-size:16px">$' + Number(cost.d30 || 0).toFixed(2) + '</div></div>';
        html += '</div>';
        // AI usage breakdown (by endpoint+model, 7d)
        const br = usage && usage.breakdown;
        if (Array.isArray(br) && br.length) {
            html += '<div class="card-title">' + (t('adminAiDaily') || 'AI за 7д') + '</div>';
            html += '<div style="font-size:12px;color:var(--text2);margin-bottom:14px">';
            br.forEach(d => {
                html += '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border);gap:8px"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + (d.endpoint || '') + ' <span style="opacity:.5">' + (d.model || '') + '</span></span><span style="white-space:nowrap">$' + Number(d.cost_usd || 0).toFixed(3) + ' · ' + (d.calls || 0) + '×</span></div>';
            });
            html += '</div>';
        }
        // Feature usage
        const eps = feat && feat.endpoints;
        if (Array.isArray(eps) && eps.length) {
            html += '<div class="card-title">' + (t('adminFeatures') || 'Топ фич') + '</div>';
            html += '<div style="font-size:12px;color:var(--text2)">';
            eps.slice(0, 15).forEach(f => {
                html += '<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid var(--border)"><span>' + (f.endpoint || '') + '</span><span>' + (f.calls || 0) + '</span></div>';
            });
            html += '</div>';
        }
        box.innerHTML = html;
    } catch(e) {
        box.innerHTML = '<p style="color:#e74c3c;padding:20px;text-align:center">Ошибка: ' + (e.message || e) + '</p>';
    }
}
// Show admin section for superusers when settings opens
(function(){
    const prev = window.openSettings;
    if (typeof prev === 'function') {
        window.openSettings = function() {
            prev.apply(this, arguments);
            setTimeout(checkAdmin, 60);
        };
    }
})();

