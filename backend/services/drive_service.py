"""Google Drive service — lists images in a folder and downloads them."""

import io
import json
import os
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

SCOPES = ["https://www.googleapis.com/auth/drive.readonly"]
IMAGE_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/heic",
}


def _get_credentials():
    # Prefer inline JSON (useful for cloud env vars)
    raw_json = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
    if raw_json:
        info = json.loads(raw_json)
        return service_account.Credentials.from_service_account_info(info, scopes=SCOPES)

    key_file = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", "service_account.json")
    return service_account.Credentials.from_service_account_file(key_file, scopes=SCOPES)


def _build_service():
    creds = _get_credentials()
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def get_folder_info(folder_id: str) -> dict:
    """Return id and name for a Drive folder."""
    service = _build_service()
    meta = service.files().get(fileId=folder_id, fields="id,name").execute()
    return {"id": meta["id"], "name": meta["name"]}


def list_photos(folder_id: str) -> list[dict]:
    """Return metadata for all image files inside *folder_id*."""
    service = _build_service()
    query = (
        f"'{folder_id}' in parents"
        " and mimeType != 'application/vnd.google-apps.folder'"
        " and trashed = false"
    )
    results = (
        service.files()
        .list(
            q=query,
            fields="files(id, name, mimeType, thumbnailLink, webContentLink, createdTime)",
            orderBy="createdTime desc",
            pageSize=50,
        )
        .execute()
    )
    files = results.get("files", [])
    # Filter to image types only
    return [f for f in files if f.get("mimeType") in IMAGE_MIME_TYPES]


def download_photo(file_id: str) -> tuple[bytes, str]:
    """Download a file by ID and return (bytes, mime_type)."""
    service = _build_service()
    meta = service.files().get(fileId=file_id, fields="mimeType,name").execute()
    mime_type = meta.get("mimeType", "image/jpeg")

    request = service.files().get_media(fileId=file_id)
    buffer = io.BytesIO()
    downloader = MediaIoBaseDownload(buffer, request)
    done = False
    while not done:
        _, done = downloader.next_chunk()
    return buffer.getvalue(), mime_type


def download_photo_header(file_id: str, size: int = 131072) -> bytes:
    """
    Download only the first *size* bytes of a photo (default 128 KB).
    JPEG EXIF data sits within the first ~64 KB, so this is sufficient for
    location/date extraction without pulling the full 15–20 MB raw file.
    """
    service = _build_service()
    request = service.files().get_media(fileId=file_id)
    buffer = io.BytesIO()
    downloader = MediaIoBaseDownload(buffer, request, chunksize=size)
    downloader.next_chunk()   # one chunk = first `size` bytes, then stop
    return buffer.getvalue()
