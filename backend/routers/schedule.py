"""Routes for schedule configuration and pending post approvals."""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from services.schedule_service import (
    approve_pending_post,
    load_config,
    load_pending,
    reject_pending_post,
    save_config,
)

router = APIRouter(prefix="/schedule", tags=["schedule"])


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
