"""Routes for generating captions via Claude."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.claude_service import generate_caption
from services.drive_service import download_photo

router = APIRouter(prefix="/caption", tags=["caption"])


class CaptionRequest(BaseModel):
    file_id: str
    tone: str = "engaging"


@router.post("/generate")
def generate(req: CaptionRequest):
    """Download image from Drive then ask Claude for a caption."""
    try:
        image_bytes, mime_type = download_photo(req.file_id)
        caption = generate_caption(image_bytes, mime_type, tone=req.tone)
        return {"caption": caption}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
