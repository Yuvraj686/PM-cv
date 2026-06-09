"""Activity feed logging and real-time broadcast."""

import structlog
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models.activity import Activity
from models.user import User
from services.webhooks import enqueue_project_webhooks
from websocket.manager import manager

logger = structlog.get_logger()

VALID_ACTIONS = frozenset(
    {
        "task_created",
        "task_updated",
        "task_moved",
        "member_invited",
        "comment_added",
        "github_push",
    }
)


def _serialize_activity(activity: Activity, actor: User | None) -> dict:
    return {
        "id": str(activity.id),
        "project_id": str(activity.project_id),
        "action": activity.action,
        "target_id": str(activity.target_id) if activity.target_id else None,
        "target_type": activity.target_type,
        "metadata": activity.metadata_ or {},
        "created_at": activity.created_at.isoformat(),
        "actor": (
            {
                "id": str(actor.id),
                "name": actor.name,
                "avatar_url": actor.avatar_url,
            }
            if actor
            else None
        ),
    }


async def log_activity(
    db: AsyncSession,
    *,
    project_id: str,
    actor_id: str | None,
    action: str,
    target_id: str | None = None,
    target_type: str | None = None,
    metadata: dict | None = None,
    broadcast: bool = True,
) -> Activity:
    if action not in VALID_ACTIONS:
        logger.warning("invalid_activity_action", action=action)
    activity = Activity(
        project_id=project_id,
        actor_id=actor_id,
        action=action,
        target_id=target_id,
        target_type=target_type,
        metadata_=metadata or {},
    )
    db.add(activity)
    await db.flush()

    if broadcast:
        actor = None
        if actor_id:
            res = await db.execute(select(User).where(User.id == actor_id))
            actor = res.scalar_one_or_none()
        await manager.broadcast_to_room(
            f"project_{project_id}",
            {"type": "activity:new", "activity": _serialize_activity(activity, actor)},
        )

    try:
        payload_data = {
            "target_id": target_id,
            "target_type": target_type,
            "metadata": metadata or {},
            "actor_id": actor_id,
        }
        if target_type == "task" and target_id:
            payload_data["id"] = str(target_id)

        await enqueue_project_webhooks(
            db,
            project_id=str(project_id),
            event=action,
            data=payload_data,
        )
    except Exception as exc:  # pragma: no cover - background integration safety
        logger.warning(
            "webhook_enqueue_failed",
            project_id=project_id,
            action=action,
            error=str(exc),
        )

    return activity
