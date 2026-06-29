from fastapi import APIRouter
from app.api.v1.endpoints import  auth, products, diary, meals, barcode, stats, nutrients, health, devices, food_scan, export

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(products.router)
api_router.include_router(diary.router)
api_router.include_router(meals.router)
api_router.include_router(barcode.router)
api_router.include_router(stats.router)
api_router.include_router(nutrients.router)
api_router.include_router(health.router)
api_router.include_router(devices.router)
api_router.include_router(food_scan.router)
api_router.include_router(export.router)
from app.api.v1.endpoints.share import router as share_router
api_router.include_router(share_router)
from app.api.v1.endpoints.bot import router as bot_router
api_router.include_router(bot_router)
from app.api.v1.endpoints.recommendations import router as rec_router
api_router.include_router(rec_router)
from app.api.v1.endpoints.sync import router as sync_router
api_router.include_router(sync_router)

from app.api.v1.endpoints.fasting import router as fasting_router
api_router.include_router(fasting_router)

from app.api.v1.endpoints.mood import router as mood_router
api_router.include_router(mood_router)

from app.api.v1.endpoints.water import router as water_router
api_router.include_router(water_router)

from app.api.v1.endpoints.nutrition_goals import router as nutrition_goals_router
api_router.include_router(nutrition_goals_router)

from fastapi import APIRouter as _AR
import os, datetime
_v_router = _AR(prefix="/version", tags=["version"])
_STARTED_AT = datetime.datetime.utcnow().isoformat() + "Z"
_BUILD_VERSION = os.environ.get("RAILWAY_GIT_COMMIT_SHA", "")[:7] or _STARTED_AT
@_v_router.get("")
async def app_version():
    return {"version": _BUILD_VERSION, "started_at": _STARTED_AT}
api_router.include_router(_v_router)

from app.api.v1.endpoints.chat import router as chat_router
api_router.include_router(chat_router)

from app.api.v1.endpoints.recipes import router as recipes_router
api_router.include_router(recipes_router)

from app.api.v1.endpoints.import_data import router as import_router
api_router.include_router(import_router)

from app.api.v1.endpoints.push import router as push_router
api_router.include_router(push_router)

from app.api.v1.endpoints.voice import router as voice_router
api_router.include_router(voice_router)
from app.api.v1.endpoints.meal_plans import router as meal_plan_router
api_router.include_router(meal_plan_router)
from app.api.v1.endpoints.gamification import router as gam_router
api_router.include_router(gam_router)
from app.api.v1.endpoints.deficiency import router as deficiency_router
api_router.include_router(deficiency_router)
from app.api.v1.endpoints.alternatives import router as alt_router
api_router.include_router(alt_router)
from app.api.v1.endpoints.russian_recipes import router as ru_recipe_router
api_router.include_router(ru_recipe_router)
from app.api.v1.endpoints.wearable_import import router as wearable_router
api_router.include_router(wearable_router)
from app.api.v1.endpoints.account import router as account_router
api_router.include_router(account_router)
from app.api.v1.endpoints.weekly_report import router as weekly_router
api_router.include_router(weekly_router)
from app.api.v1.endpoints.coach import router as coach_router
api_router.include_router(coach_router)
