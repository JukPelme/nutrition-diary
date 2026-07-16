# История питания + повтор дня/приёма (ветка agent/diary-history)

Цель: список последних дней с едой, чтобы найти и повторить приём/день.

## Шаги
- [ ] backend: diary_service.get_recent_days(days=14)
- [ ] backend: GET /diary/recent?days=14
- [ ] frontend: модалка История + openHistory/renderHistory
- [ ] frontend: repeatDay/repeatMeal -> копируют в сегодня
- [ ] index.html: кнопка в шапке даты + history-modal
- [ ] i18n RU/EN/JA
- [ ] sw.js bump v36->v37
- [ ] тест backend /recent
- [ ] PR в main
