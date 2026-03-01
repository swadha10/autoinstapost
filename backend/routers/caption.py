"""Routes for generating captions via Gemini."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.claude_service import generate_caption
from services.drive_service import download_photo
from services.schedule_service import extract_photo_metadata

router = APIRouter(prefix="/caption", tags=["caption"])


class CaptionRequest(BaseModel):
    file_ids: list[str]
    tone: str = "engaging"


@router.post("/generate")
def generate(req: CaptionRequest):
    """Download one or more images from Drive, extract EXIF context, then generate a caption."""
    try:
        raw_images = [download_photo(fid) for fid in req.file_ids]
        # Extract date/location from first photo before any compression
        meta = extract_photo_metadata(raw_images[0][0]) if raw_images else {}
        caption = generate_caption(
            raw_images,
            tone=req.tone,
            date_str=meta.get("date"),
            location_str=meta.get("location_name"),
        )
        return {"caption": caption, "location_name": meta.get("location_name") or ""}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
