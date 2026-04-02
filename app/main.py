from fastapi import FastAPI
from app.core.config import settings

app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    docs_url="/docs",
    redoc_url="/redoc",
)


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": settings.version}
