"""Routes for browsing Google Drive photos."""

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from services.drive_service import download_photo, list_photos

router = APIRouter(prefix="/drive", tags=["drive"])


@router.get("/photos")
def get_photos(folder_id: str):
    """List all images in the given Google Drive folder."""
    try:
        photos = list_photos(folder_id)
        return {"photos": photos}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/photo/{file_id}/raw")
def get_photo_raw(file_id: str):
    """Download and serve a Drive photo as raw image bytes (used for the caption preview)."""
    try:
        data, mime_type = download_photo(file_id)
        return Response(content=data, media_type=mime_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
