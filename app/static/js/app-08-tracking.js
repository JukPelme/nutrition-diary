// app-08-tracking.js — mechanical split of app.js (Этап 1). Loaded as classic script; all globals stay global.
// ---- Weight Goals ----
async function loadWeightGoal() {
    const container = document.getElementById('weight-goal-content');
    const goal = await api('/health/weight-goal');
    if (!goal) return;

    const bmi = goal.bmi ? `<span style="color:var(--text2)">ИМТ: <b>${goal.bmi}</b></span>` : '';
    const diff = (goal.current_weight && goal.target_weight)
        ? (goal.target_weight - goal.current_weight).toFixed(1)
        : null;
    const diffText = diff ? `<span style="color:${diff > 0 ? 'var(--green)' : 'var(--accent)'}"> (${diff > 0 ? '+' : ''}${diff} кг)</span>` : '';

    container.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px">
            <div class="stat-box">
                <div class="stat-value">${goal.current_weight || '—'}</div>
                <div class="stat-label">Текущий, кг</div>
            </div>
            <div class="stat-box">
                <div class="stat-value">${goal.target_weight || '—'}</div>
                <div class="stat-label">Цель, кг</div>
            </div>
            <div class="stat-box">
                <div class="stat-value">${goal.height || '—'}</div>
                <div class="stat-label">Рост, см</div>
            </div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:12px">
            ${bmi} ${diffText}
        </div>
        <button class="btn btn-secondary" style="width:100%" onclick="openWeightGoalEdit()">Изменить</button>
        <div id="weight-goal-edit" style="display:none;margin-top:12px">
            <div class="form-row">
                <div class="form-group" style="flex:1">
                    <label class="label">Текущий вес, кг</label>
                    <input type="number" id="wg-current" class="input" step="0.1" value="${goal.current_weight || ''}">
                </div>
                <div class="form-group" style="flex:1">
                    <label class="label">Цель, кг</label>
                    <input type="number" id="wg-target" class="input" step="0.1" value="${goal.target_weight || ''}">
                </div>
                <div class="form-group" style="flex:1">
                    <label class="label">Рост, см</label>
                    <input type="number" id="wg-height" class="input" step="1" value="${goal.height || ''}">
                </div>
            </div>
            <button class="btn btn-primary" style="width:100%" onclick="saveWeightGoal()">Сохранить</button>
        </div>
    `;

    loadWeightHistory();
}

function openWeightGoalEdit() {
    const el = document.getElementById('weight-goal-edit');
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function saveWeightGoal() {
    const current = parseFloat(document.getElementById('wg-current').value) || null;
    const target = parseFloat(document.getElementById('wg-target').value) || null;
    const height = parseFloat(document.getElementById('wg-height').value) || null;

    await api('/health/weight-goal', {
        method: 'PATCH',
        body: JSON.stringify({ current_weight: current, target_weight: target, height: height })
    });

    loadWeightGoal();
}

async function loadWeightHistory() {
    const data = await api('/health/weight-history?days=90');
    const card = document.getElementById('weight-chart-card');
    if (!data || !data.data || data.data.length < 2) { card.style.display = 'none'; return; }
    card.style.display = '';

    const canvas = document.getElementById('weight-chart');
    const ctx = canvas.getContext('2d');
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width - 32;
    canvas.height = 200;

    const points = data.data;
    const weights = points.map(p => p.weight);
    const target = data.target_weight;
    const allVals = [...weights];
    if (target) allVals.push(target);

    const minW = Math.min(...allVals) - 1;
    const maxW = Math.max(...allVals) + 1;
    const range = maxW - minW || 1;

    const pad = { top: 20, right: 16, bottom: 30, left: 40 };
    const w = canvas.width - pad.left - pad.right;
    const h = canvas.height - pad.top - pad.bottom;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Y axis labels
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text2').trim() || '#888';
    ctx.font = '11px sans-serif';
    for (let i = 0; i <= 4; i++) {
        const val = minW + (range * i / 4);
        const y = pad.top + h - (i / 4) * h;
        ctx.fillText(val.toFixed(1), 2, y + 4);
        ctx.strokeStyle = 'rgba(128,128,128,0.15)';
        ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + w, y); ctx.stroke();
    }

    // X axis labels
    const step = Math.max(1, Math.floor(points.length / 5));
    for (let i = 0; i < points.length; i += step) {
        const x = pad.left + (i / (points.length - 1)) * w;
        const label = points[i].date.slice(5); // MM-DD
        ctx.fillText(label, x - 12, canvas.height - 5);
    }

    // Target line
    if (target) {
        const ty = pad.top + h - ((target - minW) / range) * h;
        ctx.strokeStyle = 'var(--green, #4caf50)';
        ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(pad.left, ty); ctx.lineTo(pad.left + w, ty); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'var(--green, #4caf50)';
        ctx.fillText('Цель: ' + target, pad.left + w - 60, ty - 5);
    }

    // Weight line
    ctx.strokeStyle = 'var(--accent, #4a9eff)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => {
        const x = pad.left + (i / (points.length - 1)) * w;
        const y = pad.top + h - ((p.weight - minW) / range) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Dots
    ctx.fillStyle = 'var(--accent, #4a9eff)';
    points.forEach((p, i) => {
        const x = pad.left + (i / (points.length - 1)) * w;
        const y = pad.top + h - ((p.weight - minW) / range) * h;
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
    });

    // EMA smoothing (alpha=0.2)
    if (weights.length >= 3) {
        const alpha = 0.2;
        let ema = weights[0];
        const smoothed = weights.map((v, i) => { ema = i === 0 ? v : (alpha * v + (1 - alpha) * ema); return ema; });
        ctx.strokeStyle = '#ff7e00';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        smoothed.forEach((v, i) => {
            const x = pad.left + (i / (weights.length - 1)) * w;
            const y = pad.top + h - ((v - minW) / range) * h;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ff7e00';
        ctx.fillText('EMA', pad.left + w - 24, pad.top + 10);
    }

    // Forecast
    const forecastEl = document.getElementById('weight-forecast');
    if (data.forecast) {
        const f = data.forecast;
        const rateColor = f.rate_per_week < 0 ? 'var(--green)' : 'var(--accent)';
        forecastEl.innerHTML = `
            <div style="font-size:12px;color:var(--text2)">
                Темп: <b style="color:${rateColor}">${f.rate_per_week > 0 ? '+' : ''}${f.rate_per_week} кг/нед</b>
                · Прогноз цели: <b>${f.estimated_date}</b> (${f.days_to_goal} дн.)
            </div>
        `;
    } else {
        forecastEl.innerHTML = '';
    }
}


// ---- Saved Recipes ----
function getSavedRecipes() {
    return JSON.parse(localStorage.getItem('savedRecipes') || '[]');
}

function saveRecipe() {
    const name = document.getElementById('cp-name').value.trim();
    if (!name || !recipeIngredients.length) { alert('Введите название и добавьте ингредиенты'); return; }
    const portions = parseInt(document.getElementById('recipe-portions')?.value) || 1;

    const recipes = getSavedRecipes();
    const existing = recipes.findIndex(r => r.name === name);
    const recipe = {
        name,
        portions,
        ingredients: recipeIngredients.map(i => ({
            id: i.id, name: i.name, amount: i.amount,
            calories: i.calories, protein: i.protein, fat: i.fat, carbohydrates: i.carbohydrates,
        })),
        savedAt: new Date().toISOString(),
    };

    if (existing >= 0) recipes[existing] = recipe;
    else recipes.unshift(recipe);

    localStorage.setItem('savedRecipes', JSON.stringify(recipes));
    alert('Рецепт сохранён!');
    renderSavedRecipes();
}

function loadRecipe(idx) {
    const recipes = getSavedRecipes();
    const recipe = recipes[idx];
    if (!recipe) return;

    document.getElementById('cp-name').value = recipe.name;
    if (document.getElementById('recipe-portions')) {
        document.getElementById('recipe-portions').value = recipe.portions || 1;
    }
    recipeIngredients = recipe.ingredients.map(i => ({ ...i }));
    setCreateMode('recipe');
    renderRecipeIngredients();
}

function deleteRecipe(idx) {
    const recipes = getSavedRecipes();
    recipes.splice(idx, 1);
    localStorage.setItem('savedRecipes', JSON.stringify(recipes));
    renderSavedRecipes();
}

function renderSavedRecipes() {
    const container = document.getElementById('saved-recipes-list');
    if (!container) return;
    const recipes = getSavedRecipes();
    if (!recipes.length) { container.innerHTML = '<div style="color:var(--text2);font-size:12px">Нет сохранённых рецептов</div>'; return; }

    container.innerHTML = recipes.map((r, i) => {
        const totalCal = r.ingredients.reduce((s, ing) => s + (ing.calories || 0) * ing.amount / 100, 0);
        const perPortion = r.portions > 0 ? Math.round(totalCal / r.portions) : Math.round(totalCal);
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--bg2)">
            <div>
                <div style="font-weight:500">${r.name}</div>
                <div style="font-size:11px;color:var(--text2)">${r.ingredients.length} ингр. · ${perPortion} ккал/порция · ${r.portions || 1} порц.</div>
            </div>
            <div style="display:flex;gap:4px">
                <button class="btn-icon" onclick="loadRecipe(${i})" title="Загрузить">📝</button>
                <button class="btn-icon" onclick="deleteRecipe(${i})" title="Удалить">🗑</button>
            </div>
        </div>`;
    }).join('');
}

// ---- Mood Diary ----
let currentMood = { mood: null, energy: null, sleep_hours: null };

async function loadMood() {
    const data = await api(`/mood?date=${currentDate}`);
    currentMood = data || { mood: null, energy: null, sleep_hours: null };

    document.querySelectorAll('.mood-btn[data-mood]').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.mood) === currentMood.mood);
    });
    document.querySelectorAll('.mood-btn[data-energy]').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.energy) === currentMood.energy);
    });

    const sleepInput = document.getElementById('mood-sleep');
    if (sleepInput && currentMood.sleep_hours) sleepInput.value = currentMood.sleep_hours;

    const label = document.getElementById('mood-current');
    if (label) {
        const names = { 1: 'Ужасно', 2: 'Плохо', 3: 'Нормально', 4: 'Хорошо', 5: 'Отлично' };
        label.textContent = currentMood.mood ? names[currentMood.mood] : '';
    }
}

function setMood(val) {
    currentMood.mood = val;
    document.querySelectorAll('.mood-btn[data-mood]').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.mood) === val);
    });
    saveMoodData();
}

function setEnergy(val) {
    currentMood.energy = val;
    document.querySelectorAll('.mood-btn[data-energy]').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.energy) === val);
    });
    saveMoodData();
}

async function saveMoodData() {
    if (!currentMood.mood) return;
    const sleep = parseFloat(document.getElementById('mood-sleep')?.value) || null;
    await api('/mood', {
        method: 'POST',
        body: JSON.stringify({
            date: currentDate,
            mood: currentMood.mood,
            energy: currentMood.energy,
            sleep_hours: sleep,
        })
    });
    const label = document.getElementById('mood-current');
    if (label) {
        const names = { 1: 'Ужасно', 2: 'Плохо', 3: 'Нормально', 4: 'Хорошо', 5: 'Отлично' };
        label.textContent = names[currentMood.mood] || '';
    }
}

// ---- Copy entire day ----
async function copyDay() {
    // Get entries from previous day
    const prevDate = new Date(currentDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = prevDate.toISOString().slice(0, 10);

    const summary = await api(`/diary/summary?entry_date=${prevDateStr}`);
    const prevEntries = summary?.entries || [];

    if (!prevEntries.length) {
        alert('Вчера нет записей для копирования');
        return;
    }

    if (!confirm(`Копировать ${prevEntries.length} записей из ${formatDate(prevDateStr)}?`)) return;

    let copied = 0;
    for (const entry of prevEntries) {
        const result = await apiQueued('/diary', {
            method: 'POST',
            body: JSON.stringify({
                product_id: entry.product_id,
                meal_id: entry.meal_id,
                serving_amount: entry.serving_amount,
                entry_date: currentDate,
            })
        });
        if (result && !result._error) copied++;
    }

    if (copied > 0) loadDiary();
    alert(`Скопировано ${copied} из ${prevEntries.length} записей`);
}


async function autoCalcGoals() {
    // First persist current profile fields (so backend uses fresh data)
    const heightVal = parseFloat(document.getElementById('prof-height').value);
    const weightVal = parseFloat(document.getElementById('prof-weight').value);
    const birthYear = parseInt(document.getElementById('prof-birth-year').value);
    const sex = document.getElementById('prof-sex').value || null;
    const activity = document.getElementById('prof-activity').value || null;
    const goal = document.getElementById('prof-goal').value || null;
    await api('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({
            height: isNaN(heightVal) ? null : heightVal,
            current_weight: isNaN(weightVal) ? null : weightVal,
            birth_year: isNaN(birthYear) ? null : birthYear,
            sex,
            activity_level: activity,
            goal_type: goal,
        })
    });
    const res = await api('/nutrition/auto-goals');
    const hint = document.getElementById('auto-goal-hint');
    if (!res || res.ready === false) {
        hint.textContent = (res && res.message) || 'Не хватает данных';
        return;
    }
    document.getElementById('set-cal').value = res.calories;
    document.getElementById('set-protein').value = res.protein;
    document.getElementById('set-fat').value = res.fat;
    document.getElementById('set-carbs').value = res.carbs;
    hint.textContent = `BMR ${res.details.bmr} · TDEE ${res.details.tdee} · возраст ${res.details.age} · активность ×${res.details.activity_factor}`;
}


function setupOfflineIndicator() {
    const el = document.getElementById('offline-indicator');
    const cnt = document.getElementById('offline-count');
    if (!el) return;
    const render = (s) => {
        const showQ = s.queueCount > 0;
        if (!s.online) {
            el.classList.remove('hidden');
            el.title = showQ ? `Офлайн · ${s.queueCount} в очереди` : 'Офлайн';
            cnt.textContent = showQ ? s.queueCount : '';
        } else if (showQ) {
            el.classList.remove('hidden');
            el.title = `Синхронизация · ${s.queueCount} ожидают`;
            cnt.textContent = s.queueCount;
        } else {
            el.classList.add('hidden');
        }
    };
    offlineState.listeners.push(render);
    refreshQueueCount();
    render(offlineState);
}


function setAiQuality(q) {
    localStorage.setItem('ai_quality', q);
    document.querySelectorAll('.ai-q-btn').forEach(b => b.classList.toggle('active', b.dataset.q === q));
}
// Re-highlight on Profile open
(function(){
    const prev = window.openProfile;
    if (typeof prev === 'function') {
        window.openProfile = async function(){
            await prev.apply(this, arguments);
            const cur = localStorage.getItem('ai_quality') || 'fast';
            document.querySelectorAll('.ai-q-btn').forEach(b => b.classList.toggle('active', b.dataset.q === cur));
        };
    }
})();


async function decodeBarcodeFromImage(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    console.log('[barcode] decodeBarcodeFromImage called, file=', file);
    if (!file) { alert('Файл не получен от камеры'); return; }

    const status = document.getElementById('barcode-status');
    const setMsg = (m) => {
        if (status) { status.textContent = m; status.style.color = '#ffa940'; status.style.fontSize = '14px'; }
        if (typeof showToast === 'function') showToast(m);
        console.log('[barcode]', m);
    };

    setMsg(`Сжимаю фото (${Math.round(file.size/1024)} КБ, ${file.type || 'unknown'})...`);
    try {
        let blob;
        try {
            blob = await compressImage(file, 1280, 0.85);
            setMsg(`Сжато до ${Math.round(blob.size/1024)} КБ, распознаю...`);
        } catch (cErr) {
            console.warn('[barcode] compress failed, sending original:', cErr);
            blob = file;
            setMsg(`Сжатие невозможно, шлю оригинал ${Math.round(file.size/1024)} КБ...`);
        }

        const fd = new FormData();
        fd.append('file', blob, blob.name || 'barcode.jpg');
        const resp = await fetch('/api/v1/barcode/decode-image', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token },
            body: fd,
        });
        console.log('[barcode] HTTP', resp.status);
        const text = await resp.text();
        let data;
        try { data = JSON.parse(text); } catch(e) { data = { error: `HTTP ${resp.status}: ${text.slice(0,200)}` }; }
        console.log('[barcode] response:', data);

        if (data.error) { setMsg('⚠️ ' + data.error.slice(0, 200)); return; }
        // Stash extracted nutrition (if any) for prefill
        window._lastBarcodeExtract = {
            barcode: data.barcode, name: data.name, brand: data.brand,
            calories: data.calories, protein: data.protein, fat: data.fat,
            carbohydrates: data.carbohydrates, fiber: data.fiber, sugar: data.sugar,
        };
        const hasNutrition = data.calories != null || data.protein != null;
        if (data.barcode) {
            if (typeof awardFeature === "function") awardFeature("barcode");
            document.getElementById('barcode-input').value = data.barcode;
            if (data.product) { setMsg('✓ ' + data.barcode); searchBarcode(); }
            else {
                setMsg('');
                if (status) {
                    const hint = hasNutrition
                        ? `<div style="font-size:11px;color:#4caf50;margin-top:4px">✨ Сразу подхватим название и КБЖУ с фото</div>`
                        : '';
                    status.innerHTML = `Найден <b>${data.barcode}</b>, в базе нет.${hint}<br><button class="btn btn-primary" style="margin-top:8px;width:100%" onclick="createProductFromBarcode('${data.barcode}', true)">＋ Создать продукт${hasNutrition ? ' (с авто-КБЖУ)' : ''}</button>`;
                    status.style.color = 'var(--text)';
                }
            }
        } else if (hasNutrition) {
            // No barcode but Claude extracted nutrition — still useful
            setMsg('');
            if (status) {
                status.innerHTML = `Штрихкод не распознан, но видно КБЖУ.<br><button class="btn btn-primary" style="margin-top:8px;width:100%" onclick="createProductFromBarcode('', true)">＋ Создать продукт с КБЖУ из фото</button>`;
                status.style.color = 'var(--text)';
            }
        } else {
            setMsg('Штрихкод не распознан. Снимай ближе и ровно, чтобы линии были чёткими. ' + (data.raw ? '(Claude: ' + data.raw.slice(0,40) + ')' : ''));
        }
    } catch (e) {
        console.error('[barcode] exception:', e);
        setMsg('Ошибка: ' + (e?.message || e));
    }
}

function compressImage(file, maxSide = 1280, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            let { width, height } = img;
            if (width > maxSide || height > maxSide) {
                const ratio = Math.min(maxSide / width, maxSide / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }
            const canvas = document.createElement('canvas');
            canvas.width = width; canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', quality);
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
        img.src = url;
    });
}


async function checkAppVersion() {
    try {
        // Bypass any SW or HTTP cache — append timestamp
        const resp = await fetch('/api/v1/version?_=' + Date.now(), {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' },
        });
        if (!resp.ok) return;
        const data = await resp.json();
        const current = data.version;
        const saved = localStorage.getItem('app_version');
        if (!saved) { localStorage.setItem('app_version', current); }
        else if (saved !== current) offerUpdate(current);
        window._appVersion = current;
        window._appStartedAt = data.started_at;
        renderVersionFooter();
    } catch(e) { console.warn('[version] check failed:', e); }
}

function renderVersionFooter() {
    const el = document.getElementById('version-footer');
    if (!el || !window._appVersion) return;
    const ts = (window._appStartedAt || '').slice(0, 19).replace('T', ' ');
    el.innerHTML = `v <code>${window._appVersion}</code> · ${ts}`;
}

function offerUpdate(newVersion) {
    if (document.getElementById('update-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'update-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:var(--accent);color:#fff;padding:10px 14px;text-align:center;z-index:300;font-size:13px;display:flex;gap:12px;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,.3)';
    banner.innerHTML = `Доступна новая версия (${newVersion}) <button onclick="hardRefresh()" style="background:#fff;color:var(--accent);border:none;border-radius:8px;padding:6px 12px;font-weight:600;cursor:pointer">Обновить</button>`;
    document.body.appendChild(banner);
}

async function hardRefresh() {
    try {
        if ('serviceWorker' in navigator) {
            const regs = await navigator.serviceWorker.getRegistrations();
            for (const r of regs) await r.unregister();
        }
        if (window.caches) {
            const keys = await caches.keys();
            for (const k of keys) await caches.delete(k);
        }
        localStorage.setItem('app_version', window._appVersion || '');
    } catch(e) {}
    location.reload();
}


