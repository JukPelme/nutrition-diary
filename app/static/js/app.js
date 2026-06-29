
// ---- Theme & Accent ----
function initTheme() {
    const theme = localStorage.getItem('theme') || 'dark';
    const accent = localStorage.getItem('accent') || 'blue';
    applyTheme(theme);
    applyAccent(accent);
}

function setTheme(theme) {
    localStorage.setItem('theme', theme);
    applyTheme(theme);
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const darkBtn = document.getElementById('theme-dark-btn');
    const lightBtn = document.getElementById('theme-light-btn');
    const amoledBtn = document.getElementById('theme-amoled-btn');
    if (darkBtn) darkBtn.classList.toggle('active', theme === 'dark');
    if (lightBtn) lightBtn.classList.toggle('active', theme === 'light');
    if (amoledBtn) amoledBtn.classList.toggle('active', theme === 'amoled');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
        meta.content = theme === 'light' ? '#ffffff' : (theme === 'amoled' ? '#000000' : '#0f1117');
    }
}

function setAccent(color) {
    localStorage.setItem('accent', color);
    applyAccent(color);
}

function applyAccent(color) {
    document.documentElement.setAttribute('data-accent', color);
    document.querySelectorAll('.accent-dot').forEach(dot => {
        dot.classList.toggle('active', dot.dataset.color === color);
    });
}

// Apply theme immediately on script load
initTheme();


// ---- Notifications / Reminders ----
function initNotifications() {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    
    const enabled = localStorage.getItem('notificationsEnabled');
    if (enabled === 'true') {
        startReminderLoop();
    }
}

async function toggleNotifications() {
    if (!('Notification' in window)) {
        alert('Браузер не поддерживает уведомления');
        return;
    }
    
    const enabled = localStorage.getItem('notificationsEnabled') === 'true';
    
    if (enabled) {
        localStorage.setItem('notificationsEnabled', 'false');
        clearInterval(window._reminderInterval);
        updateNotifButton(false);
        return;
    }
    
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
        localStorage.setItem('notificationsEnabled', 'true');
        startReminderLoop();
        updateNotifButton(true);
    } else {
        alert('Уведомления заблокированы в настройках браузера');
    }
}

function updateNotifButton(on) {
    const btn = document.getElementById('notif-toggle-btn');
    if (btn) {
        btn.textContent = on ? '🔔 Вкл' : '🔕 Выкл';
        btn.classList.toggle('active', on);
    }
}

function startReminderLoop() {
    checkAndNotify();
    window._reminderInterval = setInterval(checkAndNotify, 30 * 60 * 1000); // every 30 min
}

async function checkAndNotify() {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const todayStr = now.toISOString().slice(0, 10);
    const todayKey = 'lastNotif_' + todayStr;
    const sent = JSON.parse(localStorage.getItem(todayKey) || '{}');

    const reminders = getReminders();

    // Fetch today's diary to check what's logged
    let todayEntries = entries; // use global if same date
    if (currentDate !== todayStr) {
        try {
            const summary = await api('/diary/summary?entry_date=' + todayStr);
            todayEntries = summary?.entries || [];
        } catch(e) { todayEntries = []; }
    }

    // Map meal names to meal IDs
    const mealMap = {};
    for (const m of meals) {
        const n = (m.name || '').toLowerCase();
        if (n.includes('завтрак')) mealMap['breakfast'] = m.id;
        else if (n.includes('обед')) mealMap['lunch'] = m.id;
        else if (n.includes('ужин')) mealMap['dinner'] = m.id;
        else if (n.includes('перекус')) mealMap['snack'] = m.id;
    }

    for (const r of reminders) {
        // Smart check: remind only AFTER the meal hour + delay, and only if nothing logged
        const checkHour = r.hour + (r.delay || 1); // default: check 1 hour after meal time
        if (hour >= checkHour && !sent[r.id]) {
            const mealId = mealMap[r.id];
            const hasFood = mealId ? todayEntries.some(e => e.meal_id === mealId) : false;
            if (!hasFood) {
                sendNotification(r.title, r.smartBody || r.body, r.id);
            }
            sent[r.id] = true;
            localStorage.setItem(todayKey, JSON.stringify(sent));
        }
    }

    // Water reminder: every 2 hours from 9 to 21 if water < goal
    if (hour >= 9 && hour <= 21 && hour % 2 === 0 && !sent['water_' + hour]) {
        const water = parseInt(localStorage.getItem('water_' + todayStr) || '0');
        if (water < waterGoal) {
            sendNotification('💧 Выпей воды', water + ' из ' + waterGoal + ' стаканов', 'water_' + hour);
            sent['water_' + hour] = true;
            localStorage.setItem(todayKey, JSON.stringify(sent));
        }
    }

    // Fasting reminder: if active fasting session is ending soon
    if (!sent['fasting_end'] && hour >= 6) {
        try {
            const fasting = await api('/fasting/current');
            if (fasting && fasting.id) {
                const targetEnd = new Date(fasting.target_end);
                const diff = (targetEnd - now) / (1000 * 60); // minutes
                if (diff > 0 && diff <= 30) {
                    sendNotification('⏰ Голодание заканчивается', 'Осталось ' + Math.round(diff) + ' мин до конца окна голодания', 'fasting_end');
                    sent['fasting_end'] = true;
                    localStorage.setItem(todayKey, JSON.stringify(sent));
                }
            }
        } catch(e) {}
    }

    // Update PWA badge with remaining calories
    updateAppBadge();
}

function getReminders() {
    return JSON.parse(localStorage.getItem('mealReminders') || JSON.stringify([
        { id: 'breakfast', hour: 8, delay: 2, title: '🌅 Завтрак', body: 'Пора завтракать!', smartBody: 'Ты не записал завтрак' },
        { id: 'lunch', hour: 13, delay: 1, title: '☀️ Обед', body: 'Время обеда!', smartBody: 'Ты не записал обед' },
        { id: 'dinner', hour: 19, delay: 2, title: '🌙 Ужин', body: 'Пора ужинать!', smartBody: 'Ты не записал ужин' },
    ]));
}

function sendNotification(title, body, tag) {
    if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({
            type: 'SHOW_NOTIFICATION', title, body, tag
        });
    }
}

// PWA badge: show remaining calories on app icon
async function updateAppBadge() {
    if (!('setAppBadge' in navigator)) return;
    try {
        const todayStr = new Date().toISOString().slice(0, 10);
        let cal = 0;
        if (currentDate === todayStr && entries.length > 0) {
            cal = entries.reduce((s, e) => s + (e.calories || 0), 0);
        } else {
            const summary = await api('/diary/summary?entry_date=' + todayStr);
            cal = summary?.total_calories || 0;
        }
        const remaining = Math.max(0, Math.round((userGoals.calories - cal) / 100)); // in hundreds
        if (remaining > 0) {
            navigator.setAppBadge(remaining);
        } else {
            navigator.clearAppBadge();
        }
    } catch(e) {}
}

// State
let currentDate = new Date().toISOString().slice(0, 10);
let meals = [];
let entries = [];
let selectedMealId = null;
let userGoals = { calories: 2000, protein: 120, fat: 65, carbs: 250 };
let waterGoal = 8;
let waterCount = 0;

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
    if (!isLoggedIn()) {
        showAuth();
    } else {
        showApp();
    }
});

// ---- Auth ----
function showAuth() {
    document.getElementById('auth-page').classList.remove('hidden');
    document.getElementById('app-page').classList.add('hidden');
}

async function showApp() {
    document.getElementById('auth-page').classList.add('hidden');
    document.getElementById('app-page').classList.remove('hidden');
    await loadUserSettings();
    initNotifications();
    migrateLegacyWater().catch(()=>{});
    checkAppVersion().catch(()=>{});
    // Apply server-saved language preference (cross-device)
    api('/auth/me').then(me => {
        if (me?.preferred_language && me.preferred_language !== currentLang && typeof setLang === 'function') {
            setLang(me.preferred_language);
        }
    }).catch(()=>{});
    setupOfflineIndicator();
    flushSyncQueue().catch(()=>{});
    cacheProductCatalog().catch(()=>{});
    loadDiary();
    setActiveTab('diary');
}

async function handleLogin(e) {
    e.preventDefault();
    const login = document.getElementById('auth-login').value;
    const password = document.getElementById('auth-password').value;
    const body = { login, password };
    let data = await api('/auth/login', { method: 'POST', body: JSON.stringify(body) });
    if (data?.detail === 'totp_required') {
        const totp_code = prompt('Введи 6-значный код из приложения 2FA:');
        if (!totp_code) return;
        data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ ...body, totp_code }) });
    }
    if (data?.access_token) {
        setToken(data.access_token);
        showApp();
    } else {
        showError(data?.detail || 'Неверный email/логин или пароль');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const name = document.getElementById('auth-name')?.value || '';
    const username = document.getElementById('auth-username')?.value?.trim() || null;
    const body = { email, password, full_name: name };
    if (username) body.username = username;
    const data = await api('/auth/register', { method: 'POST', body: JSON.stringify(body) });
    if (data?.access_token) {
        setToken(data.access_token);
        showApp();
    } else {
        showError(data?.detail || 'Ошибка регистрации');
    }
}

function toggleAuthMode() {
    const form = document.getElementById('auth-form');
    const btn = document.getElementById('auth-submit');
    const toggle = document.getElementById('auth-toggle-text');
    const nameField = document.getElementById('auth-name-group');
    const usernameField = document.getElementById('auth-username-group');
    const emailField = document.getElementById('auth-email-group');
    const loginInput = document.getElementById('auth-login');
    if (btn.textContent === 'Войти') {
        btn.textContent = 'Зарегистрироваться';
        toggle.innerHTML = 'Уже есть аккаунт? <a href="#" onclick="toggleAuthMode()">Войти</a>';
        nameField.classList.remove('hidden');
        usernameField.classList.remove('hidden');
        emailField.classList.remove('hidden');
        // In register mode the "login" field becomes hidden — we need email + username instead
        loginInput.removeAttribute('required');
        loginInput.parentElement.classList.add('hidden');
        document.getElementById('auth-email').setAttribute('required', '');
        form.onsubmit = handleRegister;
    } else {
        btn.textContent = 'Войти';
        toggle.innerHTML = 'Нет аккаунта? <a href="#" onclick="toggleAuthMode()">Регистрация</a>';
        nameField.classList.add('hidden');
        usernameField.classList.add('hidden');
        emailField.classList.add('hidden');
        loginInput.setAttribute('required', '');
        loginInput.parentElement.classList.remove('hidden');
        document.getElementById('auth-email').removeAttribute('required');
        form.onsubmit = handleLogin;
    }
}

// ---- User Settings & Goals ----
async function loadUserSettings() {
    const user = await api('/auth/me');
    if (user) {
        userGoals.calories = user.daily_calorie_goal || 2000;
        userGoals.protein = user.daily_protein_goal || 120;
        userGoals.fat = user.daily_fat_goal || 65;
        userGoals.carbs = user.daily_carb_goal || 250;
    }
    waterGoal = parseInt(localStorage.getItem('waterGoal') || '8');
    waterCount = parseInt(localStorage.getItem(`water_${currentDate}`) || '0');
}

function switchSettingsTab(tab) {
    document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.settings-tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`.settings-tab[onclick*="${tab}"]`).classList.add('active');
    document.getElementById('settings-tab-' + tab).classList.add('active');
}

async function openProfile() {
    document.getElementById('profile-modal').classList.add('active');
    loadDevices();
    document.getElementById('set-cal').value = userGoals.calories;
    document.getElementById('set-protein').value = userGoals.protein;
    document.getElementById('set-fat').value = userGoals.fat;
    document.getElementById('set-carbs').value = userGoals.carbs;
    document.getElementById('set-water').value = '';

    const me = await api('/auth/me').catch(() => null);
    const verEl = document.getElementById('version-info');
    if (verEl && window._appVersion) {
        verEl.innerHTML = `Версия: <code>${window._appVersion}</code> · запущена ${window._appStartedAt || ''}`;
    }
    if (me) {
        document.getElementById('prof-name').value = me.full_name || '';
        document.getElementById('prof-username').value = me.username || '';
        document.getElementById('prof-height').value = me.height || '';
        document.getElementById('prof-weight').value = me.current_weight || '';
        document.getElementById('prof-target-weight').value = me.target_weight || '';
        document.getElementById('prof-birth-year').value = me.birth_year || '';
        if (me.sex) document.getElementById('prof-sex').value = me.sex;
        if (me.activity_level) document.getElementById('prof-activity').value = me.activity_level;
        if (me.goal_type) document.getElementById('prof-goal').value = me.goal_type;
        const _dr = document.getElementById('prof-diet-restrictions');
        if (_dr) _dr.value = me.dietary_restrictions || '';
        { const el = document.getElementById('ng-vitamin_d'); if (el) el.value = (me.nutrient_goals && me.nutrient_goals['vitamin_d']) || ''; }
        { const el = document.getElementById('ng-vitamin_b12'); if (el) el.value = (me.nutrient_goals && me.nutrient_goals['vitamin_b12']) || ''; }
        { const el = document.getElementById('ng-vitamin_c'); if (el) el.value = (me.nutrient_goals && me.nutrient_goals['vitamin_c']) || ''; }
        { const el = document.getElementById('ng-iron'); if (el) el.value = (me.nutrient_goals && me.nutrient_goals['iron']) || ''; }
        { const el = document.getElementById('ng-calcium'); if (el) el.value = (me.nutrient_goals && me.nutrient_goals['calcium']) || ''; }
        { const el = document.getElementById('ng-magnesium'); if (el) el.value = (me.nutrient_goals && me.nutrient_goals['magnesium']) || ''; }
        { const el = document.getElementById('ng-zinc'); if (el) el.value = (me.nutrient_goals && me.nutrient_goals['zinc']) || ''; }
        { const el = document.getElementById('ng-potassium'); if (el) el.value = (me.nutrient_goals && me.nutrient_goals['potassium']) || ''; }
        { const el = document.getElementById('ng-fiber'); if (el) el.value = (me.nutrient_goals && me.nutrient_goals['fiber']) || ''; }
        const _sh = document.getElementById('prof-seasonal-hints');
        if (_sh) _sh.checked = me.seasonal_hints_enabled !== false;
        renderBMI(me.current_weight, me.height);
    }
    ['prof-height', 'prof-weight'].forEach(id => {
        document.getElementById(id).addEventListener('input', () => {
            const w = parseFloat(document.getElementById('prof-weight').value);
            const h = parseFloat(document.getElementById('prof-height').value);
            renderBMI(w, h);
        });
    });

    const goal = await api('/water/goal').catch(() => null);
    const hint = document.getElementById('water-goal-hint');
    if (goal) {
        if (goal.is_auto) {
            hint.textContent = goal.source_weight_kg
                ? `Авто: ${goal.daily_water_goal_ml} мл (${goal.source_weight_kg} кг × 30)`
                : `Авто: ${goal.daily_water_goal_ml} мл (вес не указан — стандарт)`;
        } else {
            hint.textContent = `Своя цель: ${goal.daily_water_goal_ml} мл`;
            document.getElementById('set-water').value = goal.daily_water_goal_ml;
        }
    }
}

function renderBMI(weight, heightCm) {
    const block = document.getElementById('bmi-block');
    if (!block) return;
    if (!weight || !heightCm) {
        block.className = 'bmi-block empty';
        block.innerHTML = 'Укажи рост и вес — посчитаю ИМТ';
        return;
    }
    const h = heightCm / 100;
    const bmi = weight / (h * h);
    let band, cls;
    if (bmi < 18.5) { band = 'Недовес'; cls = 'bmi-band-low'; }
    else if (bmi < 25) { band = 'Норма'; cls = 'bmi-band-norm'; }
    else if (bmi < 30) { band = 'Избыток'; cls = 'bmi-band-over'; }
    else { band = 'Ожирение'; cls = 'bmi-band-obese'; }
    block.className = 'bmi-block';
    block.innerHTML = `
        <div>
            <div class="bmi-label">ИМТ</div>
            <div class="bmi-value">${bmi.toFixed(1)}</div>
        </div>
        <div class="bmi-band ${cls}">${band}</div>
    `;
}

function openSettings() {
    document.getElementById('settings-modal').classList.add('active');
    applyTheme(localStorage.getItem('theme') || 'dark');
    applyAccent(localStorage.getItem('accent') || 'blue');
    updateNotifButton(localStorage.getItem('notificationsEnabled') === 'true');
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === currentLang));
}

async function saveSettings() {
    const cal = parseInt(document.getElementById('set-cal').value) || 2000;
    const protein = parseFloat(document.getElementById('set-protein').value) || 120;
    const fat = parseFloat(document.getElementById('set-fat').value) || 65;
    const carbs = parseFloat(document.getElementById('set-carbs').value) || 250;
    const waterRaw = document.getElementById('set-water').value.trim();
    const waterMl = waterRaw ? parseInt(waterRaw) : null;

    const fullName = document.getElementById('prof-name').value.trim() || null;
    const username = document.getElementById('prof-username').value.trim() || null;
    const heightVal = parseFloat(document.getElementById('prof-height').value);
    const weightVal = parseFloat(document.getElementById('prof-weight').value);
    const targetVal = parseFloat(document.getElementById('prof-target-weight').value);

    const birthYear = parseInt(document.getElementById('prof-birth-year').value);
    const sex = document.getElementById('prof-sex').value || null;
    const activityLevel = document.getElementById('prof-activity').value || null;
    const goalType = document.getElementById('prof-goal').value || null;

    const meResp = await api('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({
            daily_calorie_goal: cal,
            daily_protein_goal: protein,
            daily_fat_goal: fat,
            daily_carb_goal: carbs,
            full_name: fullName,
            username,
            height: isNaN(heightVal) ? null : heightVal,
            current_weight: isNaN(weightVal) ? null : weightVal,
            target_weight: isNaN(targetVal) ? null : targetVal,
            birth_year: isNaN(birthYear) ? null : birthYear,
            sex,
            activity_level: activityLevel,
            goal_type: goalType,
        })
    });
    if (meResp?.detail) { showError(meResp.detail); return; }

    await api('/water/goal', {
        method: 'PATCH',
        body: JSON.stringify({ daily_water_goal_ml: waterMl })
    });

    userGoals = { calories: cal, protein, fat, carbs };
    closeModal('profile-modal');
    loadDiary();
}


// ---- Devices ----
const PROVIDER_NAMES = {
    apple_health: 'Apple Health', google_fit: 'Google Fit', fitbit: 'Fitbit',
    garmin: 'Garmin', withings: 'Withings', samsung_health: 'Samsung Health', mi_fit: 'Mi Fit',
};
const METRIC_UNITS = {
    weight: 'кг', glucose: 'ммоль/л', blood_pressure: 'мм рт.ст.',
    heart_rate: 'уд/мин', steps: 'шагов', sleep: 'часов',
};
const METRIC_NAMES = {
    weight: 'Вес', glucose: 'Глюкоза', blood_pressure: 'Давление',
    heart_rate: 'Пульс', steps: 'Шаги', sleep: 'Сон',
};

async function loadDevices() {
    const integrations = await api('/devices') || [];
    const container = document.getElementById('devices-list');
    if (!integrations.length) {
        container.innerHTML = '<div style="color:var(--text2);font-size:13px;padding:4px 0">Нет подключённых устройств</div>';
        return;
    }
    container.innerHTML = integrations.map(d => `
        <div class="condition-row">
            <div>
                <div class="condition-name">${PROVIDER_NAMES[d.provider] || d.provider}</div>
                <div class="condition-code">${d.is_active ? 'Активно' : 'Неактивно'} · ${d.last_sync_at ? new Date(d.last_sync_at).toLocaleDateString('ru') : 'Не синхронизировано'}</div>
            </div>
            <button class="btn-delete" onclick="disconnectDevice('${d.id}')" title="Отключить">✕</button>
        </div>
    `).join('');
}

async function connectDevice() {
    const provider = document.getElementById('device-provider').value;
    if (!provider) return;
    await api('/devices', {
        method: 'POST',
        body: JSON.stringify({ provider })
    });
    document.getElementById('device-provider').value = '';
    loadDevices();
}

async function disconnectDevice(id) {
    if (!confirm('Отключить устройство?')) return;
    await api(`/devices/${id}`, { method: 'DELETE' });
    loadDevices();
}

async function addMetric() {
    const type = document.getElementById('metric-type').value;
    const value = parseFloat(document.getElementById('metric-value').value);
    if (!value && value !== 0) { alert('Введите значение'); return; }
    const unit = METRIC_UNITS[type] || '';

    await api('/devices/metrics', {
        method: 'POST',
        body: JSON.stringify({
            metrics: [{
                provider: 'manual',
                metric_type: type,
                value,
                unit,
                measured_at: new Date().toISOString(),
            }]
        })
    });
    document.getElementById('metric-value').value = '';
    alert('Записано');
}

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
    meals = await api('/meals') || [];
    const summary = await api(`/diary/summary?entry_date=${currentDate}`);
    entries = summary?.entries || [];
    renderDiary(summary);
    loadMood();
}

function renderDiary(summary) {
    document.getElementById('date-display').textContent = (typeof formatDateLocale === 'function' && currentLang !== 'ru') ? formatDateLocale(currentDate) : formatDate(currentDate);

    const cal = summary?.total_calories || 0;
    const goal = userGoals.calories;
    const pct = Math.min((cal / goal) * 100, 100);
    const circumference = 2 * Math.PI * 40;
    const offset = circumference - (pct / 100) * circumference;

    document.getElementById('cal-ring').setAttribute('stroke-dasharray', circumference);
    document.getElementById('cal-ring').setAttribute('stroke-dashoffset', offset);
    document.getElementById('cal-num').textContent = Math.round(cal);
    document.getElementById('cal-left').textContent = `${typeof t === 'function' ? t('outOf') : 'из'} ${goal}`;
    document.getElementById('cal-ring').style.stroke = pct >= 100 ? 'var(--red)' : 'var(--accent)';

    const prot = Math.round(summary?.total_protein || 0);
    const fatVal = Math.round(summary?.total_fat || 0);
    const carbsVal = Math.round(summary?.total_carbohydrates || 0);
    document.getElementById('protein-val').textContent = prot + 'г';
    document.getElementById('fat-val').textContent = fatVal + 'г';
    document.getElementById('carbs-val').textContent = carbsVal + 'г';

    // Update macro bars
    document.querySelector('.macro-protein .macro-fill').style.width = Math.min(prot / userGoals.protein * 100, 100) + '%';
    document.querySelector('.macro-fat .macro-fill').style.width = Math.min(fatVal / userGoals.fat * 100, 100) + '%';
    document.querySelector('.macro-carbs .macro-fill').style.width = Math.min(carbsVal / userGoals.carbs * 100, 100) + '%';

    const container = document.getElementById('meals-container');
    container.innerHTML = '';

    for (const meal of meals) {
        const mealEntries = entries.filter(e => e.meal_id === meal.id);
        const mealCal = mealEntries.reduce((s, e) => s + (e.calories || 0), 0);

        const section = document.createElement('div');
        section.className = 'card meal-section';
        section.innerHTML = `
            <div class="meal-header">
                <span><span class="meal-icon">${meal.icon || '🍽'}</span><span class="meal-name">${typeof trMeal === "function" ? trMeal(meal.name) : meal.name}</span></span>
                <span class="meal-cal">${mealCal ? Math.round(mealCal) + ' ккал' : ''}</span>
            </div>
            <div class="meal-entries">
                ${mealEntries.map(e => `
                    <div class="entry-row" id="entry-${e.id}">
                        <div class="entry-info" onclick="editEntry('${e.id}', ${e.serving_amount}, '${e.product_name.replace(/'/g, "\\'")}')">
                            <div class="entry-name">${e.product_name}</div>
                            <div class="entry-weight">${e.serving_amount}г · Б${Math.round(e.protein)} Ж${Math.round(e.fat)} У${Math.round(e.carbohydrates)}</div>
                        </div>
                        <div class="entry-right">
                            <span class="entry-cal">${Math.round(e.calories)} ккал</span>
                            <button class="btn-delete" onclick="deleteEntry('${e.id}')" title="Удалить">✕</button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div style="display:flex;gap:6px">
                <div class="add-btn" style="flex:1" onclick="openAddFood('${meal.id}')">+ ${typeof t === 'function' ? t('add').replace(/^\+ /, '') : 'Добавить'}</div>
                <div class="add-btn" style="flex:0;padding:10px 12px;font-size:16px" onclick="openTemplates('${meal.id}')" title="Шаблоны">📂</div>
                <div class="add-btn" style="flex:0;padding:10px 12px;font-size:16px" onclick="saveTemplate('${meal.id}')" title="Сохранить как шаблон">💾</div>
                <div class="add-btn" style="flex:0;padding:10px 12px;font-size:16px" onclick="copyMeal('${meal.id}', '${currentDate}')" title="Повторить вчера">📋</div>
            </div>
        `;
        container.appendChild(section);
    }
    renderWater();
}

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

// ---- Add Food Modal ----
function openAddFood(mealId) {
    selectedMealId = mealId;
    document.getElementById('add-food-modal').classList.add('active');
    document.getElementById('food-search').value = '';
    document.getElementById('food-category-filter').value = '';
    document.getElementById('food-sort').value = '';

    const container = document.getElementById('search-results');
    let html = '';

    // Recent products (from diary entries)
    const recent = getRecentProducts();
    if (recent.length) {
        html += '<div class="card-title" style="padding:8px 0 4px;font-size:11px">🕐 Недавние</div>';
        html += recent.map(p => `
            <div class="product-row" role="button" tabindex="0" onkeydown='if(event.key==="Enter"||event.key===" "){event.preventDefault();event.currentTarget.click();}' onclick='selectProduct(${JSON.stringify(p).replace(/'/g, "&#39;")})'>
                <div>
                    <div class="p-name">${p.name}</div>
                    <div class="p-brand">${p.brand || ''} · ${p.serving_size || 100}${p.serving_unit || 'g'}</div>
                </div>
                <div class="p-cal">${p.calories ? Math.round(p.calories) + ' ' + (typeof t === 'function' ? t('kcalShort') : 'ккал') : '—'}</div>
            </div>
        `).join('');
    }

    // Favorites
    const favs = getFavorites();
    if (favs.length) {
        html += '<div class="card-title" style="padding:8px 0 4px;font-size:11px">⭐ Избранное</div>';
        html += favs.map(p => `
            <div class="product-row" role="button" tabindex="0" onkeydown='if(event.key==="Enter"||event.key===" "){event.preventDefault();event.currentTarget.click();}' onclick='selectProduct(${JSON.stringify(p).replace(/'/g, "&#39;")})'>
                <div>
                    <div class="p-name">⭐ ${p.name}${p.source === 'openfoodfacts' ? ' 🌐' : ''}</div>
                    <div class="p-brand">${p.brand || ''} · ${p.serving_size || 100}${p.serving_unit || 'g'}</div>
                </div>
                <div class="p-cal">${p.calories ? Math.round(p.calories) + ' ' + (typeof t === 'function' ? t('kcalShort') : 'ккал') : '—'}</div>
            </div>
        `).join('');
    }

    container.innerHTML = html;
    document.getElementById('food-search').focus();
}

function getRecentProducts() {
    const stored = JSON.parse(localStorage.getItem('recentProducts') || '[]');
    return stored.slice(0, 8);
}

function addToRecent(product) {
    let recent = JSON.parse(localStorage.getItem('recentProducts') || '[]');
    // Remove duplicate
    recent = recent.filter(p => p.id !== product.id);
    recent.unshift({
        id: product.id, name: product.name, calories: product.calories,
        protein: product.protein, fat: product.fat, carbohydrates: product.carbohydrates,
        serving_size: product.serving_size, serving_unit: product.serving_unit,
        brand: product.brand, source: product.source,
    });
    if (recent.length > 20) recent = recent.slice(0, 20);
    localStorage.setItem('recentProducts', JSON.stringify(recent));
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

let searchTimeout;
function onFoodSearch(e) {
    clearTimeout(searchTimeout);
    const q = e.target.value.trim();
    if (q.length < 2) { document.getElementById('search-results').innerHTML = ''; return; }
    searchTimeout = setTimeout(() => applyFoodFilter(), 300);
}

function applyFoodFilter() {
    const q = document.getElementById('food-search').value.trim();
    const category = document.getElementById('food-category-filter').value;
    const sort = document.getElementById('food-sort').value;
    if (q.length < 2 && !category) { document.getElementById('search-results').innerHTML = ''; return; }
    searchProducts(q, category, sort);
}

async function searchProducts(q, category, sort) {
    let url = `/products?limit=30`;
    if (q) url += `&q=${encodeURIComponent(q)}`;
    if (category) url += `&category=${encodeURIComponent(category)}`;
    const products = await api(url);
    if (!products) return;

    // Client-side sort
    if (sort === 'calories_asc') products.sort((a, b) => (a.calories || 0) - (b.calories || 0));
    else if (sort === 'calories_desc') products.sort((a, b) => (b.calories || 0) - (a.calories || 0));
    else if (sort === 'protein_desc') products.sort((a, b) => (b.protein || 0) - (a.protein || 0));
    const container = document.getElementById('search-results');
    if (!products?.length) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text2)">Ничего не найдено</div>';
        return;
    }
    container.innerHTML = products.map(p => `
        <div class="product-row" style="display:flex;align-items:center;gap:6px">
            <div role="button" tabindex="0" style="flex:1;cursor:pointer" onclick='selectProduct(${JSON.stringify(p).replace(/'/g, "&#39;")})' onkeydown='if(event.key==="Enter"||event.key===" "){event.preventDefault();selectProduct(${JSON.stringify(p).replace(/'/g, "&#39;")});}'>
                <div class="p-name">${p.name}${p.is_verified ? ' ✓' : ''}${p.source === 'openfoodfacts' ? ' 🌐' : ''}</div>
                <div class="p-brand">${p.brand || ''} · ${p.serving_size}${p.serving_unit}</div>
            </div>
            <div class="p-cal" style="min-width:60px;text-align:right">${p.calories ? Math.round(p.calories) + ' ' + (typeof t === 'function' ? t('kcalShort') : 'ккал') : '—'}</div>
            <button class="btn-icon" aria-label="Добавить к сравнению" onclick='addToCompare(${JSON.stringify(p).replace(/'/g, "&#39;")})' title="Сравнить">⚖️</button>
            <button class="btn-icon" aria-label="Найти замены" onclick='openAlternatives("${p.id}", ${JSON.stringify(p.name)})' title="Замены">🔄</button>
        </div>
    `).join('');
    // Floating Compare button (visible when >=2 in list)
    if (_compareList && _compareList.length >= 2) {
        const fab = document.getElementById('compare-fab') || (() => {
            const el = document.createElement('button');
            el.id = 'compare-fab';
            el.className = 'btn btn-primary';
            el.style.cssText = 'position:fixed;bottom:80px;right:16px;z-index:1000;border-radius:24px;padding:10px 16px;box-shadow:0 4px 12px rgba(0,0,0,0.3)';
            el.onclick = openCompare;
            document.body.appendChild(el);
            return el;
        })();
        fab.textContent = '⚖️ ' + (typeof t === 'function' ? t('compare') : 'Сравнить') + ' (' + _compareList.length + ')';
        fab.style.display = '';
    } else {
        const fab = document.getElementById('compare-fab');
        if (fab) fab.style.display = 'none';
    }
}

// ---- Barcode ----
let barcodeScanner = null;
let scannerActive = false;

async function searchBarcode() {
    const code = document.getElementById('barcode-input').value.trim();
    if (!code) return;
    document.getElementById('barcode-status').textContent = 'Ищу...';
    const product = await api(`/barcode/${code}`);
    if (product?.id) {
        document.getElementById('barcode-status').textContent = '';
        closeBarcodeModal();
        selectProduct(product);
    } else {
        document.getElementById('barcode-status').textContent = 'Продукт не найден';
    }
}

function openBarcode(mealId) {
    selectedMealId = mealId;
    document.getElementById('barcode-modal').classList.add('active');
    document.getElementById('barcode-input').value = '';
    document.getElementById('barcode-status').textContent = '';
    document.getElementById('barcode-scanner-area').classList.add('hidden');
    scannerActive = false;
    document.getElementById('scan-toggle-btn').textContent = '📷 Сканировать';
    document.getElementById('barcode-input').focus();
}

function closeBarcodeModal() {
    stopBarcodeScanner();
    closeModal('barcode-modal');
}

let nativeScannerStream = null;
let nativeScannerLoopRunning = false;

async function listVideoDevices() {
    try {
        // First request a generic stream to unlock device labels (Chrome hides them otherwise)
        const tmp = await navigator.mediaDevices.getUserMedia({ video: true });
        tmp.getTracks().forEach(t => t.stop());
    } catch(e) {}
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter(d => d.kind === 'videoinput');
}

async function pickCameraByLabel(devices) {
    // Heuristic: pick the back/main color camera, NOT depth/mono/wide/macro
    const saved = localStorage.getItem('preferred_camera_id');
    if (saved && devices.some(d => d.deviceId === saved)) return saved;
    const bad = /(depth|mono|monochrome|ir|infrared|wide|ultra|macro|telephoto)/i;
    const goodBack = devices.find(d => /(back|rear|environment|world)/i.test(d.label) && !bad.test(d.label));
    if (goodBack) return goodBack.deviceId;
    const anyBack = devices.find(d => /(back|rear|environment)/i.test(d.label));
    if (anyBack) return anyBack.deviceId;
    return devices[devices.length - 1]?.deviceId;
}

async function startNativeBarcodeScanner(onFound, onError) {
    const reader = document.getElementById('barcode-reader');
    const devices = await listVideoDevices();
    const selectedId = await pickCameraByLabel(devices);

    // Always show a small info bar — how many cameras detected + selector
    let selectorHtml = '<div style="background:var(--bg3);border-radius:8px;padding:8px 10px;margin-bottom:8px;font-size:12px;color:var(--text2)">';
    if (devices.length === 0) {
        selectorHtml += 'Камер не найдено (попробуй разрешение доступа).';
    } else {
        selectorHtml += `Найдено камер: <b style="color:var(--text)">${devices.length}</b>`;
        selectorHtml += '<select id="bc-camera-select" style="width:100%;padding:8px;margin-top:6px;background:var(--bg2);color:var(--text);border:1px solid var(--border);border-radius:6px;font-size:13px">' +
            devices.map((d, i) => `<option value="${d.deviceId}" ${d.deviceId===selectedId?'selected':''}>${i+1}. ${(d.label||'Camera ' + (i+1)).slice(0,60)}</option>`).join('') +
            '</select>';
    }
    selectorHtml += '</div>';
    reader.innerHTML =
        '<video id="bc-video" playsinline muted autoplay style="width:100%;max-height:40vh;display:block;background:#000;border-radius:8px;object-fit:cover"></video>';
    const info = document.getElementById('barcode-camera-info');
    if (info) info.innerHTML = selectorHtml;
    const video = document.getElementById('bc-video');

    if (devices.length > 1) {
        document.getElementById('bc-camera-select').onchange = async (e) => {
            localStorage.setItem('preferred_camera_id', e.target.value);
            stopNativeBarcodeScanner();
            startNativeBarcodeScanner(onFound, onError);
        };
    }

    try {
        const constraints = selectedId
            ? { deviceId: { exact: selectedId } }
            : { facingMode: { ideal: 'environment' } };
        Object.assign(constraints, {
            width:  { ideal: 1920 },
            height: { ideal: 1080 },
            focusMode: 'continuous',
            advanced: [{ focusMode: 'continuous' }],
        });
        nativeScannerStream = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
        video.srcObject = nativeScannerStream;
        await video.play();
        // Try continuous focus / torch via track constraints
        const track = nativeScannerStream.getVideoTracks()[0];
        try { await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch(e){}

        const detector = new BarcodeDetector({
            formats: ['ean_13','ean_8','upc_a','upc_e','code_128','code_39','itf']
        });
        nativeScannerLoopRunning = true;
        const loop = async () => {
            if (!nativeScannerLoopRunning) return;
            try {
                const codes = await detector.detect(video);
                if (codes && codes.length) {
                    onFound(codes[0].rawValue);
                    return;
                }
            } catch(e) { /* one-off detect error — keep looping */ }
            requestAnimationFrame(loop);
        };
        loop();
    } catch (e) {
        onError && onError(e);
    }
}

function stopNativeBarcodeScanner() {
    nativeScannerLoopRunning = false;
    if (nativeScannerStream) {
        nativeScannerStream.getTracks().forEach(t => t.stop());
        nativeScannerStream = null;
    }
}

async function toggleBarcodeScanner() {
    const area = document.getElementById('barcode-scanner-area');
    const btn = document.getElementById('scan-toggle-btn');

    if (scannerActive) {
        stopBarcodeScanner();
        area.classList.add('hidden');
        btn.textContent = '📷 Сканировать';
        scannerActive = false;
        return;
    }

    area.classList.remove('hidden');
    btn.textContent = '⏹ Остановить';
    scannerActive = true;

    // Prefer native BarcodeDetector — colour preview, GPU-accelerated, autofocus
    if ('BarcodeDetector' in window) {
        await startNativeBarcodeScanner(
            (code) => {
                stopNativeBarcodeScanner();
                document.getElementById('barcode-input').value = code;
                area.classList.add('hidden');
                btn.textContent = '📷 Сканировать';
                scannerActive = false;
                searchBarcode();
            },
            (err) => {
                area.classList.add('hidden');
                btn.textContent = '📷 Сканировать';
                scannerActive = false;
                document.getElementById('barcode-status').textContent = 'Камера недоступна: ' + (err && err.name || 'error');
            }
        );
        return;
    }

    // Fallback: html5-qrcode for Safari / older browsers
    if (!barcodeScanner) {
        barcodeScanner = new Html5Qrcode('barcode-reader');
    }

    try {
        // Adaptive qrbox: 70% of available width, 28% height
        const vw = Math.min(window.innerWidth - 40, 480);
        const qrbox = { width: Math.floor(vw * 0.7), height: Math.floor(vw * 0.28) };

        await barcodeScanner.start(
            {
                facingMode: { ideal: 'environment' },
                // Prefer high resolution for sharp barcodes
                width:  { ideal: 1920 },
                height: { ideal: 1080 },
                // Continuous autofocus where supported (Android Chrome)
                focusMode: 'continuous',
                advanced: [{ focusMode: 'continuous' }, { zoom: 1.0 }],
            },
            {
                fps: 15,
                qrbox,
                aspectRatio: 1.5,
                // Native BarcodeDetector (Chrome/Edge) — colour preview + HW accel
                experimentalFeatures: { useBarCodeDetectorIfSupported: true },
                rememberLastUsedCamera: true,
                showTorchButtonIfSupported: true,
                showZoomSliderIfSupported: true,
                formatsToSupport: [
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.EAN_8,
                    Html5QrcodeSupportedFormats.UPC_A,
                    Html5QrcodeSupportedFormats.UPC_E,
                    Html5QrcodeSupportedFormats.CODE_128,
                    Html5QrcodeSupportedFormats.CODE_39,
                ],
            },
            (code) => {
                document.getElementById('barcode-input').value = code;
                stopBarcodeScanner();
                area.classList.add('hidden');
                btn.textContent = '📷 Сканировать';
                scannerActive = false;
                searchBarcode();
            },
            () => {}
        );
    } catch (err) {
        area.classList.add('hidden');
        btn.textContent = '📷 Сканировать';
        scannerActive = false;
        document.getElementById('barcode-status').textContent = 'Камера недоступна';
    }
}

function stopBarcodeScanner() {
    if (typeof stopNativeBarcodeScanner === 'function') stopNativeBarcodeScanner();
    if (barcodeScanner && scannerActive) {
        barcodeScanner.stop().catch(() => {});
    }
    scannerActive = false;
}


// ---- Create Custom Product ----
let recipeIngredients = [];
let createMode = 'manual';

function openCreateProduct() {
    setTimeout(() => renderSavedRecipes(), 100);
    document.getElementById('create-product-modal').classList.add('active');
    document.getElementById('cp-name').value = '';
    document.getElementById('cp-category').value = 'Готовые блюда';
    document.getElementById('cp-cal').value = '';
    document.getElementById('cp-protein').value = '';
    document.getElementById('cp-fat').value = '';
    document.getElementById('cp-carbs').value = '';
    recipeIngredients = [];
    setCreateMode('manual');
    document.getElementById('cp-name').focus();
}

function setCreateMode(mode) {
    createMode = mode;
    document.getElementById('cp-manual-mode').classList.toggle('hidden', mode !== 'manual');
    document.getElementById('cp-recipe-mode').classList.toggle('hidden', mode !== 'recipe');
    document.getElementById('mode-manual-btn').classList.toggle('active', mode === 'manual');
    document.getElementById('mode-recipe-btn').classList.toggle('active', mode === 'recipe');
}

// Recipe ingredient search
let recipeSearchTimeout;
function onRecipeSearch(e) {
    clearTimeout(recipeSearchTimeout);
    const q = e.target.value.trim();
    if (q.length < 2) { document.getElementById('recipe-search-results').innerHTML = ''; return; }
    recipeSearchTimeout = setTimeout(() => searchRecipeIngredients(q), 300);
}

async function searchRecipeIngredients(q) {
    const products = await api(`/products?q=${encodeURIComponent(q)}&limit=10`);
    const container = document.getElementById('recipe-search-results');
    if (!products?.length) {
        container.innerHTML = '<div style="padding:10px;text-align:center;color:var(--text2);font-size:13px">Не найдено</div>';
        return;
    }
    container.innerHTML = products.map(p => `
        <div class="product-row" role="button" tabindex="0" onkeydown='if(event.key==="Enter"||event.key===" "){event.preventDefault();event.currentTarget.click();}' onclick='addRecipeIngredient(${JSON.stringify(p).replace(/'/g, "&#39;")})'>
            <div>
                <div class="p-name" style="font-size:13px">${p.name}</div>
                <div class="p-brand" style="font-size:11px">${p.calories ? Math.round(p.calories) + ' ' + (typeof t === 'function' ? t('kcalPer100g') : 'ккал/100г') : ''}</div>
            </div>
        </div>
    `).join('');
}

function addRecipeIngredient(product) {
    recipeIngredients.push({ ...product, amount: 100 });
    document.getElementById('recipe-search-results').innerHTML = '';
    document.getElementById('recipe-ingredient-search').value = '';
    renderRecipeIngredients();
}

function removeRecipeIngredient(idx) {
    recipeIngredients.splice(idx, 1);
    renderRecipeIngredients();
}

function updateRecipeAmount(idx, val) {
    recipeIngredients[idx].amount = parseFloat(val) || 0;
    updateRecipeTotals();
}

function renderRecipeIngredients() {
    const container = document.getElementById('recipe-ingredients-list');
    if (!recipeIngredients.length) {
        container.innerHTML = '';
        document.getElementById('recipe-totals').classList.add('hidden');
        return;
    }

    container.innerHTML = recipeIngredients.map((ing, i) => {
        const cal = Math.round((ing.calories || 0) * ing.amount / 100);
        return `<div class="recipe-ingredient">
            <div class="recipe-ing-name">${ing.name}</div>
            <div class="recipe-ing-weight">
                <input type="number" value="${ing.amount}" min="1" oninput="updateRecipeAmount(${i}, this.value)">
            </div>
            <div class="recipe-ing-cal">${cal} ккал</div>
            <button class="recipe-ing-del" onclick="removeRecipeIngredient(${i})">✕</button>
        </div>`;
    }).join('');

    updateRecipeTotals();
}

function updateRecipeTotals() {
    if (!recipeIngredients.length) return;

    let totalWeight = 0, totalCal = 0, totalP = 0, totalF = 0, totalC = 0;

    for (const ing of recipeIngredients) {
        const factor = ing.amount / 100;
        totalWeight += ing.amount;
        totalCal += (ing.calories || 0) * factor;
        totalP += (ing.protein || 0) * factor;
        totalF += (ing.fat || 0) * factor;
        totalC += (ing.carbohydrates || 0) * factor;
    }

    // Per 100g
    const per100 = totalWeight > 0 ? 100 / totalWeight : 0;

    const portions = parseInt(document.getElementById('recipe-portions')?.value) || 1;
    const perPortion = totalWeight > 0 ? 1 / portions : 0;

    document.getElementById('recipe-totals').classList.remove('hidden');
    document.getElementById('recipe-total-weight').textContent = Math.round(totalWeight) + 'г всего (' + Math.round(totalWeight / portions) + 'г/порция)';
    document.getElementById('recipe-total-cal').textContent = Math.round(totalCal * per100) + ' ккал/100г · ' + Math.round(totalCal * perPortion) + ' ккал/порция';
    document.getElementById('recipe-total-p').textContent = Math.round(totalP * per100) + 'г/100г · ' + Math.round(totalP * perPortion) + 'г/порция';
    document.getElementById('recipe-total-f').textContent = Math.round(totalF * per100) + 'г/100г · ' + Math.round(totalF * perPortion) + 'г/порция';
    document.getElementById('recipe-total-c').textContent = Math.round(totalC * per100) + 'г/100г · ' + Math.round(totalC * perPortion) + 'г/порция';
}

async function createCustomProduct() {
    const name = document.getElementById('cp-name').value.trim();
    if (!name) { alert('Введите название'); return; }

    let cal = 0, protein = 0, fat = 0, carbs = 0;

    if (createMode === 'recipe') {
        if (!recipeIngredients.length) { alert('Добавьте ингредиенты'); return; }
        let totalWeight = 0;
        for (const ing of recipeIngredients) {
            const factor = ing.amount / 100;
            totalWeight += ing.amount;
            cal += (ing.calories || 0) * factor;
            protein += (ing.protein || 0) * factor;
            fat += (ing.fat || 0) * factor;
            carbs += (ing.carbohydrates || 0) * factor;
        }
        const per100 = totalWeight > 0 ? 100 / totalWeight : 0;
        cal = Math.round(cal * per100 * 10) / 10;
        protein = Math.round(protein * per100 * 10) / 10;
        fat = Math.round(fat * per100 * 10) / 10;
        carbs = Math.round(carbs * per100 * 10) / 10;
    } else {
        cal = parseFloat(document.getElementById('cp-cal').value) || 0;
        protein = parseFloat(document.getElementById('cp-protein').value) || 0;
        fat = parseFloat(document.getElementById('cp-fat').value) || 0;
        carbs = parseFloat(document.getElementById('cp-carbs').value) || 0;
    }

    const product = await api('/products', {
        method: 'POST',
        body: JSON.stringify({
            name,
            category: document.getElementById('cp-category').value || null,
            calories: cal,
            protein,
            fat,
            carbohydrates: carbs,
        })
    });

    if (product?.id) {
        closeModal('create-product-modal');
        selectProduct(product);
    } else {
        alert('Ошибка создания продукта');
    }
}

// ---- Food Photo Scan ----
function openFoodScan() {
    document.getElementById('food-scan-modal').classList.add('active');
    document.getElementById('scan-preview').classList.add('hidden');
    document.getElementById('scan-results').classList.add('hidden');
    document.getElementById('scan-status').textContent = '';
    document.getElementById('food-photo-input').value = '';
}

async function onFoodPhotoSelected(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Show preview
    const preview = document.getElementById('scan-preview');
    const img = document.getElementById('scan-preview-img');
    img.src = URL.createObjectURL(file);
    preview.classList.remove('hidden');

    // Upload
    document.getElementById('scan-status').textContent = 'Распознаю...';
    document.getElementById('scan-results').classList.add('hidden');

    const formData = new FormData();
    formData.append('file', file);

    try {
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const _quality = localStorage.getItem('ai_quality') || 'fast';
        const resp = await fetch(`/api/v1/food-scan?quality=${_quality}`, {
            method: 'POST',
            headers,
            body: formData,
        });

        if (resp.status === 401) { logout(); return; }
        const data = await resp.json();
        if (typeof awardFeature === "function") awardFeature("photo");

        if (data.error && !data.foods?.length) {
            document.getElementById('scan-status').textContent = data.error === 'No food recognition provider available'
                ? 'Сервис распознавания недоступен (нужен API ключ)'
                : 'Ошибка: ' + data.error;
            return;
        }

        document.getElementById('scan-status').textContent = data.description || '';
        renderScanResults(data.foods || []);
    } catch (err) {
        document.getElementById('scan-status').textContent = 'Ошибка загрузки';
    }
}

function renderScanResults(foods) {
    const container = document.getElementById('scan-foods-list');
    const results = document.getElementById('scan-results');

    if (!foods.length) {
        results.classList.add('hidden');
        return;
    }

    results.classList.remove('hidden');
    container.innerHTML = foods.map((f, i) => {
        const conf = f.confidence ? Math.round(f.confidence * 100) : null;
        return `<div class="scan-food-item">
            <div class="scan-food-info">
                <div class="scan-food-name">${f.name || f.name_en}</div>
                <div class="scan-food-detail">~${f.estimated_weight_g || 100}г · ${Math.round(f.calories || 0)} ккал · Б${Math.round(f.protein || 0)} Ж${Math.round(f.fat || 0)} У${Math.round(f.carbohydrates || 0)}</div>
            </div>
            ${conf ? `<span class="scan-food-confidence">${conf}%</span>` : ''}
            <div class="scan-food-add">
                <button class="btn btn-primary" style="padding:6px 12px;font-size:13px" onclick='addScannedFood(${JSON.stringify(f).replace(/'/g, "&#39;")})'>+</button>
            </div>
        </div>`;
    }).join('');
}

function addScannedFood(food) {
    // Create a product-like object for the portion modal
    const product = {
        name: food.name || food.name_en,
        calories: food.calories ? (food.calories / (food.estimated_weight_g || 100)) * 100 : 0,
        protein: food.protein ? (food.protein / (food.estimated_weight_g || 100)) * 100 : 0,
        fat: food.fat ? (food.fat / (food.estimated_weight_g || 100)) * 100 : 0,
        carbohydrates: food.carbohydrates ? (food.carbohydrates / (food.estimated_weight_g || 100)) * 100 : 0,
        serving_size: 100,
        serving_unit: 'g',
    };

    // First create product in DB, then open portion modal
    createAndSelectScannedProduct(product, food.estimated_weight_g || 100);
}

async function createAndSelectScannedProduct(product, defaultWeight) {
    const created = await api('/products', {
        method: 'POST',
        body: JSON.stringify({
            name: product.name,
            category: 'Готовые блюда',
            calories: Math.round(product.calories * 10) / 10,
            protein: Math.round(product.protein * 10) / 10,
            fat: Math.round(product.fat * 10) / 10,
            carbohydrates: Math.round(product.carbohydrates * 10) / 10,
        })
    });

    if (created?.id) {
        closeModal('food-scan-modal');
        selectProduct(created);
        // Set default weight from AI estimate
        document.getElementById('portion-amount').value = defaultWeight;
        updatePortionCalc();
    }
}

// ---- Favorites ----
function toggleFavFromPortion() {
    const p = window._selectedProduct;
    if (!p?.id) return;
    toggleFavorite(p);
    const favStar = isFavorite(p.id) ? '★' : '☆';
    document.getElementById('portion-product-name').innerHTML = p.name +
        ` <span class="fav-btn" onclick="toggleFavFromPortion()" style="cursor:pointer;color:var(--orange)">${favStar}</span>`;
}

function getFavorites() {
    return JSON.parse(localStorage.getItem('favorites') || '[]');
}

function toggleFavorite(product) {
    let favs = getFavorites();
    const idx = favs.findIndex(f => f.id === product.id);
    if (idx >= 0) {
        favs.splice(idx, 1);
    } else {
        favs.unshift({ id: product.id, name: product.name, calories: product.calories, protein: product.protein, fat: product.fat, carbohydrates: product.carbohydrates, serving_size: product.serving_size, serving_unit: product.serving_unit, brand: product.brand, is_verified: product.is_verified });
        if (favs.length > 20) favs.pop();
    }
    localStorage.setItem('favorites', JSON.stringify(favs));
}

function isFavorite(productId) {
    return getFavorites().some(f => f.id === productId);
}

// ---- Copy Meal ----
async function copyMeal(mealId, fromDate) {
    const prevDate = new Date(fromDate);
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = prevDate.toISOString().slice(0, 10);

    const summary = await api(`/diary/summary?entry_date=${prevDateStr}`);
    const prevEntries = (summary?.entries || []).filter(e => e.meal_id === mealId);

    if (!prevEntries.length) {
        alert('Вчера в этом приёме пищи ничего не было');
        return;
    }

    for (const e of prevEntries) {
        await apiQueued('/diary', {
            method: 'POST',
            body: JSON.stringify({
                meal_id: mealId,
                product_id: e.product_id,
                entry_date: currentDate,
                product_name: e.product_name,
                serving_amount: e.serving_amount,
                calories: e.calories,
                protein: e.protein,
                fat: e.fat,
                carbohydrates: e.carbohydrates,
            })
        });
    }
    loadDiary();
}


// ---- Meal Templates ----
function getTemplates() {
    return JSON.parse(localStorage.getItem('mealTemplates') || '[]');
}

function saveTemplate(mealId) {
    const meal = meals.find(m => m.id === mealId);
    if (!meal) return;
    const mealEntries = entries.filter(e => e.meal_id === mealId);
    if (!mealEntries.length) {
        alert('Нет записей для сохранения');
        return;
    }
    const name = prompt('Название шаблона:', meal.name + ' — ' + new Date().toLocaleDateString('ru'));
    if (!name) return;

    const templates = getTemplates();
    templates.push({
        id: Date.now().toString(),
        name: name,
        items: mealEntries.map(e => ({
            product_id: e.product_id,
            product_name: e.product_name,
            serving_amount: e.serving_amount,
            calories: e.calories,
            protein: e.protein,
            fat: e.fat,
            carbohydrates: e.carbohydrates,
        }))
    });
    localStorage.setItem('mealTemplates', JSON.stringify(templates));
    alert('Шаблон сохранён: ' + name);
}

function openTemplates(mealId) {
    const templates = getTemplates();
    if (!templates.length) {
        alert('Нет сохранённых шаблонов. Сначала добавьте еду и нажмите 💾');
        return;
    }
    window._templateMealId = mealId;
    const list = document.getElementById('template-list');
    list.innerHTML = templates.map(t => `
        <div class="product-row" style="cursor:pointer">
            <div style="flex:1" onclick="applyTemplate('${t.id}')">
                <div class="p-name">${t.name}</div>
                <div class="p-brand">${t.items.length} продукт(ов) · ${Math.round(t.items.reduce((s,i) => s + i.calories, 0))} ккал</div>
            </div>
            <button class="btn-delete" onclick="deleteTemplate('${t.id}')" title="Удалить">✕</button>
        </div>
    `).join('');
    document.getElementById('template-modal').classList.add('active');
}

async function applyTemplate(templateId) {
    const templates = getTemplates();
    const tmpl = templates.find(t => t.id === templateId);
    if (!tmpl) return;
    const mealId = window._templateMealId;

    for (const item of tmpl.items) {
        await apiQueued('/diary', {
            method: 'POST',
            body: JSON.stringify({
                meal_id: mealId,
                product_id: item.product_id,
                entry_date: currentDate,
                product_name: item.product_name,
                serving_amount: item.serving_amount,
                calories: item.calories,
                protein: item.protein,
                fat: item.fat,
                carbohydrates: item.carbohydrates,
            })
        });
    }
    closeModal('template-modal');
    loadDiary();
}

function deleteTemplate(templateId) {
    if (!confirm('Удалить шаблон?')) return;
    const templates = getTemplates().filter(t => t.id !== templateId);
    localStorage.setItem('mealTemplates', JSON.stringify(templates));
    openTemplates(window._templateMealId);
}

// ---- Portion ----
function selectProduct(product) {
    window._lastSelectedProduct = product;
    closeModal('add-food-modal');
    closeModal('barcode-modal');
    document.getElementById('portion-modal').classList.add('active');
    const favStar = product.id && isFavorite(product.id) ? '★' : '☆';
    document.getElementById('portion-product-name').innerHTML = product.name +
        (product.id ? ` <span class="fav-btn" onclick="toggleFavFromPortion()" style="cursor:pointer;color:var(--orange)">${favStar}</span>` : '');
    document.getElementById('portion-amount').value = 100;
    window._selectedProduct = product;
    updatePortionCalc();
}

function updatePortionCalc() {
    const p = window._selectedProduct;
    const amount = parseFloat(document.getElementById('portion-amount').value) || 0;
    const factor = amount / 100;
    document.getElementById('portion-cal').textContent = Math.round((p.calories || 0) * factor);
    document.getElementById('portion-protein').textContent = Math.round((p.protein || 0) * factor) + 'г';
    document.getElementById('portion-fat').textContent = Math.round((p.fat || 0) * factor) + 'г';
    document.getElementById('portion-carbs').textContent = Math.round((p.carbohydrates || 0) * factor) + 'г';
}

async function addToDiary() {
    const p = window._selectedProduct;
    const amount = parseFloat(document.getElementById('portion-amount').value) || 100;
    const factor = amount / 100;

    await apiQueued('/diary', {
        method: 'POST',
        body: JSON.stringify({
            meal_id: selectedMealId,
            product_id: p.id,
            entry_date: currentDate,
            product_name: p.name,
            serving_amount: amount,
            calories: (p.calories || 0) * factor,
            protein: (p.protein || 0) * factor,
            fat: (p.fat || 0) * factor,
            carbohydrates: (p.carbohydrates || 0) * factor,
        })
    });

    closeModal('portion-modal');
    if (typeof showToast === 'function') showToast(typeof t === 'function' ? (navigator.onLine ? t('addedSynced') : t('addedOffline')) : 'Добавлено');
    loadDiary();
    if (typeof checkAchievementsAfterAction === 'function') setTimeout(checkAchievementsAfterAction, 400);
}

// ---- Nutrients ----
async function loadNutrients() {
    const container = document.getElementById('nutrients-content');
    setTimeout(() => { if (typeof injectDeficiencyWidget === 'function') injectDeficiencyWidget(); }, 600);
    container.innerHTML = '<div class="card" style="text-align:center;padding:20px;color:var(--text2)">' + (typeof t === 'function' ? t('loading') : 'Загрузка...') + '</div>';

    const data = await api(`/nutrients/daily?entry_date=${currentDate}`);
    if (!data) { container.innerHTML = '<div class="card" style="padding:20px;color:var(--text2)">' + (typeof t === 'function' ? t('loadError') : 'Ошибка загрузки') + '</div>'; return; }

    const macros = data.macros || {};
    const nutrients = data.nutrients || {};
    const vitamins = Object.entries(nutrients.vitamins || {});
    const minerals = Object.entries(nutrients.minerals || {});

    function nutrientName(key) {
        const names = {
            vitamin_a: 'Вит. A', vitamin_b1: 'Вит. B1', vitamin_b2: 'Вит. B2',
            vitamin_b3: 'Вит. B3', vitamin_b5: 'Вит. B5', vitamin_b6: 'Вит. B6',
            vitamin_b9: 'Вит. B9', vitamin_b12: 'Вит. B12', vitamin_c: 'Вит. C',
            vitamin_d: 'Вит. D', vitamin_e: 'Вит. E', vitamin_k: 'Вит. K',
            calcium: 'Кальций', iron: 'Железо', magnesium: 'Магний',
            phosphorus: 'Фосфор', potassium: 'Калий', sodium: 'Натрий',
            zinc: 'Цинк', selenium: 'Селен', iodine: 'Йод',
        };
        return names[key] || key;
    }

    function nutrientBar(key, item) {
        const pct = Math.min(item.percent || 0, 100);
        const color = pct >= 80 ? 'var(--green)' : pct >= 40 ? 'var(--orange)' : 'var(--red)';
        return `<div class="nutrient-row">
            <div class="nutrient-info"><span class="nutrient-name">${nutrientName(key)}</span><span class="nutrient-val">${item.amount.toFixed(1)} · ${Math.round(item.percent)}%</span></div>
            <div class="nutrient-bar"><div class="nutrient-fill" style="width:${pct}%;background:${color}"></div></div>
        </div>`;
    }

    container.innerHTML = `
        <div class="date-nav" style="margin-bottom:16px">
            <button class="btn-icon" onclick="changeNutrientDate(-1)">◀</button>
            <span class="date-text">${formatDate(currentDate)}</span>
            <button class="btn-icon" onclick="changeNutrientDate(1)">▶</button>
        </div>
        <div class="card">
            <div class="card-title">Макронутриенты</div>
            <div class="macros" style="flex-direction:row;justify-content:space-around">
                <div class="macro" style="text-align:center"><div class="macro-value">${Math.round(macros.calories || 0)}</div><div class="macro-label">ккал</div></div>
                <div class="macro macro-protein" style="text-align:center"><div class="macro-value">${Math.round(macros.protein || 0)}г</div><div class="macro-label">белки</div></div>
                <div class="macro macro-fat" style="text-align:center"><div class="macro-value">${Math.round(macros.fat || 0)}г</div><div class="macro-label">жиры</div></div>
                <div class="macro macro-carbs" style="text-align:center"><div class="macro-value">${Math.round(macros.carbohydrates || 0)}г</div><div class="macro-label">углеводы</div></div>
            </div>
        </div>
        ${vitamins.length ? `<div class="card"><div class="card-title">Витамины</div>${vitamins.map(([k, v]) => nutrientBar(k, v)).join('')}</div>` : ''}
        ${minerals.length ? `<div class="card"><div class="card-title">Минералы</div>${minerals.map(([k, v]) => nutrientBar(k, v)).join('')}</div>` : ''}
        ${!vitamins.length && !minerals.length ? '<div class="card" style="padding:20px;color:var(--text2);text-align:center">Нет данных о микронутриентах.<br>Базовые продукты не содержат витаминов — добавьте продукты из онлайн-базы или USDA.</div>' : ''}
    `;
}

function changeNutrientDate(delta) {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + delta);
    currentDate = d.toISOString().slice(0, 10);
    loadNutrients();
}

// ---- Health Profile ----
async function loadHealth() {
    loadWeightGoal();
    const container = document.getElementById('health-content');
    container.innerHTML = '<div class="card" style="text-align:center;padding:20px;color:var(--text2)">' + (typeof t === 'function' ? t('loading') : 'Загрузка...') + '</div>';

    const [profile, aiRecs] = await Promise.all([
        api('/health/profile'),
        api(`/recommendations?lang=${currentLang}`),
    ]);
    if (!profile) { container.innerHTML = '<div class="card" style="padding:20px;color:var(--text2)">' + (typeof t === 'function' ? t('loadError') : 'Ошибка загрузки') + '</div>'; return; }

    const conditions = profile.conditions || [];
    const recs = profile.recommendations || {};

    // AI Recommendations block
    let aiHtml = '';
    if (aiRecs?.ai_summary) {
        aiHtml += `<div class="card ai-summary-card">
            <div class="card-title">🤖 Персональный анализ</div>
            <div class="ai-summary-text">${aiRecs.ai_summary}</div>
        </div>`;
    }
    if (aiRecs?.recommendations?.length) {
        const typeColors = { warning: 'var(--orange)', tip: 'var(--accent)', health: 'var(--green)', success: 'var(--green)', info: 'var(--text2)' };
        aiHtml += '<div class="card"><div class="card-title">Рекомендации</div>' +
            aiRecs.recommendations.map(r =>
                `<div style="padding:8px 0;border-bottom:1px solid var(--border)">
                    <div style="font-size:14px;font-weight:500">${r.icon} ${r.title}</div>
                    <div style="font-size:12px;color:var(--text2);margin-top:4px">${r.text}</div>
                </div>`
            ).join('') + '</div>';

        if (aiRecs.top_products?.length) {
            aiHtml += '<div class="card"><div class="card-title">Часто едите</div>' +
                aiRecs.top_products.map(p =>
                    `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px">
                        <span>${p.name}</span><span style="color:var(--text2)">${p.count}x ${typeof t === 'function' ? t('perWeek') : 'за неделю'}</span>
                    </div>`
                ).join('') + '</div>';
        }
    }

    // Словарь переводов
    const T = {
        // Нутриенты
        sugar: 'Сахар', fiber: 'Клетчатка', sodium: 'Натрий', potassium: 'Калий',
        calcium: 'Кальций', iron: 'Железо', magnesium: 'Магний', phosphorus: 'Фосфор',
        zinc: 'Цинк', selenium: 'Селен', iodine: 'Йод', omega_3: 'Омега-3',
        saturated_fat: 'Насыщ. жиры', trans_fat: 'Транс-жиры', cholesterol: 'Холестерин',
        purine: 'Пурины', fructose: 'Фруктоза', caffeine: 'Кофеин', alcohol: 'Алкоголь',
        carbohydrates_percent: 'Углеводы %', protein_per_kg: 'Белок (г/кг)', water_ml: 'Вода (мл)',
        vitamin_c: 'Вит. C', vitamin_d: 'Вит. D', vitamin_b12: 'Вит. B12', vitamin_k: 'Вит. K',
        folate: 'Фолат',
        // Продукты / категории
        sugary_drinks: 'Сладкие напитки', refined_sugar: 'Рафинированный сахар',
        white_bread: 'Белый хлеб', processed_food: 'Обработанная еда',
        whole_grains: 'Цельнозерновые', legumes: 'Бобовые',
        non_starchy_vegetables: 'Некрахмалистые овощи', vegetables: 'Овощи',
        lean_protein: 'Нежирный белок', nuts: 'Орехи', fruits: 'Фрукты',
        fish: 'Рыба', olive_oil: 'Оливковое масло', oats: 'Овсянка',
        low_fat_dairy: 'Нежирная молочка', dairy: 'Молочные',
        canned_food: 'Консервы', pickles: 'Соленья', salty_snacks: 'Солёные снеки',
        fried_food: 'Жареная еда', processed_meat: 'Колбасы',
        dark_cola: 'Тёмная кола', bananas: 'Бананы', oranges: 'Апельсины',
        rice: 'Рис', apples: 'Яблоки', berries: 'Ягоды', cabbage: 'Капуста',
        gluten: 'Глютен', wheat: 'Пшеница', barley: 'Ячмень', rye: 'Рожь',
        corn: 'Кукуруза', quinoa: 'Киноа', buckwheat: 'Гречка', gluten_free: 'Без глютена',
        raw_vegetables: 'Сырые овощи', seeds: 'Семена', popcorn: 'Попкорн',
        high_fiber: 'Грубая клетчатка', cooked_vegetables: 'Варёные овощи',
        white_rice: 'Белый рис', fast_food: 'Фастфуд', water: 'Вода',
        organ_meat: 'Субпродукты', shellfish: 'Моллюски', beer: 'Пиво',
        red_meat: 'Красное мясо', cherries: 'Вишня', coffee: 'Кофе',
        tea_with_meals: 'Чай с едой', coffee_with_meals: 'Кофе с едой',
        calcium_with_iron: 'Кальций с железом', liver: 'Печень', spinach: 'Шпинат',
        fortified_cereals: 'Обогащ. каши', excessive_alcohol: 'Много алкоголя',
        excessive_caffeine: 'Много кофеина', high_sodium: 'Солёная еда',
        sardines: 'Сардины', leafy_greens: 'Зелень', fortified_foods: 'Обогащ. продукты',
        plant_milk: 'Растительное молоко', yogurt: 'Йогурт',
        hard_cheese: 'Твёрдый сыр', lactose_free_dairy: 'Безлактозная молочка',
        seafood: 'Морепродукты', seaweed: 'Морская капуста', brazil_nuts: 'Бразильский орех',
        eggs: 'Яйца', raw_cruciferous_excess: 'Много сырых крестоцветных',
        soy_excess: 'Много сои', milk: 'Молоко', ice_cream: 'Мороженое',
        soft_cheese: 'Мягкий сыр', cream: 'Сливки',
    };
    function tr(key) { return T[key] || key.replace(/_/g, ' '); }

    let recsHtml = '';
    if (conditions.length) {
        const restrict = recs.restrict ? Object.entries(recs.restrict).map(([k,v]) => `<span class="tag tag-red">${tr(k)}: макс ${v}</span>`).join('') : '';
        const increase = recs.increase ? Object.entries(recs.increase).map(([k,v]) => `<span class="tag tag-green">${tr(k)}: мин ${v}</span>`).join('') : '';
        const avoid = (recs.avoid || []).map(a => `<span class="tag tag-red">${tr(a)}</span>`).join('');
        const prefer = (recs.prefer || []).map(a => `<span class="tag tag-green">${tr(a)}</span>`).join('');

        recsHtml = `
            <div class="card">
                <div class="card-title">Рекомендации</div>
                ${restrict ? `<div class="rec-section"><div class="rec-label">Ограничить</div><div class="tags">${restrict}</div></div>` : ''}
                ${increase ? `<div class="rec-section"><div class="rec-label">Увеличить</div><div class="tags">${increase}</div></div>` : ''}
                ${avoid ? `<div class="rec-section"><div class="rec-label">Избегать</div><div class="tags">${avoid}</div></div>` : ''}
                ${prefer ? `<div class="rec-section"><div class="rec-label">Предпочитать</div><div class="tags">${prefer}</div></div>` : ''}
            </div>`;
    }

    // Load latest metrics
    const metrics = await api('/devices/metrics/latest') || {};
    let metricsHtml = '';
    if (Object.keys(metrics).length) {
        metricsHtml = `<div class="card"><div class="card-title">Последние метрики</div>` +
            Object.entries(metrics).map(([type, m]) => {
                const name = METRIC_NAMES[type] || type;
                const date = new Date(m.measured_at).toLocaleDateString('ru');
                return `<div class="condition-row">
                    <div><div class="condition-name">${name}</div><div class="condition-code">${m.provider} · ${date}</div></div>
                    <div style="font-size:16px;font-weight:600">${m.value} ${m.unit}</div>
                </div>`;
            }).join('') + `</div>`;
    }

    container.innerHTML = metricsHtml + `
        <div class="card">
            <div class="card-title">Мои состояния</div>
            ${conditions.length ? conditions.map(c => `
                <div class="condition-row">
                    <div>
                        <div class="condition-name">${c.name || 'N/A'}</div>
                        <div class="condition-code">${c.code || ''}</div>
                    </div>
                    <button class="btn-delete" onclick="removeCondition('${c.id}')" title="Удалить">✕</button>
                </div>
            `).join('') : '<div style="color:var(--text2);padding:8px 0">Нет добавленных состояний</div>'}
            <div class="add-btn" onclick="openAddCondition()" style="margin-top:12px">+ Добавить состояние</div>
        </div>
        ${recsHtml}
    `;
}

async function removeCondition(condId) {
    if (!confirm('Удалить состояние?')) return;
    await api(`/health/profile/conditions/${condId}`, { method: 'DELETE' });
    loadHealth();
}

function openAddCondition() {
    document.getElementById('condition-modal').classList.add('active');
    document.getElementById('condition-search').value = '';
    document.getElementById('condition-results').innerHTML = '';
    document.getElementById('condition-search').focus();
}

let condSearchTimeout;
function onConditionSearch(e) {
    clearTimeout(condSearchTimeout);
    const q = e.target.value.trim();
    if (q.length < 2) { document.getElementById('condition-results').innerHTML = ''; return; }
    condSearchTimeout = setTimeout(() => searchConditions(q), 300);
}

async function searchConditions(q) {
    const results = await api(`/health/conditions?q=${encodeURIComponent(q)}`);
    const container = document.getElementById('condition-results');
    if (!results?.length) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text2)">Ничего не найдено</div>';
        return;
    }
    container.innerHTML = results.map(c => `
        <div class="product-row" role="button" tabindex="0" onkeydown='if(event.key==="Enter"||event.key===" "){event.preventDefault();event.currentTarget.click();}' onclick="addCondition('${c.id}')">
            <div>
                <div class="p-name">${c.name_ru || c.name_en}</div>
                <div class="p-brand">${c.code} · ${typeof trCategory === "function" ? trCategory(c.category) : c.category}</div>
            </div>
        </div>
    `).join('');
}

async function addCondition(conditionId) {
    await api('/health/profile/conditions', {
        method: 'POST',
        body: JSON.stringify({ condition_id: conditionId })
    });
    closeModal('condition-modal');
    loadHealth();
}

// ---- Export ----
async function exportCSV(days) {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const resp = await fetch(`/api/v1/export/csv?days=${days}`, { headers });
    if (!resp.ok) { alert('Ошибка экспорта'); return; }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diary_${days}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ---- Stats ----
let statsPeriod = 'week';

async function loadStats() {
    refreshStreakBadge();
    loadAchievements();
    setTimeout(injectStatsWidgets, 300);
    let data;
    if (statsPeriod === 'week') {
        data = await api('/stats/week');
    } else if (statsPeriod === 'month') {
        const now = new Date();
        data = await api(`/stats/month?month=${now.getMonth()+1}&year=${now.getFullYear()}`);
    } else {
        const to = new Date().toISOString().slice(0,10);
        const from = new Date(Date.now() - 90*86400000).toISOString().slice(0,10);
        data = await api(`/stats/range?date_from=${from}&date_to=${to}`);
    }
    if (!data) return;
    renderStats(data);
}

function setStatsPeriod(p) {
    statsPeriod = p;
    document.querySelectorAll('.stats-period-btn').forEach(b => b.classList.toggle('active', b.dataset.period === p));
    loadStats();
}

function renderStats(data) {
    const container = document.getElementById('stats-content');
    const days = data.days || [];
    const avg = data.averages || {};
    const periodLabels = { week: 'неделю', month: 'месяц', quarter: '3 месяца' };

    const maxCal = Math.max(...days.map(d => d.calories), 1);
    const maxProt = Math.max(...days.map(d => d.protein), 1);
    const maxFat = Math.max(...days.map(d => d.fat), 1);
    const maxCarb = Math.max(...days.map(d => d.carbohydrates), 1);

    // Goal progress
    const goalPct = (v, g) => g > 0 ? Math.min(Math.round(v / g * 100), 100) : 0;
    const calPct = goalPct(avg.avg_calories, userGoals.calories);
    const protPct = goalPct(avg.avg_protein, userGoals.protein);
    const fatPct = goalPct(avg.avg_fat, userGoals.fat);
    const carbPct = goalPct(avg.avg_carbohydrates, userGoals.carbs);

    // For month/quarter, show abbreviated dates
    const dayLabel = (d) => {
        if (statsPeriod === 'week') return new Date(d.date).toLocaleDateString('ru-RU', { weekday: 'short' });
        return new Date(d.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    };

    // Limit bars for long periods
    const displayDays = statsPeriod === 'quarter' ? days.filter((_, i) => i % 3 === 0 || i === days.length - 1) : days;

    container.innerHTML = `
        <div class="card">
            <div class="mode-toggle">
                <button class="mode-btn stats-period-btn ${statsPeriod==='week'?'active':''}" data-period="week" onclick="setStatsPeriod('week')">Неделя</button>
                <button class="mode-btn stats-period-btn ${statsPeriod==='month'?'active':''}" data-period="month" onclick="setStatsPeriod('month')">Месяц</button>
                <button class="mode-btn stats-period-btn ${statsPeriod==='quarter'?'active':''}" data-period="quarter" onclick="setStatsPeriod('quarter')">3 мес</button>
            </div>
        </div>
        <div class="card">
            <div class="card-title">Прогресс к целям (средн. за ${periodLabels[statsPeriod]})</div>
            <div class="nutrient-row"><div class="nutrient-info"><span class="nutrient-name">Калории</span><span class="nutrient-val">${Math.round(avg.avg_calories||0)} / ${userGoals.calories} ккал (${calPct}%)</span></div><div class="nutrient-bar"><div class="nutrient-fill" style="width:${calPct}%;background:var(--accent)"></div></div></div>
            <div class="nutrient-row"><div class="nutrient-info"><span class="nutrient-name">Белки</span><span class="nutrient-val">${Math.round(avg.avg_protein||0)} / ${userGoals.protein}г (${protPct}%)</span></div><div class="nutrient-bar"><div class="nutrient-fill" style="width:${protPct}%;background:var(--protein)"></div></div></div>
            <div class="nutrient-row"><div class="nutrient-info"><span class="nutrient-name">Жиры</span><span class="nutrient-val">${Math.round(avg.avg_fat||0)} / ${userGoals.fat}г (${fatPct}%)</span></div><div class="nutrient-bar"><div class="nutrient-fill" style="width:${fatPct}%;background:var(--fat)"></div></div></div>
            <div class="nutrient-row"><div class="nutrient-info"><span class="nutrient-name">Углеводы</span><span class="nutrient-val">${Math.round(avg.avg_carbohydrates||0)} / ${userGoals.carbs}г (${carbPct}%)</span></div><div class="nutrient-bar"><div class="nutrient-fill" style="width:${carbPct}%;background:var(--carbs)"></div></div></div>
        </div>
        <div class="card">
            <div class="card-title">Среднее за ${periodLabels[statsPeriod]}</div>
            <div class="macros" style="flex-direction:row;justify-content:space-around">
                <div class="macro" style="text-align:center"><div class="macro-value">${Math.round(avg.avg_calories || 0)}</div><div class="macro-label">ккал</div></div>
                <div class="macro macro-protein" style="text-align:center"><div class="macro-value">${Math.round(avg.avg_protein || 0)}г</div><div class="macro-label">белки</div></div>
                <div class="macro macro-fat" style="text-align:center"><div class="macro-value">${Math.round(avg.avg_fat || 0)}г</div><div class="macro-label">жиры</div></div>
                <div class="macro macro-carbs" style="text-align:center"><div class="macro-value">${Math.round(avg.avg_carbohydrates || 0)}г</div><div class="macro-label">углеводы</div></div>
            </div>
        </div>
        <div class="card">
            <div class="card-title">Калории по дням</div>
            <div class="chart-bars">
                ${displayDays.map(d => {
                    const h = Math.max((d.calories / maxCal) * 100, 2);
                    return `<div class="chart-bar">
                        <div class="bar-value">${Math.round(d.calories)}</div>
                        <div class="bar" style="height:${h}%"></div>
                        <div class="bar-label">${dayLabel(d)}</div>
                    </div>`;
                }).join('')}
            </div>
        </div>
        <div class="card">
            <div class="card-title">БЖУ по дням</div>
            <div class="chart-bars" style="height:100px">
                ${displayDays.map(d => {
                    const maxM = Math.max(maxProt, maxFat, maxCarb, 1);
                    const hp = Math.max((d.protein / maxM) * 100, 1);
                    const hf = Math.max((d.fat / maxM) * 100, 1);
                    const hc = Math.max((d.carbohydrates / maxM) * 100, 1);
                    return `<div class="chart-bar" style="gap:2px">
                        <div style="display:flex;gap:1px;align-items:flex-end;height:80px;width:100%">
                            <div style="flex:1;background:var(--protein);border-radius:2px 2px 0 0;height:${hp}%"></div>
                            <div style="flex:1;background:var(--fat);border-radius:2px 2px 0 0;height:${hf}%"></div>
                            <div style="flex:1;background:var(--carbs);border-radius:2px 2px 0 0;height:${hc}%"></div>
                        </div>
                        <div class="bar-label">${dayLabel(d)}</div>
                    </div>`;
                }).join('')}
            </div>
            <div style="display:flex;gap:12px;justify-content:center;margin-top:8px;font-size:11px">
                <span style="color:var(--protein)">● Белки</span>
                <span style="color:var(--fat)">● Жиры</span>
                <span style="color:var(--carbs)">● Углеводы</span>
            </div>
        </div>
        <div class="card">
            <div class="card-title">Экспорт данных</div>
            <div style="display:flex;gap:8px;margin-bottom:6px">
                <button class="btn btn-secondary" style="flex:1" onclick="exportCSV(7)">CSV 7д</button>
                <button class="btn btn-secondary" style="flex:1" onclick="exportCSV(30)">CSV 30д</button>
                <button class="btn btn-secondary" style="flex:1" onclick="exportCSV(90)">CSV 90д</button>
            </div>
            <div style="display:flex;gap:8px">
                <button class="btn btn-secondary" style="flex:1" onclick="exportPDF(7)">📄 PDF 7д</button>
                <button class="btn btn-secondary" style="flex:1" onclick="exportPDF(30)">📄 PDF 30д</button>
                <button class="btn btn-secondary" style="flex:1" onclick="exportPDF(90)">📄 PDF 90д</button>
            </div>
        </div>
        <div class="card">
            <div class="card-title">Регулярность</div>
            <div id="heatmap-area" style="margin-top:8px"></div>
        </div>
    `;
    loadHeatmap(90);
}




// ---- Sync / Backup ----
async function syncExport() {
    const resp = await fetch('/api/v1/sync/export', {
        headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!resp.ok) { alert('Ошибка экспорта'); return; }
    const data = await resp.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nutrition-diary-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

async function syncImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!confirm('Импортировать данные из файла? Существующие записи не удалятся.')) return;

    const formData = new FormData();
    formData.append('file', file);

    const resp = await fetch('/api/v1/sync/import', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token },
        body: formData,
    });
    const result = await resp.json();
    if (result.status === 'ok') {
        alert('Импортировано записей: ' + result.imported_entries);
        loadDiary();
    } else {
        alert('Ошибка: ' + (result.error || 'unknown'));
    }
    event.target.value = '';
}

// ---- Share ----
async function shareDay() {
    const data = await api(`/share/day?entry_date=${currentDate}`, { method: 'POST' });
    if (data?._error) {
        alert(data.detail || 'Нет записей для этого дня');
        return;
    }
    const url = window.location.origin + '/shared/' + data.share_id;
    if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        alert('Ссылка скопирована: ' + url);
    } else {
        prompt('Скопируйте ссылку:', url);
    }
}

// ---- Week Plan ----
async function loadWeekPlan() {
    loadAiMealPlanCard();
    loadRecipesIfAny();
    const container = document.getElementById('plan-content');
    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));

    let html = '';
    const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateStr = d.toISOString().slice(0, 10);
        const isToday = dateStr === new Date().toISOString().slice(0, 10);
        const isPast = d < new Date(new Date().toISOString().slice(0, 10));

        const summary = await api(`/diary/summary?entry_date=${dateStr}`);
        const dayEntries = summary?.entries || [];
        const totalCal = dayEntries.reduce((s, e) => s + (e.calories || 0), 0);
        const totalP = dayEntries.reduce((s, e) => s + (e.protein || 0), 0);
        const totalF = dayEntries.reduce((s, e) => s + (e.fat || 0), 0);
        const totalC = dayEntries.reduce((s, e) => s + (e.carbohydrates || 0), 0);

        const borderColor = isToday ? 'var(--accent)' : 'var(--border)';
        const bg = isToday ? 'border-width:2px' : '';

        let foodList = '';
        if (dayEntries.length > 0) {
            const grouped = {};
            for (const e of dayEntries) {
                const mealName = meals.find(m => m.id === e.meal_id)?.name || 'Другое';
                if (!grouped[mealName]) grouped[mealName] = [];
                grouped[mealName].push(e.product_name);
            }
            foodList = Object.entries(grouped).map(([meal, items]) =>
                `<div style="margin-top:4px"><span style="font-size:11px;color:var(--text2)">${meal}:</span> <span style="font-size:12px">${items.join(', ')}</span></div>`
            ).join('');
        } else {
            foodList = '<div style="font-size:12px;color:var(--text2);margin-top:4px">' + (isPast ? 'Нет записей' : 'Не запланировано') + '</div>';
        }

        html += `
            <div class="card" style="border-color:${borderColor};${bg};cursor:pointer" onclick="goToDate('${dateStr}')">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        <span style="font-weight:600">${dayNames[i]}</span>
                        <span style="color:var(--text2);font-size:13px;margin-left:6px">${d.toLocaleDateString('ru-RU', {day:'numeric', month:'short'})}</span>
                        ${isToday ? '<span style="color:var(--accent);font-size:11px;margin-left:6px">сегодня</span>' : ''}
                    </div>
                    <div style="text-align:right;font-size:13px">
                        <div style="font-weight:600">${Math.round(totalCal)} ккал</div>
                        <div style="font-size:11px;color:var(--text2)">Б${Math.round(totalP)} Ж${Math.round(totalF)} У${Math.round(totalC)}</div>
                    </div>
                </div>
                ${foodList}
            </div>
        `;
    }

    // Weekly totals
    container.innerHTML = html;
}

function goToDate(dateStr) {
    currentDate = dateStr;
    setActiveTab('diary');
}

// ---- Navigation ----
function setActiveTab(tab) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');

    ['diary-view','plan-view','stats-view','nutrients-view','health-view','fasting-view'].forEach(v =>
        document.getElementById(v)?.classList.add('hidden'));

    if (tab === 'diary') {
        document.getElementById('diary-view').classList.remove('hidden');
        loadDiary();
    } else if (tab === 'plan') {
        document.getElementById('plan-view').classList.remove('hidden');
        loadWeekPlan();
    } else if (tab === 'stats') {
        document.getElementById('stats-view').classList.remove('hidden');
        loadStats();
    } else if (tab === 'nutrients') {
        document.getElementById('nutrients-view').classList.remove('hidden');
        loadNutrients();
    } else if (tab === 'health') {
        document.getElementById('health-view').classList.remove('hidden');
        loadHealth();
    } else if (tab === 'fasting') {
        document.getElementById('fasting-view').classList.remove('hidden');
        loadFasting();
    }
}

function showError(msg) {
    alert(msg);
}


// ---- Intermittent Fasting ----
let fastingTimer = null;

async function loadFasting() {
    const container = document.getElementById('fasting-content');
    const current = await api('/fasting/current');

    if (current) {
        renderActiveFasting(current);
        startFastingTimer(current);
    } else {
        renderFastingStart();
    }

    loadFastingStats();
    loadFastingHistory();
}

function renderFastingStart() {
    const container = document.getElementById('fasting-content');
    container.innerHTML = `
        <p style="color:var(--text2);margin-bottom:16px">Выберите план голодания и нажмите старт</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
            <button class="mode-btn fasting-plan-btn active" data-plan="16:8" onclick="selectFastingPlan(this)">16:8</button>
            <button class="mode-btn fasting-plan-btn" data-plan="18:6" onclick="selectFastingPlan(this)">18:6</button>
            <button class="mode-btn fasting-plan-btn" data-plan="20:4" onclick="selectFastingPlan(this)">20:4</button>
            <button class="mode-btn fasting-plan-btn" data-plan="14:10" onclick="selectFastingPlan(this)">14:10</button>
            <button class="mode-btn fasting-plan-btn" data-plan="23:1" onclick="selectFastingPlan(this)">23:1</button>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:16px">
            <b>16:8</b> — 16ч голод / 8ч еда (популярный)<br>
            <b>18:6</b> — 18ч голод / 6ч еда<br>
            <b>20:4</b> — 20ч голод / 4ч еда (продвинутый)
        </div>
        <button class="btn btn-primary" style="width:100%" onclick="startFasting()">Начать голодание</button>
    `;
}

function selectFastingPlan(btn) {
    document.querySelectorAll('.fasting-plan-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function renderActiveFasting(data) {
    const container = document.getElementById('fasting-content');
    const progress = data.progress_percent || 0;
    const elapsed = data.elapsed_hours || 0;
    const remaining = data.remaining_hours || 0;
    const circumference = 2 * Math.PI * 70;
    const offset = circumference - (progress / 100) * circumference;
    const color = progress >= 100 ? 'var(--green)' : 'var(--accent)';

    const elapsedH = Math.floor(elapsed);
    const elapsedM = Math.round((elapsed - elapsedH) * 60);
    const remainH = Math.floor(remaining);
    const remainM = Math.round((remaining - remainH) * 60);

    container.innerHTML = `
        <div style="text-align:center;margin:16px 0">
            <svg width="160" height="160" viewBox="0 0 160 160">
                <circle cx="80" cy="80" r="70" fill="none" stroke="var(--bg2)" stroke-width="8"/>
                <circle cx="80" cy="80" r="70" fill="none" stroke="${color}" stroke-width="8"
                    stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
                    stroke-linecap="round" transform="rotate(-90 80 80)" style="transition:stroke-dashoffset 1s"/>
                <text x="80" y="70" text-anchor="middle" fill="var(--text1)" font-size="24" font-weight="bold">
                    ${elapsedH}ч ${elapsedM}м
                </text>
                <text x="80" y="92" text-anchor="middle" fill="var(--text2)" font-size="13">
                    из ${data.fasting_hours}ч
                </text>
                <text x="80" y="112" text-anchor="middle" fill="${color}" font-size="14" font-weight="bold">
                    ${Math.round(progress)}%
                </text>
            </svg>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <span style="color:var(--text2)">План: <b>${data.plan_type}</b></span>
            <span style="color:var(--text2)">Осталось: <b>${remainH}ч ${remainM}м</b></span>
        </div>
        <div style="font-size:12px;color:var(--text2);margin-bottom:16px">
            Начало: ${new Date(data.started_at).toLocaleString()}
        </div>
        ${progress >= 100 ? '<div style="text-align:center;color:var(--green);font-weight:bold;margin-bottom:12px">Цель достигнута! Можете завершить</div>' : ''}
        <button class="btn ${progress >= 100 ? 'btn-primary' : 'btn-secondary'}" style="width:100%" onclick="stopFasting()">
            ${progress >= 100 ? 'Завершить голодание' : 'Прервать голодание'}
        </button>
    `;
}

function startFastingTimer(data) {
    if (fastingTimer) clearInterval(fastingTimer);
    fastingTimer = setInterval(async () => {
        const current = await api('/fasting/current');
        if (current) renderActiveFasting(current);
        else { clearInterval(fastingTimer); renderFastingStart(); }
    }, 60000); // update every minute
}

async function startFasting() {
    const activeBtn = document.querySelector('.fasting-plan-btn.active');
    const plan = activeBtn ? activeBtn.dataset.plan : '16:8';
    const result = await api('/fasting/start', {
        method: 'POST',
        body: JSON.stringify({ plan_type: plan })
    });
    if (result && !result._error) {
        renderActiveFasting(result);
        startFastingTimer(result);
    }
}

async function stopFasting() {
    const result = await api('/fasting/stop', { method: 'POST' });
    if (result && !result._error) {
        if (fastingTimer) clearInterval(fastingTimer);
        renderFastingStart();
        loadFastingStats();
        loadFastingHistory();
    }
}

async function loadFastingStats() {
    const stats = await api('/fasting/stats?days=30');
    const card = document.getElementById('fasting-stats-card');
    const container = document.getElementById('fasting-stats-content');
    if (!stats || stats.total_sessions === 0) { card.style.display = 'none'; return; }
    card.style.display = '';
    container.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="stat-box"><div class="stat-value">${stats.total_sessions}</div><div class="stat-label">Сессий</div></div>
            <div class="stat-box"><div class="stat-value">${stats.completed}</div><div class="stat-label">Завершено</div></div>
            <div class="stat-box"><div class="stat-value">${stats.avg_hours}ч</div><div class="stat-label">Среднее</div></div>
            <div class="stat-box"><div class="stat-value">${stats.longest_hours}ч</div><div class="stat-label">Рекорд</div></div>
            <div class="stat-box"><div class="stat-value">${stats.completion_rate || 0}%</div><div class="stat-label">Успешность</div></div>
            <div class="stat-box"><div class="stat-value">${stats.streak}</div><div class="stat-label">Серия дней</div></div>
        </div>
    `;
}

async function loadFastingHistory() {
    const history = await api('/fasting/history?limit=10');
    const card = document.getElementById('fasting-history-card');
    const container = document.getElementById('fasting-history-content');
    if (!history || history.length === 0) { card.style.display = 'none'; return; }
    card.style.display = '';
    container.innerHTML = history.map(h => {
        const date = new Date(h.started_at).toLocaleDateString();
        const hours = h.elapsed_hours;
        const icon = h.completed ? '✅' : '❌';
        return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--bg2)">
            <span>${icon} ${date} — ${h.plan_type}</span>
            <span style="color:var(--text2)">${hours}ч</span>
        </div>`;
    }).join('');
}


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
        if (data.barcode) {
            document.getElementById('barcode-input').value = data.barcode;
            if (data.product) { setMsg('✓ ' + data.barcode); searchBarcode(); }
            else setMsg(`Найден ${data.barcode}, но нет в базе. Нажми «Найти».`);
        } else {
            setMsg('Штрихкод не распознан. Снимай ближе и ровно, чтобы линии были чёткими.');
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
        if (typeof awardFeature === "function") awardFeature("barcode");
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

async function togglePush() {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
        const endpoint = existing.endpoint;
        await existing.unsubscribe();
        await api('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint }) });
        loadPushStatus();
        return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { alert('Нужно разрешить уведомления'); loadPushStatus(); return; }
    const keyResp = await api('/push/key');
    if (!keyResp?.public_key) { alert('Сервер не вернул VAPID ключ'); return; }
    const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyResp.public_key),
    });
    const subJson = sub.toJSON();
    await api('/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({
            endpoint: subJson.endpoint,
            p256dh: subJson.keys.p256dh,
            auth: subJson.keys.auth,
        })
    });
    loadPushStatus();
    if (typeof showToast === 'function') showToast('Пуши включены');
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
        const items2 = (r2 && r2.achievements) ? r2.achievements : items;
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
