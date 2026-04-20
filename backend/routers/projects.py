from datetime import date
from uuid import UUID
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from core.database import get_db
from core.dependencies import get_current_user, require_role
from models.project import Project
from models.project_member import ProjectMember
from models.task import Task
from models.user import User
from models.channel import Channel
from models.channel_member import ChannelMember
from schemas.schemas import ProjectCreate, ProjectUpdate, ProjectOut, MemberAdd, MemberRoleUpdate, MemberOut
from services.github_service import sync_repo_issues

router = APIRouter(prefix="/api/projects", tags=["projects"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.get("", response_model=list[ProjectOut])
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

    # Trigger initial GitHub sync in background if repo_url provided
    if project.repo_url:
        import asyncio
        asyncio.create_task(sync_repo_issues(str(project.id), project.repo_url))

    return project


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(project_id: str, current_user: CurrentUser, db: DB):
    project = await _get_project_or_404(project_id, db)
    await _assert_member(project_id, current_user, db)
    return project


@router.put("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: str,
    payload: ProjectUpdate,
    current_user: CurrentUser,
    db: DB,
    _=Depends(require_role("admin", "project_lead")),
):
    project = await _get_project_or_404(project_id, db)
    for field, value in payload.model_dump(exclude_none=True).items():
        if field == "deadline" and value:
            value = date.fromisoformat(value)
        setattr(project, field, value)
    await db.commit()
    await db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    current_user: CurrentUser,
    db: DB,
    _=Depends(require_role("admin")),
):
    project = await _get_project_or_404(project_id, db)
    await db.delete(project)
    await db.commit()


@router.get("/{project_id}/progress")
async def get_project_progress(project_id: str, current_user: CurrentUser, db: DB):
    await _assert_member(project_id, current_user, db)

    total_q = await db.execute(select(func.count(Task.id)).where(Task.project_id == project_id))
    total = total_q.scalar() or 0

    done_q = await db.execute(
        select(func.count(Task.id)).where(Task.project_id == project_id, Task.status == "done")
    )
    done = done_q.scalar() or 0

    in_progress_q = await db.execute(
        select(func.count(Task.id)).where(Task.project_id == project_id, Task.status == "in_progress")
    )
    in_progress = in_progress_q.scalar() or 0

    todo = total - done - in_progress
    percent = round((done / total) * 100) if total > 0 else 0

    return {"total": total, "done": done, "in_progress": in_progress, "todo": todo, "percent": percent}


@router.get("/{project_id}/members", response_model=list[MemberOut])
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
        raise HTTPException(status_code=400, detail="Either user_id or email is required")

    user_query = select(User)
    if payload.user_id:
        user_query = user_query.where(User.id == payload.user_id)
    else:
        user_query = user_query.where(User.email == payload.email.lower().strip())

    # Verify user exists
    user_result = await db.execute(user_query)
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Check not already a member
    existing = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == user.id
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="User is already a member")

    member = ProjectMember(project_id=project_id, user_id=user.id, role=payload.role)
    db.add(member)
    
    # Auto-add to all project group channels
    channels_res = await db.execute(
        select(Channel).where(Channel.project_id == project_id, Channel.type == "group")
    )
    for channel in channels_res.scalars().all():
        db.add(ChannelMember(channel_id=channel.id, user_id=user.id))

    await db.commit()
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
        raise HTTPException(status_code=404, detail="Member not found")

    member.role = payload.role
    await db.commit()
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


@router.delete("/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
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
        delete(ChannelMember)
        .where(
            ChannelMember.user_id == user_id,
            ChannelMember.channel_id.in_(
                select(Channel.id).where(Channel.project_id == project_id)
            )
        )
    )
    
    await db.delete(member)
    await db.commit()


# ─── Helpers ───────────────────────────────────────────────────────────────────

async def _get_project_or_404(project_id: str, db: AsyncSession) -> Project:
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def _assert_member(project_id: str, user: User, db: AsyncSession):
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == user.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this project")
