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
            "ru": "Извлеки из текста съеденные продукты. Верни ТОЛЬКО JSON-массив без пояснений, формат: [{\"name\":\"...\", \"grams\": число}]. Если граммы не названы — оцени разумно (1 яблоко=150г, 1 яйцо=60г, тарелка каши=200г, стакан=200г). Текст: ",
            "en": "Extract foods eaten from the text. Return ONLY a JSON array: [{\"name\":\"...\", \"grams\": number}]. If grams not stated — estimate reasonably (1 apple=150g, 1 egg=60g). Text: ",
            "ja": "テキストから食べたものを抽出してください。JSON配列のみで返答: [{\"name\":\"...\", \"grams\": 数値}]。グラムが指定されていない場合は妥当に推定 (りんご1個=150g, 卵1個=60g)。テキスト: ",
        }
        prompt = prompts.get(lang, prompts["ru"]) + transcript
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
        # Lookup via full search service (pg_trgm similarity + ilike) — best fuzzy match
        from app.services.product_service import search_products
        results, _ = await search_products(db, q=name, limit=1, offset=0)
        p = results[0] if results else None
        if not p:
            # fallback: split into words, try each
            for word in name.split():
                if len(word) < 3:
                    continue
                p = (await db.execute(
                    select(Product).where(Product.name.ilike(f"%{word}%"))
                    .order_by(Product.is_verified.desc()).limit(1)
                )).scalar_one_or_none()
                if p:
                    break
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


# ---- Universal voice: detect intent and parse ----
@router.post("/parse-any")
async def parse_any(
    file: UploadFile = File(...),
    lang: str = Query("ru", pattern="^(ru|en|ja)$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Universal voice: returns {intent, transcript, data}.

    intent ∈ {food, water, mood, sleep, weight, unknown}
    data shape depends on intent:
      food   -> {items: [{name, grams}]}   (does NOT persist — client confirms)
      water  -> {amount_ml: 200, type: 'water'}
      mood   -> {mood: 1-5, energy: 1-5, sleep_hours: float|null, notes: str|null}
      sleep  -> {hours: 7.5}
      weight -> {kg: 75.3}
      unknown-> {raw: transcript}
    """
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
        raise HTTPException(413, "Audio too large")

    dg_lang = {"ru": "ru", "en": "en", "ja": "ja"}.get(lang, "ru")

    transcript = ""
    async with httpx.AsyncClient(timeout=60) as client:
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
        try:
            transcript = r.json()["results"]["channels"][0]["alternatives"][0]["transcript"].strip()
        except Exception:
            transcript = ""

        if not transcript:
            return {"intent": "unknown", "transcript": "", "data": {}}

        # Ask Claude for intent + structured data
        sys_prompt = (
            "Determine intent of user's voice diary entry and extract structured data. "
            "Reply ONLY raw JSON, no fences. Schema:\n"
            "{\"intent\":\"food|water|mood|sleep|weight|unknown\",\"data\":{...}}\n"
            "- food   -> data.items: [{name, grams}]  (grams: best-guess if unstated)\n"
            "- water  -> data.amount_ml: integer (1 стакан=200, 1 чашка=200, 1 бутылка=500)\n"
            "- mood   -> data.mood: 1-5, data.energy: 1-5 (if mentioned), data.sleep_hours: float|null, data.notes: str|null\n"
            "- sleep  -> data.hours: float (e.g. 7.5)\n"
            "- weight -> data.kg: float (e.g. 75.3)\n"
            "- unknown-> data: {}\n"
            "Pick exactly one intent. If user said multiple things, pick the most explicit one."
        )
        cr = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": cl_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 500,
                "system": sys_prompt,
                "messages": [{"role": "user", "content": f"TEXT ({lang}): {transcript}"}],
            },
        )
        if cr.status_code >= 400:
            raise HTTPException(502, f"Claude {cr.status_code}")
        text = cr.json()["content"][0]["text"].strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[-1]
            if text.endswith("```"):
                text = text.rsplit("```", 1)[0]
        try:
            parsed = json.loads(text)
        except Exception:
            return {"intent": "unknown", "transcript": transcript, "data": {"raw": text[:200]}}

    intent = (parsed.get("intent") or "unknown").lower()
    if intent not in {"food", "water", "mood", "sleep", "weight", "unknown"}:
        intent = "unknown"

    return {
        "intent": intent,
        "transcript": transcript,
        "data": parsed.get("data") or {},
    }


# ---- Multi-intent voice: parse all things mentioned in one phrase ----
@router.post("/parse-multi")
async def parse_multi(
    file: UploadFile = File(...),
    lang: str = Query("ru", pattern="^(ru|en|ja)$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Detect multiple intents in a single utterance.

    User says: "съел овсянку с яблоком, выпил 300мл воды, настроение 4, спал 7 часов"
    Returns: {transcript, intents: [{intent, data}, ...]}
    """
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
        raise HTTPException(413, "Audio too large")

    dg_lang = {"ru": "ru", "en": "en", "ja": "ja"}.get(lang, "ru")
    transcript = ""
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            "https://api.deepgram.com/v1/listen",
            params={"model": "nova-2", "language": dg_lang, "smart_format": "true", "punctuate": "true"},
            headers={"Authorization": f"Token {dg_key}", "Content-Type": file.content_type or "audio/webm"},
            content=audio,
        )
        if r.status_code >= 400:
            raise HTTPException(502, f"Deepgram {r.status_code}")
        try:
            transcript = r.json()["results"]["channels"][0]["alternatives"][0]["transcript"].strip()
        except Exception:
            transcript = ""
        if not transcript:
            return {"transcript": "", "intents": []}

        sys_prompt = (
            "Extract ALL intents (food/water/mood/sleep/weight) from a single utterance. "
            "Reply ONLY raw JSON. Schema:\n"
            '{"intents":[{"intent":"food|water|mood|sleep|weight","data":{...}}]}\n'
            "Same field shape as /voice/parse-any. If only one intent mentioned, return list of length 1. If none, []."
        )
        cr = await client.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": cl_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={
                "model": "claude-haiku-4-5-20251001",
                "max_tokens": 700,
                "system": sys_prompt,
                "messages": [{"role": "user", "content": f"TEXT ({lang}): {transcript}"}],
            },
        )
        if cr.status_code >= 400:
            raise HTTPException(502, f"Claude {cr.status_code}")
        text = cr.json()["content"][0]["text"].strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[-1]
            if text.endswith("```"): text = text.rsplit("```", 1)[0]
        try:
            parsed = json.loads(text)
        except Exception:
            return {"transcript": transcript, "intents": []}

    intents = parsed.get("intents") or []
    if not isinstance(intents, list):
        intents = []
    return {"transcript": transcript, "intents": intents}
