"""Google Photos Library API — list albums, list media, download photos."""

import os

import httpx

PHOTOS_API = "https://photoslibrary.googleapis.com/v1"
PICKER_API = "https://photospicker.googleapis.com/v1"


def _get_access_token(creds: dict) -> str:
    """Exchange stored refresh token for a fresh access token."""
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "")
    refresh_token = (creds or {}).get("google_photos_refresh_token", "")

    if not refresh_token:
        raise ValueError("Google Photos not connected. Go to Settings and click 'Connect Google Photos'.")
    if not client_id or not client_secret:
        raise ValueError("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in server .env")

    resp = httpx.post(
        "https://oauth2.googleapis.com/token",
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=15,
    )
    if not resp.is_success:
        raise RuntimeError(f"Google token refresh failed: {resp.text}")
    return resp.json()["access_token"]


def list_albums(creds: dict) -> list[dict]:
    """Return user's Google Photos albums."""
    token = _get_access_token(creds)
    albums = []
    page_token = None

    while True:
        params = {"pageSize": 50}
        if page_token:
            params["pageToken"] = page_token
        resp = httpx.get(
            f"{PHOTOS_API}/albums",
            headers={"Authorization": f"Bearer {token}"},
            params=params,
            timeout=20,
        )
        if not resp.is_success:
            raise RuntimeError(f"Failed to list Google Photos albums: {resp.text}")
        data = resp.json()
        for a in data.get("albums", []):
            cover = a.get("coverPhotoBaseUrl", "")
            albums.append({
                "id": a["id"],
                "title": a.get("title", "Untitled"),
                "count": a.get("mediaItemsCount", "?"),
                "coverUrl": f"{cover}=w200-h200-c" if cover else None,
            })
        page_token = data.get("nextPageToken")
        if not page_token:
            break

    return albums


def list_album_media(album_id: str, creds: dict) -> list[dict]:
    """Return image media items in an album."""
    token = _get_access_token(creds)
    items = []
    page_token = None

    while True:
        body = {"albumId": album_id, "pageSize": 100}
        if page_token:
            body["pageToken"] = page_token
        resp = httpx.post(
            f"{PHOTOS_API}/mediaItems:search",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json=body,
            timeout=20,
        )
        if not resp.is_success:
            raise RuntimeError(f"Failed to list album media: {resp.text}")
        data = resp.json()
        for item in data.get("mediaItems", []):
            mime = item.get("mimeType", "")
            if not mime.startswith("image/"):
                continue
            base = item.get("baseUrl", "")
            items.append({
                "id": item["id"],
                "name": item.get("filename", item["id"]),
                "mimeType": mime,
                "thumbnailUrl": f"{base}=w400-h400-c" if base else None,
                "source": "gphotos",
            })
        page_token = data.get("nextPageToken")
        if not page_token:
            break

    return items


# ── Google Photos Picker API ──────────────────────────────────────────────────


def create_picker_session(access_token: str) -> dict:
    """Create a Picker session and return {id, pickerUri, ...}."""
    resp = httpx.post(
        f"{PICKER_API}/sessions",
        headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
        json={},
        timeout=15,
    )
    if not resp.is_success:
        raise RuntimeError(f"Failed to create picker session: {resp.text}")
    return resp.json()


def get_picker_session(session_id: str, access_token: str) -> dict:
    """Return the session status dict (check mediaItemsSet field)."""
    resp = httpx.get(
        f"{PICKER_API}/sessions/{session_id}",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=15,
    )
    if not resp.is_success:
        raise RuntimeError(f"Failed to get picker session: {resp.text}")
    return resp.json()


def list_picker_items(session_id: str, access_token: str) -> list[dict]:
    """Return all image items selected in the picker session."""
    items = []
    page_token = None
    while True:
        params = {"sessionId": session_id, "pageSize": 100}
        if page_token:
            params["pageToken"] = page_token
        resp = httpx.get(
            f"{PICKER_API}/mediaItems",
            headers={"Authorization": f"Bearer {access_token}"},
            params=params,
            timeout=20,
        )
        if not resp.is_success:
            raise RuntimeError(f"Failed to list picker items: {resp.text}")
        data = resp.json()
        for item in data.get("mediaItems", []):
            mf = item.get("mediaFile", {})
            mime = mf.get("mimeType", "")
            if not mime.startswith("image/"):
                continue
            items.append({
                "id": item["id"],
                "name": mf.get("filename", item["id"]),  # filename lives inside mediaFile
                "mimeType": mime,
                "source": "gphotos_picker",
                # No thumbnailUrl — baseUrl requires auth; frontend uses proxy endpoint
            })
        page_token = data.get("nextPageToken")
        if not page_token:
            break
    return items


def _get_picker_base_url(media_id: str, session_id: str, access_token: str) -> tuple[str, str]:
    """Return (baseUrl, mimeType) for a specific picker media item (re-fetches fresh URLs)."""
    resp = httpx.get(
        f"{PICKER_API}/mediaItems",
        headers={"Authorization": f"Bearer {access_token}"},
        params={"sessionId": session_id, "pageSize": 100},
        timeout=20,
    )
    if not resp.is_success:
        raise RuntimeError(f"Picker session expired or not found: {resp.text}")
    for item in resp.json().get("mediaItems", []):
        if item["id"] == media_id:
            mf = item.get("mediaFile", {})
            base_url = mf.get("baseUrl", "")
            mime = mf.get("mimeType", "image/jpeg")
            if not base_url:
                raise RuntimeError("No baseUrl for media item")
            return base_url, mime
    raise RuntimeError(f"Media item {media_id} not found in picker session.")


def download_picker_thumbnail(media_id: str, session_id: str, creds: dict) -> tuple[bytes, str]:
    """Fetch a 400×400 thumbnail of a picker photo (proxied with auth)."""
    access_token = _get_access_token(creds)
    base_url, mime = _get_picker_base_url(media_id, session_id, access_token)
    auth_headers = {"Authorization": f"Bearer {access_token}"}
    dl = httpx.get(f"{base_url}=w400-h400-c", headers=auth_headers, timeout=30, follow_redirects=True)
    if not dl.is_success:
        raise RuntimeError(f"Failed to download picker thumbnail: {dl.status_code}")
    return dl.content, mime


def download_picker_photo(media_id: str, session_id: str, creds: dict) -> tuple[bytes, str]:
    """Download full-resolution picker photo."""
    access_token = _get_access_token(creds)
    base_url, mime = _get_picker_base_url(media_id, session_id, access_token)
    auth_headers = {"Authorization": f"Bearer {access_token}"}
    dl = httpx.get(f"{base_url}=d", headers=auth_headers, timeout=120, follow_redirects=True)
    if not dl.is_success:
        raise RuntimeError(f"Failed to download picker photo: {dl.status_code}")
    return dl.content, mime


# ── Google Photos Library API (deprecated — kept for reference) ───────────────


def download_media(media_id: str, creds: dict) -> tuple[bytes, str]:
    """Download a Google Photos media item at full resolution."""
    token = _get_access_token(creds)

    # Fetch media item to get fresh (60-min) baseUrl
    resp = httpx.get(
        f"{PHOTOS_API}/mediaItems/{media_id}",
        headers={"Authorization": f"Bearer {token}"},
        timeout=15,
    )
    if not resp.is_success:
        raise RuntimeError(f"Failed to fetch Google Photos media item: {resp.text}")

    item = resp.json()
    base_url = item.get("baseUrl", "")
    mime_type = item.get("mimeType", "image/jpeg")

    if not base_url:
        raise RuntimeError("Google Photos returned no baseUrl for media item")

    # =d downloads the original; =w4096-h4096 downloads at max size (preferred)
    dl = httpx.get(f"{base_url}=d", timeout=120, follow_redirects=True)
    if not dl.is_success:
        raise RuntimeError(f"Failed to download Google Photos image: {dl.status_code}")

    return dl.content, mime_type
