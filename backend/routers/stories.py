"""Routes for Instagram Stories — manual posting, scheduling, history, status."""

import threading

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from auth import get_current_user
from db import get_credentials, upsert_credentials
from services.story_service import (
    load_story_config,
    load_story_history,
    load_story_posted_ids,
    log_story_attempt,
    record_story_posted_id,
    run_scheduled_story_job,
    save_story_config,
    _post_story_image,
)

router = APIRouter(prefix="/stories", tags=["stories"])


class StoryConfig(BaseModel):
    enabled: bool = False
    hour: int = 9
    minute: int = 0
    cadence: str = "daily"
    every_n_days: int = 1
    weekdays: list[int] = [0, 1, 2, 3, 4]
    timezone: str = "America/Los_Angeles"
    source: str = "drive"  # "drive" or "gphotos_picker"
    folder_id: str = ""


class ManualStoryRequest(BaseModel):
    file_id: str
    source: str = "drive"  # "drive" or "gphotos_picker"
    picker_session_id: str | None = None


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

@router.get("/config")
def get_story_config(current_user: dict = Depends(get_current_user)):
    return load_story_config(current_user["id"])


@router.post("/config")
def set_story_config(config: StoryConfig, request: Request, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    data = config.model_dump()
    save_story_config(data, user_id)
    _reschedule_story(request.app.state.scheduler, data, user_id)
    return {"success": True, "config": data}


# ---------------------------------------------------------------------------
# Manual post
# ---------------------------------------------------------------------------

@router.post("/post")
def post_story_manual(req: ManualStoryRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    creds = get_credentials(user_id)
    try:
        media_id = _post_story_image(
            req.file_id, creds=creds, user_id=user_id,
            source=req.source, picker_session_id=req.picker_session_id,
        )
        record_story_posted_id(req.file_id, user_id)
        log_story_attempt(
            file_id=req.file_id, file_name=req.file_id,
            status="success", source="manual", media_id=media_id,
            user_id=user_id,
        )
        return {"success": True, "media_id": media_id}
    except Exception as e:
        log_story_attempt(
            file_id=req.file_id, file_name=req.file_id,
            status="failed", source="manual", error=str(e),
            user_id=user_id,
        )
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Story picker (separate session from feed picker)
# ---------------------------------------------------------------------------

@router.post("/picker/start")
def start_story_picker(current_user: dict = Depends(get_current_user)):
    """Create a Google Photos Picker session for story scheduling."""
    user_id = current_user["id"]
    creds = get_credentials(user_id)
    try:
        from services.photos_service import _get_access_token, create_picker_session
        access_token = _get_access_token(creds)
        session = create_picker_session(access_token)
        session_id = session["id"]
        upsert_credentials(user_id, {"google_story_picker_session_id": session_id})
        return {"pickerUri": session["pickerUri"], "session_id": session_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------

@router.get("/history")
def get_story_history(current_user: dict = Depends(get_current_user)):
    return load_story_history(current_user["id"])


# ---------------------------------------------------------------------------
# Run now
# ---------------------------------------------------------------------------

@router.post("/run-now")
def run_story_now(current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    threading.Thread(target=run_scheduled_story_job, args=(user_id,), daemon=True).start()
    return {"success": True, "message": "Story job triggered — check history in ~30s"}


# ---------------------------------------------------------------------------
# Status / checklist
# ---------------------------------------------------------------------------

@router.get("/status")
def get_story_status(request: Request, current_user: dict = Depends(get_current_user)):
    user_id = current_user["id"]
    creds = get_credentials(user_id)
    config = load_story_config(user_id)

    scheduler = request.app.state.scheduler
    job_id = f"story_post_{user_id}"
    job = scheduler.get_job(job_id)
    next_run = job.next_run_time.isoformat() if (job and job.next_run_time) else None

    checks = []

    # 1. Schedule enabled
    enabled = config.get("enabled", False)
    checks.append({
        "name": "Story schedule",
        "ok": enabled,
        "message": "Enabled" if enabled else "Disabled — turn on above",
    })

    # 2. Instagram account connected
    ig_account_id = ((creds or {}).get("instagram_account_id") or "").strip()
    ig_token = ((creds or {}).get("instagram_access_token") or "").strip()
    ig_connected = bool(ig_account_id) and bool(ig_token)
    checks.append({
        "name": "Instagram account",
        "ok": ig_connected,
        "message": f"Connected (account {ig_account_id})" if ig_connected
                   else "Not connected — go to Setup and link your Instagram account",
    })

    # 3. Photo source
    source = config.get("source", "drive")
    if source == "gphotos_picker":
        picker_session = ((creds or {}).get("google_story_picker_session_id") or "").strip()
        checks.append({
            "name": "Google Photos picker",
            "ok": bool(picker_session),
            "message": "Picker session active" if picker_session
                       else "No picker session — open Google Photos Picker in Story Schedule above",
        })
        if picker_session:
            try:
                from services.photos_service import list_picker_items, _get_access_token as _gphotos_token
                access_token = _gphotos_token(creds)
                photos = list_picker_items(picker_session, access_token)
                checks.append({
                    "name": "Story photos available",
                    "ok": len(photos) > 0,
                    "message": f"{len(photos)} photo{'s' if len(photos) != 1 else ''} in picker selection"
                               if photos else "No photos in picker selection — open picker and select photos",
                })
            except Exception as e:
                checks.append({"name": "Story photos available", "ok": False, "message": f"Picker error: {e}"})
    else:
        folder_id = config.get("folder_id", "").strip()
        checks.append({
            "name": "Story folder",
            "ok": bool(folder_id),
            "message": "Folder configured" if folder_id else "No folder set — pick one above",
        })
        if folder_id:
            try:
                from services.drive_service import list_photos
                photos = list_photos(folder_id, creds=creds)
                posted = load_story_posted_ids(user_id)
                fresh = [p for p in photos if p["id"] not in posted]
                checks.append({
                    "name": "Fresh story photos",
                    "ok": len(fresh) > 0,
                    "message": f"{len(fresh)} unposted photo{'s' if len(fresh) != 1 else ''} available"
                               if fresh else "All photos already used as stories — add more to the folder",
                })
            except Exception as e:
                checks.append({"name": "Fresh story photos", "ok": False, "message": f"Drive error: {e}"})

    # 4. Instagram token
    if ig_connected:
        try:
            from services.instagram_service import get_token_status
            ts = get_token_status(creds=creds)
            token_ok = ts.get("valid", False)
            days = ts.get("days_left")
            if ts.get("status") == "unknown":
                msg = "Valid (expiry unknown)"
            elif token_ok and days is not None:
                msg = f"Valid — {days} day{'s' if days != 1 else ''} left"
            else:
                msg = "Expired — exchange a new token in Setup"
            checks.append({"name": "Instagram token", "ok": token_ok, "message": msg})
        except Exception as e:
            checks.append({"name": "Instagram token", "ok": False, "message": str(e)})

    return {
        "next_run": next_run,
        "checks": checks,
        "all_ok": all(c["ok"] for c in checks),
    }


# ---------------------------------------------------------------------------
# Scheduler helper
# ---------------------------------------------------------------------------

def _reschedule_story(scheduler, config: dict, user_id: int) -> None:
    from apscheduler.triggers.cron import CronTrigger

    job_id = f"story_post_{user_id}"
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)

    if not config.get("enabled"):
        return

    hour = config.get("hour", 9)
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
        trigger = CronTrigger(day_of_week=",".join(str(d) for d in days), hour=hour, minute=minute, timezone=tz)
    else:
        trigger = CronTrigger(hour=hour, minute=minute, timezone=tz)

    scheduler.add_job(
        run_scheduled_story_job,
        trigger=trigger,
        id=job_id,
        replace_existing=True,
        kwargs={"user_id": user_id},
    )
