"""Story service — scheduling and posting Instagram Stories from a Drive folder."""

import io
import json
import logging
import os
import random
import uuid
from datetime import datetime, timezone
from pathlib import Path

logger = logging.getLogger(__name__)

_BASE_DATA_DIR = Path(__file__).parent.parent / "data"
TEMP_DIR = Path("/tmp/autoinstapost")
TEMP_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_STORY_CONFIG = {
    "enabled": False,
    "hour": 9,
    "minute": 0,
    "cadence": "daily",
    "every_n_days": 1,
    "weekdays": [0, 1, 2, 3, 4],
    "timezone": "America/Los_Angeles",
    "folder_id": "",
}


# ---------------------------------------------------------------------------
# Per-user file helpers
# ---------------------------------------------------------------------------

def _user_data_dir(user_id: int | None) -> Path:
    if user_id is not None:
        return _BASE_DATA_DIR / "users" / str(user_id)
    return _BASE_DATA_DIR


def _config_file(user_id: int | None) -> Path:
    return _user_data_dir(user_id) / "story_config.json"


def _posted_file(user_id: int | None) -> Path:
    return _user_data_dir(user_id) / "story_posted_ids.json"


def _history_file(user_id: int | None) -> Path:
    return _user_data_dir(user_id) / "story_history.json"


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

def load_story_config(user_id: int | None = None) -> dict:
    f = _config_file(user_id)
    if not f.exists():
        return dict(DEFAULT_STORY_CONFIG)
    try:
        return json.loads(f.read_text())
    except Exception:
        return dict(DEFAULT_STORY_CONFIG)


def save_story_config(config: dict, user_id: int | None = None) -> None:
    d = _user_data_dir(user_id)
    d.mkdir(parents=True, exist_ok=True)
    _config_file(user_id).write_text(json.dumps(config, indent=2))


# ---------------------------------------------------------------------------
# Posted IDs (separate from feed posted IDs so same photo can be used in both)
# ---------------------------------------------------------------------------

def load_story_posted_ids(user_id: int | None = None) -> set[str]:
    f = _posted_file(user_id)
    if not f.exists():
        return set()
    try:
        return set(json.loads(f.read_text()))
    except Exception:
        return set()


def record_story_posted_id(file_id: str, user_id: int | None = None) -> None:
    ids = load_story_posted_ids(user_id)
    ids.add(file_id)
    d = _user_data_dir(user_id)
    d.mkdir(parents=True, exist_ok=True)
    _posted_file(user_id).write_text(json.dumps(sorted(ids), indent=2))


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------

def load_story_history(user_id: int | None = None) -> list[dict]:
    f = _history_file(user_id)
    if not f.exists():
        return []
    try:
        return json.loads(f.read_text())
    except Exception:
        return []


def log_story_attempt(
    *,
    file_id: str,
    file_name: str,
    status: str,
    source: str,
    error: str = "",
    media_id: str = "",
    user_id: int | None = None,
) -> None:
    entry = {
        "id": str(uuid.uuid4()),
        "file_id": file_id,
        "file_name": file_name,
        "status": status,
        "source": source,
        "error": error,
        "media_id": media_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    history = load_story_history(user_id)
    history.insert(0, entry)
    d = _user_data_dir(user_id)
    d.mkdir(parents=True, exist_ok=True)
    _history_file(user_id).write_text(json.dumps(history[:200], indent=2))


# ---------------------------------------------------------------------------
# Image processing
# ---------------------------------------------------------------------------

def _crop_for_story(image_bytes: bytes) -> bytes:
    """Center-crop and resize to 9:16 (1080×1920) for Instagram Stories."""
    from PIL import Image, ImageOps

    img = Image.open(io.BytesIO(image_bytes))
    img = ImageOps.exif_transpose(img)
    if img.mode != "RGB":
        img = img.convert("RGB")

    target_w, target_h = 1080, 1920
    target_ratio = target_w / target_h  # 0.5625

    w, h = img.size
    current_ratio = w / h

    if current_ratio > target_ratio:
        # Wider than 9:16 — crop width
        new_w = int(h * target_ratio)
        left = (w - new_w) // 2
        img = img.crop((left, 0, left + new_w, h))
    elif current_ratio < target_ratio:
        # Taller than 9:16 — crop height
        new_h = int(w / target_ratio)
        top = (h - new_h) // 2
        img = img.crop((0, top, w, top + new_h))

    img = img.resize((target_w, target_h), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85, optimize=True)
    logger.info("Story crop: %dx%d → 1080x1920 (%d KB)", w, h, buf.tell() // 1024)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Core posting
# ---------------------------------------------------------------------------

def _post_story_image(
    file_id: str,
    creds: dict | None = None,
    user_id: int | None = None,
) -> str:
    """Download from Drive, crop to 9:16, serve publicly, post as Story."""
    import httpx as _httpx
    from services.drive_service import download_photo
    from services.instagram_service import post_story

    base_url = (
        (creds.get("public_base_url") if creds else None)
        or os.environ.get("PUBLIC_BASE_URL", "")
    ).rstrip("/")

    if not base_url or "localhost" in base_url or "127.0.0.1" in base_url:
        raise RuntimeError(
            f"PUBLIC_BASE_URL is not set to a public URL (current: '{base_url}'). "
            "Update it in Setup and retry."
        )

    image_bytes, _ = download_photo(file_id, creds=creds)
    story_bytes = _crop_for_story(image_bytes)

    filename = f"{uuid.uuid4().hex}.jpg"
    filepath = TEMP_DIR / filename
    filepath.write_bytes(story_bytes)

    image_url = f"{base_url}/temp/{filename}"
    try:
        # Verify Instagram can reach the URL
        probe = _httpx.get(
            image_url,
            timeout=12,
            follow_redirects=True,
            headers={
                "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
                "Range": "bytes=0-2047",
            },
        )
        if probe.status_code not in (200, 206):
            raise RuntimeError(
                f"Image URL returned HTTP {probe.status_code}. "
                f"Tunnel may be down. URL: {image_url}"
            )

        logger.info("Posting story from %s", image_url)
        return post_story(image_url, creds=creds, user_id=user_id)
    finally:
        filepath.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Scheduled job
# ---------------------------------------------------------------------------

def run_scheduled_story_job(user_id: int | None = None) -> None:
    """Scheduled story job: pick one unposted photo and post as a Story."""
    creds: dict | None = None
    if user_id is not None:
        from db import get_credentials
        creds = get_credentials(user_id)

    config = load_story_config(user_id)

    if not config.get("enabled"):
        logger.info("Story scheduler: disabled — skipping.")
        return

    folder_id = config.get("folder_id", "").strip()
    if not folder_id:
        logger.warning("Story scheduler: no folder_id configured — skipping.")
        return

    from services.drive_service import list_photos
    try:
        photos = list_photos(folder_id, creds=creds)
    except Exception as e:
        logger.error("Story scheduler: failed to list photos — %s", e)
        return

    if not photos:
        logger.warning("Story scheduler: no photos in folder — skipping.")
        return

    posted_ids = load_story_posted_ids(user_id)
    INSTAGRAM_OK = {"image/jpeg", "image/png"}
    unused = [
        p for p in photos
        if p["id"] not in posted_ids and p.get("mimeType", "") in INSTAGRAM_OK
    ]

    if not unused:
        logger.warning("Story scheduler: all photos already used as stories — skipping.")
        return

    selected = random.choice(unused)
    file_id = selected["id"]
    file_name = selected.get("name", file_id)

    try:
        media_id = _post_story_image(file_id, creds=creds, user_id=user_id)
        record_story_posted_id(file_id, user_id)
        log_story_attempt(
            file_id=file_id, file_name=file_name,
            status="success", source="scheduled", media_id=media_id,
            user_id=user_id,
        )
        logger.info("Story scheduler: posted story — %s (media_id=%s)", file_name, media_id)
    except Exception as e:
        log_story_attempt(
            file_id=file_id, file_name=file_name,
            status="failed", source="scheduled", error=str(e),
            user_id=user_id,
        )
        logger.error("Story scheduler: failed to post story — %s", e)
