// app-02-settings.js — mechanical split of app.js (Этап 1). Loaded as classic script; all globals stay global.
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
        { const el = document.getElementById('prof-waist'); if (el) el.value = me.waist_cm || ''; }
        { const el = document.getElementById('prof-body-fat'); if (el) el.value = me.body_fat_pct || ''; }
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
        renderBodyComposition();
    }
    ['prof-height', 'prof-weight', 'prof-waist', 'prof-body-fat'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => renderBodyComposition());
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

async function renderBodyComposition() {
    const block = document.getElementById('bmi-block');
    if (!block) return;
    const w = parseFloat(document.getElementById('prof-weight')?.value);
    const h = parseFloat(document.getElementById('prof-height')?.value);
    if (!w || !h) {
        block.className = 'bmi-block empty';
        block.innerHTML = t('enterHeightWeight') || 'Укажи рост и вес';
        return;
    }
    // Quick local BMI while waiting for server
    const hm = h / 100, bmiQ = w / (hm * hm);
    block.className = 'bmi-block loading';
    block.innerHTML = `<span style="opacity:.5">ИМТ ${bmiQ.toFixed(1)}…</span>`;
    try {
        const bc = await api('/health/body-composition');
        if (!bc || !bc.available) {
            block.className = 'bmi-block empty';
            block.innerHTML = t('enterHeightWeight') || 'Укажи рост и вес';
            return;
        }
        block.className = 'bmi-block body-comp-card';
        block.innerHTML = _renderBodyCompCard(bc);
    } catch(e) {
        // fallback to local BMI
        const bmi = bmiQ;
        const bmiCat = bmi < 18.5 ? {l:t('bmiLow')||'Недовес',c:'bmi-band-low'}
            : bmi < 25 ? {l:t('bmiNormal')||'Норма',c:'bmi-band-norm'}
            : bmi < 30 ? {l:t('bmiOver')||'Избыток',c:'bmi-band-over'}
            : {l:t('bmiObese')||'Ожирение',c:'bmi-band-obese'};
        block.className = 'bmi-block';
        block.innerHTML = `<div><div class="bmi-label">ИМТ</div><div class="bmi-value">${bmi.toFixed(1)}</div></div><div class="bmi-band ${bmiCat.c}">${bmiCat.l}</div>`;
    }
}

function _renderBodyCompCard(bc) {
    const L = {
        bmi_cats: {severe_thin:t('bmiSevereThin')||'Резкий недовес', moderate_thin:t('bmiModerateThin')||'Умеренный недовес', mild_thin:t('bmiMildThin')||'Лёгкий недовес', normal:t('bmiNormal')||'Норма', overweight:t('bmiOver')||'Избыток', obese1:t('bmiObese1')||'Ожирение I', obese2:t('bmiObese2')||'Ожирение II', obese3:t('bmiObese3')||'Ожирение III'},
        whtr_cats: {underweight:t('whtrUnderweight')||'Недовес', healthy:t('whtrHealthy')||'Норма', increased_risk:t('whtrRisk')||'Повышенный риск', high_risk:t('whtrHighRisk')||'Высокий риск'},
        ffmi_cats: {below_avg:t('ffmiBelow')||'Ниже среднего', average:t('ffmiAvg')||'Среднее', above_avg:t('ffmiAbove')||'Выше среднего', excellent:t('ffmiExcellent')||'Отлично', elite:t('ffmiElite')||'Элита', exceptional:t('ffmiExceptional')||'Исключительно'},
        fat_cats: {essential:t('fatEssential')||'Эссенциальный', athlete:t('fatAthlete')||'Атлет', fitness:t('fatFitness')||'Фитнес', average:t('fatAverage')||'Среднее', obese:t('fatObese')||'Ожирение'},
    };
    let html = '<div class="bc-grid">';
    // Primary: WHtR if available, else BMI
    const primary = bc.primary_metric;
    // BMI block
    const bmiInfo = bc.bmi;
    const bmiLabel = L.bmi_cats[bmiInfo.category] || bmiInfo.category;
    const bmiNote = bmiInfo.athlete_note ? `<div class="bc-note">${t('bmiAthleteNote')||'ИМТ не учитывает мышечную массу'}</div>` : '';
    html += `<div class="bc-metric${primary==='bmi'?' bc-primary':''}">
        <div class="bc-metric-title">ИМТ</div>
        <div class="bc-metric-value" style="color:${bmiInfo.color}">${bmiInfo.value}</div>
        <div class="bc-metric-cat" style="color:${bmiInfo.color}">${bmiLabel}</div>
        ${bmiNote}
    </div>`;
    // WHtR block
    if (bc.whtr) {
        const wi = bc.whtr;
        const wLabel = L.whtr_cats[wi.category] || wi.category;
        html += `<div class="bc-metric${primary==='whtr'?' bc-primary':''}">
            <div class="bc-metric-title">${t('whtrTitle')||'ОТ/Рост'} <span class="bc-badge">${t('preferred')||'точнее'}</span></div>
            <div class="bc-metric-value" style="color:${wi.color}">${wi.value}</div>
            <div class="bc-metric-cat" style="color:${wi.color}">${wLabel}</div>
        </div>`;
    }
    // FFMI block
    if (bc.ffmi) {
        const fi = bc.ffmi;
        const fLabel = L.ffmi_cats[fi.category] || fi.category;
        html += `<div class="bc-metric">
            <div class="bc-metric-title">FFMI</div>
            <div class="bc-metric-value" style="color:${fi.color}">${fi.ffmi}</div>
            <div class="bc-metric-cat" style="color:${fi.color}">${fLabel}</div>
        </div>`;
    }
    // Body fat %
    if (bc.body_fat) {
        const bfCat = L.fat_cats[bc.body_fat.category] || bc.body_fat.category;
        html += `<div class="bc-metric">
            <div class="bc-metric-title">${t('bodyFatPct')||'% жира'}</div>
            <div class="bc-metric-value" style="color:${bc.body_fat.color}">${bc.body_fat.pct}%</div>
            <div class="bc-metric-cat" style="color:${bc.body_fat.color}">${bfCat}</div>
        </div>`;
    }
    html += '</div>';
    return html;
}

function renderBMI(weight, heightCm) { renderBodyComposition(); }

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
            waist_cm: isNaN(parseFloat(document.getElementById('prof-waist')?.value)) ? null : parseFloat(document.getElementById('prof-waist').value),
            body_fat_pct: isNaN(parseFloat(document.getElementById('prof-body-fat')?.value)) ? null : parseFloat(document.getElementById('prof-body-fat').value),
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

