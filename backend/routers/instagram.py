"""Routes for posting to Instagram."""

import os
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.drive_service import download_photo
from services.instagram_service import post_photo

router = APIRouter(prefix="/instagram", tags=["instagram"])

# Temp directory to serve images to Instagram
TEMP_DIR = Path("/tmp/autoinstapost")
TEMP_DIR.mkdir(parents=True, exist_ok=True)


class PostRequest(BaseModel):
    file_id: str
    caption: str


@router.post("/post")
def post_to_instagram(req: PostRequest):
    """
    Download the Drive photo, save it temporarily, then post to Instagram.
    Instagram requires a publicly reachable URL for the image.
    Set PUBLIC_BASE_URL in .env to your server's public address.
    """
    try:
        image_bytes, mime_type = download_photo(req.file_id)

        # Save to temp file so we can serve a public URL
        ext = mime_type.split("/")[-1].replace("jpeg", "jpg")
        filename = f"{uuid.uuid4().hex}.{ext}"
        filepath = TEMP_DIR / filename
        filepath.write_bytes(image_bytes)

        base_url = os.environ.get("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")
        image_url = f"{base_url}/temp/{filename}"

        media_id = post_photo(image_url, req.caption)

        # Clean up temp file after posting
        filepath.unlink(missing_ok=True)

        return {"success": True, "media_id": media_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
