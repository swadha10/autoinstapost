"""AutoInstaPost — FastAPI backend entry point."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
_log = logging.getLogger(__name__)
_pub = os.environ.get("PUBLIC_BASE_URL", "")
_log.info("PUBLIC_BASE_URL loaded: %s", _pub if _pub else "(NOT SET)")

from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from db import init_db
from routers import caption, drive, instagram
from routers.auth import router as auth_router
from routers.photos import router as photos_router
from routers.schedule import router as schedule_router
from routers.stories import router as stories_router, _reschedule_story

TEMP_DIR = Path("/tmp/autoinstapost")
TEMP_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()

    scheduler = BackgroundScheduler()
    app.state.scheduler = scheduler

    # Restore per-user schedules on startup
    from db import _conn
    from routers.schedule import _reschedule_user
    try:
        with _conn() as conn:
            rows = conn.execute("SELECT id FROM users").fetchall()
        for row in rows:
            user_id = row["id"]
            from services.schedule_service import load_config
            from services.story_service import load_story_config
            config = load_config(user_id)
            if config.get("enabled"):
                _reschedule_user(scheduler, config, user_id)
            story_config = load_story_config(user_id)
            if story_config.get("enabled"):
                _reschedule_story(scheduler, story_config, user_id)
    except Exception as e:
        _log.warning("Could not restore user schedules: %s", e)

    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title="AutoInstaPost API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.middleware.gzip import GZipMiddleware
app.add_middleware(GZipMiddleware, minimum_size=1024)

# Serve temp images so Instagram can fetch them (use ngrok / public URL in prod)
app.mount("/temp", StaticFiles(directory=str(TEMP_DIR)), name="temp")

app.include_router(auth_router)
app.include_router(drive.router)
app.include_router(photos_router)
app.include_router(caption.router)
app.include_router(instagram.router)
app.include_router(schedule_router)
app.include_router(stories_router)


@app.get("/health")
def health():
    return {"status": "ok"}


# Serve built React frontend — must be last so API routes take priority
_frontend_dist = Path(__file__).parent.parent / "frontend" / "dist"
if _frontend_dist.exists():
    from fastapi.responses import FileResponse

    # Serve static assets (JS, CSS, images) directly
    app.mount("/assets", StaticFiles(directory=str(_frontend_dist / "assets")), name="assets")

    # SPA catch-all: any unmatched path returns index.html so React Router works
    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str):
        index = _frontend_dist / "index.html"
        return FileResponse(str(index))

    _log.info("Serving frontend from %s", _frontend_dist)
else:
    _log.info("No frontend/dist found — run 'npm run build' in the frontend folder")
