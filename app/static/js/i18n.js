
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
    },
    ja: {
        diary: '日記', plan: 'プラン', nutrients: '栄養素', stats: '統計', health: '健康',
        today: '今日', yesterday: '昨日', tomorrow: '明日',
        breakfast: '朝食', lunch: '昼食', dinner: '夕食', snack: 'おやつ',
        add: '+ 追加', search: '検索', calories: 'カロリー',
        protein: 'タンパク質', fat: '脂質', carbs: '炭水化物',
        water: '水', glasses: '杯',
        settings: '設定', theme: 'テーマ', dark: 'ダーク', light: 'ライト',
        accent: 'アクセント', dailyGoal: '1日の目標', save: '保存',
        login: 'ログイン', register: '新規登録', email: 'メール', password: 'パスワード', name: '名前',
        noAccount: 'アカウントをお持ちでない方', hasAccount: 'すでにアカウントをお持ちの方',
        signUp: '登録', wrongCreds: 'メールまたはパスワードが正しくありません',
        regError: '登録エラー',
        notifications: 'リマインダー', on: 'オン', off: 'オフ',
        devices: 'デバイス・アプリ', connect: '接続',
        export: 'エクスポート', days7: '7日間', days30: '30日間', months3: '3ヶ月',
        week: '週', month: '月',
        avgFor: '平均', goalProgress: '目標達成度',
        recommendations: 'おすすめ', frequentFoods: 'よく食べるもの',
        myConditions: '体調', addCondition: '追加',
        grams: 'g', kcal: 'kcal', portion: '分量',
        appTitle: '栄養日記', appSubtitle: '食事と栄養素を記録',
        addProduct: '食品を追加',
        language: '言語',
        // Extended (2026-06-17)
        share: '共有', logout: 'ログアウト',
        mood: '気分', energy: 'エネルギー', sleepHours: '睡眠時間',
        weekPlan: '週間プラン', weightGoal: '目標体重', weightChart: '体重グラフ',
        intermittentFasting: '間欠的ファスティング', fastingStats: 'ファスティング統計',
        history: '履歴', fasting: 'ファスティング',
        allCategories: 'すべて',
        byRelevance: '関連順', barcode: 'バーコード',
        product: '食品',
        createProduct: '食品を作成', productName: '名称',
        category: 'カテゴリー', uncategorized: '未分類',
        enterKBJU: '栄養素を入力', fromIngredients: '材料から',
        proteinG: 'タンパク質 (g)', fatG: '脂質 (g)', carbsG: '炭水化物 (g)',
        account: 'アカウント', body: '身体', autoGoals: '自動計算のための情報',
        height: '身長 (cm)', currentWeight: '現在の体重 (kg)', targetWeight: '目標体重 (kg)',
        birthYear: '生年', sex: '性別', activity: '活動量', goal: '目標',
        calculateAuto: '⚡ 自動計算',
        dailyNorm: '1日の摂取目標',
        recover: '回復', forgot: 'ログイン名を忘れた',
        liquid: '水分', signOut: 'サインアウト',
        weight: '体重', glucose: '血糖値', bloodPressure: '血圧',
        heartRate: '心拍数', steps: '歩数', record: '記録',
        sync: '同期', import: 'インポート',
        offline: 'オフライン', online: 'オンライン', syncing: '同期中',
        perWeek: '週間', kcalShort: 'kcal', kcalPer100g: 'kcal/100g', loading: '読み込み中...', loadError: '読み込みエラー', addedSynced: '追加しました', addedOffline: 'オフラインで追加 — 接続時に同期', noEntries: '記録なし',
        outOf: '/',
        custom: '＋ カスタム',
    }
};

let currentLang = localStorage.getItem('lang') || 'ru';

function t(key) {
    return TRANSLATIONS[currentLang]?.[key] || TRANSLATIONS.ru[key] || key;
}

function setLang(lang) {
    currentLang = lang;
    localStorage.setItem('lang', lang);
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
