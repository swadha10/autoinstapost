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

from routers import caption, drive, instagram
from routers.schedule import _reschedule, router as schedule_router
from services.schedule_service import load_config

TEMP_DIR = Path("/tmp/autoinstapost")
TEMP_DIR.mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = BackgroundScheduler()
    app.state.scheduler = scheduler

    # Apply any previously saved schedule on startup
    config = load_config()
    _reschedule(scheduler, config)

    scheduler.start()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title="AutoInstaPost API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve temp images so Instagram can fetch them (use ngrok / public URL in prod)
app.mount("/temp", StaticFiles(directory=str(TEMP_DIR)), name="temp")

app.include_router(drive.router)
app.include_router(caption.router)
app.include_router(instagram.router)
app.include_router(schedule_router)


@app.get("/health")
def health():
    return {"status": "ok"}
