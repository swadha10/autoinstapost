"""Routes for generating captions via Claude."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.claude_service import generate_caption
from services.drive_service import download_photo

router = APIRouter(prefix="/caption", tags=["caption"])


class CaptionRequest(BaseModel):
    file_ids: list[str]
    tone: str = "engaging"


@router.post("/generate")
def generate(req: CaptionRequest):
    """Download one or more images from Drive then ask Claude for a caption."""
    try:
        images = [download_photo(fid) for fid in req.file_ids]
        caption = generate_caption(images, tone=req.tone)
        return {"caption": caption}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
