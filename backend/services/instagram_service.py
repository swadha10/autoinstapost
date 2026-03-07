"""Instagram Graph API service — upload and publish photos, with auto token refresh."""

import json
import logging
import os
import time
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.facebook.com/v21.0"

# Refresh when fewer than 7 days remain on the 60-day long-lived token
REFRESH_THRESHOLD_DAYS = 7

# Meta error codes that indicate a transient server-side problem (safe to retry)
_TRANSIENT_META_CODES = {1, 2, 4, 17, 341}
# Max attempts and backoff delays (seconds) for transient Graph API errors
_RETRY_DELAYS = [5, 15, 30]


def _is_transient_error(resp: httpx.Response) -> bool:
    """Return True if the Meta API response signals a transient error worth retrying."""
    try:
        err = resp.json().get("error", {})
        return bool(err.get("is_transient")) or err.get("code") in _TRANSIENT_META_CODES
    except Exception:
        return resp.status_code >= 500


# ---------------------------------------------------------------------------
# Token helpers — read from creds dict (DB) or env var fallback
# ---------------------------------------------------------------------------

def _get_token_data(creds: dict | None) -> dict:
    """Return {access_token, expires_at} from creds dict or legacy file/env."""
    if creds is not None:
        # Per-user mode: only use their own credentials, never fall back to env
        token = creds.get("instagram_access_token") or ""
        expires_at = creds.get("instagram_token_expires_at") or 0
        return {"access_token": token, "expires_at": expires_at}

    # Legacy: read from token.json file
    token_file = Path(__file__).parent.parent / "data" / "token.json"
    if token_file.exists():
        try:
            return json.loads(token_file.read_text())
        except Exception:
            pass
    return {
        "access_token": os.environ.get("INSTAGRAM_ACCESS_TOKEN", ""),
        "expires_at": 0,
    }


def _save_token_data(
    access_token: str,
    expires_in_seconds: int,
    user_id: int | None = None,
) -> None:
    """Persist a refreshed token to the DB (if user_id provided) or legacy file."""
    expires_at = int(time.time()) + expires_in_seconds
    if user_id is not None:
        from db import upsert_credentials
        upsert_credentials(user_id, {
            "instagram_access_token": access_token,
            "instagram_token_expires_at": expires_at,
        })
    else:
        # Legacy single-user: write to token.json
        token_file = Path(__file__).parent.parent / "data" / "token.json"
        token_file.parent.mkdir(parents=True, exist_ok=True)
        data = {"access_token": access_token, "expires_at": expires_at}
        token_file.write_text(json.dumps(data, indent=2))
    logger.info("Saved new Instagram token, expires in %d days.", expires_in_seconds // 86400)


def _get_app_credentials(creds: dict | None) -> tuple[str, str]:
    """Return (app_id, app_secret) — always from server env (platform-level credentials)."""
    app_id = os.environ.get("FACEBOOK_APP_ID", "")
    app_secret = os.environ.get("FACEBOOK_APP_SECRET", "")
    if not app_id or not app_secret:
        raise ValueError("FACEBOOK_APP_ID and FACEBOOK_APP_SECRET must be set in server .env")
    return app_id, app_secret


def _account_id(creds: dict | None = None) -> str:
    if creds is not None:
        acct = creds.get("instagram_account_id", "")
        if not acct:
            raise ValueError("Instagram Account ID not configured. Go to Setup → connect Instagram.")
        return acct
    return os.environ["INSTAGRAM_ACCOUNT_ID"]


# ---------------------------------------------------------------------------
# Token exchange / refresh
# ---------------------------------------------------------------------------

def exchange_for_long_lived_token(
    short_lived_token: str,
    creds: dict | None = None,
    user_id: int | None = None,
) -> str:
    app_id, app_secret = _get_app_credentials(creds)
    resp = httpx.get(
        "https://graph.facebook.com/oauth/access_token",
        params={
            "grant_type": "fb_exchange_token",
            "client_id": app_id,
            "client_secret": app_secret,
            "fb_exchange_token": short_lived_token,
        },
        timeout=30,
    )
    if not resp.is_success:
        raise RuntimeError(f"Token exchange failed ({resp.status_code}): {resp.text}")

    data = resp.json()
    token = data.get("access_token")
    expires_in = data.get("expires_in", 5_184_000)
    if not token:
        raise RuntimeError(f"Token exchange returned no token: {data}")

    _save_token_data(token, expires_in, user_id=user_id)
    return token


def refresh_long_lived_token(
    current_token: str,
    creds: dict | None = None,
    user_id: int | None = None,
) -> str:
    app_id, app_secret = _get_app_credentials(creds)
    resp = httpx.get(
        "https://graph.facebook.com/oauth/access_token",
        params={
            "grant_type": "fb_exchange_token",
            "client_id": app_id,
            "client_secret": app_secret,
            "fb_exchange_token": current_token,
        },
        timeout=30,
    )
    if not resp.is_success:
        raise RuntimeError(f"Token refresh failed ({resp.status_code}): {resp.text}")

    data = resp.json()
    token = data.get("access_token")
    expires_in = data.get("expires_in", 5_184_000)
    if not token:
        raise RuntimeError(f"Token refresh returned no token: {data}")

    _save_token_data(token, expires_in, user_id=user_id)
    return token


def get_valid_token(creds: dict | None = None, user_id: int | None = None) -> str:
    """Return a valid access token, refreshing automatically when near expiry."""
    data = _get_token_data(creds)
    token = data.get("access_token", "")
    expires_at = data.get("expires_at", 0)

    threshold = REFRESH_THRESHOLD_DAYS * 86400
    time_left = expires_at - time.time()

    needs_refresh = (expires_at == 0) or (expires_at > 0 and time_left < threshold)

    if needs_refresh:
        reason = "expiry unknown (bootstrapping)" if expires_at == 0 else f"expires in {time_left / 86400:.1f} days"
        logger.info("Instagram token — %s — refreshing now.", reason)
        try:
            token = refresh_long_lived_token(token, creds=creds, user_id=user_id)
        except Exception as e:
            logger.warning("Token auto-refresh failed: %s — using existing token.", e)

    return token


def get_account_info(creds: dict | None = None) -> dict:
    """Fetch the Instagram account username and profile picture from the Graph API."""
    try:
        account_id = _account_id(creds)
    except ValueError:
        return {"username": "", "name": "", "profile_picture_url": "", "not_configured": True}
    token = get_valid_token(creds=creds)
    if not token:
        return {"username": "", "name": "", "profile_picture_url": "", "not_configured": True}
    try:
        resp = httpx.get(
            f"{GRAPH_BASE}/{account_id}",
            params={"fields": "username,name,profile_picture_url", "access_token": token},
            timeout=10,
        )
        if resp.is_success:
            data = resp.json()
            return {
                "username": data.get("username", ""),
                "name": data.get("name", ""),
                "profile_picture_url": data.get("profile_picture_url", ""),
            }
    except Exception as e:
        logger.warning("Failed to fetch Instagram account info: %s", e)
    return {"username": "", "name": "", "profile_picture_url": ""}


def get_token_status(creds: dict | None = None) -> dict:
    """Return human-readable token status."""
    data = _get_token_data(creds)
    expires_at = data.get("expires_at", 0)
    if expires_at == 0:
        return {"valid": True, "status": "unknown", "expires_at": None, "days_left": None}
    days_left = (expires_at - time.time()) / 86400
    return {
        "valid": days_left > 0,
        "status": "ok" if days_left > 0 else "expired",
        "expires_at": expires_at,
        "days_left": round(days_left, 1),
    }


# ---------------------------------------------------------------------------
# Core posting functions
# ---------------------------------------------------------------------------

def search_instagram_location(lat: float, lng: float, creds: dict | None = None, user_id: int | None = None):
    try:
        resp = httpx.get(
            f"{GRAPH_BASE}/search",
            params={
                "type": "place",
                "center": f"{lat},{lng}",
                "distance": 1000,
                "fields": "id,name",
                "limit": 1,
                "access_token": get_valid_token(creds=creds, user_id=user_id),
            },
            timeout=15,
        )
        if resp.is_success:
            data = resp.json().get("data", [])
            if data:
                logger.info("Found Instagram place: %s (id=%s)", data[0]["name"], data[0]["id"])
                return data[0]["id"]
    except Exception as e:
        logger.warning("Instagram location search failed: %s", e)
    return None


def create_container(
    image_url: str,
    caption: str,
    location_id=None,
    creds: dict | None = None,
    user_id: int | None = None,
) -> str:
    acct_id = _account_id(creds)
    params = {
        "image_url": image_url,
        "caption": caption,
        "access_token": get_valid_token(creds=creds, user_id=user_id),
    }
    if location_id:
        params["location_id"] = location_id
    last_error: Exception | None = None
    for attempt, delay in enumerate([0] + _RETRY_DELAYS):
        if delay:
            logger.warning("Container creation transient error — retrying in %ds (attempt %d)…", delay, attempt)
            time.sleep(delay)
        resp = httpx.post(f"{GRAPH_BASE}/{acct_id}/media", params=params, timeout=30)
        if resp.is_success:
            data = resp.json()
            if "id" not in data:
                raise RuntimeError(f"Instagram container creation failed: {data}")
            return data["id"]
        if _is_transient_error(resp):
            last_error = RuntimeError(f"Instagram container creation failed ({resp.status_code}): {resp.text}")
            continue
        raise RuntimeError(f"Instagram container creation failed ({resp.status_code}): {resp.text}")
    raise last_error  # type: ignore[misc]


def wait_for_container(
    container_id: str,
    max_wait: int = 60,
    poll_interval: int = 5,
    creds: dict | None = None,
    user_id: int | None = None,
) -> None:
    token = get_valid_token(creds=creds, user_id=user_id)
    waited = 0
    status = ""
    while waited < max_wait:
        resp = httpx.get(
            f"{GRAPH_BASE}/{container_id}",
            params={"fields": "status_code", "access_token": token},
            timeout=15,
        )
        if not resp.is_success:
            raise RuntimeError(f"Container status check failed: {resp.text}")
        status = resp.json().get("status_code", "")
        logger.info("Container %s status: %s", container_id, status)
        if status == "FINISHED":
            return
        if status == "ERROR":
            raise RuntimeError(f"Instagram container processing failed (status=ERROR) for {container_id}")
        time.sleep(poll_interval)
        waited += poll_interval
    raise RuntimeError(f"Container {container_id} not ready after {max_wait}s (last status: {status})")


def publish_container(
    container_id: str,
    creds: dict | None = None,
    user_id: int | None = None,
) -> str:
    acct_id = _account_id(creds)
    last_error: Exception | None = None
    for attempt, delay in enumerate([0] + _RETRY_DELAYS):
        if delay:
            logger.warning("Publish transient error — retrying in %ds (attempt %d)…", delay, attempt)
            time.sleep(delay)
        resp = httpx.post(
            f"{GRAPH_BASE}/{acct_id}/media_publish",
            params={
                "creation_id": container_id,
                "access_token": get_valid_token(creds=creds, user_id=user_id),
            },
            timeout=30,
        )
        if resp.is_success:
            data = resp.json()
            if "id" not in data:
                raise RuntimeError(f"Instagram publish failed: {data}")
            return data["id"]
        if _is_transient_error(resp):
            last_error = RuntimeError(f"Instagram publish failed ({resp.status_code}): {resp.text}")
            continue
        raise RuntimeError(f"Instagram publish failed ({resp.status_code}): {resp.text}")
    raise last_error  # type: ignore[misc]


def post_photo(
    image_url: str,
    caption: str,
    location_id=None,
    creds: dict | None = None,
    user_id: int | None = None,
) -> str:
    container_id = create_container(image_url, caption, location_id, creds=creds, user_id=user_id)
    wait_for_container(container_id, creds=creds, user_id=user_id)
    return publish_container(container_id, creds=creds, user_id=user_id)


def create_carousel_item_container(
    image_url: str,
    creds: dict | None = None,
    user_id: int | None = None,
) -> str:
    acct_id = _account_id(creds)
    last_error: Exception | None = None
    for attempt, delay in enumerate([0] + _RETRY_DELAYS):
        if delay:
            logger.warning("Carousel item creation transient error — retrying in %ds (attempt %d)…", delay, attempt)
            time.sleep(delay)
        resp = httpx.post(
            f"{GRAPH_BASE}/{acct_id}/media",
            params={
                "image_url": image_url,
                "is_carousel_item": "true",
                "access_token": get_valid_token(creds=creds, user_id=user_id),
            },
            timeout=30,
        )
        if resp.is_success:
            data = resp.json()
            if "id" not in data:
                raise RuntimeError(f"Carousel item creation failed: {data}")
            return data["id"]
        if _is_transient_error(resp):
            last_error = RuntimeError(f"Carousel item creation failed ({resp.status_code}): {resp.text}")
            continue
        raise RuntimeError(f"Carousel item creation failed ({resp.status_code}): {resp.text}")
    raise last_error  # type: ignore[misc]


def create_carousel_container(
    item_ids: list[str],
    caption: str,
    location_id=None,
    creds: dict | None = None,
    user_id: int | None = None,
) -> str:
    acct_id = _account_id(creds)
    params = {
        "media_type": "CAROUSEL",
        "caption": caption,
        "children": ",".join(item_ids),
        "access_token": get_valid_token(creds=creds, user_id=user_id),
    }
    if location_id:
        params["location_id"] = location_id
    last_error: Exception | None = None
    for attempt, delay in enumerate([0] + _RETRY_DELAYS):
        if delay:
            logger.warning("Carousel container creation transient error — retrying in %ds (attempt %d)…", delay, attempt)
            time.sleep(delay)
        resp = httpx.post(f"{GRAPH_BASE}/{acct_id}/media", params=params, timeout=30)
        if resp.is_success:
            data = resp.json()
            if "id" not in data:
                raise RuntimeError(f"Carousel container creation failed: {data}")
            return data["id"]
        if _is_transient_error(resp):
            last_error = RuntimeError(f"Carousel container creation failed ({resp.status_code}): {resp.text}")
            continue
        raise RuntimeError(f"Carousel container creation failed ({resp.status_code}): {resp.text}")
    raise last_error  # type: ignore[misc]


def post_story(
    image_url: str,
    creds: dict | None = None,
    user_id: int | None = None,
) -> str:
    """Post a single image as an Instagram Story."""
    acct_id = _account_id(creds)
    last_error: Exception | None = None
    for attempt, delay in enumerate([0] + _RETRY_DELAYS):
        if delay:
            logger.warning("Story creation transient error — retrying in %ds (attempt %d)…", delay, attempt)
            time.sleep(delay)
        resp = httpx.post(
            f"{GRAPH_BASE}/{acct_id}/media",
            params={
                "image_url": image_url,
                "media_type": "STORIES",
                "access_token": get_valid_token(creds=creds, user_id=user_id),
            },
            timeout=30,
        )
        if resp.is_success:
            data = resp.json()
            if "id" not in data:
                raise RuntimeError(f"Story container creation failed: {data}")
            container_id = data["id"]
            wait_for_container(container_id, creds=creds, user_id=user_id)
            return publish_container(container_id, creds=creds, user_id=user_id)
        if _is_transient_error(resp):
            last_error = RuntimeError(f"Story creation failed ({resp.status_code}): {resp.text}")
            continue
        raise RuntimeError(f"Story creation failed ({resp.status_code}): {resp.text}")
    raise last_error  # type: ignore[misc]


def post_carousel(
    image_urls: list[str],
    caption: str,
    location_id=None,
    creds: dict | None = None,
    user_id: int | None = None,
) -> str:
    if len(image_urls) < 2 or len(image_urls) > 4:
        raise ValueError(f"Carousel requires 2–4 images, got {len(image_urls)}")

    item_ids = []
    for url in image_urls:
        item_id = create_carousel_item_container(url, creds=creds, user_id=user_id)
        wait_for_container(item_id, creds=creds, user_id=user_id)
        item_ids.append(item_id)

    carousel_id = create_carousel_container(item_ids, caption, location_id, creds=creds, user_id=user_id)
    wait_for_container(carousel_id, creds=creds, user_id=user_id)
    return publish_container(carousel_id, creds=creds, user_id=user_id)
