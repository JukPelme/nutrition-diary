from fastapi import APIRouter
from app.api.v1.endpoints import auth, products, diary, meals

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(products.router)
api_router.include_router(diary.router)
api_router.include_router(meals.router)
