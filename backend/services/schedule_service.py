"""Schedule service — config persistence and the scheduled job logic."""

import json
import logging
import os
import random
import uuid
from datetime import datetime, timezone
from pathlib import Path

from services.claude_service import generate_caption
from services.drive_service import download_photo, list_photos
from services.instagram_service import post_photo

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data"
CONFIG_FILE = DATA_DIR / "schedule_config.json"
PENDING_FILE = DATA_DIR / "pending_posts.json"
POSTED_FILE = DATA_DIR / "posted_photos.json"
HISTORY_FILE = DATA_DIR / "post_history.json"

TEMP_DIR = Path("/tmp/autoinstapost")
TEMP_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_CAPTION = "If you are feeling lazy use claude to post your work on insta w/o lifting a finger :)"

DEFAULT_CONFIG = {
    "enabled": False,
    "hour": 8,
    "minute": 0,
    "cadence": "daily",
    "every_n_days": 1,
    "weekdays": [0, 1, 2, 3, 4],
    "folder_id": "",
    "tone": "engaging",
    "require_approval": True,
    "default_caption": DEFAULT_CAPTION,
}


def load_config() -> dict:
    if not CONFIG_FILE.exists():
        return dict(DEFAULT_CONFIG)
    try:
        return json.loads(CONFIG_FILE.read_text())
    except Exception:
        return dict(DEFAULT_CONFIG)


def save_config(config: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.write_text(json.dumps(config, indent=2))


def load_posted_ids() -> set[str]:
    """Return set of file IDs that have already been posted."""
    if not POSTED_FILE.exists():
        return set()
    try:
        return set(json.loads(POSTED_FILE.read_text()))
    except Exception:
        return set()


def record_posted_id(file_id: str) -> None:
    """Append a file ID to the posted history so it is never reused."""
    ids = load_posted_ids()
    ids.add(file_id)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    POSTED_FILE.write_text(json.dumps(sorted(ids), indent=2))


def load_pending() -> list[dict]:
    if not PENDING_FILE.exists():
        return []
    try:
        return json.loads(PENDING_FILE.read_text())
    except Exception:
        return []


def save_pending(posts: list[dict]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    PENDING_FILE.write_text(json.dumps(posts, indent=2))


def load_history() -> list[dict]:
    if not HISTORY_FILE.exists():
        return []
    try:
        return json.loads(HISTORY_FILE.read_text())
    except Exception:
        return []


def log_post_attempt(
    *,
    file_ids: list[str],
    file_names: list[str],
    caption: str,
    status: str,          # "success" | "failed"
    source: str,          # "manual" | "scheduled" | "approved"
    error: str = "",
    media_id: str = "",
) -> None:
    """Append one entry to the post history log."""
    entry = {
        "id": str(uuid.uuid4()),
        "file_ids": file_ids,
        "file_names": file_names,
        "caption": caption,
        "status": status,
        "source": source,
        "error": error,
        "media_id": media_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    history = load_history()
    history.insert(0, entry)  # newest first
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    HISTORY_FILE.write_text(json.dumps(history, indent=2))


def _post_image(file_id: str, caption: str) -> str:
    """Download from Drive, save temp file, post to Instagram. Returns media_id."""
    image_bytes, mime_type = download_photo(file_id)
    ext = mime_type.split("/")[-1].replace("jpeg", "jpg")
    filename = f"{uuid.uuid4().hex}.{ext}"
    filepath = TEMP_DIR / filename
    filepath.write_bytes(image_bytes)

    base_url = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")
    image_url = f"{base_url}/temp/{filename}"

    try:
        media_id = post_photo(image_url, caption)
    finally:
        filepath.unlink(missing_ok=True)

    return media_id


def run_scheduled_job() -> None:
    """Core scheduled job: pick photo, generate caption, post or queue."""
    config = load_config()

    if not config.get("enabled"):
        logger.info("Scheduler: job triggered but scheduling is disabled — skipping.")
        return

    folder_id = config.get("folder_id", "").strip()
    if not folder_id:
        logger.warning("Scheduler: no folder_id configured — skipping.")
        return

    try:
        photos = list_photos(folder_id)
    except Exception as e:
        logger.error("Scheduler: failed to list photos — %s", e)
        return

    if not photos:
        logger.warning("Scheduler: no photos found in folder %s — skipping.", folder_id)
        return

    posted_ids = load_posted_ids()
    unused = [p for p in photos if p["id"] not in posted_ids]
    if not unused:
        logger.warning("Scheduler: all %d photos have already been posted — skipping to avoid reuse.", len(photos))
        return

    photo = random.choice(unused)
    file_id = photo["id"]
    file_name = photo.get("name", file_id)
    tone = config.get("tone", "engaging")

    try:
        image_bytes, mime_type = download_photo(file_id)
        caption = generate_caption([(image_bytes, mime_type)], tone=tone)
    except Exception as e:
        logger.error("Scheduler: failed to generate caption — %s", e)
        fallback = config.get("default_caption", "").strip()
        if not fallback:
            logger.warning("Scheduler: no default caption set — skipping post.")
            return
        caption = fallback
        logger.info("Scheduler: using default caption as fallback.")

    if not config.get("require_approval", True):
        try:
            media_id = _post_image(file_id, caption)
            record_posted_id(file_id)
            log_post_attempt(
                file_ids=[file_id], file_names=[file_name],
                caption=caption, status="success",
                source="scheduled", media_id=media_id,
            )
            logger.info("Scheduler: auto-posted %s", file_name)
        except Exception as e:
            log_post_attempt(
                file_ids=[file_id], file_names=[file_name],
                caption=caption, status="failed",
                source="scheduled", error=str(e),
            )
            logger.error("Scheduler: failed to post — %s", e)
    else:
        post = {
            "id": str(uuid.uuid4()),
            "file_id": file_id,
            "file_name": file_name,
            "caption": caption,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        pending = load_pending()
        pending.append(post)
        save_pending(pending)
        # Record as used now so the same photo isn't queued again before approval
        record_posted_id(file_id)
        logger.info("Scheduler: queued %s for approval (id=%s)", file_name, post["id"])


def approve_pending_post(post_id: str) -> bool:
    """Post an approved item immediately. Returns True if found and posted."""
    pending = load_pending()
    post = next((p for p in pending if p["id"] == post_id), None)
    if post is None:
        return False

    try:
        media_id = _post_image(post["file_id"], post["caption"])
        log_post_attempt(
            file_ids=[post["file_id"]], file_names=[post.get("file_name", post["file_id"])],
            caption=post["caption"], status="success",
            source="approved", media_id=media_id,
        )
    except Exception as e:
        log_post_attempt(
            file_ids=[post["file_id"]], file_names=[post.get("file_name", post["file_id"])],
            caption=post["caption"], status="failed",
            source="approved", error=str(e),
        )
        raise

    save_pending([p for p in pending if p["id"] != post_id])
    return True


def reject_pending_post(post_id: str) -> bool:
    """Discard a pending post. Returns True if found."""
    pending = load_pending()
    new_pending = [p for p in pending if p["id"] != post_id]
    if len(new_pending) == len(pending):
        return False
    save_pending(new_pending)
    return True
