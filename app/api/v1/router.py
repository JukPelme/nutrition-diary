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
