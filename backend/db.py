"""SQLite database layer — users and per-user credentials."""

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).parent / "data" / "autoinstapost.db"


def _conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Create tables if they don't exist."""
    with _conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS credentials (
                user_id INTEGER PRIMARY KEY REFERENCES users(id),
                instagram_access_token TEXT,
                instagram_account_id TEXT,
                facebook_app_id TEXT,
                facebook_app_secret TEXT,
                gemini_api_key TEXT,
                anthropic_api_key TEXT,
                public_base_url TEXT,
                google_service_account_json TEXT,
                instagram_token_expires_at INTEGER,
                google_photos_refresh_token TEXT
            )
        """)
        # Migrate existing DBs
        for col in ["google_photos_refresh_token TEXT", "google_picker_session_id TEXT", "saved_drive_folders TEXT"]:
            try:
                conn.execute(f"ALTER TABLE credentials ADD COLUMN {col}")
                conn.commit()
            except Exception:
                pass  # Column already exists
        conn.commit()


def create_user(email: str, password_hash: str) -> dict:
    """Insert a new user and return the row as a dict."""
    now = datetime.now(timezone.utc).isoformat()
    with _conn() as conn:
        cur = conn.execute(
            "INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)",
            (email, password_hash, now),
        )
        conn.commit()
        return {"id": cur.lastrowid, "email": email, "created_at": now}


def get_user_by_email(email: str) -> dict | None:
    with _conn() as conn:
        row = conn.execute(
            "SELECT id, email, password_hash, created_at FROM users WHERE email = ?",
            (email,),
        ).fetchone()
        return dict(row) if row else None


def get_user_by_id(user_id: int) -> dict | None:
    with _conn() as conn:
        row = conn.execute(
            "SELECT id, email, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        return dict(row) if row else None


def get_credentials(user_id: int) -> dict:
    """Return credentials for a user. Always returns a dict (empty if not set up yet).
    Never returns None so service functions don't fall back to server .env values."""
    with _conn() as conn:
        row = conn.execute(
            "SELECT * FROM credentials WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        return dict(row) if row else {}


def upsert_credentials(user_id: int, updates: dict) -> None:
    """Create or update credentials for a user. Always ensures a row exists."""
    allowed = {
        "instagram_access_token",
        "instagram_account_id",
        "facebook_app_id",
        "facebook_app_secret",
        "gemini_api_key",
        "anthropic_api_key",
        "public_base_url",
        "google_service_account_json",
        "instagram_token_expires_at",
        "google_photos_refresh_token",
        "google_picker_session_id",
        "saved_drive_folders",
    }
    filtered = {k: v for k, v in updates.items() if k in allowed}

    with _conn() as conn:
        existing = conn.execute(
            "SELECT user_id FROM credentials WHERE user_id = ?", (user_id,)
        ).fetchone()

        if existing:
            if filtered:
                set_clause = ", ".join(f"{k} = ?" for k in filtered)
                values = list(filtered.values()) + [user_id]
                conn.execute(
                    f"UPDATE credentials SET {set_clause} WHERE user_id = ?", values
                )
        else:
            # Always create the row, even if no valid fields provided
            cols = ["user_id"] + list(filtered.keys())
            vals = [user_id] + list(filtered.values())
            placeholders = ", ".join("?" for _ in cols)
            conn.execute(
                f"INSERT INTO credentials ({', '.join(cols)}) VALUES ({placeholders})",
                vals,
            )
        conn.commit()


def has_credentials(user_id: int) -> bool:
    """Return True if the user has completed initial setup (credentials row exists)."""
    with _conn() as conn:
        row = conn.execute(
            "SELECT user_id FROM credentials WHERE user_id = ?", (user_id,)
        ).fetchone()
        return row is not None
