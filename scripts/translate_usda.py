"""
Translate USDA product names to Russian.
Run: docker-compose exec app python scripts/translate_usda.py
"""
import os
import sys
import asyncio
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from sqlalchemy import select, update
from app.models.product import Product

DB_URL = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///nutrition_diary.db")

# English → Russian dictionary for USDA foods
DICT = {
    # Meat
    "chicken": "Курица", "chicken breast": "Куриная грудка", "chicken thigh": "Куриное бедро",
    "chicken leg": "Куриная ножка", "chicken wing": "Куриное крыло", "chicken liver": "Куриная печень",
    "beef": "Говядина", "ground beef": "Говяжий фарш", "beef steak": "Стейк из говядины",
    "beef liver": "Говяжья печень", "beef tongue": "Говяжий язык",
    "pork": "Свинина", "pork chop": "Свиная отбивная", "pork loin": "Свиная вырезка",
    "pork tenderloin": "Свиная вырезка", "pork shoulder": "Свиная лопатка",
    "turkey": "Индейка", "turkey breast": "Грудка индейки",
    "lamb": "Баранина", "veal": "Телятина", "duck": "Утка",
    "bacon": "Бекон", "ham": "Ветчина", "sausage": "Колбаса",
    
    # Fish & Seafood
    "salmon": "Лосось", "tuna": "Тунец", "cod": "Треска", "trout": "Форель",
    "herring": "Сельдь", "mackerel": "Скумбрия", "sardine": "Сардина", "sardines": "Сардины",
    "halibut": "Палтус", "catfish": "Сом", "tilapia": "Тилапия", "bass": "Окунь",
    "shrimp": "Креветки", "crab": "Краб", "lobster": "Лобстер", "squid": "Кальмар",
    "oyster": "Устрица", "oysters": "Устрицы", "clam": "Моллюск", "clams": "Моллюски",
    "mussel": "Мидия", "mussels": "Мидии", "scallop": "Гребешок", "scallops": "Гребешки",
    "octopus": "Осьминог", "anchovy": "Анчоус", "anchovies": "Анчоусы",
    "fish": "Рыба", "seafood": "Морепродукты", "crustaceans": "Ракообразные",
    "mollusks": "Моллюски",
    
    # Dairy
    "milk": "Молоко", "whole milk": "Цельное молоко", "skim milk": "Обезжиренное молоко",
    "cream": "Сливки", "sour cream": "Сметана", "heavy cream": "Жирные сливки",
    "butter": "Масло сливочное", "ghee": "Топлёное масло",
    "cheese": "Сыр", "cheddar": "Чеддер", "mozzarella": "Моцарелла", "parmesan": "Пармезан",
    "brie": "Бри", "gouda": "Гауда", "feta": "Фета", "ricotta": "Рикотта",
    "cottage cheese": "Творог", "cream cheese": "Сливочный сыр",
    "yogurt": "Йогурт", "kefir": "Кефир", "whey": "Сыворотка",
    
    # Eggs
    "egg": "Яйцо", "eggs": "Яйца", "egg white": "Яичный белок", "egg yolk": "Яичный желток",
    "whole egg": "Целое яйцо",
    
    # Grains
    "rice": "Рис", "white rice": "Белый рис", "brown rice": "Бурый рис",
    "oats": "Овёс", "oatmeal": "Овсянка", "wheat": "Пшеница",
    "barley": "Ячмень", "rye": "Рожь", "corn": "Кукуруза", "millet": "Пшено",
    "buckwheat": "Гречка", "quinoa": "Киноа", "bulgur": "Булгур", "couscous": "Кускус",
    "flour": "Мука", "bread": "Хлеб", "pasta": "Паста", "noodles": "Лапша",
    "cereal": "Хлопья", "granola": "Гранола", "tortilla": "Тортилья",
    
    # Vegetables
    "potato": "Картофель", "potatoes": "Картофель", "sweet potato": "Батат",
    "tomato": "Помидор", "tomatoes": "Помидоры",
    "carrot": "Морковь", "carrots": "Морковь",
    "onion": "Лук", "garlic": "Чеснок",
    "broccoli": "Брокколи", "cauliflower": "Цветная капуста",
    "cabbage": "Капуста", "spinach": "Шпинат", "lettuce": "Салат",
    "pepper": "Перец", "bell pepper": "Болгарский перец", "peppers": "Перцы",
    "cucumber": "Огурец", "zucchini": "Кабачок", "eggplant": "Баклажан",
    "celery": "Сельдерей", "asparagus": "Спаржа", "artichoke": "Артишок",
    "mushroom": "Гриб", "mushrooms": "Грибы",
    "peas": "Горох", "green beans": "Стручковая фасоль",
    "corn": "Кукуруза", "beet": "Свёкла", "beets": "Свёкла",
    "radish": "Редис", "turnip": "Репа", "parsnip": "Пастернак",
    "kale": "Капуста кейл", "arugula": "Руккола", "chard": "Мангольд",
    "leek": "Лук-порей", "leeks": "Лук-порей",
    "squash": "Тыква", "pumpkin": "Тыква",
    
    # Fruits
    "apple": "Яблоко", "apples": "Яблоки",
    "banana": "Банан", "bananas": "Бананы",
    "orange": "Апельсин", "oranges": "Апельсины",
    "lemon": "Лимон", "lime": "Лайм", "grapefruit": "Грейпфрут",
    "grape": "Виноград", "grapes": "Виноград",
    "strawberry": "Клубника", "strawberries": "Клубника",
    "blueberry": "Черника", "blueberries": "Черника",
    "raspberry": "Малина", "raspberries": "Малина",
    "blackberry": "Ежевика", "blackberries": "Ежевика",
    "cherry": "Вишня", "cherries": "Вишня",
    "peach": "Персик", "peaches": "Персики",
    "pear": "Груша", "pears": "Груши",
    "plum": "Слива", "plums": "Сливы",
    "mango": "Манго", "pineapple": "Ананас", "kiwi": "Киви",
    "watermelon": "Арбуз", "melon": "Дыня", "cantaloupe": "Канталупа",
    "avocado": "Авокадо", "coconut": "Кокос",
    "fig": "Инжир", "figs": "Инжир", "date": "Финик", "dates": "Финики",
    "pomegranate": "Гранат", "papaya": "Папайя", "guava": "Гуава",
    "apricot": "Абрикос", "apricots": "Абрикосы",
    "cranberry": "Клюква", "cranberries": "Клюква",
    
    # Legumes
    "beans": "Фасоль", "kidney beans": "Красная фасоль", "black beans": "Чёрная фасоль",
    "white beans": "Белая фасоль", "navy beans": "Белая фасоль",
    "lima beans": "Лимская фасоль", "pinto beans": "Пёстрая фасоль",
    "chickpeas": "Нут", "chickpea": "Нут", "garbanzo": "Нут",
    "lentils": "Чечевица", "lentil": "Чечевица",
    "soybeans": "Соя", "soybean": "Соя", "soy": "Соя",
    "tofu": "Тофу", "tempeh": "Темпе", "edamame": "Эдамаме",
    
    # Nuts & Seeds
    "peanut": "Арахис", "peanuts": "Арахис", "peanut butter": "Арахисовая паста",
    "almond": "Миндаль", "almonds": "Миндаль",
    "walnut": "Грецкий орех", "walnuts": "Грецкие орехи",
    "cashew": "Кешью", "cashews": "Кешью",
    "pistachio": "Фисташка", "pistachios": "Фисташки",
    "pecan": "Пекан", "pecans": "Пекан",
    "hazelnut": "Фундук", "hazelnuts": "Фундук",
    "macadamia": "Макадамия", "brazil nut": "Бразильский орех",
    "sunflower seeds": "Семечки подсолнуха", "pumpkin seeds": "Тыквенные семечки",
    "flax": "Лён", "flaxseed": "Льняное семя", "chia": "Чиа", "chia seeds": "Семена чиа",
    "sesame": "Кунжут", "sesame seeds": "Семена кунжута",
    "hemp seeds": "Семена конопли", "poppy seeds": "Мак",
    
    # Oils
    "olive oil": "Оливковое масло", "coconut oil": "Кокосовое масло",
    "sunflower oil": "Подсолнечное масло", "canola oil": "Рапсовое масло",
    "sesame oil": "Кунжутное масло", "vegetable oil": "Растительное масло",
    "oil": "Масло", "lard": "Смалец",
    
    # Sweets
    "sugar": "Сахар", "honey": "Мёд", "maple syrup": "Кленовый сироп",
    "chocolate": "Шоколад", "cocoa": "Какао", "candy": "Конфета",
    "cookie": "Печенье", "cookies": "Печенье", "cake": "Торт",
    "ice cream": "Мороженое", "jam": "Варенье", "jelly": "Желе",
    
    # Drinks
    "juice": "Сок", "tea": "Чай", "coffee": "Кофе",
    "water": "Вода", "beer": "Пиво", "wine": "Вино",
    
    # Cooking terms
    "raw": "сырой", "cooked": "варёный", "baked": "запечённый", "fried": "жареный",
    "grilled": "гриль", "roasted": "жареный", "boiled": "варёный", "steamed": "на пару",
    "smoked": "копчёный", "dried": "сушёный", "canned": "консервированный",
    "frozen": "замороженный", "fresh": "свежий", "organic": "органический",
    "whole": "цельный", "ground": "молотый", "sliced": "нарезанный",
    "skinless": "без кожи", "boneless": "без кости",
    "lean": "нежирный", "fat-free": "обезжиренный", "low-fat": "нежирный",
    "unsalted": "несолёный", "salted": "солёный",
    "with salt": "с солью", "without salt": "без соли",
    "with skin": "с кожей", "without skin": "без кожи",
    "breast": "грудка", "thigh": "бедро", "drumstick": "голень",
    "fillet": "филе", "steak": "стейк", "chop": "отбивная",
    "loin": "вырезка", "rib": "ребро", "ribs": "рёбра",
    "tenderloin": "вырезка", "shoulder": "лопатка",
    "mixed species": "разные виды", "farm raised": "фермерские",
    "atlantic": "атлантический", "pacific": "тихоокеанский",
    "wild": "дикий", "cultivated": "культивированный",
    "mature seeds": "зрелые семена", "immature seeds": "незрелые семена",
    "sprouted": "пророщенный", "enriched": "обогащённый",
    "unenriched": "необогащённый", "fortified": "обогащённый",
    "reduced fat": "пониженной жирности", "nonfat": "обезжиренный",
    "plain": "без добавок", "flavored": "с вкусом",
    "unsweetened": "без сахара", "sweetened": "подслащённый",
    "regular": "обычный", "light": "лёгкий",
    "extra virgin": "Extra Virgin",
}

def translate_name(name: str) -> str:
    """Translate USDA product name to Russian."""
    # Remove brand prefixes (ALL CAPS words before comma)
    cleaned = re.sub(r'^[A-Z][A-Z\s&\'\.]+,\s*', '', name)
    
    lower = cleaned.lower().strip()
    
    # Try exact match first
    if lower in DICT:
        return DICT[lower]
    
    # Try to translate parts
    parts = []
    # Split by comma and translate each part
    segments = [s.strip() for s in lower.split(',')]
    
    for seg in segments:
        # Try full segment
        if seg in DICT:
            parts.append(DICT[seg])
            continue
        
        # Try translating individual words/phrases
        translated = seg
        # Sort by length descending to match longer phrases first
        for eng, rus in sorted(DICT.items(), key=lambda x: -len(x[0])):
            if eng in translated:
                translated = translated.replace(eng, rus)
        
        parts.append(translated)
    
    result = ', '.join(parts)
    
    # Capitalize first letter
    if result:
        result = result[0].upper() + result[1:]
    
    return result


async def translate_all():
    engine = create_async_engine(DB_URL)
    Session = async_sessionmaker(engine, expire_on_commit=False)
    
    async with Session() as session:
        result = await session.execute(
            select(Product).where(Product.source == "usda")
        )
        products = result.scalars().all()
        
        translated = 0
        for p in products:
            new_name = translate_name(p.name)
            if new_name != p.name:
                p.name = new_name
                translated += 1
        
        await session.commit()
        print(f"Translated {translated} / {len(products)} USDA products")
    
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(translate_all())
