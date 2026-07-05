// app-11-extras.js — mechanical split of app.js (Этап 1). Loaded as classic script; all globals stay global.
// ---- Share day as PNG ----
async function shareDayAsImage() {
    const summary = await api(`/diary/summary?entry_date=${currentDate}`);
    if (!summary) { alert('Нет данных'); return; }
    const entries = summary.entries || [];
    const totals = (entries || []).reduce((a, e) => ({
        kcal: a.kcal + (e.calories || 0),
        p: a.p + (e.protein || 0),
        f: a.f + (e.fat || 0),
        c: a.c + (e.carbohydrates || 0),
    }), { kcal: 0, p: 0, f: 0, c: 0 });

    const W = 1080, H = 1350;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Gradient background
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#1a2330');
    grad.addColorStop(1, '#0d1117');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Accent strip
    const gradAcc = ctx.createLinearGradient(0, 0, W, 0);
    gradAcc.addColorStop(0, '#ff7e00');
    gradAcc.addColorStop(1, '#4a9eff');
    ctx.fillStyle = gradAcc;
    ctx.fillRect(0, 0, W, 8);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px sans-serif';
    ctx.fillText('🥗 Дневник питания', 60, 90);
    ctx.fillStyle = '#9ca3af';
    ctx.font = '28px sans-serif';
    const dateStr = new Date(currentDate).toLocaleDateString(navigator.language || 'ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
    ctx.fillText(dateStr, 60, 140);

    // KBJU big block
    ctx.fillStyle = '#1f2937';
    roundRect(ctx, 60, 180, W - 120, 280, 24);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 96px sans-serif';
    ctx.fillText(Math.round(totals.kcal) + '', 110, 320);
    ctx.fillStyle = '#9ca3af';
    ctx.font = '28px sans-serif';
    ctx.fillText('ккал за день', 110, 360);

    const macros = [
        { label: 'Белки', val: totals.p, color: '#4caf50' },
        { label: 'Жиры', val: totals.f, color: '#ffa940' },
        { label: 'Углеводы', val: totals.c, color: '#4a9eff' },
    ];
    let mx = 110;
    macros.forEach((m, i) => {
        const x = 110 + i * 280;
        ctx.fillStyle = m.color;
        ctx.fillRect(x, 405, 60, 8);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 32px sans-serif';
        ctx.fillText(Math.round(m.val) + ' г', x, 395);
        ctx.fillStyle = '#9ca3af';
        ctx.font = '20px sans-serif';
        ctx.fillText(m.label, x, 440);
    });

    // Entries list
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('Что съел:', 60, 530);
    let y = 580;
    const items = entries.slice(0, 12);
    items.forEach((e) => {
        if (y > H - 120) return;
        ctx.fillStyle = '#e5e7eb';
        ctx.font = '24px sans-serif';
        const name = (e.product_name || '').slice(0, 45);
        ctx.fillText('• ' + name, 80, y);
        ctx.fillStyle = '#9ca3af';
        ctx.font = '20px sans-serif';
        const meta = `${Math.round(e.serving_amount || 0)} г · ${Math.round(e.calories || 0)} ккал`;
        ctx.fillText(meta, 80, y + 26);
        y += 64;
    });

    if (entries.length > 12) {
        ctx.fillStyle = '#9ca3af';
        ctx.font = 'italic 22px sans-serif';
        ctx.fillText('... и ещё ' + (entries.length - 12), 80, y);
    }

    // Footer
    ctx.fillStyle = '#6b7280';
    ctx.font = '20px sans-serif';
    ctx.fillText('nutrition-diary.app', 60, H - 50);

    canvas.toBlob(async (blob) => {
        if (!blob) return;
        const file = new File([blob], `nutrition-${currentDate}.png`, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({ files: [file], title: 'Мой день питания', text: dateStr });
                return;
            } catch (e) { console.warn('share', e); }
        }
        // Fallback: download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nutrition-${currentDate}.png`;
        a.click();
        URL.revokeObjectURL(url);
    }, 'image/png');
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
}

// ---- Wearable import ----
async function uploadAppleHealth(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const status = document.getElementById('wearable-import-status');
    status.textContent = 'Загрузка...';
    const fd = new FormData();
    fd.append('file', file);
    try {
        const resp = await fetch('/api/v1/wearable/import/apple-health', {
            method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, body: fd
        });
        const data = await resp.json();
        if (data.detail) { status.textContent = '⚠️ ' + data.detail; return; }
        status.textContent = `✅ Добавлено: ${data.inserted}, пропущено типов: ${data.skipped_types}`;
        if (typeof loadHealth === 'function') loadHealth();
    } catch (e) {
        status.textContent = 'Ошибка: ' + (e?.message || e);
    }
}
async function uploadGarminCsv(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const metric = prompt('Что в этом CSV? weight / steps / sleep / heart_rate', 'weight') || 'weight';
    if (!['weight','steps','sleep','heart_rate'].includes(metric)) { alert('Неверный тип'); return; }
    const status = document.getElementById('wearable-import-status');
    status.textContent = 'Загрузка...';
    const fd = new FormData();
    fd.append('file', file);
    try {
        const resp = await fetch('/api/v1/wearable/import/garmin-csv?metric=' + metric, {
            method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, body: fd
        });
        const data = await resp.json();
        if (data.detail) { status.textContent = '⚠️ ' + data.detail; return; }
        status.textContent = `✅ Добавлено: ${data.inserted}`;
        if (typeof loadHealth === 'function') loadHealth();
    } catch (e) {
        status.textContent = 'Ошибка: ' + (e?.message || e);
    }
}

// ---- Push reminders auto-trigger ----
async function maybeTriggerPushReminder() {
    try {
        const last = parseInt(localStorage.getItem('push_reminder_last') || '0');
        const SIX_HOURS = 6 * 60 * 60 * 1000;
        if (Date.now() - last < SIX_HOURS) return;
        const hour = new Date().getHours();
        if (hour < 11 || hour > 21) return; // only between 11:00 and 21:00 local
        localStorage.setItem('push_reminder_last', String(Date.now()));
        await api('/push/reminders/send-due', { method: 'POST' }).catch(() => {});
    } catch (e) { console.warn('push trigger', e); }
}

// ---- Account: export + delete ----
async function downloadMyData() {
    try {
        const resp = await fetch('/api/v1/account/export', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!resp.ok) { alert('Ошибка: ' + resp.status); return; }
        const blob = await resp.blob();
        const cd = resp.headers.get('Content-Disposition') || '';
        const m = cd.match(/filename="([^"]+)"/);
        const name = m ? m[1] : 'nutrition-diary-export.zip';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name; a.click();
        URL.revokeObjectURL(url);
    } catch (e) { alert('Ошибка: ' + (e?.message || e)); }
}

async function confirmDeleteAccount() {
    const phrase = prompt('Это удалит ВСЕ твои данные навсегда. Введи слово УДАЛИТЬ чтобы подтвердить:');
    if (phrase !== 'УДАЛИТЬ' && phrase !== 'DELETE') return;
    const r = await api('/account', { method: 'DELETE' });
    if (r && !r._error) {
        localStorage.clear();
        sessionStorage.clear();
        alert('Аккаунт удалён');
        location.href = '/';
    } else {
        alert(r?.detail || 'Ошибка');
    }
}

// ---- Weekly report / Compare periods / Coach tip ----
async function loadWeeklyReport() {
    const wrap = document.getElementById('weekly-report-widget');
    if (!wrap) return;
    const lang = (typeof currentLang === 'string' && currentLang) || 'ru';
    wrap.innerHTML = `<div class="card"><div class="card-title">📅 ${t('weeklyReport') || 'Недельный отчёт'}</div><div style="color:var(--text2);text-align:center;padding:12px">${t('loading') || 'Загрузка...'}</div></div>`;
    const r = await api('/recommendations/weekly?lang=' + lang);
    if (!r || r._error) {
        wrap.innerHTML = `<div class="card"><div class="card-title">📅 ${t('weeklyReport') || 'Недельный отчёт'}</div><div style="color:#c0392b">${escapeHtml(r?.detail || 'Ошибка')}</div></div>`;
        return;
    }
    const dKcal = r.deltas?.kcal || 0;
    const arrow = (v) => v > 0 ? '<span style="color:#ffa940">↑' + v + '</span>' : (v < 0 ? '<span style="color:#4caf50">↓' + Math.abs(v) + '</span>' : '→');
    const top = (r.top_foods || []).map(f => f.name + ' ×' + f.times).join(', ');
    wrap.innerHTML = `<div class="card"><div class="card-title">📅 ${t('weeklyReport') || 'Недельный отчёт'}</div>
        <div style="font-size:13px;color:var(--text2);margin-bottom:8px">${r.period.start} — ${r.period.end}</div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;font-size:13px">
            <div>Калории/день: <b>${r.this_week.kcal_avg}</b> ${arrow(dKcal)}</div>
            <div>Белок/день: <b>${r.this_week.protein_avg}</b> г ${arrow(r.deltas.protein)}</div>
            <div>Жиры/день: <b>${r.this_week.fat_avg}</b> г ${arrow(r.deltas.fat)}</div>
            <div>Углеводы/день: <b>${r.this_week.carb_avg}</b> г ${arrow(r.deltas.carb)}</div>
        </div>
        ${r.weight_delta_kg != null ? '<div style="margin-top:6px;font-size:13px">Δ вес: <b>' + (r.weight_delta_kg > 0 ? '+' : '') + r.weight_delta_kg + ' кг</b></div>' : ''}
        ${r.mood_avg ? '<div style="margin-top:4px;font-size:13px">Настроение: <b>' + r.mood_avg + '/5</b>' + (r.energy_avg ? ' · Энергия: <b>' + r.energy_avg + '/5</b>' : '') + '</div>' : ''}
        ${top ? '<div style="margin-top:6px;font-size:12px;color:var(--text2)">Топ-5: ' + escapeHtml(top) + '</div>' : ''}
        ${r.narrative ? '<div style="margin-top:10px;padding:10px;background:var(--bg3);border-radius:8px;font-size:13px;line-height:1.4">' + escapeHtml(r.narrative) + '</div>' : ''}
    </div>`;
}

async function loadCompareWidget() {
    const wrap = document.getElementById('compare-periods-widget');
    if (!wrap) return;
    wrap.innerHTML = `<div class="card"><div class="card-title">⚖️ ${t('comparePeriods') || 'Сравнение периодов'}</div>
        <select id="compare-window" class="input" onchange="loadCompareWidget()" style="margin-bottom:8px">
            <option value="7">${t('week') || 'Неделя'}</option>
            <option value="30" selected>${t('month') || 'Месяц'}</option>
            <option value="90">${t('months3') || '3 месяца'}</option>
        </select>
        <div id="compare-result" style="color:var(--text2);text-align:center;padding:8px">…</div>
    </div>`;
    const win = parseInt(document.getElementById('compare-window').value || '30');
    const r = await api('/recommendations/compare-periods?window_days=' + win);
    if (!r || r._error) {
        document.getElementById('compare-result').textContent = r?.detail || 'Ошибка';
        return;
    }
    const arrow = (v) => v > 0 ? '<span style="color:#ffa940">↑' + v + '</span>' : (v < 0 ? '<span style="color:#4caf50">↓' + Math.abs(v) + '</span>' : '→');
    document.getElementById('compare-result').innerHTML = `
        <div style="font-size:11px;color:var(--text2);margin-bottom:6px;text-align:left">${r.this_period.start} — ${r.this_period.end} vs ${r.prev_period.start} — ${r.prev_period.end}</div>
        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;font-size:13px;text-align:left">
            <div>Ккал/день: <b>${r.this_period.kcal_avg}</b> ${arrow(r.deltas.kcal)}</div>
            <div>Белок: <b>${r.this_period.protein_avg}</b> ${arrow(r.deltas.protein)}</div>
            <div>Жиры: <b>${r.this_period.fat_avg}</b> ${arrow(r.deltas.fat)}</div>
            <div>Углеводы: <b>${r.this_period.carb_avg}</b> ${arrow(r.deltas.carb)}</div>
            <div>Записей: <b>${r.this_period.entry_count}</b> ${arrow(r.deltas.entries)}</div>
        </div>`;
}

async function loadCoachTip() {
    const wrap = document.getElementById('coach-tip-widget');
    if (!wrap) return;
    const lang = (typeof currentLang === 'string' && currentLang) || 'ru';
    const last = parseInt(localStorage.getItem('coach_tip_at') || '0');
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    const cachedTip = localStorage.getItem('coach_tip_text');
    if (cachedTip && Date.now() - last < TWO_HOURS) {
        wrap.innerHTML = `<div class="card" style="background:linear-gradient(135deg,rgba(74,158,255,0.08),rgba(255,184,0,0.08));border-color:#4a9eff"><div style="display:flex;gap:10px;align-items:flex-start"><span style="font-size:22px">🧠</span><div style="flex:1"><div style="font-weight:600;font-size:13px;margin-bottom:2px">${t('coachTip') || 'Совет на сейчас'}</div><div style="font-size:13px;line-height:1.4">${escapeHtml(cachedTip)}</div></div><button class="btn-icon" aria-label="Обновить" onclick="forceRefreshCoachTip()">↻</button></div></div>`;
        return;
    }
    await forceRefreshCoachTip();
}

async function forceRefreshCoachTip() {
    const wrap = document.getElementById('coach-tip-widget');
    if (!wrap) return;
    const lang = (typeof currentLang === 'string' && currentLang) || 'ru';
    wrap.innerHTML = `<div class="card"><div style="color:var(--text2);text-align:center;padding:8px">🧠 ${t('analyzing') || 'Claude анализирует…'}</div></div>`;
    const r = await api('/recommendations/coach-tip?lang=' + lang);
    if (!r || r._error) {
        wrap.innerHTML = `<div class="card"><div style="color:#c0392b">${escapeHtml(r?.detail || 'Ошибка')}</div></div>`;
        return;
    }
    localStorage.setItem('coach_tip_text', r.tip);
    localStorage.setItem('coach_tip_at', String(Date.now()));
    loadCoachTip();
}

function injectStatsWidgets() {
    const container = document.getElementById('stats-content');
    if (!container || document.getElementById('weekly-report-widget')) return;
    const wkly = document.createElement('div'); wkly.id = 'weekly-report-widget';
    const cmp = document.createElement('div'); cmp.id = 'compare-periods-widget';
    container.appendChild(wkly);
    container.appendChild(cmp);
    setTimeout(() => { loadWeeklyReport(); loadCompareWidget(); }, 200);
}

function injectCoachTipOnDiary() {
    const view = document.getElementById('diary-view');
    if (!view || document.getElementById('coach-tip-widget')) return;
    const card = document.createElement('div');
    card.id = 'coach-tip-widget';
    // Insert at top, before streak badge
    const seasonal = document.getElementById('seasonal-card');
    view.insertBefore(card, seasonal || view.firstChild);
    setTimeout(loadCoachTip, 500);
}

// ---- Create product from barcode (idempotent helper) ----
function createProductFromBarcode(barcode, usePrefill) {
    console.log('[barcode] createProductFromBarcode', { barcode, usePrefill, extract: window._lastBarcodeExtract });
    try {
        if (typeof closeBarcodeModal === 'function') closeBarcodeModal();
        else if (typeof closeModal === 'function') closeModal('barcode-modal');
    } catch(e) { console.warn('closeBarcodeModal failed', e); }
    if (typeof openCreateProduct !== 'function') {
        alert('Открой «Добавить» → «Создать свой» и впиши штрихкод ' + barcode);
        return;
    }
    try { openCreateProduct(); } catch(e) {
        console.error('openCreateProduct failed', e);
        alert('Ошибка открытия формы: ' + (e?.message || e));
        return;
    }
    requestAnimationFrame(() => {
        const set = (id, v) => { const el = document.getElementById(id); if (el && v != null && v !== '') el.value = v; };
        try {
            if (barcode) set('cp-barcode', barcode);
            const e = window._lastBarcodeExtract;
            if (usePrefill && e) {
                const composed = [e.brand, e.name].filter(Boolean).join(' · ');
                if (composed) set('cp-name', composed);
                set('cp-cal', e.calories);
                set('cp-protein', e.protein);
                set('cp-fat', e.fat);
                set('cp-carbs', e.carbohydrates);
                const modal = document.querySelector('#create-product-modal .modal-content');
                if (modal) {
                    const existing = modal.querySelector('.cp-prefill-note');
                    if (existing) existing.remove();
                    const note = document.createElement('div');
                    note.className = 'cp-prefill-note';
                    note.style.cssText = 'font-size:11px;color:#4caf50;margin:0 0 8px;padding:6px;background:rgba(76,175,80,0.08);border-radius:6px';
                    note.textContent = '✨ Поля подсмотрены с фото. Проверь и поправь если нужно.';
                    modal.insertBefore(note, modal.children[1] || null);
                }
            }
        } catch (err) {
            console.error('prefill failed', err);
        }
    });
}

// ---- Cuisine seeds ----
async function seedCuisine(cuisine) {
    const names = { japanese: 'японскую', mediterranean: 'средиземноморскую', vegan: 'веганскую', sports: 'спортивную' };
    if (!confirm(`Добавить ${names[cuisine] || cuisine} кухню (~30 рецептов)?`)) return;
    const r = await api('/recipes/seed-cuisine?cuisine=' + cuisine, { method: 'POST' });
    if (r && !r._error) {
        if (typeof showToast === 'function') showToast('Добавлено: ' + r.inserted);
        if (typeof loadRecipes === 'function') loadRecipes();
    } else alert(r?.detail || 'Ошибка');
}

// ---- Import recipe from URL ----
async function importRecipeFromUrl() {
    const url = prompt('URL страницы с рецептом:');
    if (!url || url.length < 10) return;
    if (typeof showToast === 'function') showToast('Парсю рецепт через Claude... 20-40 сек');
    const lang = (typeof currentLang === 'string' && currentLang) || 'ru';
    const r = await api('/recipes/import-url', { method: 'POST', body: JSON.stringify({ url, lang }) });
    if (r && !r._error) {
        if (typeof showToast === 'function') showToast(`Импортирован: ${r.name} (${r.ingredient_count} ингр.)`);
        if (typeof loadRecipes === 'function') loadRecipes();
    } else alert(r?.detail || 'Ошибка импорта');
}

// ---- From-fridge suggestions ----
async function suggestFromFridge() {
    const raw = prompt('Что есть в холодильнике (через запятую):');
    if (!raw) return;
    const ingredients = raw.split(',').map(x => x.trim()).filter(Boolean);
    if (!ingredients.length) return;
    if (typeof showToast === 'function') showToast('Думаю над рецептами...');
    const lang = (typeof currentLang === 'string' && currentLang) || 'ru';
    const r = await api('/recipes/from-fridge', { method: 'POST', body: JSON.stringify({ ingredients, lang }) });
    if (!r || r._error) { alert(r?.detail || 'Ошибка'); return; }
    const list = (r.recipes || []).map(rec => `• ${rec.name} (${rec.kcal_per_100g || '?'} ккал/100г)\n  ${rec.why || ''}`).join('\n\n');
    alert(list || 'Ничего не нашлось');
}

// ---- XP + Level widget ----
async function loadXpLevel() {
    const r = await api('/leveling/me');
    if (!r || r._error) return;
    const wrap = document.getElementById('xp-widget');
    if (!wrap) return;
    const pct = r.xp_to_next_level > 0 ? Math.round((r.xp_into_level / r.xp_to_next_level) * 100) : 0;
    wrap.innerHTML = `<div class="card" style="padding:10px"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><b>Уровень ${r.level}</b><span style="color:var(--text2)">${r.xp_into_level}/${r.xp_to_next_level} XP</span></div><div style="height:6px;background:var(--bg3);border-radius:3px"><div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#4a9eff,#ffb800);border-radius:3px"></div></div></div>`;
}

async function loadDailyQuests() {
    const wrap = document.getElementById('quests-widget');
    if (!wrap) return;
    const list = await api('/leveling/quests/today', { method: 'POST' });
    if (!list || list._error) return;
    const lang = (typeof currentLang === 'string' && currentLang) || 'ru';
    const items = list.map(q => {
        const title = q['title_' + lang] || q.title_ru;
        const done = !!q.completed_at;
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:13px${done ? ';color:var(--text2);text-decoration:line-through' : ''}"><span>${escapeHtml(title)}</span>${done ? '<span style="color:#4caf50">✓ +' + q.xp_reward + 'XP</span>' : `<button class="btn-icon" aria-label="Проверить" onclick="checkQuest('${q.id}')" title="Проверить">↻</button>`}</div>`;
    }).join('');
    wrap.innerHTML = `<div class="card"><div class="card-title">🎯 Задания на сегодня</div>${items}</div>`;
}

async function checkQuest(id) {
    const r = await api('/leveling/quests/' + id + '/check', { method: 'POST' });
    if (!r || r._error) { alert(r?.detail || 'Ошибка'); return; }
    if (r.completed) {
        if (typeof showToast === 'function') showToast(`+${r.xp_awarded} XP${r.level_up ? ' · LEVEL UP!' : ''}`);
        if (r.level_up && typeof showAchievementToast === 'function') showAchievementToast(`🎉 Уровень ${r.level}!`);
        loadXpLevel();
        loadDailyQuests();
    } else if (r.already_completed) {
        if (typeof showToast === 'function') showToast('Уже выполнено');
    } else {
        if (typeof showToast === 'function') showToast('Ещё не выполнено');
    }
}

function injectXpAndQuests() {
    const view = document.getElementById('diary-view');
    if (!view) return;
    if (!document.getElementById('xp-widget')) {
        const xp = document.createElement('div'); xp.id = 'xp-widget';
        const seasonal = document.getElementById('seasonal-card');
        view.insertBefore(xp, seasonal || view.firstChild);
        loadXpLevel();
    }
    if (!document.getElementById('quests-widget')) {
        const q = document.createElement('div'); q.id = 'quests-widget';
        const streak = document.getElementById('streak-badge');
        if (streak && streak.parentNode) streak.parentNode.insertBefore(q, streak.nextSibling);
        else view.appendChild(q);
        loadDailyQuests();
    }
}

// ---- Hook XP/quests into loadDiary ----
