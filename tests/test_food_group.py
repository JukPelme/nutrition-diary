"""Unit tests for _food_group category normalization.

Maps ~65 messy RU/EN product categories down to 9 macro food groups.
Order matters (more specific groups are checked first), so these tests
pin both the mapping and the precedence — e.g. "молочный шоколад" must
resolve to dairy, not sweets, because dairy is checked earlier.
"""
import pytest

from app.services.gamification import _food_group, FOOD_GROUPS


@pytest.mark.parametrize("category, expected", [
    (None, None),
    ("", None),
    ("яйца", "eggs"),
    ("egg dishes", "eggs"),
    ("морепродукты", "fish"),
    ("seafood", "fish"),
    ("колбаса", "meat"),
    ("chicken breast", "meat"),
    ("творог", "dairy"),
    ("cheese", "dairy"),
    ("орехи и семена", "legumes_nuts"),
    ("фасоль", "legumes_nuts"),
    ("гречка", "grains"),
    ("bread", "grains"),
    ("ягоды", "fruits"),
    ("салат", "vegetables"),
    ("зелень", "vegetables"),
    ("шоколад", "sweets_snacks"),
    ("печенье", "sweets_snacks"),
    ("какая-то неизвестная категория", None),
])
def test_food_group_mapping(category, expected):
    assert _food_group(category) == expected


def test_food_group_precedence_dairy_over_sweets():
    # "молочный шоколад" contains both "молоч" (dairy) and "шоколад" (sweets);
    # dairy is checked first, so it wins.
    assert _food_group("молочный шоколад") == "dairy"


def test_food_group_case_insensitive():
    assert _food_group("МЯСО") == "meat"
    assert _food_group("Рыба") == "fish"


def test_food_group_returns_valid_group_or_none():
    # every non-None result must be one of the 9 canonical groups
    samples = ["яйца", "рыба", "мясо", "молоко", "орехи",
               "хлеб", "фрукты", "овощи", "конфеты", "мусор"]
    for s in samples:
        g = _food_group(s)
        assert g is None or g in FOOD_GROUPS
