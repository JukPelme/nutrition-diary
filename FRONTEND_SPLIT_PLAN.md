# Frontend split plan — app.js модуляризация

Ветка: `agent/frontend-modules` (создана 2026-07-05). Прод НЕ трогается (Railway деплоит только с main). Слить в main через PR когда готово + CI зелёный.

## Контекст
- app.js: 4800 строк, 234 функции, всё в глобальном scope, 413 DOM-обращений.
- index.html: 62 уникальных функции в 119 inline-onclick.
- Ревью Fable 5 (external) рекомендовал ES-модули. Наш scope-анализ выявил риски → поэтапный подход.

## Порядок загрузки скриптов (index.html 1125-1131), все НЕ-модули:
html5-qrcode → dexie.min.js → i18n.js → api.js → db.js → sync.js → app.js → inline<script>(1132)

## Глобальное состояние (кандидат в state.js), app.js top-level:
currentDate, meals, entries, selectedMealId, userGoals, waterGoal, waterCount,
+ searchTimeout, barcodeScanner, scannerActive, nativeScannerStream, recipeIngredients,
createMode, statsPeriod, fastingTimer, currentMood, _chatLoaded, _compareList, _altProductId, и др.

## Кросс-файловые связи (циклические через глобали):
- api.js: api(), token, setToken, setRefreshToken, logout, isLoggedIn — базовый слой (уже отдельный).
- sync.js: определяет showToast(); зовёт loadDiary (app.js) через typeof-guard.
- app.js: зовёт showToast (из sync.js).
- db.js: зовёт api().
→ При модулях станут явными import. Пока — держатся на window/global.

## 62 onclick-функции (должны остаться доступны из HTML):
__hardRefresh __showCameras addMetric addToDiary addVoiceItems addWater addWaterCustom
autoCalcGoals changeDate clearChat clearShoppingChecks closeBarcodeModal closeModal
closeVoiceModal confirmDeleteAccount connectDevice copyDay createCustomProduct dismissSeasonal
downloadMyData generateMealPlan importRecipeFromUrl logout openAdmin openChat openCreateRecipe
openMealPlanGenerator openProfile openSettings openUniversalVoice saveDietRestrictions
saveNutrientGoals saveRecipe saveSettings searchBarcode seedCuisine seedRussianRecipes
sendChatMessage setAccent setActiveTab setAiQuality setCreateMode setEnergy setLang setMood
setTheme shareDay shareDayAsImage shareShoppingList suggestFromFridge syncExport testPush
toggleAuthMode toggleBarcodeScanner toggleChatMic toggleNotifications togglePush
toggleUniversalVoice toggleVoiceRec verifyTotp

## ПЛАН (два этапа)

### Этап 1 — механический распил (почти нулевой риск, делать первым)
Разрезать app.js на обычные <script>-файлы по секциям-комментам (// ---- Auth ----, // ---- Water Tracker ----, и т.д.). Глобали остаются глобальными, onclick работает, логика НЕ меняется.
- Секции по существующим комментам: auth, diary, water, products/barcode, recipes, gamification,
  chat, voice, devices, stats, fasting, mood, settings, meal-plan, shopping, compare, share.
- Обновить index.html: заменить <script src=app.js> на N файлов В ПРАВИЛЬНОМ ПОРЯДКЕ
  (сначала те, где определены глобали и showToast/state, потом зависимые).
- Обновить sw.js STATIC_ASSETS: добавить все новые js + bump CACHE_NAME (сейчас v27 → v28).
- Проверить build-exe.yml: PyInstaller должен паковать всю static/js/ (проверить include).
- Тест: smoke вручную (login, дневник, вода, настройки) + существующий бэкенд-CI не затронут.
- Порядок важен: определения глобалей и showToast должны грузиться ДО использующих.

### Этап 2 — ES-модули для чистой логики (позже, отдельный PR)
- Вынести чистые функции (расчёты КБЖУ, стрики, форматирование дат/чисел) в модули БЕЗ DOM.
- window.* мостик для onclick при переходе на type="module".
- state.js: общее состояние как объект (export const state = {...}); заменить обращения currentDate → state.currentDate (большой diff, главный риск — делать аккуратно).
- Фронт-тесты через node --test или Vitest на вынесенную чистую логику.

## Риски (из scope)
- 62 onclick сломаются при type="module" без window-мостика (Этап 2).
- Мутация импортированного `let` невозможна — нужен state-объект (Этап 2).
- SW-кэш: не забыть новые файлы в STATIC_ASSETS + bump (оба этапа).
- Порядок <script> при не-модульном распиле (Этап 1) критичен.
- Фронт-тестов пока нет — Этап 1 проверять руками.

## Статус: PLAN ONLY. Код НЕ тронут. Ветка создана, ждёт выполнения в новой сессии.
