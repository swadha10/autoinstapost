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
from services.instagram_service import post_photo, search_instagram_location

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data"
CONFIG_FILE = DATA_DIR / "schedule_config.json"
PENDING_FILE = DATA_DIR / "pending_posts.json"
POSTED_FILE = DATA_DIR / "posted_photos.json"
HISTORY_FILE = DATA_DIR / "post_history.json"
LOCATION_CACHE_FILE = DATA_DIR / "photo_locations.json"

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


def load_location_cache() -> dict:
    """Return {file_id: location_name_or_None} from the persistent cache."""
    if not LOCATION_CACHE_FILE.exists():
        return {}
    try:
        return json.loads(LOCATION_CACHE_FILE.read_text())
    except Exception:
        return {}


def save_location_cache(cache: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    LOCATION_CACHE_FILE.write_text(json.dumps(cache, indent=2))


def resolve_photo_locations(file_ids: list) -> dict:
    """
    Return {file_id: location_name_or_None} for the given IDs.
    Hits the persistent cache first; for any uncached ID downloads only the
    first 128 KB of the file (enough for EXIF GPS) to avoid pulling full images.
    """
    cache = load_location_cache()
    uncached = [fid for fid in file_ids if fid not in cache]

    for fid in uncached:
        try:
            header_bytes = download_photo_header(fid)
            meta = extract_photo_metadata(header_bytes)
            cache[fid] = meta.get("location_name")   # None when no GPS
        except Exception as e:
            logger.warning("Location resolve failed for %s: %s", fid, e)
            cache[fid] = None   # cache the failure so we don't retry every run

    if uncached:
        save_location_cache(cache)

    return {fid: cache.get(fid) for fid in file_ids}


def select_by_location(unused: list, locations: dict) -> list:
    """
    Group *unused* photos by location name and return all photos from the
    location with the most unposted shots.  Falls back to the full *unused*
    list when no location group has ≥ 2 photos (e.g. no GPS in any photo).
    """
    groups: dict = {}
    for photo in unused:
        loc = locations.get(photo["id"])
        if loc:
            groups.setdefault(loc, []).append(photo)

    valid = {loc: photos for loc, photos in groups.items() if len(photos) >= 2}
    if valid:
        best = max(valid, key=lambda loc: len(valid[loc]))
        logger.info(
            "Location grouping: picked '%s' (%d photos available)", best, len(valid[best])
        )
        return valid[best]

    logger.info("Location grouping: no group with ≥2 photos — using random selection")
    return unused


def _dms_to_decimal(dms, ref: str):
    """Convert GPS degrees/minutes/seconds tuple to decimal degrees."""
    if not dms or len(dms) < 3:
        return None
    d, m, s = float(dms[0]), float(dms[1]), float(dms[2])
    decimal = d + m / 60 + s / 3600
    if ref in ("S", "W"):
        decimal = -decimal
    return decimal


def _reverse_geocode(lat: float, lng: float):
    """Return 'City, State' string from GPS coords via Nominatim (no API key required)."""
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
    """
    Extract date and GPS location from photo EXIF.
    Returns a dict with optional keys: 'date' (str), 'gps' (lat, lng), 'location_name' (str).
    """
    import io
    from PIL import Image

    result = {}
    try:
        img = Image.open(io.BytesIO(image_bytes))
        exif = img.getexif()

        # Try date tags in priority order:
        # 36867 = DateTimeOriginal (actual capture), 36868 = DateTimeDigitized, 306 = DateTime (file modified)
        for tag_id in (36867, 36868, 306):
            date_raw = exif.get(tag_id)
            if date_raw:
                try:
                    dt = datetime.strptime(date_raw, "%Y:%m:%d %H:%M:%S")
                    result["date"] = dt.strftime("%-d %B %Y")  # e.g. "15 February 2026"
                    break
                except ValueError:
                    continue

        # GPSInfo (tag 34853)
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
    """
    Re-encode image as JPEG and scale down until it fits within *max_bytes*.
    Instagram carousel items must be ≤ 8 MB; we target 7 MB to be safe.
    Also caps the longest dimension at 1440 px (Instagram's carousel max).
    """
    import io
    from PIL import Image, ImageOps

    img = Image.open(io.BytesIO(image_bytes))
    # Fix orientation from EXIF before anything else
    img = ImageOps.exif_transpose(img)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")

    # Resize so longest edge ≤ 1440 px
    max_dim = 1440
    w, h = img.size
    if max(w, h) > max_dim:
        scale = max_dim / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    # Iteratively lower quality until under size limit
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


def _post_images(file_ids: list[str], caption: str, location_id=None) -> str:
    """Download one or more Drive photos, post single or carousel. Returns media_id."""
    import httpx as _httpx
    from services.instagram_service import post_carousel

    base_url = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")

    # Fail early with a clear message rather than letting Instagram return a cryptic error
    if not base_url or "localhost" in base_url or "127.0.0.1" in base_url:
        raise RuntimeError(
            f"PUBLIC_BASE_URL is not set to a public URL (current value: '{base_url}'). "
            "Run 'cloudflared tunnel --url http://localhost:8000', copy the URL, "
            "update PUBLIC_BASE_URL in backend/.env, then restart the backend."
        )

    temp_files: list[Path] = []
    image_urls: list[str] = []

    try:
        for fid in file_ids:
            image_bytes, mime_type = download_photo(fid)
            image_bytes = _compress_for_instagram(image_bytes)
            filename = f"{uuid.uuid4().hex}.jpg"
            filepath = TEMP_DIR / filename
            filepath.write_bytes(image_bytes)
            temp_files.append(filepath)
            image_urls.append(f"{base_url}/temp/{filename}")

        # Probe first URL simulating Instagram's crawler.
        # Use GET (not HEAD) + facebookexternalhit UA to catch:
        #   - dead tunnels
        #   - Cloudflare HTML interstitials served to bots
        #   - wrong Content-Type (not an image)
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
                    f"Tunnel may be down or PUBLIC_BASE_URL is wrong. "
                    f"URL: {image_urls[0]}"
                )
            ct = probe.headers.get("content-type", "")
            if not ct.lower().startswith("image/"):
                raise RuntimeError(
                    f"Image URL returned Content-Type='{ct}' — not an image. "
                    "Cloudflare is likely showing a bot-challenge page to Instagram's crawler. "
                    "Fix: switch PUBLIC_BASE_URL from a trycloudflare.com quick tunnel to the "
                    "named tunnel (ca5619f4-cb52-40a6-929e-eb12000b7728.cfargotunnel.com) "
                    "and restart the backend."
                )
        except _httpx.RequestError as exc:
            raise RuntimeError(
                f"Cannot reach image URL: {exc}. "
                "Check cloudflared is running and PUBLIC_BASE_URL is correct in .env."
            ) from exc

        logger.info("Posting to Instagram (base_url=%s): %s", base_url, image_urls)

        if len(image_urls) == 1:
            return post_photo(image_urls[0], caption, location_id=location_id)
        return post_carousel(image_urls, caption, location_id=location_id)
    finally:
        for fp in temp_files:
            fp.unlink(missing_ok=True)


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
    # Instagram only supports JPEG and PNG — skip HEIC, WebP, GIF, etc.
    INSTAGRAM_OK = {"image/jpeg", "image/png"}
    unused = [
        p for p in photos
        if p["id"] not in posted_ids and p.get("mimeType", "") in INSTAGRAM_OK
    ]
    if not unused:
        logger.warning("Scheduler: all %d photos have already been posted — skipping to avoid reuse.", len(photos))
        return

    # Guardrail (AGENTS.md #6): group by location before selecting
    all_unused_ids = [p["id"] for p in unused]
    locations = resolve_photo_locations(all_unused_ids)
    pool = select_by_location(unused, locations)

    # Guardrail (AGENTS.md #3): post as many same-location photos as possible (up to 10),
    # minimum 3 when available
    pick_count = min(10, len(pool))
    selected = random.sample(pool, pick_count) if len(pool) > pick_count else list(pool)
    file_ids = [p["id"] for p in selected]
    file_names = [p.get("name", p["id"]) for p in selected]
    tone = config.get("tone", "engaging")

    try:
        images = []
        meta = {}
        for i, fid in enumerate(file_ids):
            image_bytes, mime_type = download_photo(fid)
            if i == 0:
                # Extract date/GPS before compression strips EXIF
                meta = extract_photo_metadata(image_bytes)
            compressed = _compress_for_instagram(image_bytes)
            images.append((compressed, "image/jpeg"))

        date_str = meta.get("date")
        location_name = meta.get("location_name")
        gps = meta.get("gps")
        logger.info("Scheduler: photo metadata — date=%s, location=%s, gps=%s", date_str, location_name, gps)

        # Resolve Instagram location_id from GPS coordinates (best-effort)
        location_id = None
        if gps:
            location_id = search_instagram_location(*gps)
            logger.info("Scheduler: Instagram location_id=%s", location_id)

        caption = generate_caption(images, tone=tone, date_str=date_str, location_str=location_name)
    except Exception as e:
        logger.error("Scheduler: failed to generate caption via Gemini — %s — skipping post.", e)
        return

    if not config.get("require_approval", True):
        try:
            media_id = _post_images(file_ids, caption, location_id=location_id)
            for fid in file_ids:
                record_posted_id(fid)
            log_post_attempt(
                file_ids=file_ids, file_names=file_names,
                caption=caption, status="success",
                source="scheduled", media_id=media_id,
            )
            logger.info("Scheduler: auto-posted %d photo(s): %s", len(file_ids), file_names)
        except Exception as e:
            log_post_attempt(
                file_ids=file_ids, file_names=file_names,
                caption=caption, status="failed",
                source="scheduled", error=str(e),
            )
            logger.error("Scheduler: failed to post — %s", e)
    else:
        post = {
            "id": str(uuid.uuid4()),
            "file_ids": file_ids,
            "file_names": file_names,
            "caption": caption,
            "location_id": location_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        pending = load_pending()
        pending.append(post)
        save_pending(pending)
        # Record as used now so the same photos aren't queued again before approval
        for fid in file_ids:
            record_posted_id(fid)
        logger.info("Scheduler: queued %d photo(s) for approval (id=%s)", len(file_ids), post["id"])


def approve_pending_post(post_id: str) -> bool:
    """Post an approved item immediately. Returns True if found and posted."""
    pending = load_pending()
    post = next((p for p in pending if p["id"] == post_id), None)
    if post is None:
        return False

    # Support both old single-photo format (file_id) and new multi-photo format (file_ids)
    file_ids = post.get("file_ids") or [post["file_id"]]
    file_names = post.get("file_names") or [post.get("file_name", file_ids[0])]

    location_id = post.get("location_id")

    try:
        media_id = _post_images(file_ids, post["caption"], location_id=location_id)
        log_post_attempt(
            file_ids=file_ids, file_names=file_names,
            caption=post["caption"], status="success",
            source="approved", media_id=media_id,
        )
    except Exception as e:
        log_post_attempt(
            file_ids=file_ids, file_names=file_names,
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
