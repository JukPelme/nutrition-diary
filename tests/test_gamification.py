"""Gamification: food-group mapping (Rainbow) + idempotent catalog seed."""
import pytest
from app.services.gamification import _food_group, seed_achievements, FOOD_GROUPS
from app.db.session import async_session


def test_food_group_covers_nine_groups():
    samples = {
        "vegetables": "Овощи",
        "fruits": "Фрукты",
        "meat": "Мясо",
        "fish": "Рыба и морепродукты",
        "dairy": "Молочные",
        "grains": "Крупы",
        "legumes_nuts": "Орехи",
        "eggs": "Яйца",
        "sweets_snacks": "Сладкое",
    }
    for expected, cat in samples.items():
        assert _food_group(cat) == expected, f"{cat} -> {_food_group(cat)} != {expected}"
    assert len(set(FOOD_GROUPS)) == 9


def test_food_group_ignores_non_food():
    for cat in ("Напитки", "Соусы", "Масла", "Специи", None, ""):
        assert _food_group(cat) is None


async def test_seed_achievements_idempotent():
    async with async_session() as db:
        first = await seed_achievements(db)   # inserts on empty DB
        second = await seed_achievements(db)  # nothing new to insert
    assert first >= 1
    assert second == 0
