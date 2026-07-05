// app-06-health.js — mechanical split of app.js (Этап 1). Loaded as classic script; all globals stay global.
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

