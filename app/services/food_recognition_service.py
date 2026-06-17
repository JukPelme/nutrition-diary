"""
Food recognition from photos.
Supports multiple providers:
1. Claude Vision API (Anthropic) — best quality
2. Google Vision API — alternative
3. LogMeal API — specialized food recognition

The mobile app sends a photo, we identify the food and estimate KBJU.
"""
import base64
import httpx
from app.core.config import settings


async def recognize_food_claude(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict | None:
    """Recognize food using Claude Vision API."""
    api_key = settings.anthropic_api_key
    if not api_key:
        return None

    b64_image = base64.b64encode(image_bytes).decode("utf-8")

    prompt = """Analyze this food photo. Return a JSON object with:
{
  "foods": [
    {
      "name": "food name in Russian",
      "name_en": "food name in English",
      "estimated_weight_g": estimated weight in grams,
      "calories": estimated calories for this portion,
      "protein": estimated protein in grams,
      "fat": estimated fat in grams,
      "carbohydrates": estimated carbs in grams,
      "confidence": 0.0-1.0 confidence score
    }
  ],
  "total_calories": total for all foods,
  "description": "brief description of the meal in Russian"
}
If you cannot identify food in the image, return {"foods": [], "error": "no food detected"}.
Only return valid JSON, no other text."""

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 1024,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": mime_type,
                                        "data": b64_image,
                                    },
                                },
                                {"type": "text", "text": prompt},
                            ],
                        }
                    ],
                },
            )
            resp.raise_for_status()
            data = resp.json()

            # Extract text content
            text = data["content"][0]["text"]

            # Parse JSON from response
            import json
            # Handle markdown code blocks
            if "```json" in text:
                text = text.split("```json")[1].split("```")[0]
            elif "```" in text:
                text = text.split("```")[1].split("```")[0]

            return json.loads(text.strip())

    except Exception as e:
        return {"foods": [], "error": str(e)}


async def recognize_food_logmeal(image_bytes: bytes) -> dict | None:
    """Recognize food using LogMeal API (specialized food recognition)."""
    api_key = settings.logmeal_api_key
    if not api_key:
        return None

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            # Step 1: Upload image for recognition
            resp = await client.post(
                "https://api.logmeal.com/v2/image/segmentation/complete",
                headers={"Authorization": f"Bearer {api_key}"},
                files={"image": ("photo.jpg", image_bytes, "image/jpeg")},
            )
            resp.raise_for_status()
            segmentation = resp.json()

            # Step 2: Get nutritional info
            image_id = segmentation.get("imageId")
            if not image_id:
                return None

            resp2 = await client.post(
                "https://api.logmeal.com/v2/recipe/nutritionalInfo",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={"imageId": image_id},
            )
            resp2.raise_for_status()
            nutrition = resp2.json()

            # Parse response
            foods = []
            for item in nutrition.get("foodFamily", []):
                foods.append({
                    "name": item.get("name", "Unknown"),
                    "name_en": item.get("name", "Unknown"),
                    "estimated_weight_g": item.get("serving_size", 100),
                    "calories": item.get("nutritional_info", {}).get("calories", 0),
                    "protein": item.get("nutritional_info", {}).get("totalNutrients", {}).get("protein", {}).get("quantity", 0),
                    "fat": item.get("nutritional_info", {}).get("totalNutrients", {}).get("fat", {}).get("quantity", 0),
                    "carbohydrates": item.get("nutritional_info", {}).get("totalNutrients", {}).get("carbs", {}).get("quantity", 0),
                    "confidence": item.get("confidence", 0.5),
                })

            return {
                "foods": foods,
                "total_calories": sum(f["calories"] for f in foods),
                "description": f"Detected {len(foods)} food items",
            }

    except Exception as e:
        return {"foods": [], "error": str(e)}


async def recognize_food(image_bytes: bytes, mime_type: str = "image/jpeg") -> dict:
    """Try available providers in order of preference."""
    # Try Claude first (best quality)
    result = await recognize_food_claude(image_bytes, mime_type)
    if result and result.get("foods"):
        result["provider"] = "claude"
        return result

    # Try LogMeal
    result = await recognize_food_logmeal(image_bytes)
    if result and result.get("foods"):
        result["provider"] = "logmeal"
        return result

    return {"foods": [], "error": "No food recognition provider available", "provider": None}
