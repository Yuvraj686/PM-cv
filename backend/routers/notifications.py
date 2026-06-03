import logging
from typing import Annotated
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from core.database import get_db
from core.dependencies import get_current_user
from models.user import User
from models.notification import Notification
from schemas.schemas import NotificationOut

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/notifications", tags=["notifications"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.get("", response_model=list[NotificationOut])
async def list_notifications(current_user: CurrentUser, db: DB):
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
    )
    return result.scalars().all()


@router.patch("/{notification_id}/read")
async def mark_read(notification_id: str, current_user: CurrentUser, db: DB):
    await db.execute(
        update(Notification)
        .where(
            Notification.id == notification_id, Notification.user_id == current_user.id
        )
        .values(read=True)
    )
    await db.commit()
    return {"message": "Notification marked as read"}


@router.patch("/read-all")
async def mark_all_read(current_user: CurrentUser, db: DB):
    await db.execute(
        update(Notification)
        .where(Notification.user_id == current_user.id, not Notification.read)
        .values(read=True)
    )
    await db.commit()
    return {"message": "All notifications marked as read"}
