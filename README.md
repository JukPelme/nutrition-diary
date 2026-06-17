# Nutrition Diary

Дневник питания на FastAPI с десктоп-версией, AI-рекомендациями и интеграцией с Telegram.

## Возможности

- Учёт приёмов пищи, БЖУ, калорий, воды
- База продуктов (688+ позиций) + штрихкоды + фото-распознавание
- 46 диагнозов ICD-11 с подбором питания
- Шаблоны и планирование рациона на неделю
- Статистика, графики прогресса к целям
- Темы оформления (тёмная/светлая + 5 акцентов)
- PWA + умные уведомления
- Telegram-бот API
- AI-рекомендации по КБЖУ
- Мультиязычность (RU/EN)
- Экспорт/импорт JSON, CSV
- Дневник настроения (корреляция с питанием)
- Десктоп-версия на SQLite

## Стек

- Python 3.12, FastAPI, SQLAlchemy, Alembic
- PostgreSQL 16 (prod) / SQLite (desktop)
- Redis (кэш)
- Docker, Docker Compose
- PWA, GitHub Actions

## Запуск

### Docker (рекомендуется)

```bash
cp .env.example .env
docker-compose up --build
```

Откроется на http://localhost:8000. Документация API: /docs.

### Desktop (Windows)

```bash
desktop/start.bat
```

Использует SQLite, без Docker.

## Переменные окружения

См. .env.example:

- DATABASE_URL — строка подключения к PostgreSQL (asyncpg) или SQLite
- REDIS_URL — Redis для кэша
- SECRET_KEY — секрет для JWT
- DEBUG — режим отладки

## Структура

```
app/         — основной код (роуты, модели, сервисы)
desktop/     — десктоп-версия (SQLite + start.bat)
migrations/  — миграции Alembic
scripts/     — утилиты (импорт продуктов, init БД)
tests/       — pytest
```

## Лицензия

MIT — см. LICENSE.
