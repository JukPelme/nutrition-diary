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

function openSettings() {
    document.getElementById('settings-modal').classList.add('active');
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
                    <div class="p-name">⭐ ${p.name}</div>
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
                <div class="p-name">${p.name}${p.is_verified ? ' ✓' : ''}</div>
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
    const container = document.getElementById('health-content');
    container.innerHTML = '<div class="card" style="text-align:center;padding:20px;color:var(--text2)">Загрузка...</div>';

    const profile = await api('/health/profile');
    if (!profile) { container.innerHTML = '<div class="card" style="padding:20px;color:var(--text2)">Ошибка загрузки</div>'; return; }

    const conditions = profile.conditions || [];
    const recs = profile.recommendations || {};

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

    container.innerHTML = `
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
function exportCSV(days) {
    window.open(`/api/v1/export/csv?days=${days}`, '_blank');
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
            <div class="card-title">Экспорт данных</div>
            <div style="display:flex;gap:8px">
                <button class="btn btn-secondary" style="flex:1" onclick="exportCSV(7)">7 дней</button>
                <button class="btn btn-secondary" style="flex:1" onclick="exportCSV(30)">30 дней</button>
                <button class="btn btn-secondary" style="flex:1" onclick="exportCSV(90)">3 месяца</button>
            </div>
        </div>
        <div class="card">
            <div class="card-title">Среднее за неделю</div>
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
    document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');

    ['diary-view','stats-view','nutrients-view','health-view'].forEach(v =>
        document.getElementById(v)?.classList.add('hidden'));

    if (tab === 'diary') {
        document.getElementById('diary-view').classList.remove('hidden');
        loadDiary();
    } else if (tab === 'stats') {
        document.getElementById('stats-view').classList.remove('hidden');
        loadStats();
    } else if (tab === 'nutrients') {
        document.getElementById('nutrients-view').classList.remove('hidden');
        loadNutrients();
    } else if (tab === 'health') {
        document.getElementById('health-view').classList.remove('hidden');
        loadHealth();
    }
}

function showError(msg) {
    alert(msg);
}
