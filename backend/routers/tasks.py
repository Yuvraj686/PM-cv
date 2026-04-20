from datetime import date
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from core.database import get_db
from core.dependencies import get_current_user
from models.task import Task
from models.project_member import ProjectMember
from models.user import User
from models.notification import Notification
from websocket.manager import manager
from schemas.schemas import TaskCreate, TaskUpdate, TaskStatusUpdate, TaskOut

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.get("", response_model=list[TaskOut])
async def list_tasks(
    project_id: str = Query(...),
    current_user: CurrentUser = None,
    db: DB = None,
):
    await _assert_member(project_id, current_user, db)
    result = await db.execute(
        select(Task)
        .options(selectinload(Task.assignee))
        .where(Task.project_id == project_id)
        .order_by(Task.position, Task.created_at)
    )
    return result.scalars().all()


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
async def create_task(payload: TaskCreate, current_user: CurrentUser, db: DB):
    role = await _get_role(payload.project_id, current_user, db)
    if role not in ("admin", "project_lead"):
        raise HTTPException(status_code=403, detail="Only admins and project leads can create tasks")

    due_date = date.fromisoformat(payload.due_date) if payload.due_date else None
    task = Task(
        project_id=payload.project_id,
        title=payload.title,
        description=payload.description,
        status=payload.status,
        priority=payload.priority,
        assignee_id=payload.assignee_id,
        due_date=due_date,
        position=payload.position,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    # Reload with assignee
    result = await db.execute(
        select(Task).options(selectinload(Task.assignee)).where(Task.id == task.id)
    )
    task = result.scalar_one()

    # Create notification for assignee
    if task.assignee_id:
        notif = Notification(
            user_id=task.assignee_id,
            type="task_assigned",
            content=f"You have been assigned to task: {task.title}",
        )
        db.add(notif)
        await db.commit()
        await db.refresh(notif)
        
        # WebSocket alert
        await manager.send_to_user(str(task.assignee_id), {
            "type": "notification",
            "notification": {
                "id": str(notif.id),
                "type": notif.type,
                "content": notif.content,
                "created_at": notif.created_at.isoformat(),
            }
        })

    return task


@router.put("/{task_id}", response_model=TaskOut)
async def update_task(task_id: str, payload: TaskUpdate, current_user: CurrentUser, db: DB):
    task = await _get_task_or_404(task_id, db)
    role = await _get_role(str(task.project_id), current_user, db)

    # Developers can only update their own tasks
    if role == "developer" and str(task.assignee_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Developers can only update their own tasks")
    if role == "viewer":
        raise HTTPException(status_code=403, detail="Viewers cannot edit tasks")

    for field, value in payload.model_dump(exclude_none=True).items():
        if field == "due_date" and value:
            value = date.fromisoformat(value)
            task.alert_sent = False  # reset alert when due_date changes
        setattr(task, field, value)

    await db.commit()
    result = await db.execute(
        select(Task).options(selectinload(Task.assignee)).where(Task.id == task_id)
    )
    return result.scalar_one()


@router.patch("/{task_id}/status", response_model=TaskOut)
async def update_task_status(task_id: str, payload: TaskStatusUpdate, current_user: CurrentUser, db: DB):
    task = await _get_task_or_404(task_id, db)
    role = await _get_role(str(task.project_id), current_user, db)

    if role == "viewer":
        raise HTTPException(status_code=403, detail="Viewers cannot move tasks")

    task.status = payload.status
    if payload.position is not None:
        task.position = payload.position

    await db.commit()
    result = await db.execute(
        select(Task).options(selectinload(Task.assignee)).where(Task.id == task_id)
    )
    task = result.scalar_one()

    # Notify assignee if status changed by someone else
    if task.assignee_id and str(task.assignee_id) != str(current_user.id):
        notif = Notification(
            user_id=task.assignee_id,
            type="task_status_changed",
            content=f"Task '{task.title}' status updated to {task.status}",
        )
        db.add(notif)
        await db.commit()
        await db.refresh(notif)
        
        await manager.send_to_user(str(task.assignee_id), {
            "type": "notification",
            "notification": {
                "id": str(notif.id),
                "type": notif.type,
                "content": notif.content,
                "created_at": notif.created_at.isoformat(),
            }
        })

    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: str, current_user: CurrentUser, db: DB):
    task = await _get_task_or_404(task_id, db)
    role = await _get_role(str(task.project_id), current_user, db)

    if role not in ("admin", "project_lead"):
        raise HTTPException(status_code=403, detail="Only admins and project leads can delete tasks")

    await db.delete(task)
    await db.commit()


# ─── Helpers ───────────────────────────────────────────────────────────────────

async def _get_task_or_404(task_id: str, db: AsyncSession) -> Task:
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


async def _assert_member(project_id: str, user: User, db: AsyncSession):
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == user.id
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a member of this project")


async def _get_role(project_id: str, user: User, db: AsyncSession) -> str:
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == user.id
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this project")
    return member.role
