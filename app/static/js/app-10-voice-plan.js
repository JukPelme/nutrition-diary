// app-10-voice-plan.js — mechanical split of app.js (Этап 1). Loaded as classic script; all globals stay global.
// === Voice input ===
let _voiceRecorder = null;
let _voiceChunks = [];
let _voiceItems = [];

function openVoiceModal() {
    document.getElementById('voice-modal').classList.add('active');
    document.getElementById('voice-transcript').style.display = 'none';
    document.getElementById('voice-transcript').textContent = '';
    document.getElementById('voice-items').innerHTML = '';
    document.getElementById('voice-add-btn').style.display = 'none';
    document.getElementById('voice-rec-status').textContent = 'Нажми и говори: «съел 200г курицы и риса»';
    document.getElementById('voice-rec-btn').textContent = '🎤';
    _voiceItems = [];
}

function closeVoiceModal() {
    if (_voiceRecorder && _voiceRecorder.state === 'recording') {
        try { _voiceRecorder.stop(); } catch(e){}
    }
    closeModal('voice-modal');
}

async function toggleVoiceRec() {
    const btn = document.getElementById('voice-rec-btn');
    const status = document.getElementById('voice-rec-status');
    if (_voiceRecorder && _voiceRecorder.state === 'recording') {
        _voiceRecorder.stop();
        btn.textContent = '🎤';
        status.textContent = 'Расшифровка...';
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
        _voiceRecorder = new MediaRecorder(stream, { mimeType: mime });
        _voiceChunks = [];
        _voiceRecorder.ondataavailable = (e) => { if (e.data.size) _voiceChunks.push(e.data); };
        _voiceRecorder.onstop = async () => {
            stream.getTracks().forEach(t => t.stop());
            const blob = new Blob(_voiceChunks, { type: mime });
            await sendVoice(blob);
        };
        _voiceRecorder.start();
        btn.textContent = '⏹';
        status.textContent = 'Говори... (нажми ⏹ когда закончишь)';
    } catch (e) {
        status.textContent = 'Микрофон недоступен: ' + (e?.message || e);
    }
}

async function sendVoice(blob) {
    const status = document.getElementById('voice-rec-status');
    const tr = document.getElementById('voice-transcript');
    const list = document.getElementById('voice-items');
    try {
        const fd = new FormData();
        fd.append('file', blob, 'voice.webm');
        const resp = await fetch(`/api/v1/voice/parse?lang=${currentLang || 'ru'}`, {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token },
            body: fd,
        });
        const data = await resp.json();
        if (data.detail) { status.textContent = '⚠️ ' + data.detail; return; }
        if (typeof awardFeature === "function") awardFeature("voice");
        tr.style.display = 'block';
        tr.textContent = '«' + (data.transcript || '—') + '»';
        if (!data.items?.length) {
            status.textContent = 'Продукты не распознаны';
            list.innerHTML = '';
            return;
        }
        _voiceItems = data.items;
        list.innerHTML = data.items.map((it, i) => {
            const matched = it.matched_product_name ? `→ ${escapeHtml(it.matched_product_name)} · ${it.calories}ккал` : '<span style="color:#ffa940">не найден в базе</span>';
            return `<div style="display:flex;justify-content:space-between;padding:8px 10px;background:var(--bg3);border-radius:6px;font-size:13px">
                <span><b>${escapeHtml(it.name)}</b> · ${it.grams}г ${matched}</span>
                <button class="btn-icon" onclick="_voiceItems.splice(${i},1); document.getElementById('voice-items').children[${i}]?.remove();">✕</button>
            </div>`;
        }).join('');
        document.getElementById('voice-add-btn').style.display = 'block';
        status.textContent = `Распознано ${data.items.length} ${data.items.length===1?'продукт':'продуктов'} — проверь и подтверди`;
    } catch (e) {
        status.textContent = 'Ошибка: ' + (e?.message || e);
    }
}

async function addVoiceItems() {
    const meal = meals?.[0];
    let added = 0;
    for (const it of _voiceItems) {
        if (!it.matched_product_id) continue;
        try {
            await apiQueued('/diary', {
                method: 'POST',
                body: JSON.stringify({
                    meal_id: meal?.id || null,
                    product_id: it.matched_product_id,
                    entry_date: currentDate,
                    product_name: it.matched_product_name || it.name,
                    serving_amount: it.grams,
                    calories: it.calories || 0,
                    protein: it.protein || 0,
                    fat: it.fat || 0,
                    carbohydrates: it.carbohydrates || 0,
                })
            });
            added += 1;
        } catch(e) {}
    }
    if (typeof showToast === 'function') showToast(`Добавлено ${added}`);
    closeVoiceModal();
    loadDiary();
}

// ---- AI Meal Plan ----
function openMealPlanGenerator() {
    const m = document.getElementById('meal-plan-modal');
    if (!m) return;
    document.getElementById('mp-status').textContent = '';
    document.getElementById('mp-gen-btn').disabled = false;
    m.classList.add('active');
}

function loadRecipesIfAny() {
    if (typeof loadRecipes === 'function') {
        try { loadRecipes(); } catch(e) { console.warn('loadRecipes failed', e); }
    }
}

async function generateMealPlan() {
    const days = parseInt(document.getElementById('mp-days').value || '7');
    const avoid = (document.getElementById('mp-avoid').value || '')
        .split(',').map(x => x.trim()).filter(Boolean);
    const notes = (document.getElementById('mp-notes').value || '').trim();
    const lang = (typeof currentLang === 'string' && currentLang) || (localStorage.getItem('lang') || 'ru');
    const btn = document.getElementById('mp-gen-btn');
    const status = document.getElementById('mp-status');
    btn.disabled = true;
    status.textContent = (t('mealPlanGenerating') || 'Генерируем меню… 30-60 сек');
    const start = Date.now();
    const tick = setInterval(() => {
        const sec = Math.floor((Date.now() - start)/1000);
        status.textContent = (t('mealPlanGenerating') || 'Генерируем меню…') + ' (' + sec + ' сек)';
    }, 1000);
    try {
        const res = await api('/nutrition/meal-plan/generate', {
            method: 'POST',
            body: JSON.stringify({ lang, days, avoid, notes: notes || null })
        });
        clearInterval(tick);
        if (!res || res._error) {
            const msg = res?.detail || 'Ошибка генерации';
            status.style.color = '#c0392b';
            status.textContent = msg;
            btn.disabled = false;
            return;
        }
        status.style.color = 'var(--text2)';
        status.textContent = t('mealPlanReady') || 'Готово!';
        closeModal('meal-plan-modal');
        await loadAiMealPlanCard();
    } catch (e) {
        clearInterval(tick);
        status.style.color = '#c0392b';
        status.textContent = e?.message || String(e);
        btn.disabled = false;
    }
}

async function loadAiMealPlanCard() {
    const wrap = document.getElementById('ai-meal-plan-content');
    if (!wrap) return;
    const cur = await api('/nutrition/meal-plan/current');
    if (!cur || cur._error) {
        wrap.innerHTML = '';
        return;
    }
    const plan = cur.plan;
    if (!plan) {
        wrap.innerHTML = '<div style="font-size:12px;color:var(--text2)">' + (t('mealPlanNone') || 'Активного плана нет — нажми «Сгенерировать»') + '</div>';
        return;
    }
    const days = (plan.days || []);
    const tipsHtml = (plan.tips && plan.tips.length)
        ? '<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;color:var(--text2)">' + (t('tips') || 'Подсказки') + '</summary><ul style="margin:6px 0 0 18px;font-size:12px">' + plan.tips.map(x => '<li>' + escapeHtml(x) + '</li>').join('') + '</ul></details>'
        : '';
    const summary = plan.summary ? '<div style="font-size:12px;color:var(--text2);margin-bottom:8px">' + escapeHtml(plan.summary) + '</div>' : '';

    let html = '';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
    html += '<div style="font-size:12px;color:var(--text2)">' + (cur.start_date || '') + ' — ' + (cur.end_date || '') + '</div>';
    html += '<button class="btn btn-secondary" style="padding:4px 10px;font-size:12px" onclick="confirmDeletePlan(\''+ cur.id +'\')">🗑</button>';
    html += '</div>';
    html += summary;

    const todayIso = new Date().toISOString().slice(0,10);
    for (const d of days) {
        const isToday = d.date === todayIso;
        const totals = d.totals || {};
        const meals = (d.meals || []);
        const mealsHtml = meals.map(m => {
            const items = (m.items || []).map(it => '<li>' + escapeHtml(it.name) + ' — ' + (it.grams || 0) + ' г <span style="color:var(--text2)">(' + Math.round(it.kcal||0) + ' ккал)</span></li>').join('');
            const mealName = mealTypeLabel(m.meal_type) + (m.title ? ': ' + escapeHtml(m.title) : '');
            return '<div style="margin-top:6px"><div style="font-size:12px;font-weight:600">' + escapeHtml(mealName) + '</div><ul style="margin:2px 0 0 18px;font-size:12px">' + items + '</ul></div>';
        }).join('');
        html += '<div class="card" style="border-color:' + (isToday ? 'var(--accent)' : 'var(--border)') + ';margin-top:8px">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center">';
        html += '<div><b>' + (d.date || '') + '</b>' + (isToday ? ' <span style="color:var(--accent);font-size:11px">' + (t('today') || 'сегодня') + '</span>' : '') + '</div>';
        html += '<div style="font-size:12px"><b>' + Math.round(totals.kcal || 0) + '</b> ккал · Б' + Math.round(totals.protein||0) + ' Ж' + Math.round(totals.fat||0) + ' У' + Math.round(totals.carbohydrates||0) + '</div>';
        html += '</div>';
        html += mealsHtml;
        html += '<button class="btn btn-primary" style="margin-top:8px;width:100%;padding:6px;font-size:13px" onclick="applyMealPlanDay(\''+ cur.id +'\', \''+ d.date +'\')" data-i18n="applyDay">→ ' + (t('applyDay') || 'Применить в дневник') + '</button>';
        html += '</div>';
    }
    html += tipsHtml;
    wrap.innerHTML = html;
}

function mealTypeLabel(type) {
    const map = {
        breakfast: t('breakfast') || 'Завтрак',
        lunch: t('lunch') || 'Обед',
        dinner: t('dinner') || 'Ужин',
        snack: t('snack') || 'Перекус',
    };
    return map[(type || '').toLowerCase()] || (type || 'Приём пищи');
}

function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

async function applyMealPlanDay(planId, dateStr) {
    if (!confirm((t('confirmApplyDay') || 'Применить день ') + dateStr + (t('toDiary') || ' в дневник?'))) return;
    const r = await api('/nutrition/meal-plan/' + planId + '/apply-day', {
        method: 'POST',
        body: JSON.stringify({ target_date: dateStr })
    });
    if (!r || r._error) {
        alert(r?.detail || 'Ошибка');
        return;
    }
    alert((t('appliedEntries') || 'Добавлено записей: ') + (r.applied || 0));
    if (typeof loadDiary === 'function') {
        try { loadDiary(); } catch(e){}
    }
}

async function confirmDeletePlan(planId) {
    if (!confirm(t('confirmDeletePlan') || 'Удалить план?')) return;
    const r = await api('/nutrition/meal-plan/' + planId, { method: 'DELETE' });
    if (r && !r._error) {
        await loadAiMealPlanCard();
    }
}

// ---- Streak + Achievements ----
async function refreshStreakBadge() {
    try {
        const r = await api('/gamification/streak');
        if (!r || r._error) return;
        const badge = document.getElementById('streak-badge');
        const text = document.getElementById('streak-text');
        const dot = document.getElementById('streak-today-dot');
        if (!badge || !text) return;
        const c = r.current || 0;
        if (c < 1) {
            badge.style.display = 'none';
            return;
        }
        badge.style.display = 'inline-flex';
        text.textContent = c + ' ' + (t('streakDays') || 'дн.');
        badge.classList.toggle('has-today', !!r.today_logged);
        dot.title = r.today_logged ? (t('streakTodayDone') || 'Сегодня уже отмечено') : (t('streakTodayMissing') || 'Сегодня ещё нет записей');
    } catch (e) {
        console.warn('streak failed', e);
    }
}

async function loadAchievements() {
    const grid = document.getElementById('achievements-grid');
    const prog = document.getElementById('achievements-progress');
    if (!grid) return;
    try {
        const r = await api('/gamification/achievements');
        if (!r || r._error) { grid.innerHTML = ''; return; }
        const lang = (typeof currentLang === 'string' && currentLang) || 'ru';
        const items = r.achievements || [];
        if (prog) {
            prog.textContent = (t('achEarnedOf') || 'Получено: ') + r.earned_count + ' / ' + r.total;
        }
        // Auto-check for new awards before rendering
        try { await api('/gamification/check', { method: 'POST' }); } catch(e){}
        const r2 = await api('/gamification/achievements');
        let items2 = (r2 && r2.achievements) ? r2.achievements : items;
        // Secret achievements: hidden until earned (shown as a mystery card otherwise)
        const SECRET = ['streak_100'];
        items2 = items2.filter(a => !(SECRET.includes(a.code) && !a.earned));
        if (prog && r2) {
            prog.textContent = (t('achEarnedOf') || 'Получено: ') + r2.earned_count + ' / ' + r2.total;
        }
        grid.innerHTML = items2.map(a => {
            const name = a['name_' + lang] || a.name_ru;
            const desc = a['desc_' + lang] || a.desc_ru;
            return '<div class="ach-card' + (a.earned ? ' earned' : '') + '" title="' + escapeHtml(desc) + '">'
                + '<div class="ach-icon">' + a.icon + '</div>'
                + '<div class="ach-name">' + escapeHtml(name) + '</div>'
                + '<div class="ach-desc">' + escapeHtml(desc) + '</div>'
                + '</div>';
        }).join('');
    } catch (e) {
        console.warn('achievements failed', e);
    }
}

let _achToastTimer = null;
function showAchievementToast(text) {
    const t = document.createElement('div');
    t.className = 'ach-toast';
    t.textContent = text;
    document.body.appendChild(t);
    if (_achToastTimer) clearTimeout(_achToastTimer);
    _achToastTimer = setTimeout(() => {
        t.style.opacity = '0';
        t.style.transition = 'opacity 0.4s';
        setTimeout(() => t.remove(), 400);
    }, 3500);
}

async function checkAchievementsAfterAction() {
    try {
        const r = await api('/gamification/check', { method: 'POST' });
        if (!r || r._error || !Array.isArray(r.new) || r.new.length === 0) return;
        // Resolve codes → names for current lang
        const list = await api('/gamification/achievements');
        if (!list || list._error) return;
        const lang = (typeof currentLang === 'string' && currentLang) || 'ru';
        for (const code of r.new) {
            const a = (list.achievements || []).find(x => x.code === code);
            if (!a) continue;
            const name = a['name_' + lang] || a.name_ru;
            showAchievementToast(a.icon + ' ' + (window.t ? (t('achUnlocked') || 'Получено: ') : 'Получено: ') + name);
        }
        refreshStreakBadge();
    } catch (e) {
        console.warn('checkAchievementsAfterAction', e);
    }
}

async function awardFeature(feature) {
    try {
        const r = await api('/gamification/award', {
            method: 'POST',
            body: JSON.stringify({ feature })
        });
        if (r && Array.isArray(r.new) && r.new.length) {
            const list = await api('/gamification/achievements');
            const lang = (typeof currentLang === 'string' && currentLang) || 'ru';
            for (const code of r.new) {
                const a = (list?.achievements || []).find(x => x.code === code);
                if (!a) continue;
                showAchievementToast(a.icon + ' ' + (t('achUnlocked') || 'Получено: ') + (a['name_' + lang] || a.name_ru));
            }
        }
    } catch (e) { console.warn('awardFeature', e); }
}

// ---- New features (universal voice / shopping / compare / alt / deficiency / seasonal / chat mic / dietary) ----

async function saveDietRestrictions() {
    const dr = document.getElementById('prof-diet-restrictions').value.trim();
    const sh = document.getElementById('prof-seasonal-hints').checked;
    const r = await api('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ dietary_restrictions: dr || null, seasonal_hints_enabled: sh })
    });
    if (r && !r._error) {
        if (typeof showToast === 'function') showToast(t('saved') || 'Сохранено');
    } else {
        alert(r?.detail || 'Ошибка');
    }
}

// Universal voice
let _uvoiceRec = null, _uvoiceChunks = [];
function openUniversalVoice() {
    const m = document.getElementById('uvoice-modal');
    if (!m) return;
    document.getElementById('uvoice-status').textContent = '';
    document.getElementById('uvoice-result').innerHTML = '';
    document.getElementById('uvoice-rec-btn').textContent = '● ' + (t('voiceStart') || 'Начать запись');
    m.classList.add('active');
}
async function toggleUniversalVoice() {
    const btn = document.getElementById('uvoice-rec-btn');
    const status = document.getElementById('uvoice-status');
    if (_uvoiceRec && _uvoiceRec.state === 'recording') { _uvoiceRec.stop(); btn.textContent = '⏳ ...'; return; }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        _uvoiceChunks = [];
        _uvoiceRec = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        _uvoiceRec.ondataavailable = e => { if (e.data.size > 0) _uvoiceChunks.push(e.data); };
        _uvoiceRec.onstop = async () => {
            stream.getTracks().forEach(tr => tr.stop());
            const blob = new Blob(_uvoiceChunks, { type: 'audio/webm' });
            await sendUniversalVoice(blob);
        };
        _uvoiceRec.start();
        btn.textContent = '■ ' + (t('voiceStop') || 'Остановить');
        status.textContent = t('voiceRecording') || 'Запись...';
    } catch (e) { status.textContent = 'Mic: ' + (e?.message || e); }
}
async function sendUniversalVoice(blob) {
    const result = document.getElementById('uvoice-result');
    const status = document.getElementById('uvoice-status');
    const btn = document.getElementById('uvoice-rec-btn');
    const lang = (typeof currentLang === 'string' && currentLang) || 'ru';
    const fd = new FormData();
    fd.append('file', blob, 'uvoice.webm');
    try {
        const resp = await fetch(`/api/v1/voice/parse-any?lang=${lang}`, {
            method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, body: fd
        });
        const data = await resp.json();
        btn.textContent = '● ' + (t('voiceStart') || 'Начать запись');
        if (data.detail) { status.textContent = '⚠️ ' + data.detail; return; }
        status.innerHTML = '«' + escapeHtml(data.transcript || '') + '»';
        const intent = data.intent || 'unknown';
        const d = data.data || {};
        let html = '';
        if (intent === 'food') {
            const items = d.items || [];
            const enc = encodeURIComponent(JSON.stringify(items));
            html = `<b>🍽 Еда:</b><ul style="margin:6px 0 0 18px">${items.map(it => `<li>${escapeHtml(it.name)} — ${it.grams || 0}г</li>`).join('')}</ul><button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="acceptUniversalFood('${enc}')">Добавить в дневник</button>`;
        } else if (intent === 'water') {
            const ml = d.amount_ml || 0;
            html = `<b>💧 Вода:</b> ${ml} мл<button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="acceptUniversalWater(${ml})">Подтвердить</button>`;
        } else if (intent === 'mood') {
            const mood = d.mood || 3, energy = d.energy || 3, sh = d.sleep_hours;
            html = `<b>😊 Настроение:</b> ${mood}/5, энергия ${energy}/5${sh ? ', сон ' + sh + 'ч' : ''}<button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="acceptUniversalMood(${mood},${energy},${sh || 'null'})">Подтвердить</button>`;
        } else if (intent === 'sleep') {
            const h = d.hours || 0;
            html = `<b>😴 Сон:</b> ${h} ч<button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="acceptUniversalSleep(${h})">Подтвердить</button>`;
        } else if (intent === 'weight') {
            const kg = d.kg || 0;
            html = `<b>⚖️ Вес:</b> ${kg} кг<button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="acceptUniversalWeight(${kg})">Подтвердить</button>`;
        } else {
            html = `<div style="color:#ffa940">Не понял. Скажи проще.</div>`;
        }
        result.innerHTML = html;
    } catch (e) {
        btn.textContent = '● ' + (t('voiceStart') || 'Начать запись');
        status.textContent = 'Err: ' + (e?.message || e);
    }
}
async function acceptUniversalFood(enc) {
    const items = JSON.parse(decodeURIComponent(enc));
    if (!items || !items.length) return;
    const meal = (meals && meals[0]) || null;
    for (const it of items) {
        let p = null;
        try {
            const list = await api('/products?q=' + encodeURIComponent(it.name) + '&limit=1');
            p = (list?.items || list || [])[0] || null;
        } catch(e){}
        const grams = it.grams || 100;
        await apiQueued('/diary', { method: 'POST', body: JSON.stringify({
            meal_id: meal?.id, product_id: p?.id || null, entry_date: currentDate,
            product_name: p?.name || it.name, serving_amount: grams,
            calories: p ? (p.calories || 0) * grams / 100 : 0,
            protein: p ? (p.protein || 0) * grams / 100 : 0,
            fat: p ? (p.fat || 0) * grams / 100 : 0,
            carbohydrates: p ? (p.carbohydrates || 0) * grams / 100 : 0,
        })});
    }
    closeModal('uvoice-modal');
    if (typeof loadDiary === 'function') loadDiary();
    if (typeof checkAchievementsAfterAction === 'function') setTimeout(checkAchievementsAfterAction, 400);
}
async function acceptUniversalWater(ml) {
    const r = await api('/water', { method: 'POST', body: JSON.stringify({ amount_ml: ml, drink_type: 'water' }) });
    if (r && !r._error) { closeModal('uvoice-modal'); if (typeof loadDiary === 'function') loadDiary(); } else alert(r?.detail || 'Ошибка');
}
async function acceptUniversalMood(mood, energy, sleep_h) {
    const body = { mood, energy, date: currentDate };
    if (sleep_h) body.sleep_hours = sleep_h;
    const r = await api('/mood', { method: 'POST', body: JSON.stringify(body) });
    if (r && !r._error) closeModal('uvoice-modal'); else alert(r?.detail || 'Ошибка');
}
async function acceptUniversalSleep(hours) {
    const r = await api('/mood', { method: 'POST', body: JSON.stringify({ date: currentDate, sleep_hours: hours }) });
    if (r && !r._error) closeModal('uvoice-modal'); else alert(r?.detail || 'Ошибка');
}
async function acceptUniversalWeight(kg) {
    const r = await api('/health/metrics', { method: 'POST', body: JSON.stringify({ type: 'weight', value: kg }) });
    if (r && !r._error) {
        await api('/auth/me', { method: 'PATCH', body: JSON.stringify({ current_weight: kg }) });
        closeModal('uvoice-modal');
        if (typeof loadHealth === 'function') loadHealth();
    } else alert(r?.detail || 'Ошибка');
}

// Chat mic
let _chatMicRec = null, _chatMicChunks = [];
async function toggleChatMic() {
    const btn = document.getElementById('chat-mic-btn');
    const input = document.getElementById('chat-input');
    if (_chatMicRec && _chatMicRec.state === 'recording') { _chatMicRec.stop(); btn.textContent = '⏳'; return; }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        _chatMicChunks = [];
        _chatMicRec = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        _chatMicRec.ondataavailable = e => { if (e.data.size > 0) _chatMicChunks.push(e.data); };
        _chatMicRec.onstop = async () => {
            stream.getTracks().forEach(tr => tr.stop());
            const blob = new Blob(_chatMicChunks, { type: 'audio/webm' });
            const fd = new FormData();
            fd.append('file', blob, 'voice.webm');
            const lang = (typeof currentLang === 'string' && currentLang) || 'ru';
            btn.textContent = '⏳';
            try {
                const resp = await fetch(`/api/v1/voice/parse-any?lang=${lang}`, {
                    method: 'POST', headers: { 'Authorization': 'Bearer ' + token }, body: fd
                });
                const data = await resp.json();
                if (data.transcript) { input.value = data.transcript; input.focus(); }
            } catch (e) { console.warn(e); }
            btn.textContent = '🎙';
        };
        _chatMicRec.start();
        btn.textContent = '■';
    } catch (e) { alert('Mic: ' + (e?.message || e)); btn.textContent = '🎙'; }
}

// Russian recipes
async function seedRussianRecipes() {
    if (!confirm(t('confirmSeedRu') || 'Добавить ~50 русских блюд в твои рецепты?')) return;
    const r = await api('/recipes/seed-russian', { method: 'POST' });
    if (r && !r._error) {
        if (typeof showToast === 'function') showToast((t('added') || 'Добавлено: ') + r.inserted);
        if (typeof loadRecipes === 'function') loadRecipes();
    } else { alert(r?.detail || 'Ошибка'); }
}

// Shopping list
let _shoppingChecks = {};
function openShoppingList(recipeId, recipeName) {
    window._currentShoppingRecipe = { id: recipeId, name: recipeName };
    const m = document.getElementById('shopping-modal');
    if (!m) return;
    m.classList.add('active');
    loadShoppingList(recipeId);
}
async function loadShoppingList(recipeId) {
    const wrap = document.getElementById('shopping-list-content');
    const r = await api('/recipes/' + recipeId);
    if (!r || r._error) { wrap.innerHTML = `<div style="color:#c0392b">${escapeHtml(r?.detail || 'Ошибка')}</div>`; return; }
    const key = 'shopping_' + recipeId;
    _shoppingChecks = JSON.parse(localStorage.getItem(key) || '{}');
    const ings = r.ingredients || [];
    let html = `<div style="font-weight:600;margin-bottom:8px">${escapeHtml(r.name)} (${r.total_weight_g || 0}г)</div>`;
    html += ings.map(ing => {
        const id = ing.id || ing.product_name;
        const checked = _shoppingChecks[id] ? 'checked' : '';
        const lt = _shoppingChecks[id] ? 'text-decoration:line-through;color:var(--text2)' : '';
        return `<label style="display:flex;gap:8px;align-items:center;padding:6px 0;cursor:pointer;font-size:13px"><input type="checkbox" data-id="${escapeAttr(id)}" data-rid="${escapeAttr(recipeId)}" onchange="toggleShoppingCheck(this)" ${checked}><span style="${lt}">${escapeHtml(ing.product_name)} — ${ing.amount_g} г</span></label>`;
    }).join('');
    wrap.innerHTML = html;
}
function toggleShoppingCheck(cb) {
    const id = cb.dataset.id;
    const rid = cb.dataset.rid;
    _shoppingChecks[id] = cb.checked;
    localStorage.setItem('shopping_' + rid, JSON.stringify(_shoppingChecks));
    const span = cb.nextElementSibling;
    if (span) span.style.cssText = cb.checked ? 'text-decoration:line-through;color:var(--text2)' : '';
}
function clearShoppingChecks() {
    const r = window._currentShoppingRecipe;
    if (!r) return;
    localStorage.removeItem('shopping_' + r.id);
    loadShoppingList(r.id);
}
async function shareShoppingList() {
    const r = window._currentShoppingRecipe;
    if (!r) return;
    const rec = await api('/recipes/' + r.id);
    if (!rec) return;
    const lines = (rec.ingredients || []).map(i => '• ' + i.product_name + ' — ' + i.amount_g + ' г');
    const text = '🛒 ' + rec.name + '\n' + lines.join('\n');
    if (navigator.share) {
        try { await navigator.share({ text }); return; } catch(e){}
    }
    try { await navigator.clipboard.writeText(text); if (typeof showToast === 'function') showToast(t('copied') || 'Скопировано'); } catch(e){ alert(text); }
}

// Compare products
let _compareList = [];
function addToCompare(p) {
    if (!p || !p.id) return;
    if (_compareList.find(x => x.id === p.id)) return;
    if (_compareList.length >= 3) _compareList.shift();
    _compareList.push(p);
    if (typeof showToast === 'function') showToast((t('inCompare') || 'В сравнении: ') + _compareList.length);
}
function openCompare() {
    if (_compareList.length < 2) { alert(t('compareNeed2') || 'Выбери минимум 2 продукта (через ⚖️ в карточке)'); return; }
    const m = document.getElementById('compare-modal');
    if (!m) return;
    renderCompare();
    m.classList.add('active');
}
function renderCompare() {
    const wrap = document.getElementById('compare-content');
    if (!_compareList.length) { wrap.innerHTML = ''; return; }
    const rows = [
        ['name', t('product') || 'Продукт'],
        ['calories', t('calories') || 'Калории'],
        ['protein', t('protein') || 'Белки'],
        ['fat', t('fat') || 'Жиры'],
        ['carbohydrates', t('carbs') || 'Углеводы'],
        ['fiber', t('fiberLabel') || 'Клетчатка'],
    ];
    let html = `<table style="width:100%;border-collapse:collapse;font-size:13px"><tr><th></th>${_compareList.map(p => `<th style="text-align:right;padding:4px">${escapeHtml(p.name).slice(0,24)}</th>`).join('')}</tr>`;
    for (const [key, label] of rows) {
        const vals = _compareList.map(p => p[key]);
        const nums = vals.filter(v => typeof v === 'number');
        const max = nums.length ? Math.max(...nums) : null;
        html += `<tr><td style="padding:6px 4px;color:var(--text2)">${label}</td>${vals.map(v => {
            const is_max = (typeof v === 'number') && v === max;
            const display = (typeof v === 'number') ? v.toFixed(1) : (v || '—');
            return `<td style="text-align:right;padding:6px 4px${is_max ? ';color:var(--accent);font-weight:600' : ''}">${escapeHtml(String(display))}</td>`;
        }).join('')}</tr>`;
    }
    html += `<tr><td colspan="${_compareList.length + 1}" style="padding-top:8px"><button class="btn btn-secondary" style="width:100%" onclick="_compareList=[];renderCompare();closeModal('compare-modal')">${t('clear') || 'Очистить'}</button></td></tr></table>`;
    wrap.innerHTML = html;
}

// Alternatives
let _altProductId = null;
function openAlternatives(productId, productName) {
    _altProductId = productId;
    const m = document.getElementById('alt-modal');
    if (!m) return;
    document.getElementById('alt-content').innerHTML = `<div style="color:var(--text2);text-align:center;padding:12px">${t('loading') || 'Загрузка...'}</div>`;
    const title = document.querySelector('#alt-modal .modal-title-lg');
    if (title) title.textContent = '🔄 ' + (t('altFor') || 'Замены для') + ' ' + (productName || '');
    m.classList.add('active');
    loadAlternatives();
}
async function loadAlternatives() {
    if (!_altProductId) return;
    const wrap = document.getElementById('alt-content');
    const goal = document.getElementById('alt-goal').value;
    const lang = (typeof currentLang === 'string' && currentLang) || 'ru';
    wrap.innerHTML = `<div style="color:var(--text2);text-align:center;padding:12px">${t('loading') || 'Загрузка...'}</div>`;
    const r = await api('/products/' + _altProductId + '/alternatives?lang=' + lang + '&goal=' + goal);
    if (!r || r._error) { wrap.innerHTML = `<div style="color:#c0392b">${escapeHtml(r?.detail || 'Ошибка')}</div>`; return; }
    const alts = r.alternatives || [];
    wrap.innerHTML = (r.explanation ? `<div style="font-size:12px;color:var(--text2);margin-bottom:10px">${escapeHtml(r.explanation)}</div>` : '')
        + alts.map(a => `<div class="card" style="padding:10px;margin-bottom:6px"><div style="font-weight:600">${escapeHtml(a.name || '')}</div><div style="font-size:11px;color:var(--text2);margin-top:2px">${a.kcal || 0} ккал · Б${a.protein || 0} Ж${a.fat || 0} У${a.carb || 0}/100г</div><div style="font-size:12px;margin-top:4px">${escapeHtml(a.reason || '')}</div></div>`).join('');
}

// Deficiency widget
async function runDeficiencyAnalysis() {
    const wrap = document.getElementById('deficiency-widget');
    if (!wrap) return;
    const lang = (typeof currentLang === 'string' && currentLang) || 'ru';
    wrap.innerHTML = `<div class="card"><div class="card-title">📊 ${t('deficiencyTitle') || 'Анализ дефицитов'}</div><div style="color:var(--text2);text-align:center;padding:12px">${t('analyzing') || 'Claude анализирует…'}</div></div>`;
    const r = await api('/recommendations/deficiencies?lang=' + lang + '&days=14');
    if (!r || r._error) {
        wrap.innerHTML = `<div class="card"><div class="card-title">📊 ${t('deficiencyTitle') || 'Анализ дефицитов'}</div><div style="color:#c0392b">${escapeHtml(r?.detail || 'Ошибка')}</div><button class="btn btn-secondary" style="margin-top:8px;width:100%" onclick="runDeficiencyAnalysis()">${t('retry') || 'Повторить'}</button></div>`;
        return;
    }
    const rda = r.rda_filled_percent || {};
    const bars = Object.entries(rda).map(([k, v]) => {
        if (v == null) return '';
        const color = v < 70 ? '#c0392b' : (v > 130 ? '#ffa940' : '#4caf50');
        const pct = Math.min(150, v);
        return `<div style="margin-bottom:4px"><div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text2)"><span>${k.replace('_', ' ')}</span><span>${v}%</span></div><div style="height:6px;background:var(--bg3);border-radius:3px;overflow:hidden"><div style="width:${pct/1.5}%;height:100%;background:${color}"></div></div></div>`;
    }).join('');
    wrap.innerHTML = `<div class="card"><div class="card-title">📊 ${t('deficiencyTitle') || 'Анализ дефицитов за 14 дней'}</div>${bars}<div style="font-size:13px;margin-top:10px;white-space:pre-wrap">${escapeHtml(r.analysis || '')}</div><button class="btn btn-secondary" style="margin-top:8px;width:100%" onclick="runDeficiencyAnalysis()">${t('refresh') || 'Обновить'}</button></div>`;
}
function injectDeficiencyWidget() {
    const container = document.getElementById('nutrients-content');
    if (!container || document.getElementById('deficiency-widget')) return;
    const div = document.createElement('div');
    div.id = 'deficiency-widget';
    div.innerHTML = `<div class="card"><div class="card-title">📊 ${t('deficiencyTitle') || 'Анализ дефицитов за 14 дней'}</div><button class="btn btn-secondary" style="width:100%" onclick="runDeficiencyAnalysis()">${t('analyze') || 'Проанализировать'}</button></div>`;
    container.appendChild(div);
}

// Seasonal hint
async function loadSeasonalHint() {
    try {
        const card = document.getElementById('seasonal-card');
        if (!card) return;
        const me = await api('/auth/me');
        if (!me || me.seasonal_hints_enabled === false) { card.style.display = 'none'; return; }
        const stored = localStorage.getItem('seasonal_dismissed_' + currentDate);
        if (stored === '1') { card.style.display = 'none'; return; }
        const month = new Date().getMonth() + 1;
        const lang = me.preferred_language || (typeof currentLang === 'string' ? currentLang : 'ru');
        const seasonal = {
            ru: {1:'Хурма, мандарины, гранат, квашеная капуста',2:'Цитрусовые, корнеплоды, цветная капуста',3:'Шпинат, редис, зелёный лук, цитрусовые',4:'Молодая зелень, редис, спаржа, ранняя клубника',5:'Спаржа, клубника, ревень, зелёный горошек',6:'Клубника, черешня, редис, зелень — пик сезона',7:'Малина, голубика, кабачки, помидоры',8:'Персики, дыня, баклажаны, болгарский перец',9:'Виноград, груши, яблоки, тыква, грибы',10:'Тыква, хурма, гранат, айва, грибы',11:'Хурма, гранат, цитрусовые, корнеплоды',12:'Мандарины, хурма, гранат, орехи'},
            en: {1:'Persimmon, tangerines, pomegranate, sauerkraut',2:'Citrus, root vegetables, cauliflower',3:'Spinach, radish, scallions, citrus',4:'Young greens, radish, asparagus, early strawberries',5:'Asparagus, strawberries, rhubarb, peas',6:'Strawberries, cherries, radish, herbs',7:'Raspberries, blueberries, zucchini, tomatoes',8:'Peaches, melon, eggplant, bell peppers',9:'Grapes, pears, apples, pumpkin, mushrooms',10:'Pumpkin, persimmon, pomegranate, quince, mushrooms',11:'Persimmon, pomegranate, citrus, root vegetables',12:'Tangerines, persimmon, pomegranate, nuts'},
            ja: {1:'柿、みかん、ザクロ、ザワークラウト',2:'柑橘類、根菜、カリフラワー',3:'ほうれん草、ラディッシュ、葉ねぎ、柑橘類',4:'若葉、ラディッシュ、アスパラ、早いイチゴ',5:'アスパラ、イチゴ、ルバーブ、グリーンピース',6:'イチゴ、さくらんぼ、ラディッシュ、ハーブ',7:'ラズベリー、ブルーベリー、ズッキーニ、トマト',8:'桃、メロン、ナス、ピーマン',9:'ブドウ、梨、リンゴ、かぼちゃ、きのこ',10:'かぼちゃ、柿、ザクロ、マルメロ、きのこ',11:'柿、ザクロ、柑橘類、根菜',12:'みかん、柿、ザクロ、ナッツ'}
        };
        const text = seasonal[lang]?.[month] || seasonal.ru[month];
        if (!text) return;
        const txt = document.getElementById('seasonal-text');
        if (txt) txt.textContent = text;
        card.style.display = '';
    } catch (e) { console.warn('seasonal', e); }
}
function dismissSeasonal() {
    const card = document.getElementById('seasonal-card');
    if (card) card.style.display = 'none';
    localStorage.setItem('seasonal_dismissed_' + currentDate, '1');
}

async function saveNutrientGoals() {
    const raw = {
            'vitamin_d': parseFloat(document.getElementById('ng-vitamin_d').value) || null,
            'vitamin_b12': parseFloat(document.getElementById('ng-vitamin_b12').value) || null,
            'vitamin_c': parseFloat(document.getElementById('ng-vitamin_c').value) || null,
            'iron': parseFloat(document.getElementById('ng-iron').value) || null,
            'calcium': parseFloat(document.getElementById('ng-calcium').value) || null,
            'magnesium': parseFloat(document.getElementById('ng-magnesium').value) || null,
            'zinc': parseFloat(document.getElementById('ng-zinc').value) || null,
            'potassium': parseFloat(document.getElementById('ng-potassium').value) || null,
            'fiber': parseFloat(document.getElementById('ng-fiber').value) || null
    };
    const goals = {};
    for (const k in raw) { if (raw[k] != null && raw[k] > 0) goals[k] = raw[k]; }
    const r = await api('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ nutrient_goals: Object.keys(goals).length ? goals : null })
    });
    if (r && !r._error) {
        if (typeof showToast === 'function') showToast(t('saved') || 'Сохранено');
    } else {
        alert(r?.detail || 'Ошибка');
    }
}


