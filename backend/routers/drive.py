"""Routes for browsing Google Drive photos."""

import json

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel

from auth import get_current_user, _get_secret
from db import get_credentials, get_user_by_id, upsert_credentials
from services.drive_service import download_photo, get_folder_info, list_photos

router = APIRouter(prefix="/drive", tags=["drive"])


def _user_from_token_param(token: str) -> dict:
    """Validate a JWT passed as a query parameter (for <img src> URLs)."""
    from jose import JWTError, jwt
    try:
        payload = jwt.decode(token, _get_secret(), algorithms=["HS256"])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")
    user = get_user_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def _drive_error(e: Exception, creds: dict | None) -> HTTPException:
    """Convert a Drive API exception into a human-readable HTTPException."""
    msg = str(e)
    if "notFound" in msg or "404" in msg:
        sa_email = _service_account_email(creds)
        hint = (
            f" Share the folder with {sa_email} (Viewer) in Google Drive and try again."
            if sa_email else
            " Make sure the folder is shared with your service account (Viewer) and try again."
        )
        return HTTPException(status_code=404, detail="Folder not found or not shared with your service account." + hint)
    return HTTPException(status_code=500, detail=msg)


def _service_account_email(creds: dict | None) -> str | None:
    """Extract client_email from the stored service account JSON, if available."""
    import json as _json
    try:
        raw = (creds or {}).get("google_service_account_json", "")
        if raw:
            return _json.loads(raw).get("client_email")
    except Exception:
        pass
    return None


@router.get("/folder/{folder_id}")
def get_folder(folder_id: str, current_user: dict = Depends(get_current_user)):
    creds = get_credentials(current_user["id"])
    try:
        return get_folder_info(folder_id, creds=creds)
    except Exception as e:
        raise _drive_error(e, creds)


@router.get("/photos")
def get_photos(folder_id: str, current_user: dict = Depends(get_current_user)):
    creds = get_credentials(current_user["id"])
    try:
        photos = list_photos(folder_id, creds=creds)
        return {"photos": photos}
    except Exception as e:
        raise _drive_error(e, creds)


class SavedFolder(BaseModel):
    id: str
    name: str


@router.get("/saved-folders")
def get_saved_folders(current_user: dict = Depends(get_current_user)):
    creds = get_credentials(current_user["id"])
    raw = (creds or {}).get("saved_drive_folders") or "[]"
    try:
        return json.loads(raw)
    except Exception:
        return []


@router.put("/saved-folders")
def put_saved_folders(folders: list[SavedFolder], current_user: dict = Depends(get_current_user)):
    upsert_credentials(current_user["id"], {"saved_drive_folders": json.dumps([f.model_dump() for f in folders])})
    return {"ok": True}


@router.get("/photo/{file_id}/raw")
def get_photo_raw(file_id: str, token: str | None = Query(default=None)):
    """Serve a Drive photo. Auth via ?token= query param (needed for <img> tags)."""
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = _user_from_token_param(token)
    creds = get_credentials(user["id"])
    try:
        data, mime_type = download_photo(file_id, creds=creds)
        return Response(content=data, media_type=mime_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
