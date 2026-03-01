"""Routes for posting to Instagram."""

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.drive_service import download_photo
from services.instagram_service import (
    exchange_for_long_lived_token,
    get_token_status,
    post_carousel,
    post_photo,
    search_instagram_location,
)
from services.schedule_service import _compress_for_instagram, extract_photo_metadata, log_post_attempt, record_posted_id

router = APIRouter(prefix="/instagram", tags=["instagram"])

TEMP_DIR = Path("/tmp/autoinstapost")
TEMP_DIR.mkdir(parents=True, exist_ok=True)


class PostRequest(BaseModel):
    file_ids: list[str]   # one image → single post; 2-10 → carousel
    caption: str


class TokenRequest(BaseModel):
    short_lived_token: str


def _save_temp(image_bytes: bytes, mime_type: str) -> tuple[Path, str]:
    """Write image bytes to a temp file and return (path, public_url)."""
    ext = mime_type.split("/")[-1].lower()
    ext = "jpg" if ext in ("jpeg", "jpg") else ("png" if ext == "png" else "jpg")
    filename = f"{uuid.uuid4().hex}.{ext}"
    filepath = TEMP_DIR / filename
    filepath.write_bytes(image_bytes)
    base_url = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
    if not base_url or "localhost" in base_url or "127.0.0.1" in base_url:
        raise HTTPException(
            status_code=400,
            detail=(
                f"PUBLIC_BASE_URL is not set to a public URL (current: '{base_url}'). "
                "Run cloudflared, update PUBLIC_BASE_URL in backend/.env, then restart the backend."
            ),
        )
    return filepath, f"{base_url}/temp/{filename}"


def _verify_image_url(url: str, base_url: str) -> None:
    """Probe the URL as Instagram's crawler would — raises HTTPException on failure."""
    import httpx as _httpx
    try:
        probe = _httpx.get(
            url,
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
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Image URL returned HTTP {probe.status_code}. "
                    f"Tunnel may be down or PUBLIC_BASE_URL is wrong (current: {base_url}). "
                    "Update .env and restart the backend."
                ),
            )
        ct = probe.headers.get("content-type", "")
        if not ct.lower().startswith("image/"):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Image URL returned Content-Type='{ct}' — not an image. "
                    "Cloudflare is likely showing a bot-challenge page to Instagram's crawler. "
                    "Switch PUBLIC_BASE_URL from trycloudflare.com to the named tunnel "
                    "(ca5619f4-cb52-40a6-929e-eb12000b7728.cfargotunnel.com) and restart the backend."
                ),
            )
    except _httpx.RequestError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot reach image URL: {exc}. Check cloudflared and PUBLIC_BASE_URL in .env.",
        ) from exc


@router.post("/post")
def post_to_instagram(req: PostRequest):
    """Download Drive photo(s) and post to Instagram — single or carousel."""
    if not req.file_ids:
        raise HTTPException(status_code=400, detail="At least one file_id is required")
    if len(req.file_ids) > 10:
        raise HTTPException(status_code=400, detail="Instagram carousels support at most 10 images")

    temp_files: list[Path] = []
    try:
        # Download all images, extract metadata from first, compress, and build public URLs
        image_urls = []
        base_url = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
        location_id = None
        for i, file_id in enumerate(req.file_ids):
            image_bytes, mime_type = download_photo(file_id)
            if i == 0:
                # Extract GPS before compression strips EXIF; resolve Instagram location
                meta = extract_photo_metadata(image_bytes)
                gps = meta.get("gps")
                if gps:
                    location_id = search_instagram_location(*gps)
            image_bytes = _compress_for_instagram(image_bytes)
            filepath, url = _save_temp(image_bytes, "image/jpeg")
            temp_files.append(filepath)
            image_urls.append(url)

        # Verify first image is reachable and is actually an image (not an HTML interstitial)
        _verify_image_url(image_urls[0], base_url)

        if len(image_urls) == 1:
            media_id = post_photo(image_urls[0], req.caption, location_id=location_id)
        else:
            media_id = post_carousel(image_urls, req.caption, location_id=location_id)

        for fid in req.file_ids:
            record_posted_id(fid)

        post_type = "single" if len(image_urls) == 1 else "carousel"
        log_post_attempt(
            file_ids=req.file_ids, file_names=req.file_ids,
            caption=req.caption, status="success",
            source="manual", media_id=media_id,
        )
        return {"success": True, "media_id": media_id, "type": post_type}

    except Exception as e:
        log_post_attempt(
            file_ids=req.file_ids, file_names=req.file_ids,
            caption=req.caption, status="failed",
            source="manual", error=str(e),
        )
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        for fp in temp_files:
            fp.unlink(missing_ok=True)


@router.get("/token-status")
def token_status():
    return get_token_status()


@router.post("/token-exchange")
def token_exchange(req: TokenRequest):
    try:
        token = exchange_for_long_lived_token(req.short_lived_token)
        status = get_token_status()
        return {"success": True, "days_left": status.get("days_left"), "token_preview": token[:20] + "…"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
