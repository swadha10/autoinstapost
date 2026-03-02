"""Auth endpoints — register, login, credentials, Instagram OAuth."""

import os

import bcrypt as _bcrypt
import httpx as _httpx

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from jose import JWTError
from pydantic import BaseModel, EmailStr

from auth import create_access_token, create_state_token, decode_state_token, get_current_user
from db import (
    create_user,
    get_credentials,
    get_user_by_email,
    has_credentials,
    upsert_credentials,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()


def _verify_password(password: str, hashed: str) -> bool:
    return _bcrypt.checkpw(password.encode(), hashed.encode())


# ── Request / response models ────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class CredentialsRequest(BaseModel):
    instagram_access_token: str | None = None
    instagram_account_id: str | None = None
    facebook_app_id: str | None = None
    facebook_app_secret: str | None = None
    gemini_api_key: str | None = None
    anthropic_api_key: str | None = None
    public_base_url: str | None = None
    google_service_account_json: str | None = None


# ── Helpers ──────────────────────────────────────────────────────────────────

def _mask(value: str | None) -> str | None:
    if not value:
        return None
    return value[:6] + "…" if len(value) > 6 else "***"


# ── Routes ───────────────────────────────────────────────────────────────────

@router.post("/register")
def register(req: RegisterRequest):
    if get_user_by_email(req.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    hashed = _hash_password(req.password)
    user = create_user(req.email, hashed)
    token = create_access_token(user["id"])
    return {"token": token, "setup_complete": False}


@router.post("/login")
def login(req: LoginRequest):
    user = get_user_by_email(req.email)
    if not user or not _verify_password(req.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    token = create_access_token(user["id"])
    setup_complete = has_credentials(user["id"])
    return {"token": token, "setup_complete": setup_complete}


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    return {
        "id": current_user["id"],
        "email": current_user["email"],
        "setup_complete": has_credentials(current_user["id"]),
    }


@router.put("/credentials")
def save_credentials(
    req: CredentialsRequest,
    current_user: dict = Depends(get_current_user),
):
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    upsert_credentials(current_user["id"], updates)
    return {"success": True}


@router.get("/instagram/connect")
def instagram_connect(current_user: dict = Depends(get_current_user)):
    """Return the Facebook OAuth URL for the user to redirect to."""
    app_id = os.environ.get("FACEBOOK_APP_ID", "")
    public_url = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
    if not app_id or not public_url:
        raise HTTPException(400, "FACEBOOK_APP_ID and PUBLIC_BASE_URL must be set in server .env")

    state = create_state_token(current_user["id"])
    redirect_uri = f"{public_url}/auth/instagram/callback"
    scope = "instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement"
    url = (
        f"https://www.facebook.com/dialog/oauth"
        f"?client_id={app_id}"
        f"&redirect_uri={redirect_uri}"
        f"&scope={scope}"
        f"&state={state}"
        f"&response_type=code"
    )
    return {"url": url}


@router.get("/instagram/callback")
def instagram_callback(code: str = None, state: str = None, error: str = None):
    """Facebook redirects here after the user approves permissions."""
    if error or not code or not state:
        return RedirectResponse(f"/app?ig_error={error or 'cancelled'}")

    try:
        user_id = decode_state_token(state)
    except (JWTError, Exception):
        return RedirectResponse("/app?ig_error=invalid_state")

    app_id = os.environ.get("FACEBOOK_APP_ID", "")
    app_secret = os.environ.get("FACEBOOK_APP_SECRET", "")
    public_url = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
    redirect_uri = f"{public_url}/auth/instagram/callback"

    # Exchange auth code → short-lived token
    r = _httpx.get("https://graph.facebook.com/oauth/access_token", params={
        "client_id": app_id, "client_secret": app_secret,
        "redirect_uri": redirect_uri, "code": code,
    })
    if not r.is_success:
        return RedirectResponse("/app?ig_error=token_exchange_failed")
    short_token = r.json()["access_token"]

    # Exchange → long-lived token (60 days)
    r2 = _httpx.get("https://graph.facebook.com/oauth/access_token", params={
        "grant_type": "fb_exchange_token",
        "client_id": app_id, "client_secret": app_secret,
        "fb_exchange_token": short_token,
    })
    if not r2.is_success:
        return RedirectResponse("/app?ig_error=longtoken_failed")
    long_token = r2.json()["access_token"]

    # Get user's Facebook Pages
    r3 = _httpx.get("https://graph.facebook.com/v21.0/me/accounts",
                    params={"access_token": long_token})
    pages = r3.json().get("data", [])

    # Find the Instagram Business Account linked to any Page
    ig_account_id = None
    for page in pages:
        r4 = _httpx.get(f"https://graph.facebook.com/v21.0/{page['id']}", params={
            "fields": "instagram_business_account",
            "access_token": page.get("access_token", long_token),
        })
        data = r4.json()
        if "instagram_business_account" in data:
            ig_account_id = data["instagram_business_account"]["id"]
            break

    updates = {"instagram_access_token": long_token}
    if ig_account_id:
        updates["instagram_account_id"] = ig_account_id

    upsert_credentials(user_id, updates)
    return RedirectResponse("/app?ig_connected=1")


@router.get("/google/connect")
def google_connect(current_user: dict = Depends(get_current_user)):
    """Return the Google OAuth URL for Photos access."""
    from urllib.parse import urlencode
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    public_url = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
    if not client_id or not public_url:
        raise HTTPException(400, "GOOGLE_CLIENT_ID and PUBLIC_BASE_URL must be set in server .env")

    state = create_state_token(current_user["id"])
    redirect_uri = f"{public_url}/auth/google/callback"
    params = urlencode({
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": "https://www.googleapis.com/auth/photospicker.mediaitems.readonly",
        "response_type": "code",
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    })
    return {"url": f"https://accounts.google.com/o/oauth2/v2/auth?{params}"}


@router.get("/google/callback")
def google_callback(code: str = None, state: str = None, error: str = None):
    """Google redirects here after the user approves Photos access."""
    if error or not code or not state:
        return RedirectResponse(f"/app?google_error={error or 'cancelled'}")

    try:
        user_id = decode_state_token(state)
    except (JWTError, Exception):
        return RedirectResponse("/app?google_error=invalid_state")

    client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "")
    public_url = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
    redirect_uri = f"{public_url}/auth/google/callback"

    r = _httpx.post("https://oauth2.googleapis.com/token", data={
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    })
    if not r.is_success:
        return RedirectResponse("/app?google_error=token_exchange_failed")

    data = r.json()
    refresh_token = data.get("refresh_token")
    if not refresh_token:
        return RedirectResponse("/app?google_error=no_refresh_token")

    upsert_credentials(user_id, {"google_photos_refresh_token": refresh_token})
    return RedirectResponse("/app?google_connected=1")


@router.get("/credentials")
def get_my_credentials(current_user: dict = Depends(get_current_user)):
    creds = get_credentials(current_user["id"]) or {}
    return {
        "instagram_account_id": creds.get("instagram_account_id"),
        "facebook_app_id": creds.get("facebook_app_id"),
        "public_base_url": creds.get("public_base_url"),
        "instagram_access_token": _mask(creds.get("instagram_access_token")),
        "facebook_app_secret": _mask(creds.get("facebook_app_secret")),
        "gemini_api_key": _mask(creds.get("gemini_api_key")),
        "anthropic_api_key": _mask(creds.get("anthropic_api_key")),
        "google_service_account_json": "saved" if creds.get("google_service_account_json") else None,
        "google_photos_connected": bool(creds.get("google_photos_refresh_token")),
        "setup_complete": has_credentials(current_user["id"]),
    }
