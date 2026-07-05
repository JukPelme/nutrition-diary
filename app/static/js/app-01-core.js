// app-01-core.js — mechanical split of app.js (Этап 1). Loaded as classic script; all globals stay global.

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

    // Water reminder: every 2 hours from 9 to 21 if below the daily ml goal
    if (hour >= 9 && hour <= 21 && hour % 2 === 0 && !sent['water_' + hour]) {
        try {
            const w = await api('/water/today');
            if (w && !w._error && w.goal_ml && w.total_ml < w.goal_ml) {
                const leftMl = Math.max(0, w.goal_ml - w.total_ml);
                sendNotification('💧 Не забудь про воду',
                    `Выпито ${w.total_ml} из ${w.goal_ml} мл — осталось ${leftMl} мл`,
                    'water_' + hour);
            }
        } catch (e) { /* offline — skip */ }
        sent['water_' + hour] = true;
        localStorage.setItem(todayKey, JSON.stringify(sent));
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
        if (data.refresh_token && typeof setRefreshToken === 'function') setRefreshToken(data.refresh_token);
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
        if (data.refresh_token && typeof setRefreshToken === 'function') setRefreshToken(data.refresh_token);
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
    // Decide direction from actual DOM state, not the (localized) button text.
    if (nameField.classList.contains('hidden')) {
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

