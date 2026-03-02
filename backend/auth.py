"""JWT authentication helpers and FastAPI Depends."""

import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from jose import JWTError, jwt

from db import get_user_by_id

_SECRET_FILE = Path(__file__).parent / "data" / "jwt_secret.txt"
_ALGORITHM = "HS256"
_EXPIRY_DAYS = 30

_bearer = HTTPBearer(auto_error=False)


def _get_secret() -> str:
    secret = os.environ.get("JWT_SECRET", "").strip()
    if secret:
        return secret

    if _SECRET_FILE.exists():
        return _SECRET_FILE.read_text().strip()

    import secrets
    secret = secrets.token_hex(32)
    _SECRET_FILE.parent.mkdir(parents=True, exist_ok=True)
    _SECRET_FILE.write_text(secret)
    return secret


def create_access_token(user_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=_EXPIRY_DAYS)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, _get_secret(), algorithm=_ALGORITHM)


def create_state_token(user_id: int) -> str:
    """Short-lived JWT used as the OAuth state parameter (10 min)."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=10)
    payload = {"sub": str(user_id), "exp": expire, "typ": "oauth_state"}
    return jwt.encode(payload, _get_secret(), algorithm=_ALGORITHM)


def decode_state_token(state: str) -> int:
    """Decode OAuth state JWT and return user_id. Raises JWTError on failure."""
    payload = jwt.decode(state, _get_secret(), algorithms=[_ALGORITHM])
    if payload.get("typ") != "oauth_state":
        raise JWTError("wrong token type")
    return int(payload["sub"])


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    """FastAPI dependency — validates JWT and returns the user row."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials
    try:
        payload = jwt.decode(token, _get_secret(), algorithms=[_ALGORITHM])
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = get_user_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user
