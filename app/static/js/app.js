// State
let currentDate = new Date().toISOString().slice(0, 10);
let meals = [];
let entries = [];
let selectedMealId = null;

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

function showApp() {
    document.getElementById('auth-page').classList.add('hidden');
    document.getElementById('app-page').classList.remove('hidden');
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
        showError('Неверный email или пароль');
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
        showError('Ошибка регистрации');
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

// ---- Diary ----
async function loadDiary() {
    meals = await api('/meals') || [];
    const summary = await api(`/diary/summary?entry_date=${currentDate}`);
    entries = summary?.entries || [];
    renderDiary(summary);
}

function renderDiary(summary) {
    document.getElementById('date-display').textContent = formatDate(currentDate);
    
    // Summary ring
    const cal = summary?.total_calories || 0;
    const goal = 2000; // TODO: from user profile
    const pct = Math.min((cal / goal) * 100, 100);
    const circumference = 2 * Math.PI * 40;
    const offset = circumference - (pct / 100) * circumference;
    
    document.getElementById('cal-ring').setAttribute('stroke-dasharray', circumference);
    document.getElementById('cal-ring').setAttribute('stroke-dashoffset', offset);
    document.getElementById('cal-num').textContent = Math.round(cal);
    document.getElementById('cal-left').textContent = `из ${goal}`;
    
    document.getElementById('protein-val').textContent = Math.round(summary?.total_protein || 0) + 'г';
    document.getElementById('fat-val').textContent = Math.round(summary?.total_fat || 0) + 'г';
    document.getElementById('carbs-val').textContent = Math.round(summary?.total_carbohydrates || 0) + 'г';

    // Meal sections
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
                    <div class="entry-row">
                        <div class="entry-info">
                            <div class="entry-name">${e.product_name}</div>
                            <div class="entry-weight">${e.serving_amount}г · Б${Math.round(e.protein)} Ж${Math.round(e.fat)} У${Math.round(e.carbohydrates)}</div>
                        </div>
                        <div class="entry-cal">${Math.round(e.calories)} ккал</div>
                    </div>
                `).join('')}
            </div>
            <div class="add-btn" onclick="openAddFood('${meal.id}')">+ Добавить</div>
        `;
        container.appendChild(section);
    }
}

function changeDate(delta) {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + delta);
    currentDate = d.toISOString().slice(0, 10);
    loadDiary();
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (dateStr === today) return 'Сегодня';
    if (dateStr === yesterday) return 'Вчера';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

// ---- Add Food Modal ----
function openAddFood(mealId) {
    selectedMealId = mealId;
    document.getElementById('add-food-modal').classList.add('active');
    document.getElementById('food-search').value = '';
    document.getElementById('search-results').innerHTML = '';
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
    searchTimeout = setTimeout(() => searchProducts(q), 300);
}

async function searchProducts(q) {
    const products = await api(`/products?q=${encodeURIComponent(q)}&limit=20`);
    const container = document.getElementById('search-results');
    if (!products?.length) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text2)">Ничего не найдено</div>';
        return;
    }
    container.innerHTML = products.map(p => `
        <div class="product-row" onclick='selectProduct(${JSON.stringify(p)})'>
            <div>
                <div class="p-name">${p.name}${p.is_verified ? ' ✓' : ''}</div>
                <div class="p-brand">${p.brand || ''} · ${p.serving_size}${p.serving_unit}</div>
            </div>
            <div class="p-cal">${p.calories ? Math.round(p.calories) + ' ккал' : '—'}</div>
        </div>
    `).join('');
}

function selectProduct(product) {
    closeModal('add-food-modal');
    document.getElementById('portion-modal').classList.add('active');
    document.getElementById('portion-product-name').textContent = product.name;
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

// ---- Stats ----
async function loadStats() {
    const data = await api('/stats/week');
    if (!data) return;
    renderStats(data);
}

function renderStats(data) {
    const container = document.getElementById('stats-content');
    const days = data.days || [];
    const avg = data.averages || {};
    
    const maxCal = Math.max(...days.map(d => d.calories), 1);
    
    container.innerHTML = `
        <div class="card">
            <div class="card-title">Среднее за неделю</div>
            <div class="macros" style="justify-content:space-around">
                <div class="macro"><div class="macro-value">${Math.round(avg.avg_calories)}</div><div class="macro-label">ккал</div></div>
                <div class="macro macro-protein"><div class="macro-value">${Math.round(avg.avg_protein)}г</div><div class="macro-label">белки</div></div>
                <div class="macro macro-fat"><div class="macro-value">${Math.round(avg.avg_fat)}г</div><div class="macro-label">жиры</div></div>
                <div class="macro macro-carbs"><div class="macro-value">${Math.round(avg.avg_carbohydrates)}г</div><div class="macro-label">углеводы</div></div>
            </div>
        </div>
        <div class="card">
            <div class="card-title">Калории по дням</div>
            <div class="chart-bars">
                ${days.map(d => {
                    const h = Math.max((d.calories / maxCal) * 100, 2);
                    const dayName = new Date(d.date).toLocaleDateString('ru-RU', { weekday: 'short' });
                    return `<div class="chart-bar">
                        <div class="bar-value">${Math.round(d.calories)}</div>
                        <div class="bar" style="height:${h}%"></div>
                        <div class="bar-label">${dayName}</div>
                    </div>`;
                }).join('')}
            </div>
        </div>
    `;
}

// ---- Navigation ----
function setActiveTab(tab) {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    
    document.getElementById('diary-view').classList.add('hidden');
    document.getElementById('stats-view').classList.add('hidden');
    
    if (tab === 'diary') {
        document.getElementById('diary-view').classList.remove('hidden');
        loadDiary();
    } else if (tab === 'stats') {
        document.getElementById('stats-view').classList.remove('hidden');
        loadStats();
    }
}

function showError(msg) {
    alert(msg);
}
