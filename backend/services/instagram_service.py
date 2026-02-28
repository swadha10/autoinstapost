"""Instagram Graph API service — upload and publish photos, with auto token refresh."""

import json
import logging
import os
import time
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.facebook.com/v21.0"
TOKEN_FILE = Path(__file__).parent.parent / "data" / "token.json"

# Refresh when fewer than 7 days remain on the 60-day long-lived token
REFRESH_THRESHOLD_DAYS = 7


# ---------------------------------------------------------------------------
# Token persistence
# ---------------------------------------------------------------------------

def _load_token_data() -> dict:
    """Return stored token data, or fall back to env var."""
    if TOKEN_FILE.exists():
        try:
            return json.loads(TOKEN_FILE.read_text())
        except Exception:
            pass
    return {
        "access_token": os.environ.get("INSTAGRAM_ACCESS_TOKEN", ""),
        "expires_at": 0,  # unknown — treat as expired
    }


def _save_token_data(access_token: str, expires_in_seconds: int) -> None:
    TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    data = {
        "access_token": access_token,
        "expires_at": int(time.time()) + expires_in_seconds,
    }
    TOKEN_FILE.write_text(json.dumps(data, indent=2))
    logger.info("Saved new Instagram token, expires in %d days.", expires_in_seconds // 86400)


# ---------------------------------------------------------------------------
# Token exchange / refresh
# ---------------------------------------------------------------------------

def exchange_for_long_lived_token(short_lived_token: str) -> str:
    """
    Exchange a short-lived user token for a long-lived one (~60 days).
    Requires FACEBOOK_APP_ID and FACEBOOK_APP_SECRET in env.
    Returns the new long-lived access token.
    """
    app_id = os.environ["FACEBOOK_APP_ID"]
    app_secret = os.environ["FACEBOOK_APP_SECRET"]

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
    expires_in = data.get("expires_in", 5_184_000)  # default 60 days
    if not token:
        raise RuntimeError(f"Token exchange returned no token: {data}")

    _save_token_data(token, expires_in)
    return token


def refresh_long_lived_token(current_token: str) -> str:
    """
    Refresh a long-lived token before it expires (can be done any time while still valid).
    Returns the refreshed token.
    """
    app_id = os.environ["FACEBOOK_APP_ID"]
    app_secret = os.environ["FACEBOOK_APP_SECRET"]

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

    _save_token_data(token, expires_in)
    return token


def get_valid_token() -> str:
    """
    Return a valid access token, refreshing automatically if it's within
    REFRESH_THRESHOLD_DAYS of expiry.
    """
    data = _load_token_data()
    token = data.get("access_token", "")
    expires_at = data.get("expires_at", 0)

    threshold = REFRESH_THRESHOLD_DAYS * 86400
    time_left = expires_at - time.time()

    if expires_at > 0 and time_left < threshold:
        logger.info(
            "Instagram token expires in %.1f days — refreshing now.", time_left / 86400
        )
        try:
            token = refresh_long_lived_token(token)
        except Exception as e:
            logger.warning("Token auto-refresh failed: %s — using existing token.", e)

    return token


def get_token_status() -> dict:
    """Return human-readable token status for the /instagram/token-status endpoint."""
    data = _load_token_data()
    expires_at = data.get("expires_at", 0)
    if expires_at == 0:
        return {"status": "unknown", "expires_at": None, "days_left": None}
    days_left = (expires_at - time.time()) / 86400
    return {
        "status": "ok" if days_left > 0 else "expired",
        "expires_at": expires_at,
        "days_left": round(days_left, 1),
    }


# ---------------------------------------------------------------------------
# Account helper
# ---------------------------------------------------------------------------

def _account_id() -> str:
    return os.environ["INSTAGRAM_ACCOUNT_ID"]


# ---------------------------------------------------------------------------
# Core posting functions
# ---------------------------------------------------------------------------

def create_container(image_url: str, caption: str) -> str:
    account_id = _account_id()
    resp = httpx.post(
        f"{GRAPH_BASE}/{account_id}/media",
        params={
            "image_url": image_url,
            "caption": caption,
            "access_token": get_valid_token(),
        },
        timeout=30,
    )
    if not resp.is_success:
        raise RuntimeError(f"Instagram container creation failed ({resp.status_code}): {resp.text}")
    data = resp.json()
    if "id" not in data:
        raise RuntimeError(f"Instagram container creation failed: {data}")
    return data["id"]


def wait_for_container(container_id: str, max_wait: int = 60, poll_interval: int = 5) -> None:
    """Poll container status until FINISHED, raise if ERROR or timeout."""
    token = get_valid_token()
    waited = 0
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


def publish_container(container_id: str) -> str:
    account_id = _account_id()
    resp = httpx.post(
        f"{GRAPH_BASE}/{account_id}/media_publish",
        params={
            "creation_id": container_id,
            "access_token": get_valid_token(),
        },
        timeout=30,
    )
    if not resp.is_success:
        raise RuntimeError(f"Instagram publish failed ({resp.status_code}): {resp.text}")
    data = resp.json()
    if "id" not in data:
        raise RuntimeError(f"Instagram publish failed: {data}")
    return data["id"]


def post_photo(image_url: str, caption: str) -> str:
    """Convenience: create container, wait until ready, then publish. Returns published media ID."""
    container_id = create_container(image_url, caption)
    wait_for_container(container_id)
    return publish_container(container_id)


def create_carousel_item_container(image_url: str) -> str:
    """Create a media container for a single carousel slide (not published on its own)."""
    account_id = _account_id()
    resp = httpx.post(
        f"{GRAPH_BASE}/{account_id}/media",
        params={
            "image_url": image_url,
            "is_carousel_item": "true",
            "access_token": get_valid_token(),
        },
        timeout=30,
    )
    if not resp.is_success:
        raise RuntimeError(f"Carousel item creation failed ({resp.status_code}): {resp.text}")
    data = resp.json()
    if "id" not in data:
        raise RuntimeError(f"Carousel item creation failed: {data}")
    return data["id"]


def create_carousel_container(item_ids: list[str], caption: str) -> str:
    """Create the carousel wrapper container from individual item container IDs."""
    account_id = _account_id()
    resp = httpx.post(
        f"{GRAPH_BASE}/{account_id}/media",
        params={
            "media_type": "CAROUSEL",
            "caption": caption,
            "children": ",".join(item_ids),
            "access_token": get_valid_token(),
        },
        timeout=30,
    )
    if not resp.is_success:
        raise RuntimeError(f"Carousel container creation failed ({resp.status_code}): {resp.text}")
    data = resp.json()
    if "id" not in data:
        raise RuntimeError(f"Carousel container creation failed: {data}")
    return data["id"]


def post_carousel(image_urls: list[str], caption: str) -> str:
    """
    Post multiple images as an Instagram carousel.
    Returns the published media ID.
    """
    if len(image_urls) < 2 or len(image_urls) > 10:
        raise ValueError(f"Carousel requires 2–10 images, got {len(image_urls)}")

    # Step 1: create + wait for each item container
    item_ids = []
    for url in image_urls:
        item_id = create_carousel_item_container(url)
        wait_for_container(item_id)
        item_ids.append(item_id)

    # Step 2: create carousel container, wait, then publish
    carousel_id = create_carousel_container(item_ids, caption)
    wait_for_container(carousel_id)
    return publish_container(carousel_id)
