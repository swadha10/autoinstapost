"""Routes for generating captions via Gemini."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import get_current_user
from db import get_credentials
from services.claude_service import generate_caption
from services.drive_service import download_photo
from services.schedule_service import extract_photo_metadata

router = APIRouter(prefix="/caption", tags=["caption"])


class CaptionRequest(BaseModel):
    file_ids: list[str]
    tone: str = "engaging"


@router.post("/generate")
def generate(req: CaptionRequest, current_user: dict = Depends(get_current_user)):
    creds = get_credentials(current_user["id"])
    try:
        raw_images = [download_photo(fid, creds=creds) for fid in req.file_ids]
        meta = extract_photo_metadata(raw_images[0][0]) if raw_images else {}
        caption = generate_caption(
            raw_images,
            tone=req.tone,
            date_str=meta.get("date"),
            location_str=meta.get("location_name"),
            creds=creds,
        )
        return {"caption": caption, "location_name": meta.get("location_name") or ""}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
