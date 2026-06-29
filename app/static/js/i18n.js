
// ---- Internationalization (i18n) ----
const TRANSLATIONS = {
    ru: {
        diary: 'Дневник', plan: 'План', nutrients: 'Нутриенты', stats: 'Статистика', health: 'Здоровье',
        today: 'Сегодня', yesterday: 'Вчера', tomorrow: 'Завтра',
        breakfast: 'Завтрак', lunch: 'Обед', dinner: 'Ужин', snack: 'Перекус',
        add: '+ Добавить', search: 'Поиск продуктов...', calories: 'Калории',
        protein: 'Белки', fat: 'Жиры', carbs: 'Углеводы',
        water: 'Вода', glasses: 'стаканов',
        settings: 'Настройки', theme: 'Тема', dark: 'Тёмная', light: 'Светлая',
        accent: 'Акцент', dailyGoal: 'Дневная норма', save: 'Сохранить',
        login: 'Войти', register: 'Зарегистрироваться', email: 'Email', password: 'Пароль', name: 'Имя',
        noAccount: 'Нет аккаунта?', hasAccount: 'Уже есть аккаунт?',
        signUp: 'Регистрация', wrongCreds: 'Неверный email или пароль',
        regError: 'Ошибка регистрации',
        notifications: 'Напоминания', on: 'Вкл', off: 'Выкл',
        devices: 'Устройства и приложения', connect: 'Подключить',
        export: 'Экспорт данных', days7: '7 дней', days30: '30 дней', months3: '3 месяца',
        week: 'Неделя', month: 'Месяц',
        avgFor: 'Среднее за', goalProgress: 'Прогресс к целям',
        recommendations: 'Рекомендации', frequentFoods: 'Часто едите',
        myConditions: 'Мои состояния', addCondition: 'Добавить',
        grams: 'г', kcal: 'ккал', portion: 'Порция',
        appTitle: 'Дневник питания', appSubtitle: 'Следите за рационом и КБЖУ',
        addProduct: 'Добавить продукт',
        language: 'Язык',
        // Extended (2026-06-17)
        share: 'Поделиться', logout: 'Выйти',
        mood: 'Настроение', energy: 'Энергия', sleepHours: 'Сон, ч',
        weekPlan: 'План на неделю', weightGoal: 'Цель по весу', weightChart: 'График веса',
        intermittentFasting: 'Интервальное голодание', fastingStats: 'Статистика голодания',
        history: 'История', fasting: 'Голодание',
        addProduct: 'Добавить продукт', allCategories: 'Все категории',
        byRelevance: 'По релевантности', barcode: 'Штрихкод', search: 'Найти',
        product: 'Продукт', portion: 'Порция, г',
        createProduct: 'Создать продукт', productName: 'Название',
        category: 'Категория', uncategorized: 'Без категории',
        enterKBJU: 'Ввести КБЖУ', fromIngredients: 'Из ингредиентов',
        proteinG: 'Белки, г', fatG: 'Жиры, г', carbsG: 'Углеводы, г',
        account: 'Аккаунт', body: 'Тело', autoGoals: 'Для авто-расчёта КБЖУ',
        height: 'Рост, см', currentWeight: 'Текущий вес, кг', targetWeight: 'Цель веса, кг',
        birthYear: 'Год рождения', sex: 'Пол', activity: 'Активность', goal: 'Цель',
        calculateAuto: '⚡ Рассчитать автоматически',
        dailyNorm: 'Дневная норма',
        recover: 'Восстановить', forgot: 'Забыл логин',
        liquid: 'Жидкость', signOut: 'Выйти',
        weight: 'Вес', glucose: 'Глюкоза', bloodPressure: 'Давление',
        heartRate: 'Пульс', steps: 'Шаги', record: 'Записать',
        sync: 'Синхронизация', export: 'Экспорт', import: 'Импорт',
        offline: 'Офлайн', online: 'Онлайн', syncing: 'Синхронизация',
        perWeek: 'за неделю', kcalShort: 'ккал', kcalPer100g: 'ккал/100г', loading: 'Загрузка...', loadError: 'Ошибка загрузки', addedSynced: 'Добавлено', addedOffline: 'Добавлено офлайн — синхр. при сети', noEntries: 'Записей нет',
        outOf: 'из',
        custom: '＋ свой',
        aiMealPlan: '✨ AI-меню на неделю', aiMealPlanHint: 'Claude составит сбалансированный план под твои цели и диагнозы. Каждый день можно применить в дневник одним тапом.',
        weekOverview: 'План на неделю',
        aiMealPlanGen: '✨ Сгенерировать меню', mealPlanDays: 'На сколько дней', mealPlanAvoid: 'Исключить (через запятую): аллергии, нелюбимое', mealPlanNotes: 'Пожелания (опц.)', mealPlanCost: 'Генерация занимает 30-60 сек, Claude Sonnet 4.6. Ориентировочно ~5 центов за план.', generate: 'Сгенерировать',
        applyDay: 'Применить в дневник', mealPlanNone: 'Активного плана нет — нажми «Сгенерировать»', tips: 'Подсказки', confirmApplyDay: 'Применить день ', toDiary: ' в дневник?', appliedEntries: 'Добавлено записей: ', confirmDeletePlan: 'Удалить план?', mealPlanGenerating: 'Генерируем меню… 30-60 сек', mealPlanReady: 'Готово!',
        aiQuality: 'Распознавание еды (AI)', aiFast: 'Быстро', aiPrecise: 'Точно', aiQualityHint: 'Быстро = Haiku 4.5 (~1¢/фото), Точно = Sonnet 4.6 (~5¢/фото, лучше для сложных блюд)',
    },
    en: {
        diary: 'Diary', plan: 'Plan', nutrients: 'Nutrients', stats: 'Statistics', health: 'Health',
        today: 'Today', yesterday: 'Yesterday', tomorrow: 'Tomorrow',
        breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack',
        add: '+ Add', search: 'Search products...', calories: 'Calories',
        protein: 'Protein', fat: 'Fat', carbs: 'Carbs',
        water: 'Water', glasses: 'glasses',
        settings: 'Settings', theme: 'Theme', dark: 'Dark', light: 'Light',
        accent: 'Accent', dailyGoal: 'Daily goal', save: 'Save',
        login: 'Sign in', register: 'Sign up', email: 'Email', password: 'Password', name: 'Name',
        noAccount: "Don't have an account?", hasAccount: 'Already have an account?',
        signUp: 'Sign up', wrongCreds: 'Invalid email or password',
        regError: 'Registration error',
        notifications: 'Reminders', on: 'On', off: 'Off',
        devices: 'Devices & Apps', connect: 'Connect',
        export: 'Export data', days7: '7 days', days30: '30 days', months3: '3 months',
        week: 'Week', month: 'Month',
        avgFor: 'Average for', goalProgress: 'Goal progress',
        recommendations: 'Recommendations', frequentFoods: 'Frequent foods',
        myConditions: 'My conditions', addCondition: 'Add',
        grams: 'g', kcal: 'kcal', portion: 'Portion',
        appTitle: 'Nutrition Diary', appSubtitle: 'Track your diet and macros',
        addProduct: 'Add product',
        language: 'Language',
        // Extended (2026-06-17)
        share: 'Share', logout: 'Logout',
        mood: 'Mood', energy: 'Energy', sleepHours: 'Sleep, h',
        weekPlan: 'Weekly plan', weightGoal: 'Weight goal', weightChart: 'Weight chart',
        intermittentFasting: 'Intermittent fasting', fastingStats: 'Fasting stats',
        history: 'History', fasting: 'Fasting',
        addProduct: 'Add product', allCategories: 'All categories',
        byRelevance: 'By relevance', barcode: 'Barcode', search: 'Search',
        product: 'Product', portion: 'Portion, g',
        createProduct: 'Create product', productName: 'Name',
        category: 'Category', uncategorized: 'Uncategorized',
        enterKBJU: 'Enter macros', fromIngredients: 'From ingredients',
        proteinG: 'Protein, g', fatG: 'Fat, g', carbsG: 'Carbs, g',
        account: 'Account', body: 'Body', autoGoals: 'Auto-calculate goals',
        height: 'Height, cm', currentWeight: 'Current weight, kg', targetWeight: 'Target weight, kg',
        birthYear: 'Birth year', sex: 'Sex', activity: 'Activity', goal: 'Goal',
        calculateAuto: '⚡ Calculate automatically',
        dailyNorm: 'Daily norm',
        recover: 'Recover', forgot: 'Forgot login',
        liquid: 'Liquids', signOut: 'Sign out',
        weight: 'Weight', glucose: 'Glucose', bloodPressure: 'Blood pressure',
        heartRate: 'Heart rate', steps: 'Steps', record: 'Save',
        sync: 'Sync', export: 'Export', import: 'Import',
        offline: 'Offline', online: 'Online', syncing: 'Syncing',
        perWeek: 'per week', kcalShort: 'kcal', kcalPer100g: 'kcal/100g', loading: 'Loading...', loadError: 'Loading error', addedSynced: 'Added', addedOffline: 'Added offline — will sync', noEntries: 'No entries',
        outOf: 'of',
        custom: '＋ custom',
        aiMealPlan: '✨ AI weekly meal plan', aiMealPlanHint: 'Claude builds a balanced plan around your goals and conditions. Apply any day to the diary with one tap.',
        weekOverview: 'Week overview',
        aiMealPlanGen: '✨ Generate meal plan', mealPlanDays: 'How many days', mealPlanAvoid: 'Avoid (comma-separated): allergies, dislikes', mealPlanNotes: 'Notes (optional)', mealPlanCost: 'Generation takes 30-60 sec, Claude Sonnet 4.6. Roughly ~5 cents per plan.', generate: 'Generate',
        applyDay: 'Apply to diary', mealPlanNone: 'No active plan — tap Generate', tips: 'Tips', confirmApplyDay: 'Apply day ', toDiary: ' to diary?', appliedEntries: 'Entries added: ', confirmDeletePlan: 'Delete this plan?', mealPlanGenerating: 'Generating menu… 30-60s', mealPlanReady: 'Done!',
        aiQuality: 'Food recognition (AI)', aiFast: 'Fast', aiPrecise: 'Precise', aiQualityHint: 'Fast = Haiku 4.5 (~1¢/photo), Precise = Sonnet 4.6 (~5¢/photo, better for complex dishes)',
    },
    ja: {
        diary: '日記', plan: 'プラン', nutrients: '栄養素', stats: '統計', health: '健康',
        today: '今日', yesterday: '昨日', tomorrow: '明日',
        breakfast: '朝食', lunch: '昼食', dinner: '夕食', snack: '間食',
        add: '+ 追加', search: '検索', calories: 'カロリー',
        protein: 'タンパク質', fat: '脂質', carbs: '炭水化物',
        water: '水', glasses: '杯',
        settings: '設定', theme: 'テーマ', dark: 'ダーク', light: 'ライト',
        accent: 'アクセント', dailyGoal: '1日の目標', save: '保存',
        login: 'ログイン', register: '新規登録', email: 'メールアドレス', password: 'パスワード', name: '名前',
        noAccount: 'アカウントをお持ちでない方へ', hasAccount: 'すでにアカウントをお持ちの方へ',
        signUp: 'アカウント登録', wrongCreds: 'メールアドレスまたはパスワードが正しくありません',
        regError: '登録に失敗しました',
        notifications: '通知・リマインダー', on: 'オン', off: 'オフ',
        devices: '連携デバイス・アプリ', connect: '連携する',
        export: 'エクスポート', days7: '7日間', days30: '30日間', months3: '3ヶ月',
        week: '週', month: '月',
        avgFor: '平均（対象期間）', goalProgress: '目標の達成状況',
        recommendations: 'アドバイス', frequentFoods: 'よく使う食品',
        myConditions: '体調・コンディション', addCondition: '追加',
        grams: 'g', kcal: 'kcal', portion: '分量 (g)',
        appTitle: '栄養日記', appSubtitle: '食事とPFCバランスを記録しましょう',
        addProduct: '食品を追加',
        language: '言語',
        // Extended (2026-06-17)
        share: '共有', logout: 'ログアウト',
        mood: '気分', energy: 'エネルギー', sleepHours: '睡眠時間 (時間)',
        weekPlan: '週間プラン', weightGoal: '目標体重', weightChart: '体重グラフ',
        intermittentFasting: '間欠的ファスティング', fastingStats: 'ファスティングの記録',
        history: '履歴', fasting: 'ファスティング',
        allCategories: 'すべてのカテゴリー',
        byRelevance: '関連度順', barcode: 'バーコード',
        product: '食品',
        createProduct: '食品を新規登録', productName: '食品名',
        category: 'カテゴリー', uncategorized: '未分類',
        enterKBJU: '栄養素を手入力', fromIngredients: '材料から作成',
        proteinG: 'タンパク質 (g)', fatG: '脂質 (g)', carbsG: '炭水化物 (g)',
        account: 'アカウント', body: '身体情報', autoGoals: 'PFC自動計算に必要な情報',
        height: '身長 (cm)', currentWeight: '現在の体重 (kg)', targetWeight: '目標体重 (kg)',
        birthYear: '生年', sex: '性別', activity: '活動レベル', goal: '目標',
        calculateAuto: '⚡ 自動で計算する',
        dailyNorm: '1日の摂取目標',
        recover: 'パスワードを再設定', forgot: 'ログイン情報を忘れた方へ',
        liquid: '水分', signOut: 'ログアウト',
        weight: '体重', glucose: '血糖値', bloodPressure: '血圧',
        heartRate: '心拍数', steps: '歩数', record: '記録する',
        sync: '同期', import: 'インポート',
        offline: 'オフライン', online: 'オンライン', syncing: '同期中...',
        perWeek: '週間合計', kcalShort: 'kcal', kcalPer100g: 'kcal/100g', loading: '読み込み中...', loadError: '読み込みに失敗しました', addedSynced: '追加しました', addedOffline: 'オフラインで追加しました。接続時に自動で同期されます', noEntries: '記録がありません',
        outOf: '/',
        custom: '＋ カスタム',
        aiMealPlan: '✨ AI週間献立', aiMealPlanHint: 'Claudeが目標と疾患を考慮したバランスの取れた献立を作成します。各日をワンタップで日記に反映できます。',
        weekOverview: '週間プラン',
        aiMealPlanGen: '✨ 献立を作成', mealPlanDays: '日数', mealPlanAvoid: '避ける食材(カンマ区切り): アレルギーや嫌いなもの', mealPlanNotes: 'メモ(任意)', mealPlanCost: '生成に30〜60秒、Claude Sonnet 4.6 を使用。1献立あたり約5セント。', generate: '生成',
        applyDay: '日記に反映', mealPlanNone: 'アクティブな献立はありません — 「生成」をタップ', tips: 'ヒント', confirmApplyDay: '日付 ', toDiary: ' を日記に反映しますか?', appliedEntries: '追加した記録数: ', confirmDeletePlan: 'この献立を削除しますか?', mealPlanGenerating: '献立を生成中… 30〜60秒', mealPlanReady: '完了!',
        aiQuality: '食品AI認識', aiFast: '高速', aiPrecise: '高精度', aiQualityHint: '高速 = Haiku 4.5（約1¢/枚）、高精度 = Sonnet 4.6（約5¢/枚・複雑な料理に対応）',
    }
};

let currentLang = localStorage.getItem('lang') || 'ru';

function t(key) {
    return TRANSLATIONS[currentLang]?.[key] || TRANSLATIONS.ru[key] || key;
}

function setLang(lang) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
    // Sync to backend if user is logged in
    try {
        const tok = localStorage.getItem('token');
        if (tok) {
            fetch('/api/v1/auth/me', {
                method: 'PATCH',
                headers: { 'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json' },
                body: JSON.stringify({ preferred_language: lang }),
            }).catch(()=>{});
        }
    } catch(e){}
    document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === lang));
    // Update static elements
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = t(el.dataset.i18n);
    });
    // Update nav labels
    document.querySelectorAll('.nav-label[data-i18n]').forEach(el => {
        el.textContent = t(el.dataset.i18n);
    });
    // Reload current view to apply translations
    const activeTab = document.querySelector('.nav-tab.active')?.dataset.tab;
    if (activeTab) setActiveTab(activeTab);
}

// Auto-apply saved language on page load
document.addEventListener('DOMContentLoaded', () => {
    if (currentLang !== 'ru') setLang(currentLang);
});


// === Category & meal name translators ===
// Backend stores categories/meals in Russian (free text). UI translates known ones.
const CATEGORY_MAP = {
    'Мясо':            { en: 'Meat',           ja: '肉類' },
    'Рыба':            { en: 'Fish',           ja: '魚' },
    'Морепродукты':    { en: 'Seafood',        ja: '魚介類' },
    'Молочные':        { en: 'Dairy',          ja: '乳製品' },
    'Яйца':            { en: 'Eggs',           ja: '卵' },
    'Крупы':           { en: 'Grains',         ja: '穀物' },
    'Хлеб':            { en: 'Bread',          ja: 'パン' },
    'Макароны':        { en: 'Pasta',          ja: 'パスタ' },
    'Фрукты':          { en: 'Fruits',         ja: '果物' },
    'Сухофрукты':      { en: 'Dried fruits',   ja: 'ドライフルーツ' },
    'Овощи':           { en: 'Vegetables',     ja: '野菜' },
    'Бобовые':         { en: 'Legumes',        ja: '豆類' },
    'Орехи':           { en: 'Nuts',           ja: 'ナッツ' },
    'Семена':          { en: 'Seeds',          ja: '種' },
    'Масла':           { en: 'Oils',           ja: '油' },
    'Сладкое':         { en: 'Sweets',         ja: 'スイーツ' },
    'Напитки':         { en: 'Beverages',      ja: '飲み物' },
    'Соусы':           { en: 'Sauces',         ja: 'ソース' },
    'Специи':          { en: 'Spices',         ja: '香辛料' },
    'Готовые блюда':   { en: 'Ready meals',    ja: '惣菜' },
    'Готовые гарниры': { en: 'Side dishes',    ja: '付け合わせ' },
    'Колбасы':         { en: 'Sausages',       ja: 'ソーセージ' },
    'Каши':            { en: 'Porridge',       ja: 'おかゆ' },
    'Фастфуд':         { en: 'Fast food',      ja: 'ファストフード' },
    'Полуфабрикаты':   { en: 'Convenience food', ja: '半加工食品' },
};

const MEAL_MAP = {
    'Завтрак': { en: 'Breakfast', ja: '朝食' },
    'Обед':    { en: 'Lunch',     ja: '昼食' },
    'Ужин':    { en: 'Dinner',    ja: '夕食' },
    'Перекус': { en: 'Snack',     ja: 'おやつ' },
};

const DRINK_TYPE_MAP = {
    'water':  { en: 'Water',  ja: '水',     ru: 'Вода' },
    'tea':    { en: 'Tea',    ja: 'お茶',   ru: 'Чай' },
    'coffee': { en: 'Coffee', ja: 'コーヒー', ru: 'Кофе' },
    'juice':  { en: 'Juice',  ja: 'ジュース', ru: 'Сок' },
    'milk':   { en: 'Milk',   ja: '牛乳',   ru: 'Молоко' },
    'other':  { en: 'Other',  ja: 'その他', ru: 'Другое' },
};

function trCategory(name) {
    if (!name || currentLang === 'ru') return name;
    return CATEGORY_MAP[name]?.[currentLang] || name;
}

function trMeal(name) {
    if (!name || currentLang === 'ru') return name;
    return MEAL_MAP[name]?.[currentLang] || name;
}

function trDrinkType(key) {
    return DRINK_TYPE_MAP[key]?.[currentLang] || key;
}

// Date formatter respecting currentLang
function formatDateLocale(d) {
    const date = (d instanceof Date) ? d : new Date(d);
    const locale = currentLang === 'ja' ? 'ja-JP' : (currentLang === 'en' ? 'en-US' : 'ru-RU');
    return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', weekday: 'short' });
}
