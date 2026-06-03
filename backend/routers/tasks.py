from datetime import date
import re
from typing import Annotated
from fastapi import APIRouter, Depends, status, Query
from utils.exceptions import NotFoundError, ForbiddenError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from core.database import get_db
from core.dependencies import get_current_user
from models.task import Task
from models.project_member import ProjectMember
from models.user import User
from models.notification import Notification
from models.comment import Comment
from websocket.manager import manager
from schemas.schemas import (
    TaskCreate,
    TaskUpdate,
    TaskStatusUpdate,
    TaskOut,
    CommentCreate,
)
from utils.sanitize import sanitize_html
from services.activity_service import log_activity
from utils.cache import invalidate

from schemas.pagination import encode_cursor, decode_cursor
from sqlalchemy import or_, and_

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


async def _comment_counts(db: AsyncSession, task_ids: list) -> dict[str, int]:
    if not task_ids:
        return {}
    result = await db.execute(
        select(Comment.task_id, func.count(Comment.id))
        .where(Comment.task_id.in_(task_ids))
        .group_by(Comment.task_id)
    )
    return {str(row[0]): row[1] for row in result.all()}


def _task_to_dict(task: Task, comment_count: int = 0) -> dict:
    data = TaskOut.model_validate(task).model_dump()
    data["comment_count"] = comment_count
    return data


@router.get("")
async def list_tasks(
    project_id: str = Query(...),
    cursor: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    paginate: bool = Query(False),
    current_user: CurrentUser = None,
    db: DB = None,
):
    await _assert_member(project_id, current_user, db)

    if cursor or paginate:
        query = (
            select(Task)
            .options(selectinload(Task.assignee))
            .where(Task.project_id == project_id)
        )
        if cursor:
            cursor_dt, cursor_id = decode_cursor(cursor)
            query = query.where(
                or_(
                    Task.created_at < cursor_dt,
                    and_(Task.created_at == cursor_dt, Task.id < cursor_id),
                )
            )
        query = query.order_by(Task.created_at.desc(), Task.id.desc()).limit(limit + 1)
        result = await db.execute(query)
        items = result.scalars().all()

        has_more = len(items) > limit
        if has_more:
            items = items[:limit]
            last_item = items[-1]
            next_cursor = encode_cursor(last_item.created_at, str(last_item.id))
        else:
            next_cursor = None

        counts = await _comment_counts(db, [t.id for t in items])
        return {
            "items": [_task_to_dict(t, counts.get(str(t.id), 0)) for t in items],
            "next_cursor": next_cursor,
            "has_more": has_more,
        }

    result = await db.execute(
        select(Task)
        .options(selectinload(Task.assignee))
        .where(Task.project_id == project_id)
        .order_by(Task.position, Task.created_at)
    )
    tasks = result.scalars().all()
    counts = await _comment_counts(db, [t.id for t in tasks])
    return [_task_to_dict(t, counts.get(str(t.id), 0)) for t in tasks]


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
async def create_task(payload: TaskCreate, current_user: CurrentUser, db: DB):
    role = await _get_role(payload.project_id, current_user, db)
    if role not in ("admin", "project_lead", "owner", "member", "developer"):
        raise ForbiddenError(message="You need member permissions to create tasks")

    due_date = date.fromisoformat(payload.due_date) if payload.due_date else None

    clean_title = sanitize_html(payload.title)
    clean_description = (
        sanitize_html(payload.description)
        if payload.description
        else payload.description
    )

    task = Task(
        project_id=payload.project_id,
        title=clean_title,
        description=clean_description,
        status=payload.status,
        priority=payload.priority,
        story_points=payload.story_points,
        assignee_id=payload.assignee_id,
        due_date=due_date,
        position=payload.position,
    )
    db.add(task)
    await db.flush()

    await log_activity(
        db,
        project_id=str(payload.project_id),
        actor_id=str(current_user.id),
        action="task_created",
        target_id=str(task.id),
        target_type="task",
        metadata={"title": clean_title},
    )
    await db.commit()
    await db.refresh(task)
    await _invalidate_project_analytics_cache(str(task.project_id))

    result = await db.execute(
        select(Task).options(selectinload(Task.assignee)).where(Task.id == task.id)
    )
    task = result.scalar_one()

    if task.assignee_id:
        notif = Notification(
            user_id=task.assignee_id,
            type="task_assigned",
            content=f"You have been assigned to task: {task.title}",
        )
        db.add(notif)
        await db.commit()
        await db.refresh(notif)

        await manager.send_to_user(
            str(task.assignee_id),
            {
                "type": "notification",
                "notification": {
                    "id": str(notif.id),
                    "type": notif.type,
                    "content": notif.content,
                    "created_at": notif.created_at.isoformat(),
                },
            },
        )
        from core.celery_app import celery_app

        celery_app.send_task(
            "services.integrations.slack_notify",
            kwargs={
                "project_id": str(task.project_id),
                "event": "task_assigned",
                "message": f"You were assigned a task: {task.title}",
                "assignee_user_id": str(task.assignee_id),
                "mentioned_usernames": [],
            },
            queue="low_priority",
        )

    return task


@router.put("/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: str, payload: TaskUpdate, current_user: CurrentUser, db: DB
):
    task = await _get_task_or_404(task_id, db)
    previous_assignee_id = str(task.assignee_id) if task.assignee_id else None
    role = await _get_role(str(task.project_id), current_user, db)

    if role == "developer" and str(task.assignee_id) != str(current_user.id):
        raise ForbiddenError(message="Developers can only update their own tasks")
    if role == "viewer":
        raise ForbiddenError(message="Viewers cannot edit tasks")

    old_status = task.status

    for field, value in payload.model_dump(exclude_none=True).items():
        if field == "due_date" and value:
            value = date.fromisoformat(value)
            task.alert_sent = False
        setattr(task, field, value)

    await log_activity(
        db,
        project_id=str(task.project_id),
        actor_id=str(current_user.id),
        action="task_updated",
        target_id=str(task.id),
        target_type="task",
        metadata={"title": task.title},
    )
    await db.commit()

    if old_status != task.status:
        from services.webhooks import enqueue_project_webhooks

        await enqueue_project_webhooks(
            db,
            project_id=str(task.project_id),
            event="task_moved",
            data={
                "id": str(task.id),
                "title": task.title,
                "old_status": old_status,
                "new_status": task.status,
                "assignee_id": str(task.assignee_id) if task.assignee_id else None,
            },
        )

    await _invalidate_project_analytics_cache(str(task.project_id))
    if task.assignee_id and str(task.assignee_id) != (previous_assignee_id or ""):
        from core.celery_app import celery_app

        celery_app.send_task(
            "services.integrations.slack_notify",
            kwargs={
                "project_id": str(task.project_id),
                "event": "task_assigned",
                "message": f"You were assigned a task: {task.title}",
                "assignee_user_id": str(task.assignee_id),
                "mentioned_usernames": [],
            },
            queue="low_priority",
        )
    result = await db.execute(
        select(Task).options(selectinload(Task.assignee)).where(Task.id == task_id)
    )
    return result.scalar_one()


@router.patch("/{task_id}/status", response_model=TaskOut)
async def update_task_status(
    task_id: str, payload: TaskStatusUpdate, current_user: CurrentUser, db: DB
):
    task = await _get_task_or_404(task_id, db)
    role = await _get_role(str(task.project_id), current_user, db)

    if role == "viewer":
        raise ForbiddenError(message="Viewers cannot move tasks")

    old_status = task.status
    task.status = payload.status
    if payload.position is not None:
        task.position = payload.position

    await log_activity(
        db,
        project_id=str(task.project_id),
        actor_id=str(current_user.id),
        action="task_moved",
        target_id=str(task.id),
        target_type="task",
        metadata={
            "title": task.title,
            "from_status": old_status,
            "to_status": payload.status,
        },
    )
    await db.commit()

    from services.webhooks import enqueue_project_webhooks

    await enqueue_project_webhooks(
        db,
        project_id=str(task.project_id),
        event="task_moved",
        data={
            "id": str(task.id),
            "title": task.title,
            "old_status": old_status,
            "new_status": task.status,
            "assignee_id": str(task.assignee_id) if task.assignee_id else None,
        },
    )

    await _invalidate_project_analytics_cache(str(task.project_id))
    result = await db.execute(
        select(Task).options(selectinload(Task.assignee)).where(Task.id == task_id)
    )
    task = result.scalar_one()

    if task.assignee_id and str(task.assignee_id) != str(current_user.id):
        notif = Notification(
            user_id=task.assignee_id,
            type="task_status_changed",
            content=f"Task '{task.title}' status updated to {task.status}",
        )
        db.add(notif)
        await db.commit()
        await db.refresh(notif)

        await manager.send_to_user(
            str(task.assignee_id),
            {
                "type": "notification",
                "notification": {
                    "id": str(notif.id),
                    "type": notif.type,
                    "content": notif.content,
                    "created_at": notif.created_at.isoformat(),
                },
            },
        )

    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: str, current_user: CurrentUser, db: DB):
    task = await _get_task_or_404(task_id, db)
    role = await _get_role(str(task.project_id), current_user, db)

    if role not in ("admin", "project_lead"):
        raise ForbiddenError(message="Only admins and project leads can delete tasks")

    await db.delete(task)
    await db.commit()
    await _invalidate_project_analytics_cache(str(task.project_id))


# ─── Task comments ─────────────────────────────────────────────────────────────


@router.get("/{task_id}/comments")
async def list_comments(
    task_id: str,
    cursor: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    current_user: CurrentUser = None,
    db: DB = None,
):
    task = await _get_task_or_404(task_id, db)
    await _assert_member(str(task.project_id), current_user, db)

    query = (
        select(Comment)
        .options(
            selectinload(Comment.author),
            selectinload(Comment.replies).selectinload(Comment.author),
        )
        .where(Comment.task_id == task_id, Comment.parent_comment_id.is_(None))
    )
    if cursor:
        cursor_dt, cursor_id = decode_cursor(cursor)
        query = query.where(
            or_(
                Comment.created_at < cursor_dt,
                and_(Comment.created_at == cursor_dt, Comment.id < cursor_id),
            )
        )
    query = query.order_by(Comment.created_at.desc(), Comment.id.desc()).limit(
        limit + 1
    )
    result = await db.execute(query)
    top_level = result.scalars().unique().all()

    has_more = len(top_level) > limit
    if has_more:
        top_level = top_level[:limit]
        next_cursor = encode_cursor(top_level[-1].created_at, str(top_level[-1].id))
    else:
        next_cursor = None

    def _serialize(c: Comment) -> dict:
        return {
            "id": str(c.id),
            "task_id": str(c.task_id),
            "author_id": str(c.author_id),
            "content": c.content,
            "parent_comment_id": str(c.parent_comment_id)
            if c.parent_comment_id
            else None,
            "created_at": c.created_at.isoformat(),
            "author": {
                "id": str(c.author.id),
                "name": c.author.name,
                "avatar_url": c.author.avatar_url,
            }
            if c.author
            else None,
            "replies": [
                _serialize(r) for r in sorted(c.replies, key=lambda x: x.created_at)
            ],
        }

    return {
        "items": [_serialize(c) for c in top_level],
        "next_cursor": next_cursor,
        "has_more": has_more,
    }


@router.post("/{task_id}/comments", status_code=status.HTTP_201_CREATED)
async def create_comment(
    task_id: str,
    payload: CommentCreate,
    current_user: CurrentUser,
    db: DB,
):
    task = await _get_task_or_404(task_id, db)
    await _assert_member(str(task.project_id), current_user, db)

    parent_id = payload.parent_comment_id
    if parent_id:
        parent_res = await db.execute(
            select(Comment).where(Comment.id == parent_id, Comment.task_id == task_id)
        )
        parent = parent_res.scalar_one_or_none()
        if not parent:
            raise NotFoundError(message="Parent comment not found")
        if parent.parent_comment_id is not None:
            raise ForbiddenError(message="Replies are limited to 2 levels deep")

    comment = Comment(
        task_id=task_id,
        author_id=current_user.id,
        content=sanitize_html(payload.content),
        parent_comment_id=parent_id,
    )
    db.add(comment)
    await db.flush()

    await log_activity(
        db,
        project_id=str(task.project_id),
        actor_id=str(current_user.id),
        action="comment_added",
        target_id=str(task.id),
        target_type="task",
        metadata={"comment_id": str(comment.id), "task_title": task.title},
    )
    await db.commit()
    await db.refresh(comment)

    author_res = await db.execute(select(User).where(User.id == current_user.id))
    author = author_res.scalar_one()

    comment_data = {
        "id": str(comment.id),
        "task_id": str(comment.task_id),
        "author_id": str(comment.author_id),
        "content": comment.content,
        "parent_comment_id": str(comment.parent_comment_id)
        if comment.parent_comment_id
        else None,
        "created_at": comment.created_at.isoformat(),
        "author": {
            "id": str(author.id),
            "name": author.name,
            "avatar_url": author.avatar_url,
        },
        "replies": [],
    }

    await manager.broadcast_to_room(
        f"project_{task.project_id}",
        {
            "type": "task:comment_added",
            "task_id": str(task.id),
            "comment": comment_data,
        },
    )

    mentioned_usernames = sorted(
        {
            mention.lower()
            for mention in re.findall(r"@([a-zA-Z0-9_\-]+)", comment.content or "")
        }
    )
    if mentioned_usernames:
        from core.celery_app import celery_app

        celery_app.send_task(
            "services.integrations.slack_notify",
            kwargs={
                "project_id": str(task.project_id),
                "event": "comment_mention",
                "message": f"{author.name or 'A teammate'} mentioned users in a comment on '{task.title}'",
                "assignee_user_id": None,
                "mentioned_usernames": mentioned_usernames,
            },
            queue="low_priority",
        )

    return comment_data


@router.delete(
    "/{task_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_comment(
    task_id: str,
    comment_id: str,
    current_user: CurrentUser,
    db: DB,
):
    task = await _get_task_or_404(task_id, db)
    role = await _get_role(str(task.project_id), current_user, db)

    result = await db.execute(
        select(Comment).where(Comment.id == comment_id, Comment.task_id == task_id)
    )
    comment = result.scalar_one_or_none()
    if not comment:
        raise NotFoundError(message="Comment not found")

    is_author = str(comment.author_id) == str(current_user.id)
    is_admin = role in ("admin", "project_lead", "owner")
    if not is_author and not is_admin:
        raise ForbiddenError(
            message="Only the author or project admin can delete this comment"
        )

    await db.delete(comment)
    await db.commit()


# ─── Helpers ───────────────────────────────────────────────────────────────────


async def _get_task_or_404(task_id: str, db: AsyncSession) -> Task:
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise NotFoundError(message="Task not found")
    return task


async def _assert_member(project_id: str, user: User, db: AsyncSession):
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == user.id
        )
    )
    if not result.scalar_one_or_none():
        raise ForbiddenError(message="Not a member of this project")


async def _get_role(project_id: str, user: User, db: AsyncSession) -> str:
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id, ProjectMember.user_id == user.id
        )
    )
    member = result.scalar_one_or_none()
    if not member:
        raise ForbiddenError(message="Not a member of this project")
    return member.role


async def _invalidate_project_analytics_cache(project_id: str):
    await invalidate(f"project_analytics:{project_id}")
    await invalidate(f"cache:*:p_{project_id}")
