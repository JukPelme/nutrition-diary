
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
