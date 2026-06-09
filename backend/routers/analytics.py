from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.database import get_db
from core.dependencies import get_current_user
from dependencies.permissions import require_project_viewer
from models.activity import Activity
from models.project import Project
from models.project_member import ProjectMember
from models.task import Task
from models.user import User
from utils.cache import cache

router = APIRouter(prefix="/api/projects", tags=["analytics"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


SPRINT_LENGTH_DAYS = 14
DEFAULT_STATUSES = ["todo", "in_progress", "done"]


def _to_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _task_points(task: Task) -> int:
    points = task.story_points if task.story_points is not None else 0
    return max(points, 0)


def _status_label(status: str) -> str:
    return status.replace("_", " ").title()


def _build_completion_datetimes(
    tasks: list[Task], activities: list[Activity]
) -> dict[str, datetime]:
    completion: dict[str, datetime] = {}
    ordered_moves = sorted(activities, key=lambda a: _to_utc(a.created_at))

    for activity in ordered_moves:
        if activity.action != "task_moved" or not activity.target_id:
            continue
        metadata = activity.metadata_ or {}
        if metadata.get("to_status") != "done":
            continue
        task_id = str(activity.target_id)
        if task_id not in completion:
            completion[task_id] = _to_utc(activity.created_at)

    for task in tasks:
        task_id = str(task.id)
        if task.status == "done" and task_id not in completion:
            completion[task_id] = _to_utc(task.updated_at)

    return completion


def _sprint_window_for_date(anchor: date, target: date) -> tuple[date, date, int]:
    days_since = max((target - anchor).days, 0)
    sprint_index = days_since // SPRINT_LENGTH_DAYS
    sprint_start = anchor + timedelta(days=sprint_index * SPRINT_LENGTH_DAYS)
    sprint_end = sprint_start + timedelta(days=SPRINT_LENGTH_DAYS - 1)
    return sprint_start, sprint_end, sprint_index


def _belongs_to_sprint(task: Task, sprint_start: date, sprint_end: date) -> bool:
    created_on = _to_utc(task.created_at).date()
    if task.due_date and sprint_start <= task.due_date <= sprint_end:
        return True
    return sprint_start <= created_on <= sprint_end


def _sprint_tasks(
    tasks: list[Task], sprint_start: date, sprint_end: date
) -> list[Task]:
    due_bound = [
        t for t in tasks if t.due_date and sprint_start <= t.due_date <= sprint_end
    ]
    if due_bound:
        return due_bound
    return [
        t for t in tasks if sprint_start <= _to_utc(t.created_at).date() <= sprint_end
    ]


def _last_six_sprint_windows(anchor: date, today: date) -> list[tuple[int, date, date]]:
    _, _, current_index = _sprint_window_for_date(anchor, today)
    windows: list[tuple[int, date, date]] = []
    for delta in range(5, -1, -1):
        sprint_index = current_index - delta
        sprint_start = anchor + timedelta(days=sprint_index * SPRINT_LENGTH_DAYS)
        sprint_end = sprint_start + timedelta(days=SPRINT_LENGTH_DAYS - 1)
        windows.append((sprint_index, sprint_start, sprint_end))
    return windows


async def _fetch_project_and_tasks(
    project_id: str, db: AsyncSession
) -> tuple[Project | None, list[Task]]:
    project_result = await db.execute(select(Project).where(Project.id == project_id))
    project = project_result.scalar_one_or_none()

    task_result = await db.execute(
        select(Task)
        .where(Task.project_id == project_id)
        .order_by(Task.created_at.asc())
    )
    tasks = task_result.scalars().all()
    return project, tasks


async def _fetch_task_activities(project_id: str, db: AsyncSession) -> list[Activity]:
    activity_result = await db.execute(
        select(Activity)
        .where(
            Activity.project_id == project_id,
            Activity.target_type == "task",
            Activity.action.in_(("task_moved", "task_created")),
        )
        .order_by(Activity.created_at.asc())
    )
    return activity_result.scalars().all()


@router.get("/{project_id}/analytics/burndown")
@cache(ttl_seconds=300)
async def get_project_burndown(
    project_id: str,
    current_user: CurrentUser,
    db: DB,
    _=Depends(require_project_viewer()),
):
    project, tasks = await _fetch_project_and_tasks(project_id, db)
    if not project:
        return []

    today = datetime.now(timezone.utc).date()
    anchor = _to_utc(project.created_at).date()
    sprint_start, sprint_end, _ = _sprint_window_for_date(anchor, today)

    has_active_scope = any(
        task.status != "done" and _belongs_to_sprint(task, sprint_start, sprint_end)
        for task in tasks
    )
    if not has_active_scope:
        return []

    scoped_tasks = _sprint_tasks(tasks, sprint_start, sprint_end)
    if not scoped_tasks:
        return []

    baseline_tasks = [
        t for t in scoped_tasks if _to_utc(t.created_at).date() <= sprint_start
    ]
    if not baseline_tasks:
        baseline_tasks = scoped_tasks

    activities = await _fetch_task_activities(project_id, db)
    completion = _build_completion_datetimes(tasks, activities)

    baseline_points = {str(task.id): _task_points(task) for task in baseline_tasks}
    total_points = sum(baseline_points.values())
    total_days = (sprint_end - sprint_start).days + 1
    date_series = []

    for offset in range(total_days):
        current_date = sprint_start + timedelta(days=offset)
        day_end = datetime.combine(current_date, time.max, tzinfo=timezone.utc)

        completed_points = sum(
            points
            for task_id, points in baseline_points.items()
            if completion.get(task_id) and completion[task_id] <= day_end
        )
        remaining_points = max(total_points - completed_points, 0)
        ideal_remaining = (
            int(round(total_points * (1 - (offset / max(total_days - 1, 1)))))
            if total_points > 0
            else 0
        )

        date_series.append(
            {
                "date": current_date.isoformat(),
                "remaining_points": remaining_points,
                "ideal_remaining": ideal_remaining,
            }
        )

    return date_series


@router.get("/{project_id}/analytics/velocity")
@cache(ttl_seconds=300)
async def get_project_velocity(
    project_id: str,
    current_user: CurrentUser,
    db: DB,
    _=Depends(require_project_viewer()),
):
    project, tasks = await _fetch_project_and_tasks(project_id, db)
    if not project:
        return []

    activities = await _fetch_task_activities(project_id, db)
    completion = _build_completion_datetimes(tasks, activities)
    today = datetime.now(timezone.utc).date()
    anchor = _to_utc(project.created_at).date()
    windows = _last_six_sprint_windows(anchor, today)

    rows = []
    for sprint_index, sprint_start, sprint_end in windows:
        points_completed = sum(
            _task_points(task)
            for task in tasks
            if (
                completion.get(str(task.id))
                and sprint_start <= completion[str(task.id)].date() <= sprint_end
            )
        )

        rows.append(
            {
                "sprint_label": f"S{max(sprint_index + 1, 1)} ({sprint_start.strftime('%b %d')} - {sprint_end.strftime('%b %d')})",
                "points_completed": points_completed,
            }
        )

    return rows


@router.get("/{project_id}/analytics/cycle-time")
@cache(ttl_seconds=300)
async def get_project_cycle_time(
    project_id: str,
    current_user: CurrentUser,
    db: DB,
    _=Depends(require_project_viewer()),
):
    _, tasks = await _fetch_project_and_tasks(project_id, db)
    if not tasks:
        return []

    activities = await _fetch_task_activities(project_id, db)
    completion = _build_completion_datetimes(tasks, activities)
    now = datetime.now(timezone.utc)

    events_by_task: dict[str, list[Activity]] = {}
    for activity in activities:
        if activity.action != "task_moved" or not activity.target_id:
            continue
        events_by_task.setdefault(str(activity.target_id), []).append(activity)

    totals: dict[str, float] = {}
    counts: dict[str, int] = {}

    def record(status: str, duration_days: float):
        if duration_days <= 0:
            return
        totals[status] = totals.get(status, 0.0) + duration_days
        counts[status] = counts.get(status, 0) + 1

    for task in tasks:
        task_id = str(task.id)
        task_events = sorted(
            events_by_task.get(task_id, []), key=lambda a: _to_utc(a.created_at)
        )
        current_status = (
            task.status
            if not task_events
            else (task_events[0].metadata_ or {}).get("from_status", "todo")
        )
        segment_start = _to_utc(task.created_at)

        for event in task_events:
            metadata = event.metadata_ or {}
            from_status = metadata.get("from_status") or current_status
            to_status = metadata.get("to_status")
            event_time = _to_utc(event.created_at)

            if from_status != current_status:
                current_status = from_status
            record(current_status, (event_time - segment_start).total_seconds() / 86400)

            if to_status:
                current_status = to_status
            segment_start = event_time

        completion_dt = completion.get(task_id)
        segment_end = (
            completion_dt if (task.status == "done" and completion_dt) else now
        )
        record(current_status, (segment_end - segment_start).total_seconds() / 86400)

    seen_statuses = set(DEFAULT_STATUSES)
    seen_statuses.update(t.status for t in tasks if t.status)
    seen_statuses.update(totals.keys())

    ordered_statuses = [s for s in DEFAULT_STATUSES if s in seen_statuses]
    ordered_statuses.extend(
        sorted(s for s in seen_statuses if s not in DEFAULT_STATUSES)
    )

    return [
        {
            "status": _status_label(status),
            "avg_days": (
                round((totals.get(status, 0.0) / counts[status]), 2)
                if counts.get(status)
                else 0.0
            ),
        }
        for status in ordered_statuses
    ]


@router.get("/{project_id}/analytics/workload")
@cache(ttl_seconds=300)
async def get_project_workload(
    project_id: str,
    current_user: CurrentUser,
    db: DB,
    _=Depends(require_project_viewer()),
):
    members_result = await db.execute(
        select(ProjectMember)
        .options(selectinload(ProjectMember.user))
        .where(ProjectMember.project_id == project_id)
    )
    members = members_result.scalars().all()
    if not members:
        return []

    aggregate_result = await db.execute(
        select(
            Task.assignee_id,
            func.count(Task.id).label("open_tasks"),
            func.coalesce(func.sum(Task.story_points), 0).label("total_points"),
        )
        .where(
            Task.project_id == project_id,
            Task.assignee_id.is_not(None),
            Task.status != "done",
        )
        .group_by(Task.assignee_id)
    )
    stats_by_assignee = {
        str(row.assignee_id): {
            "open_tasks": int(row.open_tasks or 0),
            "total_points": int(row.total_points or 0),
        }
        for row in aggregate_result
    }

    rows = []
    for member in members:
        user = member.user
        if not user:
            continue
        stats = stats_by_assignee.get(
            str(user.id), {"open_tasks": 0, "total_points": 0}
        )
        rows.append(
            {
                "user": {
                    "id": str(user.id),
                    "name": user.name or "Unknown",
                    "avatar": user.avatar_url,
                },
                "open_tasks": stats["open_tasks"],
                "total_points": stats["total_points"],
            }
        )

    rows.sort(
        key=lambda item: (
            -item["open_tasks"],
            -item["total_points"],
            item["user"]["name"],
        )
    )
    return rows
