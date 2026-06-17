# Nutrition Diary

Дневник питания на FastAPI + PostgreSQL с веб-интерфейсом, авто-расчётом КБЖУ и трекером гидратации.

**Live demo:** https://nutrition-diary-production.up.railway.app  
**Demo-аккаунт:** `demo@nutrition-diary.app` или логин `demo` / пароль `Demo12345!`

## Возможности

### Учёт еды
- Дневник приёмов пищи с КБЖУ, клетчаткой, водой
- Каталог: 2100+ продуктов (ручной сид с витаминами + Open Food Facts)
- Категории (4 типа приёмов по умолчанию: завтрак/перекус/обед/ужин), шаблоны
- Поиск, штрихкоды, фото-распознавание (требует ключ Anthropic Vision или LogMeal)
- Импорт/экспорт CSV и JSON
- Шаринг рациона публичной ссылкой

### Здоровье
- 42 диагноза ICD-11 с диетическими правилами (ограничить/увеличить)
- Метрики: вес, глюкоза, давление, пульс, шаги
- ИМТ с цветовой интерпретацией (норма/недовес/избыток/ожирение)
- Дневник настроения 1-5 + энергия 1-5 + часы сна
- Корреляция настроения с дневным КБЖУ

### Авто-расчёты
- **КБЖУ по Миффлину-Сан Жеор**: BMR → TDEE → цели с учётом возраста, пола, активности и цели (худеть / держать / набрать)
- **Гидратация**: цель = вес × 30 мл (override вручную). Трекер по типам: вода / чай / кофе / сок / молоко / другое
- Рекомендации на основе анализа недели + диагнозов (без внешних API)

### Интервальное голодание
- Планы 16:8, 18:6, 20:4, 5:2, кастомные
- Активная сессия, история, статистика

### Интерфейс
- PWA с офлайн-режимом и Service Worker
- Темы: тёмная / светлая + 5 акцентов
- Мультиязычность RU / EN с авто-применением
- Профиль и Настройки в отдельных модалках
- Push-уведомления и умные напоминания
- Десктоп-версия на SQLite (start.bat для Windows)

## Стек

- Python 3.12, FastAPI, SQLAlchemy 2.x (async), Alembic
- PostgreSQL 16 (prod) / SQLite (desktop)
- JWT auth (access + refresh, login по email или username)
- Pydantic v2, asyncpg, bcrypt
- Docker, Railway (deploy)

## API

База: `/api/v1/`. Swagger UI: `/docs`. 60+ эндпоинтов в группах:
`auth`, `products`, `diary`, `meals`, `barcode`, `food-scan`,
`health`, `devices`, `mood`, `fasting`, `water`, `nutrition`,
`stats`, `nutrients`, `recommendations`, `export`, `share`, `sync`, `bot`.

Главные:
- `POST /auth/login` — принимает email или username в поле `login`
- `POST /auth/recover-username` — найти свой логин по email + паролю
- `GET /nutrition/auto-goals` — авто-расчёт КБЖУ (Mifflin-St Jeor)
- `GET /water/today` — потребление за день + история
- `GET /water/goal` — цель (авто или override)
- `GET /mood/correlation?days=30` — настроение vs питание
- `GET /recommendations` — рекомендации на основе недели

## Запуск

### Docker (быстро)

```bash
cp .env.example .env
docker-compose up --build
```

API на http://localhost:8000, Swagger на `/docs`.

### Production (Railway)

Один сервис (Dockerfile) + PostgreSQL addon. При старте автоматически:
- Применяются миграции Alembic
- При пустой БД — сидится 170 продуктов + 42 диагноза + витамины
- При `EXTENDED_SEED=1` — расширенный импорт из Open Food Facts (опционально)

### Desktop (Windows)

```bash
desktop/start.bat
```

SQLite, без Docker, всё локально.

## Переменные окружения

| Переменная | Описание |
|---|---|
| `DATABASE_URL` | Postgres (asyncpg) или SQLite. Auto-нормализуется (`postgresql://` → `postgresql+asyncpg://`) |
| `SECRET_KEY` | Секрет для JWT (минимум 32 символа) |
| `PORT` | Порт uvicorn (по умолчанию 8000) |
| `DEBUG` | true/false |
| `ANTHROPIC_API_KEY` | (опционально) для AI-рекомендаций и распознавания еды |
| `LOGMEAL_API_KEY` | (опционально) альтернатива для распознавания |
| `EXTENDED_SEED` | `1` чтобы при следующем старте дозалить OFF-продукты |
| `DEMO_USER` | `1` чтобы создать `demo@nutrition-diary.app` с примером дня |

## Структура

```
app/
  api/v1/endpoints/       # 18 групп API: auth, water, mood, fasting, nutrition, ...
  core/                   # security, deps, settings
  db/                     # session, base, compat (UUIDType, JSONType для SQLite)
  models/                 # SQLAlchemy: User, Product, Meal, DiaryEntry,
                          # ICD11Condition, UserCondition, DeviceIntegration,
                          # HealthMetric, FastingSession, MoodEntry, WaterEntry
  schemas/                # Pydantic v2
  services/               # бизнес-логика
  static/                 # JS, CSS, sw.js (Service Worker)
  templates/index.html    # SPA на одной странице
desktop/                  # десктоп-версия + start.bat
migrations/versions/      # 001-007 Alembic миграции
scripts/                  # seed_products, seed_conditions, seed_demo_user,
                          # import_off_api, import_usda, dedup, seed_if_empty
tests/                    # pytest
```

## Лицензия

MIT — см. [LICENSE](LICENSE).
