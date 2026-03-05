"""Routes for posting to Instagram."""

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user
from db import get_credentials
from services.drive_service import download_photo as drive_download_photo
from services.photos_service import download_media as gphotos_download_media
from services.photos_service import download_picker_photo as gphotos_picker_download
from services.instagram_service import (
    exchange_for_long_lived_token,
    get_account_info,
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
    file_ids: list[str]
    caption: str
    source: str = "drive"  # "drive", "gphotos", or "gphotos_picker"
    picker_session_id: str | None = None  # required when source == "gphotos_picker"


class TokenRequest(BaseModel):
    short_lived_token: str


def _save_temp(image_bytes: bytes, base_url: str) -> tuple[Path, str]:
    filename = f"{uuid.uuid4().hex}.jpg"
    filepath = TEMP_DIR / filename
    filepath.write_bytes(image_bytes)
    if not base_url or "localhost" in base_url or "127.0.0.1" in base_url:
        raise HTTPException(
            status_code=400,
            detail=(
                f"PUBLIC_BASE_URL is not set to a public URL (current: '{base_url}'). "
                "Run cloudflared, update public_base_url in your credentials, then retry."
            ),
        )
    return filepath, f"{base_url}/temp/{filename}"


def _verify_image_url(url: str, base_url: str) -> None:
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
                    f"Tunnel may be down or public_base_url is wrong (current: {base_url})."
                ),
            )
        ct = probe.headers.get("content-type", "")
        if not ct.lower().startswith("image/"):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Image URL returned Content-Type='{ct}' — not an image. "
                    "Cloudflare is likely showing a bot-challenge page to Instagram's crawler."
                ),
            )
    except _httpx.RequestError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot reach image URL: {exc}. Check cloudflared and public_base_url.",
        ) from exc


@router.post("/post")
def post_to_instagram(req: PostRequest, current_user: dict = Depends(get_current_user)):
    if not req.file_ids:
        raise HTTPException(status_code=400, detail="At least one file_id is required")
    if len(req.file_ids) > 4:
        raise HTTPException(status_code=400, detail="Carousels support at most 4 images")

    user_id = current_user["id"]
    creds = get_credentials(user_id)
    base_url = (
        (creds.get("public_base_url") if creds else None) or ""
    ).rstrip("/")

    temp_files: list[Path] = []
    try:
        image_urls = []
        location_id = None
        for i, file_id in enumerate(req.file_ids):
            if req.source == "gphotos_picker":
                if not req.picker_session_id:
                    raise HTTPException(status_code=400, detail="picker_session_id required for gphotos_picker source")
                image_bytes, mime_type = gphotos_picker_download(file_id, req.picker_session_id, creds)
            elif req.source == "gphotos":
                image_bytes, mime_type = gphotos_download_media(file_id, creds)
            else:
                image_bytes, mime_type = drive_download_photo(file_id, creds=creds)
            if i == 0:
                meta = extract_photo_metadata(image_bytes)
                gps = meta.get("gps")
                if gps:
                    location_id = search_instagram_location(*gps, creds=creds, user_id=user_id)
            image_bytes = _compress_for_instagram(image_bytes)
            filepath, url = _save_temp(image_bytes, base_url)
            temp_files.append(filepath)
            image_urls.append(url)

        _verify_image_url(image_urls[0], base_url)

        if len(image_urls) == 1:
            media_id = post_photo(image_urls[0], req.caption, location_id=location_id, creds=creds, user_id=user_id)
        else:
            media_id = post_carousel(image_urls, req.caption, location_id=location_id, creds=creds, user_id=user_id)

        for fid in req.file_ids:
            record_posted_id(fid, user_id)

        post_type = "single" if len(image_urls) == 1 else "carousel"
        log_post_attempt(
            file_ids=req.file_ids, file_names=req.file_ids,
            caption=req.caption, status="success",
            source="manual", media_id=media_id,
            user_id=user_id,
        )
        return {"success": True, "media_id": media_id, "type": post_type}

    except Exception as e:
        log_post_attempt(
            file_ids=req.file_ids, file_names=req.file_ids,
            caption=req.caption, status="failed",
            source="manual", error=str(e),
            user_id=user_id,
        )
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        for fp in temp_files:
            fp.unlink(missing_ok=True)


@router.get("/account-info")
def account_info(current_user: dict = Depends(get_current_user)):
    creds = get_credentials(current_user["id"])
    return get_account_info(creds=creds)


@router.get("/token-status")
def token_status(current_user: dict = Depends(get_current_user)):
    creds = get_credentials(current_user["id"])
    return get_token_status(creds=creds)


@router.post("/token-exchange")
def token_exchange(req: TokenRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    creds = get_credentials(user_id)
    try:
        token = exchange_for_long_lived_token(req.short_lived_token, creds=creds, user_id=user_id)
        status = get_token_status(creds=creds)
        return {"success": True, "days_left": status.get("days_left"), "token_preview": token[:20] + "…"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
