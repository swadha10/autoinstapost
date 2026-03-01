"""Routes for schedule configuration and pending post approvals."""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from services.schedule_service import (
    approve_pending_post,
    load_config,
    load_history,
    load_pending,
    log_post_attempt,
    reject_pending_post,
    save_config,
)

router = APIRouter(prefix="/schedule", tags=["schedule"])


from services.schedule_service import DEFAULT_CAPTION  # noqa: E402 (after router import)


class ScheduleConfig(BaseModel):
    enabled: bool = False
    hour: int = 8
    minute: int = 0
    cadence: str = "daily"
    every_n_days: int = 1
    weekdays: list[int] = [0, 1, 2, 3, 4]
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
def get_config():
    return load_config()


@router.post("/config")
def set_config(config: ScheduleConfig, request: Request):
    data = config.model_dump()
    save_config(data)

    # Re-schedule the APScheduler job with new settings
    scheduler = request.app.state.scheduler
    _reschedule(scheduler, data)

    return {"success": True, "config": data}


@router.get("/posted-ids")
def get_posted_ids():
    """Return the set of Drive file IDs that have already been posted."""
    from services.schedule_service import load_posted_ids
    return sorted(load_posted_ids())


@router.post("/posted-ids/{file_id}")
def mark_as_posted(file_id: str):
    """Manually mark a photo as already shared (e.g. posted before tracking existed)."""
    from services.schedule_service import record_posted_id
    record_posted_id(file_id)
    return {"success": True}


@router.delete("/posted-ids/{file_id}")
def unmark_as_posted(file_id: str):
    """Remove a photo from the posted history so it can be reused."""
    from services.schedule_service import load_posted_ids, POSTED_FILE
    ids = load_posted_ids()
    ids.discard(file_id)
    POSTED_FILE.parent.mkdir(parents=True, exist_ok=True)
    POSTED_FILE.write_text(__import__("json").dumps(sorted(ids), indent=2))
    return {"success": True}


@router.get("/pending")
def get_pending():
    return load_pending()


@router.post("/pending/{post_id}/approve")
def approve_post(post_id: str):
    try:
        found = approve_pending_post(post_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    if not found:
        raise HTTPException(status_code=404, detail="Pending post not found")
    return {"success": True}


@router.delete("/pending/{post_id}")
def reject_post(post_id: str):
    found = reject_pending_post(post_id)
    if not found:
        raise HTTPException(status_code=404, detail="Pending post not found")
    return {"success": True}


@router.get("/history")
def get_history():
    return load_history()


@router.post("/run-now")
def run_now():
    """Trigger the scheduled job immediately for testing."""
    from services.schedule_service import run_scheduled_job
    import threading
    threading.Thread(target=run_scheduled_job, daemon=True).start()
    return {"success": True, "message": "Job triggered — check History tab in ~30s"}


@router.get("/status")
def get_status(request: Request):
    """Return next scheduled run time + pre-flight validation checks."""
    import os
    from services.schedule_service import load_posted_ids

    config = load_config()
    scheduler = request.app.state.scheduler
    job = scheduler.get_job("auto_post")
    next_run = job.next_run_time.isoformat() if (job and job.next_run_time) else None

    checks = []

    # 1. Schedule enabled
    enabled = config.get("enabled", False)
    checks.append({
        "name": "Auto-schedule",
        "ok": enabled,
        "message": "Enabled" if enabled else "Disabled — turn on in the Schedule tab",
    })

    # 2. Folder configured
    folder_id = config.get("folder_id", "").strip()
    checks.append({
        "name": "Drive folder",
        "ok": bool(folder_id),
        "message": "Folder configured" if folder_id else "No folder ID set — add one in the Schedule tab",
    })

    # 3. Fresh photos available
    upcoming_pool = []
    if folder_id:
        try:
            from services.drive_service import list_photos
            photos = list_photos(folder_id)
            posted = load_posted_ids()
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

    # 4. Public URL reachable by Instagram — actually probe it, don't just check the string
    import httpx as _httpx
    public_url = os.environ.get("PUBLIC_BASE_URL", "").rstrip("/")
    looks_public = bool(public_url) and "localhost" not in public_url and "127.0.0.1" not in public_url
    if not looks_public:
        checks.append({
            "name": "Public image URL",
            "ok": False,
            "message": "PUBLIC_BASE_URL not set or points to localhost — Instagram can't fetch images",
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
                       else f"Tunnel unreachable ({public_url}) — restart Cloudflare and update PUBLIC_BASE_URL in .env",
        })

    # 5. Instagram token valid
    try:
        from services.instagram_service import get_token_status
        ts = get_token_status()
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
            msg = "Expired — exchange a new token in the Manual tab"
        checks.append({"name": "Instagram token", "ok": token_ok, "message": msg})
    except Exception as e:
        checks.append({"name": "Instagram token", "ok": False, "message": str(e)})

    all_ok = all(c["ok"] for c in checks)
    return {"next_run": next_run, "checks": checks, "all_ok": all_ok, "upcoming_pool": upcoming_pool}


# ---------------------------------------------------------------------------
# Internal helper — kept here to avoid circular imports with main.py
# ---------------------------------------------------------------------------

def _reschedule(scheduler, config: dict) -> None:
    """Remove the existing scheduled job and add a new one based on *config*."""
    from apscheduler.triggers.cron import CronTrigger
    from services.schedule_service import run_scheduled_job

    job_id = "auto_post"

    # Remove old job if present
    if scheduler.get_job(job_id):
        scheduler.remove_job(job_id)

    if not config.get("enabled"):
        return

    hour = config.get("hour", 8)
    minute = config.get("minute", 0)
    cadence = config.get("cadence", "daily")

    if cadence == "daily":
        trigger = CronTrigger(hour=hour, minute=minute)
    elif cadence == "every_n_days":
        n = max(1, config.get("every_n_days", 1))
        trigger = CronTrigger(hour=hour, minute=minute, day=f"*/{n}")
    elif cadence == "weekdays":
        days = config.get("weekdays", [0, 1, 2, 3, 4])
        day_str = ",".join(str(d) for d in days)
        trigger = CronTrigger(day_of_week=day_str, hour=hour, minute=minute)
    else:
        trigger = CronTrigger(hour=hour, minute=minute)

    scheduler.add_job(run_scheduled_job, trigger=trigger, id=job_id, replace_existing=True)
