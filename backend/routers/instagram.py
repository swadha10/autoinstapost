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
    post_photo,
)

router = APIRouter(prefix="/instagram", tags=["instagram"])

TEMP_DIR = Path("/tmp/autoinstapost")
TEMP_DIR.mkdir(parents=True, exist_ok=True)


class PostRequest(BaseModel):
    file_id: str
    caption: str


class TokenRequest(BaseModel):
    short_lived_token: str


@router.post("/post")
def post_to_instagram(req: PostRequest):
    """Download the Drive photo, save it temporarily, then post to Instagram."""
    try:
        image_bytes, mime_type = download_photo(req.file_id)

        ext = mime_type.split("/")[-1].replace("jpeg", "jpg")
        filename = f"{uuid.uuid4().hex}.{ext}"
        filepath = TEMP_DIR / filename
        filepath.write_bytes(image_bytes)

        base_url = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")
        image_url = f"{base_url}/temp/{filename}"

        media_id = post_photo(image_url, req.caption)

        filepath.unlink(missing_ok=True)

        return {"success": True, "media_id": media_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/token-status")
def token_status():
    """Return how many days are left on the stored access token."""
    return get_token_status()


@router.post("/token-exchange")
def token_exchange(req: TokenRequest):
    """
    Exchange a short-lived Graph API Explorer token for a long-lived one (~60 days).
    Requires FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in .env.
    """
    try:
        token = exchange_for_long_lived_token(req.short_lived_token)
        status = get_token_status()
        return {"success": True, "days_left": status.get("days_left"), "token_preview": token[:20] + "…"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
