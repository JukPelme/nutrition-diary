"""
Example Telegram bot for Nutrition Diary.
Requires: pip install python-telegram-bot httpx

Set env:
  TELEGRAM_BOT_TOKEN=your_telegram_bot_token
  NUTRITION_API_URL=http://localhost:8000
  NUTRITION_BOT_TOKEN=change-me-bot-token

Usage: python scripts/telegram_bot.py
"""
import os
import asyncio
import httpx

API_URL = os.environ.get("NUTRITION_API_URL", "http://localhost:8000")
BOT_TOKEN = os.environ.get("NUTRITION_BOT_TOKEN", "change-me-bot-token")

try:
    from telegram import Update
    from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes
except ImportError:
    print("Install: pip install python-telegram-bot")
    exit(1)


# User email mapping (telegram_id -> email)
# In production, store in DB
user_map = {}


async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "Дневник питания 🍽\n\n"
        "Команды:\n"
        "/login email — привязать аккаунт\n"
        "/add продукт 100г 200ккал — добавить еду\n"
        "/today — итог за сегодня\n"
        "/help — помощь"
    )


async def login(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    if not ctx.args:
        await update.message.reply_text("Укажите email: /login your@email.com")
        return
    email = ctx.args[0]
    user_map[update.effective_user.id] = email
    await update.message.reply_text(f"Привязан: {email}")


async def add_food(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    email = user_map.get(uid)
    if not email:
        await update.message.reply_text("Сначала /login email")
        return

    text = update.message.text
    if text.startswith("/add "):
        text = text[5:]

    # Simple parse: "Яблоко 150г" or just "Яблоко"
    parts = text.strip().split()
    name = " ".join(parts)
    weight = 100

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{API_URL}/api/v1/bot/add-food",
            json={"user_email": email, "product_name": name, "serving_amount": weight},
            headers={"x-bot-token": BOT_TOKEN},
        )
        if resp.status_code == 200:
            await update.message.reply_text(f"Добавлено: {name} ({weight}г)")
        else:
            await update.message.reply_text(f"Ошибка: {resp.text}")


async def today(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    uid = update.effective_user.id
    email = user_map.get(uid)
    if not email:
        await update.message.reply_text("Сначала /login email")
        return

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{API_URL}/api/v1/bot/summary",
            params={"email": email},
            headers={"x-bot-token": BOT_TOKEN},
        )
        if resp.status_code == 200:
            d = resp.json()
            pct = round(d["calories"] / d["goal"] * 100) if d["goal"] else 0
            await update.message.reply_text(
                f"Сегодня ({d[\'entries_count\']} записей):\n"
                f"Калории: {d[\'calories\']} / {d[\'goal\']} ({pct}%)\n"
                f"Б: {d[\'protein\']}г  Ж: {d[\'fat\']}г  У: {d[\'carbohydrates\']}г"
            )
        else:
            await update.message.reply_text(f"Ошибка: {resp.text}")


def main():
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    if not token:
        print("Set TELEGRAM_BOT_TOKEN env variable")
        return
    app = Application.builder().token(token).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("help", start))
    app.add_handler(CommandHandler("login", login))
    app.add_handler(CommandHandler("add", add_food))
    app.add_handler(CommandHandler("today", today))
    print("Bot started...")
    app.run_polling()


if __name__ == "__main__":
    main()
