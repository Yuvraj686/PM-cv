from datetime import date, datetime
from typing import Annotated
from fastapi import APIRouter, Depends, status, Query
from fastapi.responses import PlainTextResponse
from utils.exceptions import (
    NotFoundError,
    ForbiddenError,
    ValidationError,
    ConflictError,
)
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from core.database import get_db
from core.dependencies import get_current_user, require_role
from core.security import create_calendar_token, verify_calendar_token
from dependencies.permissions import (
    require_project_owner,
    require_project_admin,
    require_project_viewer,
)
from models.project import Project
from models.project_member import ProjectMember
from models.task import Task
from models.user import User
from models.channel import Channel
from models.channel_member import ChannelMember
from schemas.schemas import (
    ProjectCreate,
    ProjectUpdate,
    ProjectOut,
    MemberAdd,
    MemberRoleUpdate,
    MemberOut,
)
from services.github_service import (
    sync_repo_issues,
    register_github_webhook,
    delete_github_webhook,
)
from services.activity_service import log_activity
from utils.cache import cache, invalidate
from models.activity import Activity
from schemas.pagination import encode_cursor, decode_cursor
from sqlalchemy import or_, and_

router = APIRouter(prefix="/api/projects", tags=["projects"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.get("", response_model=list[ProjectOut])
@cache(ttl_seconds=60)
async def list_projects(current_user: CurrentUser, db: DB):
    result = await db.execute(
        select(Project)
        .join(ProjectMember, ProjectMember.project_id == Project.id)
        .where(ProjectMember.user_id == current_user.id)
        .order_by(Project.created_at.desc())
    )
    return result.scalars().all()


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(payload: ProjectCreate, current_user: CurrentUser, db: DB):
    deadline = date.fromisoformat(payload.deadline) if payload.deadline else None
    project = Project(
        name=payload.name,
        description=payload.description,
        repo_url=payload.repo_url,
        deadline=deadline,
        owner_id=current_user.id,
    )
    db.add(project)
    await db.flush()

    # Add creator as admin
    member = ProjectMember(project_id=project.id, user_id=current_user.id, role="admin")
    db.add(member)

    # Auto-create "general" group channel
    gen_channel = Channel(project_id=project.id, name="general", type="group")
    db.add(gen_channel)

    # Auto-create "ai-assistant" channel
    ai_channel = Channel(project_id=project.id, name="ai-assistant", type="group")
    db.add(ai_channel)

    await db.flush()

    # Add creator to channels
    db.add(ChannelMember(channel_id=gen_channel.id, user_id=current_user.id))
    db.add(ChannelMember(channel_id=ai_channel.id, user_id=current_user.id))

    await db.commit()
    await db.refresh(project)
    await invalidate(f"project_list:{current_user.id}")

    # Trigger initial GitHub sync + webhook registration in background if repo_url provided
    if project.repo_url:
        import asyncio

        asyncio.create_task(sync_repo_issues(str(project.id), project.repo_url))
        asyncio.create_task(register_github_webhook(str(project.id), project.repo_url))

    return project


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(
    project_id: str,
    current_user: CurrentUser,
    db: DB,
    _=Depends(require_project_viewer()),
):
    project = await _get_project_or_404(project_id, db)
    return project


@router.put("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: str,
    payload: ProjectUpdate,
    current_user: CurrentUser,
    db: DB,
    _=Depends(require_project_admin()),
):
    project = await _get_project_or_404(project_id, db)
    old_repo_url = project.repo_url
    for field, value in payload.model_dump(exclude_none=True).items():
        if field == "deadline" and value:
            value = date.fromisoformat(value)
        setattr(project, field, value)
    await db.commit()
    await db.refresh(project)
    await invalidate("project_list:*")
    await invalidate(f"project_analytics:{project_id}")

    # Re-register GitHub webhook if the linked repo changed
    new_repo_url = project.repo_url
    if new_repo_url and new_repo_url != old_repo_url:
        import asyncio

        asyncio.create_task(register_github_webhook(project_id, new_repo_url))
    elif old_repo_url and not new_repo_url:
        # Repo unlinked — clean up the webhook
        import asyncio

        asyncio.create_task(delete_github_webhook(project_id, old_repo_url))

    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    current_user: CurrentUser,
    db: DB,
    _=Depends(require_project_owner()),
):
    await _get_project_or_404(project_id, db)
    # Use raw SQL DELETE so the database-level ON DELETE CASCADE
    # handles all child records reliably (avoids async lazy-load issues).
    from sqlalchemy import delete

    await db.execute(delete(Project).where(Project.id == project_id))
    await db.commit()
    await invalidate("project_list:*")
    await invalidate(f"project_analytics:{project_id}")


@router.get("/{project_id}/progress")
@cache(ttl_seconds=300)
async def get_project_progress(project_id: str, current_user: CurrentUser, db: DB):
    await _assert_member(project_id, current_user, db)

    total_q = await db.execute(
        select(func.count(Task.id)).where(Task.project_id == project_id)
    )
    total = total_q.scalar() or 0

    done_q = await db.execute(
        select(func.count(Task.id)).where(
            Task.project_id == project_id, Task.status == "done"
        )
    )
    done = done_q.scalar() or 0

    in_progress_q = await db.execute(
        select(func.count(Task.id)).where(
            Task.project_id == project_id, Task.status == "in_progress"
        )
    )
    in_progress = in_progress_q.scalar() or 0

    todo = total - done - in_progress
    percent = round((done / total) * 100) if total > 0 else 0

    return {
        "total": total,
        "done": done,
        "in_progress": in_progress,
        "todo": todo,
        "percent": percent,
    }


@router.get("/{project_id}/analytics")
@cache(ttl_seconds=300)
async def get_project_analytics(project_id: str, current_user: CurrentUser, db: DB):
    return await get_project_progress(project_id, current_user, db)


@router.get("/{project_id}/members", response_model=list[MemberOut])
@cache(ttl_seconds=120)
async def list_members(project_id: str, current_user: CurrentUser, db: DB):
    await _assert_member(project_id, current_user, db)
    result = await db.execute(
        select(ProjectMember)
        .options(selectinload(ProjectMember.user))
        .where(ProjectMember.project_id == project_id)
    )
    return result.scalars().all()


@router.post("/{project_id}/members", status_code=status.HTTP_201_CREATED)
async def add_member(
    project_id: str,
    payload: MemberAdd,
    current_user: CurrentUser,
    db: DB,
    _=Depends(require_role("admin", "project_lead")),
):
    if not payload.user_id and not payload.email:
        raise ValidationError(message="Either user_id or email is required")

    user_query = select(User)
    if payload.user_id:
        user_query = user_query.where(User.id == payload.user_id)
    else:
        user_query = user_query.where(User.email == payload.email.lower().strip())

    # Verify user exists
    user_result = await db.execute(user_query)
    user = user_result.scalar_one_or_none()
    if not user:
        raise NotFoundError(message="User not found")

    # Check not already a member
    existing = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == user.id
        )
    )
    if existing.scalar_one_or_none():
        raise ConflictError(message="User is already a member")

    member = ProjectMember(project_id=project_id, user_id=user.id, role=payload.role)
    db.add(member)

    await log_activity(
        db,
        project_id=project_id,
        actor_id=str(current_user.id),
        action="member_invited",
        target_id=str(user.id),
        target_type="user",
        metadata={"member_name": user.name, "role": payload.role},
    )

    # Auto-add to all project group channels
    channels_res = await db.execute(
        select(Channel).where(Channel.project_id == project_id, Channel.type == "group")
    )
    for channel in channels_res.scalars().all():
        db.add(ChannelMember(channel_id=channel.id, user_id=user.id))

    await db.commit()
    await invalidate(f"project_members:{project_id}")
    await invalidate("project_list:*")
    return {"message": "Member added successfully"}


@router.patch("/{project_id}/members/{user_id}/role")
async def patch_member_role(
    project_id: str,
    user_id: str,
    payload: MemberRoleUpdate,
    current_user: CurrentUser,
    db: DB,
    _=Depends(require_role("admin")),
):
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == user_id
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise NotFoundError(message="Member not found")

    member.role = payload.role
    await db.commit()
    await invalidate(f"project_members:{project_id}")
    await invalidate("project_list:*")
    return {"message": "Role updated"}


@router.put("/{project_id}/members/{user_id}/role")
async def update_member_role(
    project_id: str,
    user_id: str,
    payload: MemberRoleUpdate,
    current_user: CurrentUser,
    db: DB,
    _=Depends(require_role("admin")),
):
    return await patch_member_role(project_id, user_id, payload, current_user, db)


@router.delete(
    "/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def remove_member(
    project_id: str,
    user_id: str,
    current_user: CurrentUser,
    db: DB,
    _=Depends(require_role("admin")),
):
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == user_id
        )
    )
    member = result.scalar_one_or_none()
    # Auto-remove from all project channels
    await db.execute(
        select(ChannelMember)
        .join(Channel, Channel.id == ChannelMember.channel_id)
        .where(Channel.project_id == project_id, ChannelMember.user_id == user_id)
    )
    # Actually simpler to just delete by user_id and project channels
    from sqlalchemy import delete

    await db.execute(
        delete(ChannelMember).where(
            ChannelMember.user_id == user_id,
            ChannelMember.channel_id.in_(
                select(Channel.id).where(Channel.project_id == project_id)
            ),
        )
    )

    await db.delete(member)
    await db.commit()
    await invalidate(f"project_members:{project_id}")
    await invalidate("project_list:*")


@router.get("/{project_id}/tasks")
async def get_project_tasks(
    project_id: str,
    current_user: CurrentUser,
    db: DB,
    cursor: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    paginate: bool = Query(False),
):
    from routers.tasks import list_tasks

    return await list_tasks(
        project_id=project_id,
        cursor=cursor,
        limit=limit,
        paginate=paginate,
        current_user=current_user,
        db=db,
    )


@router.get("/{project_id}/activity")
async def get_project_activity(
    project_id: str,
    current_user: CurrentUser,
    db: DB,
    cursor: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
):
    await _assert_member(project_id, current_user, db)

    query = (
        select(Activity)
        .options(selectinload(Activity.actor))
        .where(Activity.project_id == project_id)
    )
    if cursor:
        cursor_dt, cursor_id = decode_cursor(cursor)
        query = query.where(
            or_(
                Activity.created_at < cursor_dt,
                and_(Activity.created_at == cursor_dt, Activity.id < cursor_id),
            )
        )
    query = query.order_by(Activity.created_at.desc(), Activity.id.desc()).limit(
        limit + 1
    )
    result = await db.execute(query)
    items = result.scalars().unique().all()

    has_more = len(items) > limit
    if has_more:
        items = items[:limit]
        next_cursor = encode_cursor(items[-1].created_at, str(items[-1].id))
    else:
        next_cursor = None

    def _serialize(a: Activity) -> dict:
        return {
            "id": str(a.id),
            "project_id": str(a.project_id),
            "action": a.action,
            "target_id": str(a.target_id) if a.target_id else None,
            "target_type": a.target_type,
            "metadata": a.metadata_ or {},
            "created_at": a.created_at.isoformat(),
            "actor": (
                {
                    "id": str(a.actor.id),
                    "name": a.actor.name,
                    "avatar_url": a.actor.avatar_url,
                }
                if a.actor
                else None
            ),
        }

    return {
        "items": [_serialize(a) for a in items],
        "next_cursor": next_cursor,
        "has_more": has_more,
    }


@router.get("/{project_id}/calendar-link")
async def get_calendar_link(
    project_id: str,
    current_user: CurrentUser,
    db: DB,
    _=Depends(require_project_viewer()),
):
    """Generate a signed calendar subscription URL valid for 30 days."""
    token = create_calendar_token(project_id, str(current_user.id), days_valid=30)
    return {
        "url": f"/api/projects/{project_id}/calendar.ics?token={token}",
        "token_expires_in_days": 30,
    }


@router.get("/{project_id}/calendar.ics", response_class=PlainTextResponse)
async def export_calendar_ics(project_id: str, token: str, db: DB):
    """Return a signed public ICS feed for project tasks with due dates."""
    user_id = verify_calendar_token(project_id, token)
    if not user_id:
        raise ForbiddenError(message="Invalid or expired calendar token")
    member_result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    if not member_result.scalar_one_or_none():
        raise ForbiddenError(
            message="Calendar token is no longer valid for this project"
        )

    tasks_result = await db.execute(
        select(Task)
        .options(selectinload(Task.assignee))
        .where(Task.project_id == project_id, Task.due_date.is_not(None))
        .order_by(Task.due_date.asc())
    )
    tasks = tasks_result.scalars().all()

    def _ics_escape(value: str) -> str:
        return (
            value.replace("\\", "\\\\")
            .replace(";", "\\;")
            .replace(",", "\\,")
            .replace("\n", "\\n")
        )

    now_utc = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//ProjectHub//Project Calendar//EN",
        "CALSCALE:GREGORIAN",
    ]

    for task in tasks:
        due = task.due_date
        if not due:
            continue
        dt = due.strftime("%Y%m%d")
        assignee_name = (
            task.assignee.name if task.assignee and task.assignee.name else "Unassigned"
        )
        description_parts = []
        if task.description:
            description_parts.append(task.description)
        description_parts.append(f"Assignee: {assignee_name}")
        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:{task.id}@projecthub.app",
                f"DTSTAMP:{now_utc}",
                f"DTSTART;VALUE=DATE:{dt}",
                f"DTEND;VALUE=DATE:{dt}",
                f"SUMMARY:{_ics_escape(task.title)}",
                f"DESCRIPTION:{_ics_escape(' | '.join(description_parts))}",
                "END:VEVENT",
            ]
        )

    lines.append("END:VCALENDAR")
    return PlainTextResponse("\r\n".join(lines), media_type="text/calendar")


# ─── Helpers ───────────────────────────────────────────────────────────────────


async def _get_project_or_404(project_id: str, db: AsyncSession) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise NotFoundError(message="Project not found")
    return project


async def _assert_member(project_id: str, user: User, db: AsyncSession):
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == user.id
        )
    )
    if not result.scalar_one_or_none():
        raise ForbiddenError(message="Not a member of this project")
