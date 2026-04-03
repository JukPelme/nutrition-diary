"""
Unified seed script.

Usage:
    python scripts/seed_all.py                  # offline only (~200 продуктов)
    python scripts/seed_all.py --online         # + Open Food Facts API (~10K+)
    python scripts/seed_all.py --online --usda KEY  # + USDA
"""
import argparse
import asyncio
import sys
import os

# Ensure project root is in path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


async def main():
    parser = argparse.ArgumentParser(description="Загрузка базы продуктов")
    parser.add_argument("--online", action="store_true", help="Загрузить из Open Food Facts API")
    parser.add_argument("--usda", type=str, default=None, help="USDA API key")
    parser.add_argument("--off-pages", type=int, default=5, help="Страниц на категорию OFF (default: 5)")
    parser.add_argument("--usda-pages", type=int, default=50, help="Страниц USDA (default: 50)")
    parser.add_argument("--db-url", default=None)
    args = parser.parse_args()

    # 1. Offline products
    print("=" * 50)
    print("1/3  Базовые продукты (офлайн)")
    print("=" * 50)
    from scripts.seed_products import seed as seed_products
    await seed_products(args.db_url)

    # 2. Medical conditions
    print("\n" + "=" * 50)
    print("2/3  Медицинские состояния (14 диагнозов)")
    print("=" * 50)
    from scripts.seed_conditions import seed as seed_conditions
    await seed_conditions(args.db_url)

    # 3. Online imports
    if args.online:
        print("\n" + "=" * 50)
        print("3/3  Open Food Facts API")
        print("=" * 50)
        from scripts.import_off_api import import_data as import_off
        await import_off(args.off_pages, args.db_url)

    if args.usda:
        print("\n" + "=" * 50)
        print("3+   USDA FoodData Central")
        print("=" * 50)
        from scripts.import_usda import import_data as import_usda
        await import_usda(args.usda, args.usda_pages, args.db_url)

    if not args.online and not args.usda:
        print("\n---")
        print("Базовые продукты загружены.")
        print("Для расширенной базы: python scripts/seed_all.py --online")

    print("\nГотово!")


if __name__ == "__main__":
    asyncio.run(main())
