"""Instagram Graph API service — upload and publish photos."""

import os

import httpx

GRAPH_BASE = "https://graph.facebook.com/v21.0"


def _token() -> str:
    return os.environ["INSTAGRAM_ACCESS_TOKEN"]


def _account_id() -> str:
    return os.environ["INSTAGRAM_ACCOUNT_ID"]


def create_container(image_url: str, caption: str) -> str:
    """
    Step 1: Create an IG media container.
    Instagram will fetch the image from *image_url* (must be publicly reachable).
    Returns the container ID.
    """
    account_id = _account_id()
    resp = httpx.post(
        f"{GRAPH_BASE}/{account_id}/media",
        params={
            "image_url": image_url,
            "caption": caption,
            "access_token": _token(),
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    if "id" not in data:
        raise RuntimeError(f"Instagram container creation failed: {data}")
    return data["id"]


def publish_container(container_id: str) -> str:
    """
    Step 2: Publish the container.
    Returns the published media ID.
    """
    account_id = _account_id()
    resp = httpx.post(
        f"{GRAPH_BASE}/{account_id}/media_publish",
        params={
            "creation_id": container_id,
            "access_token": _token(),
        },
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    if "id" not in data:
        raise RuntimeError(f"Instagram publish failed: {data}")
    return data["id"]


def post_photo(image_url: str, caption: str) -> str:
    """Convenience: create container then publish. Returns published media ID."""
    container_id = create_container(image_url, caption)
    return publish_container(container_id)
