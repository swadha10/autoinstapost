"""Routes for Google Photos albums and media."""

import time

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from auth import get_current_user, _get_secret
from db import get_credentials, get_user_by_id, upsert_credentials
from services.photos_service import (
    _get_access_token,
    create_picker_session,
    download_media,
    download_picker_thumbnail,
    get_picker_session,
    list_album_media,
    list_albums,
    list_picker_items,
)

router = APIRouter(prefix="/photos", tags=["photos"])


def _user_from_token_param(token: str) -> dict:
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


@router.get("/albums")
def get_albums(current_user: dict = Depends(get_current_user)):
    creds = get_credentials(current_user["id"])
    if not creds or not creds.get("google_photos_refresh_token"):
        raise HTTPException(status_code=400, detail="Google Photos not connected. Go to Setup and click 'Connect Google Photos'.")
    try:
        return {"albums": list_albums(creds)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/album/{album_id}/media")
def get_album_media(album_id: str, current_user: dict = Depends(get_current_user)):
    creds = get_credentials(current_user["id"])
    if not creds or not creds.get("google_photos_refresh_token"):
        raise HTTPException(status_code=400, detail="Google Photos not connected.")
    try:
        photos = list_album_media(album_id, creds)
        return {"photos": photos}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/picker/start")
def picker_start(current_user: dict = Depends(get_current_user)):
    """Create a Google Photos Picker session and return the pickerUri + session_id."""
    creds = get_credentials(current_user["id"])
    if not creds or not creds.get("google_photos_refresh_token"):
        raise HTTPException(status_code=400, detail="Google not connected. Go to Setup and click 'Connect Google'.")
    try:
        access_token = _get_access_token(creds)
        session = create_picker_session(access_token)
        session_id = session["id"]
        # Store session_id so /picker/items can retrieve it later
        upsert_credentials(current_user["id"], {"google_picker_session_id": session_id})
        return {"pickerUri": session["pickerUri"], "session_id": session_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/picker/items")
def picker_items(current_user: dict = Depends(get_current_user)):
    """Return photos from the user's active Picker session (polls until ready)."""
    creds = get_credentials(current_user["id"])
    session_id = (creds or {}).get("google_picker_session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="No active picker session. Pick photos first.")
    try:
        access_token = _get_access_token(creds)
        # Poll up to 30s for items to be ready
        media_items_set = False
        for _ in range(6):
            try:
                session = get_picker_session(session_id, access_token)
            except RuntimeError as poll_err:
                err_text = str(poll_err)
                if "NOT_FOUND" in err_text or "404" in err_text:
                    raise HTTPException(
                        status_code=400,
                        detail="Picker session expired or not found. Please open the Google Photos Picker again.",
                    )
                raise
            if session.get("mediaItemsSet"):
                media_items_set = True
                break
            time.sleep(5)

        if not media_items_set:
            raise HTTPException(
                status_code=400,
                detail="Photos not confirmed yet. Make sure you clicked 'Done' (or the checkmark) inside Google Photos, then try again.",
            )

        photos = list_picker_items(session_id, access_token)
        return {"photos": photos, "session_id": session_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/picker/media/{media_id}/raw")
def get_picker_media_raw(media_id: str, token: str | None = Query(default=None)):
    """Proxy a Google Photos Picker thumbnail. Auth via ?token= query param."""
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = _user_from_token_param(token)
    creds = get_credentials(user["id"])
    session_id = (creds or {}).get("google_picker_session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="No active picker session")
    try:
        data, mime_type = download_picker_thumbnail(media_id, session_id, creds)
        return Response(content=data, media_type=mime_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/media/{media_id}/raw")
def get_media_raw(media_id: str, token: str | None = Query(default=None)):
    """Serve a Google Photos media item. Auth via ?token= query param."""
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = _user_from_token_param(token)
    creds = get_credentials(user["id"])
    try:
        data, mime_type = download_media(media_id, creds)
        return Response(content=data, media_type=mime_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
