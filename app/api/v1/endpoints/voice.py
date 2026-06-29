"""Voice-to-diary: record audio in browser → Deepgram transcription → Claude parses
into structured food items → user confirms → entries added to diary.
"""
import json
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from pydantic import BaseModel
import httpx

from app.core.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.user import User
from app.models.product import Product

router = APIRouter(prefix="/voice", tags=["voice"])


class ParsedItem(BaseModel):
    name: str
    grams: float
    matched_product_id: str | None = None
    matched_product_name: str | None = None
    calories: float | None = None
    protein: float | None = None
    fat: float | None = None
    carbohydrates: float | None = None


class ParseOut(BaseModel):
    transcript: str
    items: list[ParsedItem]


@router.post("/parse", response_model=ParseOut)
async def parse_voice(
    file: UploadFile = File(...),
    lang: str = Query("ru", pattern="^(ru|en|ja)$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    dg_key = settings.deepgram_api_key
    cl_key = settings.anthropic_api_key
    if not dg_key:
        raise HTTPException(503, "DEEPGRAM_API_KEY required")
    if not cl_key:
        raise HTTPException(503, "ANTHROPIC_API_KEY required")

    audio = await file.read()
    if not audio or len(audio) < 1000:
        raise HTTPException(400, "Empty or too small audio")
    if len(audio) > 10 * 1024 * 1024:
        raise HTTPException(413, "Audio too large (max 10MB)")

    # Map UI lang to Deepgram language codes
    dg_lang = {"ru": "ru", "en": "en", "ja": "ja"}.get(lang, "ru")

    transcript = ""
    async with httpx.AsyncClient(timeout=60) as client:
        # Deepgram nova-2 supports ru/en/ja
        r = await client.post(
            "https://api.deepgram.com/v1/listen",
            params={"model": "nova-2", "language": dg_lang, "smart_format": "true", "punctuate": "true"},
            headers={
                "Authorization": f"Token {dg_key}",
                "Content-Type": file.content_type or "audio/webm",
            },
            content=audio,
        )
        if r.status_code >= 400:
            raise HTTPException(502, f"Deepgram {r.status_code}: {r.text[:200]}")
        dg = r.json()
        try:
            transcript = dg["results"]["channels"][0]["alternatives"][0]["transcript"].strip()
        except Exception:
            transcript = ""
        if not transcript:
            return ParseOut(transcript="", items=[])

        # Claude: structured extraction
        prompts = {
            "ru": "Извлеки из текста съеденные продукты. Верни ТОЛЬКО JSON-массив без пояснений, формат: [{\"name\":\"...\", \"grams\": число}]. Если граммы не названы — оцени разумно (1 яблоко=150г, 1 яйцо=60г, тарелка каши=200г, стакан=200г). Текст: {t}",
            "en": "Extract foods eaten from the text. Return ONLY a JSON array: [{\"name\":\"...\", \"grams\": number}]. If grams not stated — estimate reasonably (1 apple=150g, 1 egg=60g). Text: {t}",
            "ja": "テキストから食べたものを抽出してください。JSON配列のみで返答: [{\"name\":\"...\", \"grams\": 数値}]。グラムが指定されていない場合は妥当に推定 (りんご1個=150g, 卵1個=60g)。テキスト: {t}",
        }
        prompt = prompts.get(lang, prompts["ru"]).format(t=transcript)
        cr = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": cl_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 500,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        if cr.status_code >= 400:
            raise HTTPException(502, f"Claude {cr.status_code}")
        text = cr.json()["content"][0]["text"].strip()
        if text.startswith("```"):
            text = text.split("```", 2)[1]
            if text.startswith("json"): text = text[4:]
            text = text.strip().rstrip("`").strip()
        try:
            raw_items = json.loads(text)
        except Exception:
            raw_items = []

    # Match against our product catalog
    items: list[ParsedItem] = []
    for it in raw_items[:15]:
        name = str(it.get("name") or "").strip()
        try:
            grams = float(it.get("grams") or 0)
        except Exception:
            grams = 0
        if not name or grams <= 0:
            continue
        # Lookup product by ilike
        p = (await db.execute(
            select(Product).where(Product.name.ilike(f"%{name}%")).limit(1)
        )).scalar_one_or_none()
        item = ParsedItem(name=name, grams=grams)
        if p:
            factor = grams / 100.0
            item.matched_product_id = str(p.id)
            item.matched_product_name = p.name
            item.calories = round((p.calories or 0) * factor, 1)
            item.protein = round((p.protein or 0) * factor, 1)
            item.fat = round((p.fat or 0) * factor, 1)
            item.carbohydrates = round((p.carbohydrates or 0) * factor, 1)
        items.append(item)

    return ParseOut(transcript=transcript, items=items)
