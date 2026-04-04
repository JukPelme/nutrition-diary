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

    const cal = summary?.total_calories || 0;
    const goal = 2000;
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
            <div class="add-btn" onclick="openAddFood('${meal.id}')">+ Добавить</div>
        `;
        container.appendChild(section);
    }
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
function openCreateProduct() {
    document.getElementById('create-product-modal').classList.add('active');
    document.getElementById('cp-name').value = '';
    document.getElementById('cp-category').value = '';
    document.getElementById('cp-cal').value = '';
    document.getElementById('cp-protein').value = '';
    document.getElementById('cp-fat').value = '';
    document.getElementById('cp-carbs').value = '';
    document.getElementById('cp-name').focus();
}

async function createCustomProduct() {
    const name = document.getElementById('cp-name').value.trim();
    if (!name) { alert('Введите название'); return; }

    const product = await api('/products', {
        method: 'POST',
        body: JSON.stringify({
            name,
            category: document.getElementById('cp-category').value || null,
            calories: parseFloat(document.getElementById('cp-cal').value) || 0,
            protein: parseFloat(document.getElementById('cp-protein').value) || 0,
            fat: parseFloat(document.getElementById('cp-fat').value) || 0,
            carbohydrates: parseFloat(document.getElementById('cp-carbs').value) || 0,
        })
    });

    if (product?.id) {
        closeModal('create-product-modal');
        selectProduct(product);
    } else {
        alert('Ошибка создания продукта');
    }
}

// ---- Portion ----
function selectProduct(product) {
    closeModal('add-food-modal');
    closeModal('barcode-modal');
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
