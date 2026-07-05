import os
import sys
import pathlib
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.core.config import settings
from app.api.v1.router import api_router

# Support frozen (PyInstaller) mode
if os.environ.get("APP_BASE_DIR"):
    BASE_DIR = pathlib.Path(os.environ["APP_BASE_DIR"]) / "app"
elif getattr(sys, "frozen", False):
    BASE_DIR = pathlib.Path(sys._MEIPASS) / "app"
else:
    BASE_DIR = pathlib.Path(__file__).resolve().parent


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.db.compat import is_sqlite
    if is_sqlite():
        from app.db.session import create_tables
        await create_tables()
        print("SQLite tables ready (desktop mode)")
    else:
        print("Postgres mode — schema managed by alembic")

    # Sync achievement catalog (idempotent: inserts missing, updates metadata)
    try:
        from app.db.session import async_session
        from app.services.gamification import seed_achievements
        async with async_session() as _s:
            n = await seed_achievements(_s)
            print(f"Achievements synced (inserted {n})")
    except Exception as _e:
        print(f"Achievement seed skipped: {_e}")

    yield


app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
app.include_router(api_router, prefix=settings.api_v1_prefix)


@app.get("/")
async def index():
    return FileResponse(str(BASE_DIR / "templates" / "index.html"))


@app.get("/sw.js")
async def service_worker():
    # Serve the SW from the root so its scope covers the whole app ("/"),
    # not just /static/. Without this the SW never controls the page and
    # navigator.serviceWorker.ready hangs (breaks Web Push + offline).
    return FileResponse(
        str(BASE_DIR / "static" / "sw.js"),
        media_type="text/javascript",
        headers={
            "Service-Worker-Allowed": "/",
            "Cache-Control": "no-cache",
        },
    )


@app.get("/shared/{share_id}")
async def shared_page(share_id: str):
    return FileResponse(str(BASE_DIR / "templates" / "shared.html"))


@app.get("/health")
async def health_check():
    return {"status": "ok", "version": settings.version}
