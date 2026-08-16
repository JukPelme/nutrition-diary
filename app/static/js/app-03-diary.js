// app-03-diary.js — mechanical split of app.js (Этап 1). Loaded as classic script; all globals stay global.
// ---- Water Tracker v2 (DB-backed) ----
const DRINK_ICONS = { water: '💧', tea: '🍵', coffee: '☕', juice: '🧃', milk: '🥛', other: '🥤' };

async function renderWater() {
    const data = await api('/water/today');
    if (!data || data.detail) {
        // fallback: localStorage compat for offline
        const lsCount = parseInt(localStorage.getItem(`water_${currentDate}`) || '0');
        document.getElementById('water-summary').textContent = `${lsCount*250} / ${waterGoal*250} мл`;
        document.getElementById('water-progress-fill').style.width = Math.min(lsCount/waterGoal*100,100) + '%';
        return;
    }
    const { total_ml, goal_ml, percent, entries } = data;
    document.getElementById('water-summary').textContent = `${total_ml} / ${goal_ml} мл`;
    document.getElementById('water-percent').textContent = `${percent}%`;
    const fill = document.getElementById('water-progress-fill');
    fill.style.width = Math.min(percent, 100) + '%';
    fill.classList.toggle('full', percent >= 100);

    const list = document.getElementById('water-entries');
    list.innerHTML = entries.map(e => {
        const t = new Date(e.drunk_at);
        const hh = String(t.getHours()).padStart(2, '0');
        const mm = String(t.getMinutes()).padStart(2, '0');
        const icon = DRINK_ICONS[e.drink_type] || '💧';
        return `<span class="water-entry" title="${typeof trDrinkType === 'function' ? trDrinkType(e.drink_type) : e.drink_type}">${hh}:${mm} ${icon} ${e.amount_ml}мл<button class="water-entry-del" onclick="deleteWater('${e.id}')">✕</button></span>`;
    }).join('');
}

async function addWater(amount_ml, drink_type) {
    await apiQueued('/water', { method: 'POST', body: JSON.stringify({ amount_ml, drink_type }) });
    renderWater();
}

async function addWaterCustom() {
    const raw = prompt('Сколько мл? (10-5000)', '300');
    if (!raw) return;
    const ml = parseInt(raw);
    if (!ml || ml < 10 || ml > 5000) { alert('Введите число от 10 до 5000'); return; }
    const typeRaw = prompt('Тип? water / tea / coffee / juice / milk / other', 'water');
    const type = ['water','tea','coffee','juice','milk','other'].includes(typeRaw) ? typeRaw : 'water';
    await addWater(ml, type);
}

async function deleteWater(id) {
    await apiQueued(`/water/${id}`, { method: 'DELETE' });
    renderWater();
}

// One-time migration from localStorage glasses → DB ml (legacy users)
async function migrateLegacyWater() {
    if (localStorage.getItem('waterMigrated_v2')) return;
    const keys = Object.keys(localStorage).filter(k => k.startsWith('water_') && k !== 'waterGoal');
    if (keys.length === 0) { localStorage.setItem('waterMigrated_v2', '1'); return; }
    for (const k of keys) {
        const dateStr = k.replace('water_', '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;
        const glasses = parseInt(localStorage.getItem(k) || '0');
        if (glasses <= 0) continue;
        // Convert to ml using saved waterGoal mapping (1 glass = 250 ml as legacy default)
        const ml = glasses * 250;
        try {
            await api('/water', { method: 'POST', body: JSON.stringify({
                amount_ml: ml,
                drink_type: 'water',
                drunk_at: `${dateStr}T12:00:00Z`,
                notes: 'imported from localStorage'
            }) });
        } catch (e) { /* ignore */ }
    }
    localStorage.setItem('waterMigrated_v2', '1');
}

// ---- Diary ----
async function loadDiary() {
    refreshStreakBadge();
    if (typeof loadSeasonalHint === 'function') loadSeasonalHint();
    if (typeof maybeTriggerPushReminder === 'function') setTimeout(maybeTriggerPushReminder, 3000);
    if (typeof injectCoachTipOnDiary === 'function') setTimeout(injectCoachTipOnDiary, 200);
    if (typeof injectXpAndQuests === 'function') setTimeout(injectXpAndQuests, 250);
    if (typeof maybeTriggerStreakWarning === 'function') setTimeout(maybeTriggerStreakWarning, 4000);
    if (typeof maybeTriggerMealReminder === 'function') setTimeout(maybeTriggerMealReminder, 5000);
    meals = await api('/meals') || [];
    const summary = await api(`/diary/summary?entry_date=${currentDate}`);
    entries = summary?.entries || [];
    renderDiary(summary);
    loadMood();
}

let _lastSummary = null;
window.expandedMeals = window.expandedMeals || new Set();
const MEAL_TINT = { 'Завтрак':'rgba(251,191,36,.14)', 'Обед':'rgba(96,165,250,.14)', 'Ужин':'rgba(52,211,153,.14)', 'Перекус':'rgba(167,139,250,.16)' };

function renderDiary(summary) {
    _lastSummary = summary;
    document.getElementById('date-display').textContent = (typeof formatDateLocale === 'function' && currentLang !== 'ru') ? formatDateLocale(currentDate) : formatDate(currentDate);

    const cal = summary?.total_calories || 0;
    const goal = userGoals.calories;
    const pct = Math.min((cal / goal) * 100, 100);
    const circumference = 2 * Math.PI * 40;
    const ring = document.getElementById('cal-ring');
    ring.setAttribute('stroke-dasharray', circumference);
    ring.setAttribute('stroke-dashoffset', circumference - (pct / 100) * circumference);
    const remaining = Math.round(goal - cal);
    document.getElementById('cal-num').textContent = remaining >= 0 ? remaining : 0;
    const leftLabel = remaining >= 0 ? (typeof t === 'function' ? t('kcalLeft') : 'осталось, ккал')
                                     : (typeof t === 'function' ? t('kcalOver') : 'перебор, ккал');
    const goalWord = typeof t === 'function' ? t('goal') : 'цель';
    document.getElementById('cal-left').innerHTML = leftLabel + `<span class="cal-goal">${Math.round(cal)} / ${goal} · ${goalWord}</span>`;
    ring.style.stroke = cal >= goal ? 'var(--red)' : 'var(--accent)';

    const prot = Math.round(summary?.total_protein || 0);
    const fatVal = Math.round(summary?.total_fat || 0);
    const carbsVal = Math.round(summary?.total_carbohydrates || 0);
    document.getElementById('protein-val').textContent = prot + 'г';
    document.getElementById('fat-val').textContent = fatVal + 'г';
    document.getElementById('carbs-val').textContent = carbsVal + 'г';
    document.querySelector('.macro-protein .macro-fill').style.width = Math.min(prot / userGoals.protein * 100, 100) + '%';
    document.querySelector('.macro-fat .macro-fill').style.width = Math.min(fatVal / userGoals.fat * 100, 100) + '%';
    document.querySelector('.macro-carbs .macro-fill').style.width = Math.min(carbsVal / userGoals.carbs * 100, 100) + '%';

    const eatenEl = document.getElementById('meals-eaten');
    if (eatenEl) eatenEl.textContent = cal ? `${typeof t === 'function' ? t('eaten') : 'съедено'} ${Math.round(cal)} ккал` : '';

    const container = document.getElementById('meals-container');
    container.innerHTML = '';
    for (const meal of meals) {
        const mealEntries = entries.filter(e => e.meal_id === meal.id);
        const mealCal = Math.round(mealEntries.reduce((s, e) => s + (e.calories || 0), 0));
        const has = mealEntries.length > 0;
        const open = expandedMeals.has(meal.id);
        const mealName = typeof trMeal === 'function' ? trMeal(meal.name) : meal.name;
        const composition = has ? mealEntries.map(e => e.product_name).join(', ')
                                : (typeof t === 'function' ? t('nothingAdded') : 'Ничего не добавлено');
        const tint = MEAL_TINT[meal.name] || 'rgba(255,255,255,.05)';

        const card = document.createElement('div');
        card.className = 'meal-card' + (has ? '' : ' empty') + (open ? ' open' : '');
        card.setAttribute('onclick', `mealCardClick('${meal.id}', ${has})`);
        card.innerHTML = `
            <div class="meal-ic" style="background:${tint}">${meal.icon || '🍽'}</div>
            <div class="meal-body">
                <div class="meal-name">${mealName}</div>
                <div class="meal-sub">${composition}</div>
            </div>
            <div class="meal-right">
                ${has ? `<span class="meal-kcal">${mealCal}</span><span class="meal-chev">›</span>`
                      : `<span class="meal-plus ghost">+</span>`}
            </div>`;
        container.appendChild(card);

        if (has && open) {
            const exp = document.createElement('div');
            exp.className = 'meal-expand';
            exp.innerHTML = mealEntries.map(e => `
                <div class="entry-row" id="entry-${e.id}">
                    <div class="entry-info" onclick="editEntry('${e.id}', ${e.serving_amount}, '${(e.product_name || '').replace(/'/g, "\\'")}')">
                        <div class="entry-name">${e.product_name}</div>
                        <div class="entry-weight">${e.serving_amount}г · Б${Math.round(e.protein)} Ж${Math.round(e.fat)} У${Math.round(e.carbohydrates)}</div>
                    </div>
                    <div class="entry-right">
                        <span class="entry-cal">${Math.round(e.calories)} ккал</span>
                        <button class="btn-delete" onclick="deleteEntry('${e.id}')" title="Удалить">✕</button>
                    </div>
                </div>`).join('') + `
                <div class="meal-actions">
                    <div class="add-btn" style="flex:1" onclick="openAddFood('${meal.id}')">+ ${typeof t === 'function' ? t('add').replace(/^\+ /, '') : 'Добавить'}</div>
                    <div class="add-btn" style="flex:0;padding:10px 12px" onclick="openTemplates('${meal.id}')" title="Шаблоны">📂</div>
                    <div class="add-btn" style="flex:0;padding:10px 12px" onclick="saveTemplate('${meal.id}')" title="Сохранить шаблон">💾</div>
                    <div class="add-btn" style="flex:0;padding:10px 12px" onclick="copyMeal('${meal.id}', '${currentDate}')" title="Повторить вчера">📋</div>
                </div>`;
            container.appendChild(exp);
        }
    }
    renderWater();
}

function mealCardClick(mealId, has) {
    if (!has) { openAddFood(mealId); }
    else { toggleMeal(mealId); }
}
function toggleMeal(id) {
    if (expandedMeals.has(id)) expandedMeals.delete(id); else expandedMeals.add(id);
    if (_lastSummary !== null) renderDiary(_lastSummary);
}

// ---- Add sheet (central + button) ----
function openAddSheet() {
    document.getElementById('add-sheet-scrim').classList.add('active');
    document.getElementById('add-sheet').classList.add('active');
}
function closeAddSheet() {
    document.getElementById('add-sheet-scrim').classList.remove('active');
    document.getElementById('add-sheet').classList.remove('active');
}
function addSheetPick(kind) {
    closeAddSheet();
    const firstMeal = (typeof meals !== 'undefined' && meals && meals[0]) ? meals[0].id : null;
    if (kind === 'search') { openAddFood(firstMeal); }
    else if (kind === 'camera') {
        if (typeof openFoodPhoto === 'function') openFoodPhoto(firstMeal);
        else if (typeof openBarcodeScanner === 'function') openBarcodeScanner(firstMeal);
        else openAddFood(firstMeal);
    }
    else if (kind === 'voice') { if (typeof openUniversalVoice === 'function') openUniversalVoice(); }
    else if (kind === 'history') { if (typeof openHistory === 'function') openHistory(); }
}

// ---- Header "More" menu (Нутриенты / Голодание) ----
function toggleMoreMenu(ev) { if (ev) ev.stopPropagation(); document.getElementById('more-menu').classList.toggle('hidden'); }
function closeMoreMenu() { document.getElementById('more-menu').classList.add('hidden'); }
document.addEventListener('click', (e) => {
    const m = document.getElementById('more-menu');
    if (m && !m.classList.contains('hidden') && !e.target.closest('#more-menu') && !e.target.closest('[onclick^="toggleMoreMenu"]')) closeMoreMenu();
});

function changeDate(delta) {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + delta);
    currentDate = d.toISOString().slice(0, 10);
    // Reload current tab
    const activeTab = document.querySelector('.nav-tab.active')?.dataset.tab || 'diary';
    if (activeTab === 'diary') loadDiary();
    else if (activeTab === 'nutrients') loadNutrients();
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (dateStr === today) return 'Сегодня';
    if (dateStr === yesterday) return 'Вчера';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

// ---- Delete / Edit Entry ----
async function deleteEntry(entryId) {
    if (!confirm('Удалить запись?')) return;
    await api(`/diary/${entryId}`, { method: 'DELETE' });
    loadDiary();
}

async function editEntry(entryId, currentAmount, productName) {
    const newAmount = prompt(`${productName}\nНовая порция (г):`, currentAmount);
    if (!newAmount || parseFloat(newAmount) === currentAmount) return;
    const amount = parseFloat(newAmount);
    if (isNaN(amount) || amount <= 0) return;

    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;
    const factor = amount / entry.serving_amount;

    await api(`/diary/${entryId}`, {
        method: 'PATCH',
        body: JSON.stringify({
            serving_amount: amount,
            calories: entry.calories * factor,
            protein: entry.protein * factor,
            fat: entry.fat * factor,
            carbohydrates: entry.carbohydrates * factor,
        })
    });
    loadDiary();
}

