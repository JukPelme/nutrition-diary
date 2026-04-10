
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
    if (darkBtn && lightBtn) {
        darkBtn.classList.toggle('active', theme === 'dark');
        lightBtn.classList.toggle('active', theme === 'light');
    }
    // Update meta theme-color for PWA
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'light' ? '#ffffff' : '#0f1117';
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
    checkAndNotify(); // check immediately
    window._reminderInterval = setInterval(checkAndNotify, 60 * 60 * 1000); // every hour
}

function checkAndNotify() {
    const now = new Date();
    const hour = now.getHours();
    const todayKey = 'lastNotif_' + now.toISOString().slice(0, 10);
    const sent = JSON.parse(localStorage.getItem(todayKey) || '{}');
    
    const reminders = getReminders();
    
    for (const r of reminders) {
        if (hour >= r.hour && !sent[r.id]) {
            sendNotification(r.title, r.body, r.id);
            sent[r.id] = true;
            localStorage.setItem(todayKey, JSON.stringify(sent));
        }
    }
    
    // Water reminder: every 2 hours from 9 to 21 if water < goal
    if (hour >= 9 && hour <= 21 && hour % 2 === 0 && !sent['water_' + hour]) {
        const water = parseInt(localStorage.getItem('water_' + currentDate) || '0');
        if (water < waterGoal) {
            sendNotification('💧 Выпей воды', `${water} из ${waterGoal} стаканов`, 'water_' + hour);
            sent['water_' + hour] = true;
            localStorage.setItem(todayKey, JSON.stringify(sent));
        }
    }
}

function getReminders() {
    return JSON.parse(localStorage.getItem('mealReminders') || JSON.stringify([
        { id: 'breakfast', hour: 8, title: '🌅 Завтрак', body: 'Пора завтракать!' },
        { id: 'lunch', hour: 13, title: '☀️ Обед', body: 'Время обеда!' },
        { id: 'dinner', hour: 19, title: '🌙 Ужин', body: 'Пора ужинать!' },
    ]));
}

function sendNotification(title, body, tag) {
    if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage({
            type: 'SHOW_NOTIFICATION', title, body, tag
        });
    }
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
    loadDiary();
    setActiveTab('diary');
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (data?.access_token) {
        setToken(data.access_token);
        showApp();
    } else {
        showError(data?.detail || 'Неверный email или пароль');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const name = document.getElementById('auth-name')?.value || '';
    const data = await api('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, full_name: name }) });
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
    if (btn.textContent === 'Войти') {
        btn.textContent = 'Зарегистрироваться';
        toggle.innerHTML = 'Уже есть аккаунт? <a href="#" onclick="toggleAuthMode()">Войти</a>';
        nameField.classList.remove('hidden');
        form.onsubmit = handleRegister;
    } else {
        btn.textContent = 'Войти';
        toggle.innerHTML = 'Нет аккаунта? <a href="#" onclick="toggleAuthMode()">Регистрация</a>';
        nameField.classList.add('hidden');
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

function openSettings() {
    document.getElementById('settings-modal').classList.add('active');
    loadDevices();
    // Highlight current theme & accent
    applyTheme(localStorage.getItem('theme') || 'dark');
    applyAccent(localStorage.getItem('accent') || 'blue');
    updateNotifButton(localStorage.getItem('notificationsEnabled') === 'true');
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === currentLang));
    document.getElementById('set-cal').value = userGoals.calories;
    document.getElementById('set-protein').value = userGoals.protein;
    document.getElementById('set-fat').value = userGoals.fat;
    document.getElementById('set-carbs').value = userGoals.carbs;
    document.getElementById('set-water').value = waterGoal;
}

async function saveSettings() {
    const cal = parseInt(document.getElementById('set-cal').value) || 2000;
    const protein = parseFloat(document.getElementById('set-protein').value) || 120;
    const fat = parseFloat(document.getElementById('set-fat').value) || 65;
    const carbs = parseFloat(document.getElementById('set-carbs').value) || 250;
    const water = parseInt(document.getElementById('set-water').value) || 8;

    await api('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({
            daily_calorie_goal: cal,
            daily_protein_goal: protein,
            daily_fat_goal: fat,
            daily_carb_goal: carbs,
        })
    });

    userGoals = { calories: cal, protein, fat, carbs };
    waterGoal = water;
    localStorage.setItem('waterGoal', water);
    closeModal('settings-modal');
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

// ---- Water Tracker ----
function renderWater() {
    waterCount = parseInt(localStorage.getItem(`water_${currentDate}`) || '0');
    document.getElementById('water-count').textContent = `${waterCount} / ${waterGoal} стаканов`;
    const container = document.getElementById('water-glasses');
    let html = '';
    for (let i = 0; i < waterGoal; i++) {
        html += `<div class="water-glass ${i < waterCount ? 'filled' : ''}" onclick="setWater(${i + 1})">💧</div>`;
    }
    container.innerHTML = html;
}

function setWater(count) {
    waterCount = count;
    localStorage.setItem(`water_${currentDate}`, waterCount);
    renderWater();
}

function changeWater(delta) {
    waterCount = Math.max(0, Math.min(waterGoal, waterCount + delta));
    localStorage.setItem(`water_${currentDate}`, waterCount);
    renderWater();
}

// ---- Diary ----
async function loadDiary() {
    meals = await api('/meals') || [];
    const summary = await api(`/diary/summary?entry_date=${currentDate}`);
    entries = summary?.entries || [];
    renderDiary(summary);
}

function renderDiary(summary) {
    document.getElementById('date-display').textContent = formatDate(currentDate);

    const cal = summary?.total_calories || 0;
    const goal = userGoals.calories;
    const pct = Math.min((cal / goal) * 100, 100);
    const circumference = 2 * Math.PI * 40;
    const offset = circumference - (pct / 100) * circumference;

    document.getElementById('cal-ring').setAttribute('stroke-dasharray', circumference);
    document.getElementById('cal-ring').setAttribute('stroke-dashoffset', offset);
    document.getElementById('cal-num').textContent = Math.round(cal);
    document.getElementById('cal-left').textContent = `из ${goal}`;
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
                <span><span class="meal-icon">${meal.icon || '🍽'}</span><span class="meal-name">${meal.name}</span></span>
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
                <div class="add-btn" style="flex:1" onclick="openAddFood('${meal.id}')">+ Добавить</div>
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
    // Show favorites
    const favs = getFavorites();
    const container = document.getElementById('search-results');
    if (favs.length) {
        container.innerHTML = '<div class="card-title" style="padding:8px 0 4px;font-size:11px">Избранное</div>' +
            favs.map(p => `
            <div class="product-row" onclick='selectProduct(${JSON.stringify(p).replace(/'/g, "&#39;")})'>
                <div>
                    <div class="p-name">⭐ ${p.name}${p.source === 'openfoodfacts' ? ' 🌐' : ''}</div>
                    <div class="p-brand">${p.brand || ''} · ${p.serving_size || 100}${p.serving_unit || 'g'}</div>
                </div>
                <div class="p-cal">${p.calories ? Math.round(p.calories) + ' ккал' : '—'}</div>
            </div>
        `).join('');
    } else {
        container.innerHTML = '';
    }
    document.getElementById('food-search').focus();
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
        <div class="product-row" onclick='selectProduct(${JSON.stringify(p).replace(/'/g, "&#39;")})'>
            <div>
                <div class="p-name">${p.name}${p.is_verified ? ' ✓' : ''}${p.source === 'openfoodfacts' ? ' 🌐' : ''}</div>
                <div class="p-brand">${p.brand || ''} · ${p.serving_size}${p.serving_unit}</div>
            </div>
            <div class="p-cal">${p.calories ? Math.round(p.calories) + ' ккал' : '—'}</div>
        </div>
    `).join('');
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

    if (!barcodeScanner) {
        barcodeScanner = new Html5Qrcode('barcode-reader');
    }

    try {
        await barcodeScanner.start(
            { facingMode: 'environment' },
            { fps: 10, qrbox: { width: 250, height: 100 }, formatsToSupport: [
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8,
                Html5QrcodeSupportedFormats.UPC_A,
                Html5QrcodeSupportedFormats.UPC_E,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39
            ]},
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
    if (barcodeScanner && scannerActive) {
        barcodeScanner.stop().catch(() => {});
    }
    scannerActive = false;
}


// ---- Create Custom Product ----
let recipeIngredients = [];
let createMode = 'manual';

function openCreateProduct() {
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
        <div class="product-row" onclick='addRecipeIngredient(${JSON.stringify(p).replace(/'/g, "&#39;")})'>
            <div>
                <div class="p-name" style="font-size:13px">${p.name}</div>
                <div class="p-brand" style="font-size:11px">${p.calories ? Math.round(p.calories) + ' ккал/100г' : ''}</div>
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

    document.getElementById('recipe-totals').classList.remove('hidden');
    document.getElementById('recipe-total-weight').textContent = Math.round(totalWeight) + 'г всего';
    document.getElementById('recipe-total-cal').textContent = Math.round(totalCal * per100) + ' ккал';
    document.getElementById('recipe-total-p').textContent = Math.round(totalP * per100) + 'г';
    document.getElementById('recipe-total-f').textContent = Math.round(totalF * per100) + 'г';
    document.getElementById('recipe-total-c').textContent = Math.round(totalC * per100) + 'г';
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

        const resp = await fetch('/api/v1/food-scan', {
            method: 'POST',
            headers,
            body: formData,
        });

        if (resp.status === 401) { logout(); return; }
        const data = await resp.json();

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
        await api('/diary', {
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
        await api('/diary', {
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

    await api('/diary', {
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
    loadDiary();
}

// ---- Nutrients ----
async function loadNutrients() {
    const container = document.getElementById('nutrients-content');
    container.innerHTML = '<div class="card" style="text-align:center;padding:20px;color:var(--text2)">Загрузка...</div>';

    const data = await api(`/nutrients/daily?entry_date=${currentDate}`);
    if (!data) { container.innerHTML = '<div class="card" style="padding:20px;color:var(--text2)">Ошибка загрузки</div>'; return; }

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
    container.innerHTML = '<div class="card" style="text-align:center;padding:20px;color:var(--text2)">Загрузка...</div>';

    const [profile, aiRecs] = await Promise.all([
        api('/health/profile'),
        api('/recommendations'),
    ]);
    if (!profile) { container.innerHTML = '<div class="card" style="padding:20px;color:var(--text2)">Ошибка загрузки</div>'; return; }

    const conditions = profile.conditions || [];
    const recs = profile.recommendations || {};

    // AI Recommendations block
    let aiHtml = '';
    if (aiRecs?.recommendations?.length) {
        const typeColors = { warning: 'var(--orange)', tip: 'var(--accent)', health: 'var(--green)', success: 'var(--green)', info: 'var(--text2)' };
        aiHtml = '<div class="card"><div class="card-title">Рекомендации</div>' +
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
                        <span>${p.name}</span><span style="color:var(--text2)">${p.count}x за неделю</span>
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
        <div class="product-row" onclick="addCondition('${c.id}')">
            <div>
                <div class="p-name">${c.name_ru || c.name_en}</div>
                <div class="p-brand">${c.code} · ${c.category}</div>
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
            <div style="display:flex;gap:8px">
                <button class="btn btn-secondary" style="flex:1" onclick="exportCSV(7)">7 дней</button>
                <button class="btn btn-secondary" style="flex:1" onclick="exportCSV(30)">30 дней</button>
                <button class="btn btn-secondary" style="flex:1" onclick="exportCSV(90)">3 мес</button>
            </div>
        </div>
    `;
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
