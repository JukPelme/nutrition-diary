"""Detect whether a logged food is actually a drink, so it can be counted
toward the daily fluid goal. Keyword-based: category is unreliable
("Молочные продукты" covers both молоко and творог), the name is what
distinguishes a drink from a solid."""

# (keyword, drink_type) — drink_type must match the WaterCreate pattern:
# water|tea|coffee|juice|milk|other
_LIQUID_KEYWORDS: list[tuple[str, str]] = [
    # milk & drinkable dairy
    ("молоко", "milk"), ("кефир", "milk"), ("ряженка", "milk"), ("простокваша", "milk"),
    ("айран", "milk"), ("йогурт питьевой", "milk"), ("питьевой йогурт", "milk"),
    ("молочный коктейль", "milk"), ("milk", "milk"), ("kefir", "milk"),
    # coffee / tea / cocoa
    ("кофе", "coffee"), ("капучино", "coffee"), ("латте", "coffee"), ("эспрессо", "coffee"),
    ("американо", "coffee"), ("coffee", "coffee"), ("latte", "coffee"), ("cappuccino", "coffee"),
    ("чай", "tea"), ("матча", "tea"), ("tea", "tea"), ("matcha", "tea"),
    ("какао", "other"), ("cocoa", "other"),
    # juice / soft drinks
    ("сок", "juice"), ("нектар", "juice"), ("морс", "juice"), ("juice", "juice"),
    ("смузи", "juice"), ("smoothie", "juice"), ("фреш", "juice"),
    ("компот", "juice"), ("лимонад", "other"), ("газировка", "other"), ("кола", "other"),
    ("квас", "other"), ("cola", "other"), ("soda", "other"), ("lemonade", "other"),
    # water & isotonic
    ("вода", "water"), ("water", "water"), ("изотоник", "water"),
    # generic
    ("напиток", "other"), ("drink", "other"), ("beverage", "other"),
]

# Substrings that look liquid but are solids/semi-solids — never count these.
_SOLID_EXCLUDE: list[str] = [
    "молочный шоколад", "шоколад", "сгущён", "сгущен", "сгущенка", "сгущёнка",
    "каша", "мороженое", "творог", "сыр", "масло", "сливки", "сметана",
    "пудинг", "желе", "суфле", "конфет", "печенье", "батончик", "порошок",
    "сухое молоко", "сухой", "концентрат", "паста", "крем", "соус",
    "milk chocolate", "chocolate", "ice cream", "powder", "butter", "cheese",
]


def detect_fluid(name: str | None) -> tuple[bool, str]:
    """Return (is_liquid, drink_type). drink_type defaults to 'other'."""
    if not name or not isinstance(name, str):
        return False, "other"
    n = name.lower()
    for bad in _SOLID_EXCLUDE:
        if bad in n:
            return False, "other"
    for kw, dtype in _LIQUID_KEYWORDS:
        if kw in n:
            return True, dtype
    return False, "other"


def estimate_ml(serving_amount_g: float) -> int:
    """Grams -> millilitres. Most drinks are ~1 g/ml, so treat 1:1."""
    try:
        return max(0, round(float(serving_amount_g)))
    except (TypeError, ValueError):
        return 0
