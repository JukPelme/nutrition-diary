// app-07-stats.js — mechanical split of app.js (Этап 1). Loaded as classic script; all globals stay global.
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


