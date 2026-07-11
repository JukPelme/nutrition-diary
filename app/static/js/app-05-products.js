// app-05-products.js — mechanical split of app.js (Этап 1). Loaded as classic script; all globals stay global.
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
                <button class="btn btn-primary" style="padding:6px 12px;font-size:13px" onclick='addScannedFood(${_attrJSON(f)})'>+</button>
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
    document.getElementById('portion-product-name').innerHTML = escapeHtml(p.name) +
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
    document.getElementById('portion-product-name').innerHTML = escapeHtml(product.name) +
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

