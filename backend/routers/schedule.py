"""Routes for schedule configuration and pending post approvals."""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from auth import get_current_user
from db import get_credentials
from services.schedule_service import (
    approve_pending_post,
    load_config,
    load_history,
    load_pending,
    load_posted_ids,
    log_post_attempt,
    record_posted_id,
    reject_pending_post,
    remove_posted_id,
    save_config,
)

router = APIRouter(prefix="/schedule", tags=["schedule"])

from services.schedule_service import DEFAULT_CAPTION  # noqa: E402


class ScheduleConfig(BaseModel):
    enabled: bool = False
    hour: int = 8
    minute: int = 0
    cadence: str = "daily"
    every_n_days: int = 1
    weekdays: list[int] = [0, 1, 2, 3, 4]
    source: str = "drive"
    timezone: str = "UTC"
    folder_id: str = ""
    tone: str = "engaging"
    require_approval: bool = True
    default_caption: str = DEFAULT_CAPTION


@router.get("/timezone")
def get_timezone():
    import datetime
    import tzlocal
    tz = tzlocal.get_localzone()
    now = datetime.datetime.now(tz)
    return {
        "timezone": str(tz),
        "utc_offset": now.strftime("%z"),
        "current_time": now.strftime("%I:%M %p"),
    }


@router.get("/config")
def get_config(current_user: dict = Depends(get_current_user)):
    return load_config(current_user["id"])


@router.post("/config")
def set_config(config: ScheduleConfig, request: Request, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    data = config.model_dump()
    save_config(data, user_id)

    scheduler = request.app.state.scheduler
    _reschedule_user(scheduler, data, user_id)

    return {"success": True, "config": data}


@router.get("/posted-ids")
def get_posted_ids(current_user: dict = Depends(get_current_user)):
    return sorted(load_posted_ids(current_user["id"]))


@router.post("/posted-ids/{file_id}")
def mark_as_posted(file_id: str, current_user: dict = Depends(get_current_user)):
    record_posted_id(file_id, current_user["id"])
    return {"success": True}


@router.delete("/posted-ids/{file_id}")
def unmark_as_posted(file_id: str, current_user: dict = Depends(get_current_user)):
    remove_posted_id(file_id, current_user["id"])
    return {"success": True}


@router.get("/pending")
def get_pending(current_user: dict = Depends(get_current_user)):
    return load_pending(current_user["id"])


@router.post("/pending/{post_id}/approve")
def approve_post(post_id: str, current_user: dict = Depends(get_current_user)):
    try:
        found = approve_pending_post(post_id, current_user["id"])
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    if not found:
        raise HTTPException(status_code=404, detail="Pending post not found")
    return {"success": True}


@router.delete("/pending/{post_id}")
def reject_post(post_id: str, current_user: dict = Depends(get_current_user)):
    found = reject_pending_post(post_id, current_user["id"])
    if not found:
        raise HTTPException(status_code=404, detail="Pending post not found")
    return {"success": True}


@router.get("/history")
def get_history(current_user: dict = Depends(get_current_user)):
    return load_history(current_user["id"])


@router.post("/run-now")
def run_now(current_user: dict = Depends(get_current_user)):
    from services.schedule_service import run_scheduled_job
    import threading
    user_id = current_user["id"]
    threading.Thread(target=run_scheduled_job, args=(user_id,), daemon=True).start()
    return {"success": True, "message": "Job triggered — check History tab in ~30s"}


@router.get("/status")
def get_status(request: Request, current_user: dict = Depends(get_current_user)):
    import os
    user_id = current_user["id"]
    creds = get_credentials(user_id)

    config = load_config(user_id)
    scheduler = request.app.state.scheduler
    job_id = f"auto_post_{user_id}"
    job = scheduler.get_job(job_id)
    next_run = job.next_run_time.isoformat() if (job and job.next_run_time) else None

    checks = []

    # 1. Schedule enabled
    enabled = config.get("enabled", False)
    checks.append({
        "name": "Auto-schedule",
        "ok": enabled,
        "message": "Enabled" if enabled else "Disabled — turn on in the Schedule tab",
    })

    # 2. Source / folder configured
    source = config.get("source", "drive")
    folder_id = config.get("folder_id", "").strip()
    upcoming_pool = []

    if source == "gphotos_picker":
        picker_session = (creds or {}).get("google_picker_session_id", "")
        checks.append({
            "name": "Google Photos",
            "ok": bool(picker_session),
            "message": "Picker session active" if picker_session else "No picker session — open Google Photos Picker in the Schedule tab",
        })
        # Fresh photos check for picker
        if picker_session:
            try:
                from services.photos_service import list_picker_items, _get_access_token as _gphotos_token
                access_token = _gphotos_token(creds)
                photos = list_picker_items(picker_session, access_token)
                posted = load_posted_ids(user_id)
                fresh = [p for p in photos if p["id"] not in posted]
                checks.append({
                    "name": "Fresh photos",
                    "ok": len(fresh) > 0,
                    "message": f"{len(fresh)} unposted photo{'s' if len(fresh) != 1 else ''} available"
                               if fresh else "All photos in picker already posted — open a new picker session",
                })
            except Exception as e:
                checks.append({"name": "Fresh photos", "ok": False, "message": f"Google Photos error: {e}"})
        else:
            checks.append({"name": "Fresh photos", "ok": False, "message": "Set up Google Photos picker first"})
    else:
        checks.append({
            "name": "Drive folder",
            "ok": bool(folder_id),
            "message": "Folder configured" if folder_id else "No folder ID set — add one in the Schedule tab",
        })
        if folder_id:
            try:
                from services.drive_service import list_photos
                photos = list_photos(folder_id, creds=creds)
                posted = load_posted_ids(user_id)
                fresh = [p for p in photos if p["id"] not in posted]
                upcoming_pool = [{"id": p["id"], "name": p.get("name", "")} for p in fresh]
                checks.append({
                    "name": "Fresh photos",
                    "ok": len(fresh) > 0,
                    "message": f"{len(fresh)} unposted photo{'s' if len(fresh) != 1 else ''} available"
                               if fresh else "All photos already posted — unmark some in the Manual tab",
                })
            except Exception as e:
                checks.append({"name": "Fresh photos", "ok": False, "message": f"Drive error: {e}"})
        else:
            checks.append({"name": "Fresh photos", "ok": False, "message": "Set a folder first"})

    # 4. Public URL reachable by Instagram
    import httpx as _httpx
    public_url = (
        (creds.get("public_base_url") if creds else None)
        or os.environ.get("PUBLIC_BASE_URL", "")
    ).rstrip("/")
    looks_public = bool(public_url) and "localhost" not in public_url and "127.0.0.1" not in public_url
    if not looks_public:
        checks.append({
            "name": "Public image URL",
            "ok": False,
            "message": "public_base_url not set or points to localhost — Instagram can't fetch images",
        })
    else:
        try:
            probe = _httpx.get(f"{public_url}/health", timeout=6, follow_redirects=True)
            reachable = probe.is_success
        except Exception:
            reachable = False
        checks.append({
            "name": "Public image URL",
            "ok": reachable,
            "message": public_url if reachable
                       else f"Tunnel unreachable ({public_url}) — restart Cloudflare and update public_base_url",
        })

    # 5. Instagram account connected
    ig_account_id = (creds or {}).get("instagram_account_id", "").strip()
    ig_token = (creds or {}).get("instagram_access_token", "").strip()
    ig_connected = bool(ig_account_id) and bool(ig_token)
    checks.append({
        "name": "Instagram account",
        "ok": ig_connected,
        "message": f"Connected (account {ig_account_id})" if ig_connected
                   else "Not connected — go to Setup and link your Instagram account",
    })

    # 6. Instagram token valid
    if ig_connected:
        try:
            from services.instagram_service import get_token_status
            ts = get_token_status(creds=creds)
            token_ok = ts.get("valid", False)
            days = ts.get("days_left")
            status_str = ts.get("status", "")
            if status_str == "unknown":
                msg = "Valid (expiry unknown — will be tracked after next use)"
            elif token_ok and days is not None:
                msg = f"Valid — {days} day{'s' if days != 1 else ''} left"
            elif token_ok:
                msg = "Valid"
            else:
                msg = "Expired — exchange a new token in the Setup tab"
            checks.append({"name": "Instagram token", "ok": token_ok, "message": msg})
        except Exception as e:
            checks.append({"name": "Instagram token", "ok": False, "message": str(e)})

    all_ok = all(c["ok"] for c in checks)
    return {"next_run": next_run, "checks": checks, "all_ok": all_ok, "upcoming_pool": upcoming_pool}


# ---------------------------------------------------------------------------
# Scheduler helpers
# ---------------------------------------------------------------------------

def _reschedule_user(scheduler, config: dict, user_id: int) -> None:
    """Remove existing job for this user and add a new one based on config."""
    from apscheduler.triggers.cron import CronTrigger
    from services.schedule_service import run_scheduled_job

    job_id = f"auto_post_{user_id}"

    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)

    if not config.get("enabled"):
        return

    hour = config.get("hour", 8)
    minute = config.get("minute", 0)
    cadence = config.get("cadence", "daily")
    tz = config.get("timezone", "UTC")

    if cadence == "daily":
        trigger = CronTrigger(hour=hour, minute=minute, timezone=tz)
    elif cadence == "every_n_days":
        n = max(1, config.get("every_n_days", 1))
        trigger = CronTrigger(hour=hour, minute=minute, day=f"*/{n}", timezone=tz)
    elif cadence == "weekdays":
        days = config.get("weekdays", [0, 1, 2, 3, 4])
        day_str = ",".join(str(d) for d in days)
        trigger = CronTrigger(day_of_week=day_str, hour=hour, minute=minute, timezone=tz)
    else:
        trigger = CronTrigger(hour=hour, minute=minute, timezone=tz)

    scheduler.add_job(
        run_scheduled_job,
        trigger=trigger,
        id=job_id,
        replace_existing=True,
        kwargs={"user_id": user_id},
    )


# Keep legacy alias for backwards compat (main.py import)
def _reschedule(scheduler, config: dict) -> None:
    """Legacy single-user reschedule — calls _reschedule_user with user_id=None."""
    _reschedule_user(scheduler, config, user_id=None)
