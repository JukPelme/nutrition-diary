// app-04-food.js — mechanical split of app.js (Этап 1). Loaded as classic script; all globals stay global.
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
                    <div class="p-name">${escapeHtml(p.name)}</div>
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
                    <div class="p-name">⭐ ${escapeHtml(p.name)}${p.source === 'openfoodfacts' ? ' 🌐' : ''}</div>
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
                <div class="p-name">${escapeHtml(p.name)}${p.is_verified ? ' ✓' : ''}${p.source === 'openfoodfacts' ? ' 🌐' : ''}</div>
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
    if (typeof awardFeature === "function") awardFeature("barcode");
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
    const _b = document.getElementById('cp-barcode'); if (_b) _b.value = '';
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
                <div class="p-name" style="font-size:13px">${escapeHtml(p.name)}</div>
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
            barcode: (document.getElementById('cp-barcode')?.value || '').trim() || null,
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

