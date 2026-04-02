from fastapi import APIRouter
from app.api.v1.endpoints import auth, products, diary, meals, barcode, stats, nutrients, health

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(products.router)
api_router.include_router(diary.router)
api_router.include_router(meals.router)
api_router.include_router(barcode.router)
api_router.include_router(stats.router)
api_router.include_router(nutrients.router)
api_router.include_router(health.router)
