"""AutoInstaPost — FastAPI backend entry point."""

from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers import caption, drive, instagram

TEMP_DIR = Path("/tmp/autoinstapost")
TEMP_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="AutoInstaPost API", version="1.0.0")

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


@app.get("/health")
def health():
    return {"status": "ok"}
