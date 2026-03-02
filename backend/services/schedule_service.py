"""Schedule service — config persistence and the scheduled job logic."""

import json
import logging
import os
import random
import uuid
from datetime import datetime, timezone
from pathlib import Path

from services.claude_service import generate_caption
from services.drive_service import download_photo, download_photo_header, list_photos
from services.photos_service import list_picker_items, _get_access_token as _gphotos_token, download_picker_photo
from services.instagram_service import post_photo, search_instagram_location

logger = logging.getLogger(__name__)

_BASE_DATA_DIR = Path(__file__).parent.parent / "data"
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
    "source": "drive",        # "drive" or "gphotos_picker"
    "timezone": "America/Los_Angeles",
    "folder_id": "",
    "tone": "engaging",
    "require_approval": True,
    "default_caption": DEFAULT_CAPTION,
}


# ---------------------------------------------------------------------------
# Per-user data directory helpers
# ---------------------------------------------------------------------------

def _user_data_dir(user_id: int | None) -> Path:
    if user_id is not None:
        return _BASE_DATA_DIR / "users" / str(user_id)
    return _BASE_DATA_DIR


def _config_file(user_id: int | None) -> Path:
    return _user_data_dir(user_id) / "schedule_config.json"


def _pending_file(user_id: int | None) -> Path:
    return _user_data_dir(user_id) / "pending_posts.json"


def _posted_file(user_id: int | None) -> Path:
    return _user_data_dir(user_id) / "posted_photos.json"


def _history_file(user_id: int | None) -> Path:
    return _user_data_dir(user_id) / "post_history.json"


def _location_cache_file(user_id: int | None) -> Path:
    return _user_data_dir(user_id) / "photo_locations.json"


# Keep module-level constants for legacy callers (schedule router unmark endpoint etc.)
DATA_DIR = _BASE_DATA_DIR
CONFIG_FILE = _config_file(None)
PENDING_FILE = _pending_file(None)
POSTED_FILE = _posted_file(None)
HISTORY_FILE = _history_file(None)
LOCATION_CACHE_FILE = _location_cache_file(None)


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

def load_config(user_id: int | None = None) -> dict:
    f = _config_file(user_id)
    if not f.exists():
        return dict(DEFAULT_CONFIG)
    try:
        return json.loads(f.read_text())
    except Exception:
        return dict(DEFAULT_CONFIG)


def save_config(config: dict, user_id: int | None = None) -> None:
    d = _user_data_dir(user_id)
    d.mkdir(parents=True, exist_ok=True)
    _config_file(user_id).write_text(json.dumps(config, indent=2))


# ---------------------------------------------------------------------------
# Posted IDs
# ---------------------------------------------------------------------------

def load_posted_ids(user_id: int | None = None) -> set[str]:
    f = _posted_file(user_id)
    if not f.exists():
        return set()
    try:
        return set(json.loads(f.read_text()))
    except Exception:
        return set()


def record_posted_id(file_id: str, user_id: int | None = None) -> None:
    ids = load_posted_ids(user_id)
    ids.add(file_id)
    d = _user_data_dir(user_id)
    d.mkdir(parents=True, exist_ok=True)
    _posted_file(user_id).write_text(json.dumps(sorted(ids), indent=2))


def remove_posted_id(file_id: str, user_id: int | None = None) -> None:
    ids = load_posted_ids(user_id)
    ids.discard(file_id)
    d = _user_data_dir(user_id)
    d.mkdir(parents=True, exist_ok=True)
    _posted_file(user_id).write_text(json.dumps(sorted(ids), indent=2))


# ---------------------------------------------------------------------------
# Pending posts
# ---------------------------------------------------------------------------

def load_pending(user_id: int | None = None) -> list[dict]:
    f = _pending_file(user_id)
    if not f.exists():
        return []
    try:
        return json.loads(f.read_text())
    except Exception:
        return []


def save_pending(posts: list[dict], user_id: int | None = None) -> None:
    d = _user_data_dir(user_id)
    d.mkdir(parents=True, exist_ok=True)
    _pending_file(user_id).write_text(json.dumps(posts, indent=2))


# ---------------------------------------------------------------------------
# Post history
# ---------------------------------------------------------------------------

def load_history(user_id: int | None = None) -> list[dict]:
    f = _history_file(user_id)
    if not f.exists():
        return []
    try:
        return json.loads(f.read_text())
    except Exception:
        return []


def log_post_attempt(
    *,
    file_ids: list[str],
    file_names: list[str],
    caption: str,
    status: str,
    source: str,
    error: str = "",
    media_id: str = "",
    user_id: int | None = None,
) -> None:
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
    history = load_history(user_id)
    history.insert(0, entry)
    d = _user_data_dir(user_id)
    d.mkdir(parents=True, exist_ok=True)
    _history_file(user_id).write_text(json.dumps(history, indent=2))


# ---------------------------------------------------------------------------
# Location cache
# ---------------------------------------------------------------------------

def load_location_cache(user_id: int | None = None) -> dict:
    f = _location_cache_file(user_id)
    if not f.exists():
        return {}
    try:
        return json.loads(f.read_text())
    except Exception:
        return {}


def save_location_cache(cache: dict, user_id: int | None = None) -> None:
    d = _user_data_dir(user_id)
    d.mkdir(parents=True, exist_ok=True)
    _location_cache_file(user_id).write_text(json.dumps(cache, indent=2))


def resolve_photo_locations(
    file_ids: list,
    creds: dict | None = None,
    user_id: int | None = None,
) -> dict:
    cache = load_location_cache(user_id)
    uncached = [fid for fid in file_ids if fid not in cache]

    for fid in uncached:
        try:
            header_bytes = download_photo_header(fid, creds=creds)
            meta = extract_photo_metadata(header_bytes)
            cache[fid] = meta.get("location_name")
        except Exception as e:
            logger.warning("Location resolve failed for %s: %s", fid, e)
            cache[fid] = None

    if uncached:
        save_location_cache(cache, user_id)

    return {fid: cache.get(fid) for fid in file_ids}


# ---------------------------------------------------------------------------
# Location grouping helpers
# ---------------------------------------------------------------------------

def select_by_location(unused: list, locations: dict) -> list:
    groups: dict = {}
    for photo in unused:
        loc = locations.get(photo["id"])
        if loc:
            groups.setdefault(loc, []).append(photo)

    valid = {loc: photos for loc, photos in groups.items() if len(photos) >= 2}
    if valid:
        best = max(valid, key=lambda loc: len(valid[loc]))
        logger.info("Location grouping: picked '%s' (%d photos available)", best, len(valid[best]))
        return valid[best]

    logger.info("Location grouping: no group with ≥2 photos — using random selection")
    return unused


# ---------------------------------------------------------------------------
# EXIF helpers
# ---------------------------------------------------------------------------

def _dms_to_decimal(dms, ref: str):
    if not dms or len(dms) < 3:
        return None
    d, m, s = float(dms[0]), float(dms[1]), float(dms[2])
    decimal = d + m / 60 + s / 3600
    if ref in ("S", "W"):
        decimal = -decimal
    return decimal


def _reverse_geocode(lat: float, lng: float):
    import httpx as _httpx
    try:
        resp = _httpx.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={"lat": lat, "lon": lng, "format": "json"},
            headers={"User-Agent": "autoinstapost/1.0"},
            timeout=8,
        )
        if resp.is_success:
            addr = resp.json().get("address", {})
            city = (
                addr.get("city")
                or addr.get("town")
                or addr.get("village")
                or addr.get("county")
            )
            region = addr.get("state") or addr.get("country")
            parts = [p for p in [city, region] if p]
            return ", ".join(parts) if parts else None
    except Exception as e:
        logger.warning("Reverse geocode failed: %s", e)
    return None


def extract_photo_metadata(image_bytes: bytes) -> dict:
    import io
    from PIL import Image

    result = {}
    try:
        img = Image.open(io.BytesIO(image_bytes))
        exif = img.getexif()

        for tag_id in (36867, 36868, 306):
            date_raw = exif.get(tag_id)
            if date_raw:
                try:
                    dt = datetime.strptime(date_raw, "%Y:%m:%d %H:%M:%S")
                    result["date"] = dt.strftime("%-d %B %Y")
                    break
                except ValueError:
                    continue

        gps_info = exif.get_ifd(34853)
        if gps_info:
            lat = _dms_to_decimal(gps_info.get(2), gps_info.get(1))
            lng = _dms_to_decimal(gps_info.get(4), gps_info.get(3))
            if lat is not None and lng is not None:
                result["gps"] = (lat, lng)
                loc = _reverse_geocode(lat, lng)
                if loc:
                    result["location_name"] = loc
    except Exception as e:
        logger.warning("EXIF extraction failed: %s", e)

    return result


def _compress_for_instagram(image_bytes: bytes, max_bytes: int = 7_000_000) -> bytes:
    import io
    from PIL import Image, ImageOps

    img = Image.open(io.BytesIO(image_bytes))
    img = ImageOps.exif_transpose(img)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    max_dim = 1440
    w, h = img.size
    if max(w, h) > max_dim:
        scale = max_dim / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    quality = 88
    buf = io.BytesIO()
    while quality >= 40:
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        if buf.tell() <= max_bytes:
            break
        quality -= 10

    logger.info(
        "Compressed image: %d KB → %d KB (quality=%d)",
        len(image_bytes) // 1024,
        buf.tell() // 1024,
        quality,
    )
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Core posting
# ---------------------------------------------------------------------------

def _post_images(
    file_ids: list[str],
    caption: str,
    creds: dict | None = None,
    user_id: int | None = None,
    location_id=None,
    source: str = "drive",
    picker_session_id: str | None = None,
) -> str:
    import httpx as _httpx
    from services.instagram_service import post_carousel

    base_url = (
        (creds.get("public_base_url") if creds else None)
        or os.environ.get("PUBLIC_BASE_URL", "")
    ).rstrip("/")

    if not base_url or "localhost" in base_url or "127.0.0.1" in base_url:
        raise RuntimeError(
            f"PUBLIC_BASE_URL is not set to a public URL (current value: '{base_url}'). "
            "Run 'cloudflared tunnel --url http://localhost:8000', copy the URL, "
            "update PUBLIC_BASE_URL, then retry."
        )

    temp_files: list[Path] = []
    image_urls: list[str] = []

    try:
        for fid in file_ids:
            if source == "gphotos_picker" and picker_session_id:
                image_bytes, mime_type = download_picker_photo(fid, picker_session_id, creds)
            else:
                image_bytes, mime_type = download_photo(fid, creds=creds)
            image_bytes = _compress_for_instagram(image_bytes)
            filename = f"{uuid.uuid4().hex}.jpg"
            filepath = TEMP_DIR / filename
            filepath.write_bytes(image_bytes)
            temp_files.append(filepath)
            image_urls.append(f"{base_url}/temp/{filename}")

        try:
            probe = _httpx.get(
                image_urls[0],
                timeout=12,
                follow_redirects=True,
                headers={
                    "User-Agent": (
                        "facebookexternalhit/1.1 "
                        "(+http://www.facebook.com/externalhit_uatext.php)"
                    ),
                    "Range": "bytes=0-2047",
                },
            )
            if probe.status_code not in (200, 206):
                raise RuntimeError(
                    f"Image URL returned HTTP {probe.status_code}. "
                    f"Tunnel may be down or public_base_url is wrong. URL: {image_urls[0]}"
                )
            ct = probe.headers.get("content-type", "")
            if not ct.lower().startswith("image/"):
                raise RuntimeError(
                    f"Image URL returned Content-Type='{ct}' — not an image. "
                    "Cloudflare is likely showing a bot-challenge page to Instagram's crawler."
                )
        except _httpx.RequestError as exc:
            raise RuntimeError(f"Cannot reach image URL: {exc}.") from exc

        logger.info("Posting to Instagram (base_url=%s): %s", base_url, image_urls)

        if len(image_urls) == 1:
            return post_photo(image_urls[0], caption, location_id=location_id, creds=creds, user_id=user_id)
        return post_carousel(image_urls, caption, location_id=location_id, creds=creds, user_id=user_id)
    finally:
        for fp in temp_files:
            fp.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Scheduled job
# ---------------------------------------------------------------------------

def run_scheduled_job(user_id: int | None = None) -> None:
    """Core scheduled job: pick photo, generate caption, post or queue."""
    creds: dict | None = None
    if user_id is not None:
        from db import get_credentials
        creds = get_credentials(user_id)

    config = load_config(user_id)

    if not config.get("enabled"):
        logger.info("Scheduler: job triggered but scheduling is disabled — skipping.")
        return

    source = config.get("source", "drive")
    picker_session_id = (creds or {}).get("google_picker_session_id") if source == "gphotos_picker" else None

    if source == "gphotos_picker":
        if not creds or not creds.get("google_picker_session_id"):
            logger.warning("Scheduler: source=gphotos_picker but no picker session found — skipping.")
            return
        try:
            access_token = _gphotos_token(creds)
            photos = list_picker_items(picker_session_id, access_token)
        except Exception as e:
            logger.error("Scheduler: failed to list picker photos — %s", e)
            return
    else:
        folder_id = config.get("folder_id", "").strip()
        if not folder_id:
            logger.warning("Scheduler: no folder_id configured — skipping.")
            return
        try:
            photos = list_photos(folder_id, creds=creds)
        except Exception as e:
            logger.error("Scheduler: failed to list photos — %s", e)
            return

    if not photos:
        logger.warning("Scheduler: no photos found — skipping.")
        return

    posted_ids = load_posted_ids(user_id)
    INSTAGRAM_OK = {"image/jpeg", "image/png"}
    unused = [
        p for p in photos
        if p["id"] not in posted_ids and p.get("mimeType", "") in INSTAGRAM_OK
    ]
    if not unused:
        logger.warning("Scheduler: all %d photos have already been posted — skipping.", len(photos))
        return

    all_unused_ids = [p["id"] for p in unused]
    locations = resolve_photo_locations(all_unused_ids, creds=creds, user_id=user_id)
    pool = select_by_location(unused, locations)

    pick_count = min(10, len(pool))
    selected = random.sample(pool, pick_count) if len(pool) > pick_count else list(pool)
    file_ids = [p["id"] for p in selected]
    file_names = [p.get("name", p["id"]) for p in selected]
    tone = config.get("tone", "engaging")

    try:
        images = []
        meta = {}
        for i, fid in enumerate(file_ids):
            image_bytes, mime_type = download_photo(fid, creds=creds)
            if i == 0:
                meta = extract_photo_metadata(image_bytes)
            compressed = _compress_for_instagram(image_bytes)
            images.append((compressed, "image/jpeg"))

        date_str = meta.get("date")
        location_name = meta.get("location_name")
        gps = meta.get("gps")
        logger.info("Scheduler: photo metadata — date=%s, location=%s, gps=%s", date_str, location_name, gps)

        location_id = None
        if gps:
            location_id = search_instagram_location(*gps, creds=creds, user_id=user_id)
            logger.info("Scheduler: Instagram location_id=%s", location_id)

        caption = generate_caption(
            images, tone=tone, date_str=date_str, location_str=location_name, creds=creds
        )
    except Exception as e:
        logger.error("Scheduler: failed to generate caption — %s — skipping post.", e)
        log_post_attempt(
            file_ids=file_ids, file_names=file_names,
            caption="", status="failed",
            source="scheduled", error=f"Caption generation failed: {e}",
            user_id=user_id,
        )
        return

    if not config.get("require_approval", True):
        try:
            media_id = _post_images(file_ids, caption, creds=creds, user_id=user_id, location_id=location_id)
            for fid in file_ids:
                record_posted_id(fid, user_id)
            log_post_attempt(
                file_ids=file_ids, file_names=file_names,
                caption=caption, status="success",
                source="scheduled", media_id=media_id,
                user_id=user_id,
            )
            logger.info("Scheduler: auto-posted %d photo(s): %s", len(file_ids), file_names)
        except Exception as e:
            log_post_attempt(
                file_ids=file_ids, file_names=file_names,
                caption=caption, status="failed",
                source="scheduled", error=str(e),
                user_id=user_id,
            )
            logger.error("Scheduler: failed to post — %s", e)
    else:
        post_id = str(uuid.uuid4())
        post = {
            "id": post_id,
            "file_ids": file_ids,
            "file_names": file_names,
            "caption": caption,
            "location_id": location_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        pending = load_pending(user_id)
        pending.append(post)
        save_pending(pending, user_id)
        for fid in file_ids:
            record_posted_id(fid, user_id)
        log_post_attempt(
            file_ids=file_ids, file_names=file_names,
            caption=caption, status="queued",
            source="scheduled", media_id=post_id,
            user_id=user_id,
        )
        logger.info("Scheduler: queued %d photo(s) for approval (id=%s)", len(file_ids), post_id)


# ---------------------------------------------------------------------------
# Approval / rejection
# ---------------------------------------------------------------------------

def approve_pending_post(post_id: str, user_id: int | None = None) -> bool:
    creds: dict | None = None
    if user_id is not None:
        from db import get_credentials
        creds = get_credentials(user_id)

    pending = load_pending(user_id)
    post = next((p for p in pending if p["id"] == post_id), None)
    if post is None:
        return False

    file_ids = post.get("file_ids") or [post["file_id"]]
    file_names = post.get("file_names") or [post.get("file_name", file_ids[0])]
    location_id = post.get("location_id")

    try:
        media_id = _post_images(file_ids, post["caption"], creds=creds, user_id=user_id, location_id=location_id)
        log_post_attempt(
            file_ids=file_ids, file_names=file_names,
            caption=post["caption"], status="success",
            source="approved", media_id=media_id,
            user_id=user_id,
        )
    except Exception as e:
        log_post_attempt(
            file_ids=file_ids, file_names=file_names,
            caption=post["caption"], status="failed",
            source="approved", error=str(e),
            user_id=user_id,
        )
        raise

    save_pending([p for p in pending if p["id"] != post_id], user_id)
    return True


def reject_pending_post(post_id: str, user_id: int | None = None) -> bool:
    pending = load_pending(user_id)
    new_pending = [p for p in pending if p["id"] != post_id]
    if len(new_pending) == len(pending):
        return False
    save_pending(new_pending, user_id)
    return True
