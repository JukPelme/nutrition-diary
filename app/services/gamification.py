"""Streaks + achievements engine — pure DB logic, no Claude required.

Public API:
  - get_streak(db, user) -> dict {current, longest, today_logged, week_logged}
  - check_and_award(db, user) -> list[str]   codes newly earned
  - get_user_achievements(db, user) -> {earned: [...], all: [...]}

Achievement codes follow the catalog in ACHIEVEMENT_CATALOG below.
"""
from uuid import uuid4
from datetime import date, datetime, timedelta, timezone
from sqlalchemy import select, func, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.diary import DiaryEntry
from app.models.water import WaterEntry
from app.models.health import MoodEntry, FastingSession
from app.models.recipe import Recipe
from app.models.achievement import Achievement, UserAchievement


# Catalog of all achievements. Auto-seeded into achievements table at startup.
ACHIEVEMENT_CATALOG = [
    # First-time / feature unlocks
    {"code": "first_entry",   "kind": "feature", "icon": "🌱", "threshold": None, "sort_order": 10,
     "ru": ("Первый шаг", "Добавь первую запись в дневник"),
     "en": ("First step", "Add your first diary entry"),
     "ja": ("最初の一歩", "日記に最初の記録を追加")},
    {"code": "first_photo",   "kind": "feature", "icon": "📷", "threshold": None, "sort_order": 11,
     "ru": ("Фотограф", "Распознай еду по фото"),
     "en": ("Snapshot", "Recognize a food via photo"),
     "ja": ("スナップ", "写真で食品を認識")},
    {"code": "first_barcode", "kind": "feature", "icon": "📡", "threshold": None, "sort_order": 12,
     "ru": ("Сканер", "Считай первый штрихкод"),
     "en": ("Scanner", "Scan your first barcode"),
     "ja": ("スキャナー", "初めてバーコードを読み取る")},
    {"code": "first_voice",   "kind": "feature", "icon": "🎙", "threshold": None, "sort_order": 13,
     "ru": ("Голос", "Запиши еду голосом"),
     "en": ("Voice", "Log food using voice"),
     "ja": ("ボイス", "音声で食品を記録")},
    {"code": "first_recipe",  "kind": "feature", "icon": "📒", "threshold": None, "sort_order": 14,
     "ru": ("Кулинар", "Создай свой первый рецепт"),
     "en": ("Cook", "Create your first recipe"),
     "ja": ("料理人", "初めてのレシピを作成")},
    # Streaks
    {"code": "streak_3",   "kind": "streak", "icon": "🔥", "threshold": 3,   "sort_order": 20,
     "ru": ("Тройка", "3 дня подряд с записями"),
     "en": ("Triple", "3 days in a row"),
     "ja": ("3日連続", "3日連続で記録")},
    {"code": "streak_7",   "kind": "streak", "icon": "🔥", "threshold": 7,   "sort_order": 21,
     "ru": ("Неделя", "7 дней подряд с записями"),
     "en": ("Week", "7 days in a row"),
     "ja": ("1週間", "7日連続で記録")},
    {"code": "streak_30",  "kind": "streak", "icon": "🔥", "threshold": 30,  "sort_order": 22,
     "ru": ("Месяц", "30 дней подряд с записями"),
     "en": ("Month", "30 days in a row"),
     "ja": ("1ヶ月", "30日連続で記録")},
    {"code": "streak_100", "kind": "streak", "icon": "💯", "threshold": 100, "sort_order": 23,
     "ru": ("Сотня", "100 дней подряд — невероятно"),
     "en": ("Century", "100 days in a row — incredible"),
     "ja": ("100日", "100日連続 — 驚異的!")},
    # Counts
    {"code": "products_50",  "kind": "count", "icon": "🍎", "threshold": 50,  "sort_order": 30,
     "ru": ("Гурман", "50 разных продуктов"),
     "en": ("Gourmet", "50 different products"),
     "ja": ("グルメ", "50種類の食品")},
    {"code": "products_200", "kind": "count", "icon": "🌈", "threshold": 200, "sort_order": 31,
     "ru": ("Радуга", "200 разных продуктов"),
     "en": ("Rainbow", "200 different products"),
     "ja": ("レインボー", "200種類の食品")},
    {"code": "entries_100",  "kind": "count", "icon": "📝", "threshold": 100, "sort_order": 32,
     "ru": ("Сотня записей", "100 записей в дневнике"),
     "en": ("Hundred logs", "100 diary entries"),
     "ja": ("100記録", "日記に100件の記録")},
    {"code": "entries_500",  "kind": "count", "icon": "📚", "threshold": 500, "sort_order": 33,
     "ru": ("Архивариус", "500 записей в дневнике"),
     "en": ("Archivist", "500 diary entries"),
     "ja": ("アーカイブ", "日記に500件の記録")},
    # Fasting
    {"code": "fasting_first", "kind": "feature", "icon": "⏳", "threshold": None, "sort_order": 40,
     "ru": ("Голодающий", "Заверши первое голодание"),
     "en": ("Faster", "Complete your first fast"),
     "ja": ("ファスター", "初めてのファスティングを完了")},
    {"code": "fasting_10",    "kind": "count",   "icon": "⌛", "threshold": 10,  "sort_order": 41,
     "ru": ("Стойкий", "10 завершённых голоданий"),
     "en": ("Steady", "10 completed fasts"),
     "ja": ("不屈", "10回のファスティング完了")},
    # Special — habits
    {"code": "water_week",   "kind": "special", "icon": "💧", "threshold": 7, "sort_order": 50,
     "ru": ("Водохлёб", "Пил воду 7 дней подряд"),
     "en": ("Hydrated", "Logged water 7 days in a row"),
     "ja": ("水分補給", "7日連続で水を記録")},
    {"code": "mood_week",    "kind": "special", "icon": "😊", "threshold": 7, "sort_order": 51,
     "ru": ("Внимательный", "Заполнял настроение 7 дней"),
     "en": ("Mindful", "Logged mood 7 days in a row"),
     "ja": ("マインドフル", "7日連続で気分を記録")},
    {"code": "early_bird",   "kind": "special", "icon": "🌅", "threshold": 7, "sort_order": 52,
     "ru": ("Ранняя пташка", "Запись до 9 утра 7 дней подряд"),
     "en": ("Early bird", "Logged before 9am 7 days straight"),
     "ja": ("早起き鳥", "7日連続で朝9時前に記録")},
]


async def seed_achievements(db: AsyncSession) -> int:
    """Insert any catalog items missing from achievements table. Returns inserted count."""
    existing_codes = {
        r[0] for r in (await db.execute(select(Achievement.code))).all()
    }
    inserted = 0
    for spec in ACHIEVEMENT_CATALOG:
        if spec["code"] in existing_codes:
            continue
        a = Achievement(
            id=uuid4(),
            code=spec["code"],
            kind=spec["kind"],
            name_ru=spec["ru"][0], desc_ru=spec["ru"][1],
            name_en=spec["en"][0], desc_en=spec["en"][1],
            name_ja=spec["ja"][0], desc_ja=spec["ja"][1],
            icon=spec["icon"],
            threshold=spec["threshold"],
            sort_order=spec["sort_order"],
        )
        db.add(a)
        inserted += 1
    if inserted:
        await db.commit()
    return inserted


async def _all_entry_dates(db: AsyncSession, user_id) -> list[date]:
    rows = (await db.execute(
        select(distinct(DiaryEntry.entry_date)).where(DiaryEntry.user_id == user_id)
        .order_by(DiaryEntry.entry_date)
    )).all()
    return [r[0] for r in rows]


def _streak_lengths(dates: list[date], today: date) -> tuple[int, int]:
    """Given sorted asc list of unique dates, compute (current_streak_ending_at_today_or_yesterday, longest_streak)."""
    if not dates:
        return 0, 0
    ds = set(dates)
    longest = 0
    cur_run = 0
    prev = None
    for d in dates:
        if prev is None or d == prev + timedelta(days=1):
            cur_run += 1
        else:
            cur_run = 1
        if cur_run > longest:
            longest = cur_run
        prev = d
    # current streak: count back from today (or yesterday if today missing)
    anchor = today if today in ds else (today - timedelta(days=1) if (today - timedelta(days=1)) in ds else None)
    current = 0
    if anchor is not None:
        cur = anchor
        while cur in ds:
            current += 1
            cur -= timedelta(days=1)
    return current, longest


async def get_streak(db: AsyncSession, user: User) -> dict:
    today = date.today()
    dates = await _all_entry_dates(db, user.id)
    current, longest = _streak_lengths(dates, today)
    last_7 = {today - timedelta(days=i) for i in range(7)}
    week_logged = sum(1 for d in dates if d in last_7)
    return {
        "current": current,
        "longest": longest,
        "today_logged": today in set(dates),
        "week_logged_days": week_logged,
    }


async def _consecutive_count_ending_today(dates: set, today: date) -> int:
    cur = today
    n = 0
    while cur in dates:
        n += 1
        cur -= timedelta(days=1)
    if n == 0:
        cur = today - timedelta(days=1)
        while cur in dates:
            n += 1
            cur -= timedelta(days=1)
    return n


async def check_and_award(db: AsyncSession, user: User) -> list[str]:
    """Return list of newly-earned achievement codes."""
    catalog = (await db.execute(select(Achievement))).scalars().all()
    by_code = {a.code: a for a in catalog}
    earned_rows = (await db.execute(
        select(UserAchievement.achievement_id).where(UserAchievement.user_id == user.id)
    )).all()
    earned_ids = {r[0] for r in earned_rows}
    earned_codes = {a.code for a in catalog if a.id in earned_ids}

    today = date.today()
    # ---- Diary stats ----
    entry_count = (await db.execute(
        select(func.count(DiaryEntry.id)).where(DiaryEntry.user_id == user.id)
    )).scalar_one() or 0
    distinct_products = (await db.execute(
        select(func.count(distinct(DiaryEntry.product_name))).where(DiaryEntry.user_id == user.id)
    )).scalar_one() or 0
    dates = await _all_entry_dates(db, user.id)
    current_streak, longest_streak = _streak_lengths(dates, today)

    # ---- Water consecutive days ----
    water_rows = (await db.execute(
        select(distinct(func.date(WaterEntry.drunk_at))).where(WaterEntry.user_id == user.id)
        .order_by(func.date(WaterEntry.drunk_at))
    )).all()
    water_dates = {r[0] for r in water_rows if r[0] is not None}
    water_streak = await _consecutive_count_ending_today(water_dates, today)

    # ---- Mood consecutive days ----
    mood_rows = (await db.execute(
        select(distinct(MoodEntry.date)).where(MoodEntry.user_id == user.id)
        .order_by(MoodEntry.date)
    )).all()
    mood_dates = {r[0] for r in mood_rows}
    mood_streak = await _consecutive_count_ending_today(mood_dates, today)

    # ---- Fasting count ----
    fasting_done = (await db.execute(
        select(func.count(FastingSession.id)).where(
            FastingSession.user_id == user.id,
            FastingSession.completed.is_not(None),
        )
    )).scalar_one() or 0

    # ---- Recipe count ----
    recipe_count = (await db.execute(
        select(func.count(Recipe.id)).where(Recipe.user_id == user.id)
    )).scalar_one() or 0

    # ---- Early bird: entries before 9am UTC, distinct dates ending today ----
    early_rows = (await db.execute(
        select(distinct(DiaryEntry.entry_date)).where(
            DiaryEntry.user_id == user.id,
            func.extract('hour', DiaryEntry.created_at) < 9,
        ).order_by(DiaryEntry.entry_date)
    )).all()
    early_dates = {r[0] for r in early_rows if r[0] is not None}
    early_streak = await _consecutive_count_ending_today(early_dates, today)

    new_codes: list[str] = []

    def _award(code: str):
        if code in earned_codes or code not in by_code:
            return
        ua = UserAchievement(id=uuid4(), user_id=user.id, achievement_id=by_code[code].id)
        db.add(ua)
        new_codes.append(code)
        earned_codes.add(code)

    if entry_count >= 1: _award("first_entry")
    if entry_count >= 100: _award("entries_100")
    if entry_count >= 500: _award("entries_500")
    if distinct_products >= 50: _award("products_50")
    if distinct_products >= 200: _award("products_200")
    if longest_streak >= 3:   _award("streak_3")
    if longest_streak >= 7:   _award("streak_7")
    if longest_streak >= 30:  _award("streak_30")
    if longest_streak >= 100: _award("streak_100")
    if fasting_done >= 1: _award("fasting_first")
    if fasting_done >= 10: _award("fasting_10")
    if recipe_count >= 1: _award("first_recipe")
    if water_streak >= 7: _award("water_week")
    if mood_streak >= 7:  _award("mood_week")
    if early_streak >= 7: _award("early_bird")

    if new_codes:
        await db.commit()
    return new_codes


async def award_feature_use(db: AsyncSession, user: User, feature: str) -> str | None:
    """Award feature-unlock codes triggered by a specific action.
    feature: 'photo' | 'barcode' | 'voice'
    """
    code_map = {"photo": "first_photo", "barcode": "first_barcode", "voice": "first_voice"}
    code = code_map.get(feature)
    if not code:
        return None
    ach = (await db.execute(select(Achievement).where(Achievement.code == code))).scalar_one_or_none()
    if not ach:
        return None
    exists = (await db.execute(
        select(UserAchievement).where(
            UserAchievement.user_id == user.id,
            UserAchievement.achievement_id == ach.id,
        )
    )).scalar_one_or_none()
    if exists:
        return None
    db.add(UserAchievement(id=uuid4(), user_id=user.id, achievement_id=ach.id))
    await db.commit()
    return code


async def get_user_achievements(db: AsyncSession, user: User) -> dict:
    """Return earned + all achievements with i18n name/desc."""
    all_rows = (await db.execute(select(Achievement).order_by(Achievement.sort_order, Achievement.code))).scalars().all()
    earned_rows = (await db.execute(
        select(UserAchievement.achievement_id, UserAchievement.earned_at)
        .where(UserAchievement.user_id == user.id)
    )).all()
    earned_at_by_id = {r[0]: r[1] for r in earned_rows}
    return {
        "achievements": [
            {
                "code": a.code,
                "icon": a.icon,
                "kind": a.kind,
                "threshold": a.threshold,
                "name_ru": a.name_ru, "name_en": a.name_en, "name_ja": a.name_ja,
                "desc_ru": a.desc_ru, "desc_en": a.desc_en, "desc_ja": a.desc_ja,
                "earned": a.id in earned_at_by_id,
                "earned_at": earned_at_by_id[a.id].isoformat() if a.id in earned_at_by_id and earned_at_by_id[a.id] else None,
            }
            for a in all_rows
        ],
        "total": len(all_rows),
        "earned_count": len(earned_at_by_id),
    }
