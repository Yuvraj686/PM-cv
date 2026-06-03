import json
import logging
import uuid
from typing import Annotated
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_
from sqlalchemy.orm import selectinload
from core.database import get_db, AsyncSessionLocal
from core.security import decode_token
from core.dependencies import get_current_user
from models.channel import Channel
from models.channel_member import ChannelMember
from models.message import Message
from models.notification import Notification
from models.user import User
from models.project_member import ProjectMember
from schemas.schemas import ChannelCreate, ChannelOut
from websocket.manager import manager
from utils.sanitize import sanitize_html
from utils.exceptions import ValidationError, ForbiddenError
from utils import presence as presence_util
from schemas.pagination import encode_cursor, decode_cursor

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/chat", tags=["chat"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


def _dm_room_id(a: str, b: str) -> str:
    lo, hi = sorted([str(a), str(b)])
    return f"dm_{lo}_{hi}"


async def _channel_room_id(channel: Channel, db: AsyncSession) -> str:
    if channel.type == "group" and channel.project_id:
        return f"project_{channel.project_id}"
    if channel.type == "dm":
        members = await db.execute(
            select(ChannelMember).where(ChannelMember.channel_id == channel.id)
        )
        member_ids = [str(m.user_id) for m in members.scalars().all()]
        if len(member_ids) >= 2:
            return _dm_room_id(member_ids[0], member_ids[1])
    return f"channel_{channel.id}"


async def _fetch_user_brief(user_id: str, db: AsyncSession) -> dict | None:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        return None
    return {
        "id": str(user.id),
        "name": user.name,
        "avatar": user.avatar_url,
    }


async def _presence_join(room_id: str, user_id: str, websocket: WebSocket):
    if not room_id.startswith("project_"):
        return
    project_id = room_id.replace("project_", "", 1)
    async with AsyncSessionLocal() as db:
        user_brief = await _fetch_user_brief(user_id, db)
    if not user_brief:
        return

    await presence_util.join(project_id, user_id)
    await manager.broadcast_to_room(
        room_id,
        {"type": "presence:joined", "user": user_brief},
        exclude_user=user_id,
    )

    # Send snapshot of current viewers to the joiner
    async with AsyncSessionLocal() as db:
        present_ids = await presence_util.get_user_ids(project_id)
        users = []
        for uid in present_ids:
            brief = await _fetch_user_brief(uid, db)
            if brief:
                users.append(brief)
    await websocket.send_text(json.dumps({"type": "presence:snapshot", "users": users}))


async def _presence_leave(room_id: str, user_id: str):
    if not room_id.startswith("project_"):
        return
    project_id = room_id.replace("project_", "", 1)
    await presence_util.leave(project_id, user_id)
    await manager.broadcast_to_room(
        room_id,
        {"type": "presence:left", "user_id": user_id},
        exclude_user=user_id,
    )


async def _serialize_channel(channel: Channel, db: AsyncSession) -> dict:
    return {
        "id": channel.id,
        "project_id": channel.project_id,
        "name": channel.name,
        "type": channel.type,
        "room_id": await _channel_room_id(channel, db),
        "created_at": channel.created_at,
    }


@router.get("/channels", response_model=list[ChannelOut])
async def list_channels(
    project_id: str = Query(None),
    current_user: CurrentUser = None,
    db: DB = None,
):
    if project_id:
        result = await db.execute(
            select(Channel)
            .join(ChannelMember, ChannelMember.channel_id == Channel.id)
            .where(
                Channel.project_id == project_id,
                ChannelMember.user_id == current_user.id,
            )
        )
    else:
        result = await db.execute(
            select(Channel)
            .join(ChannelMember, ChannelMember.channel_id == Channel.id)
            .where(ChannelMember.user_id == current_user.id)
        )
    channels = result.scalars().all()
    return [await _serialize_channel(ch, db) for ch in channels]


@router.post("/channels", response_model=ChannelOut, status_code=201)
async def create_channel(payload: ChannelCreate, current_user: CurrentUser, db: DB):
    if payload.type == "dm":
        raise ValidationError(message="Use the DM endpoint to create direct messages")
    channel = Channel(
        project_id=payload.project_id,
        name=payload.name,
        type=payload.type,
    )
    db.add(channel)
    await db.flush()

    # Add creator
    db.add(ChannelMember(channel_id=channel.id, user_id=current_user.id))

    # If this is a project group channel, add all project members so everyone shares the room.
    if payload.project_id and payload.type == "group":
        pm = await db.execute(
            select(ProjectMember.user_id).where(
                ProjectMember.project_id == payload.project_id
            )
        )
        for (uid,) in pm.all():
            if str(uid) != str(current_user.id):
                db.add(ChannelMember(channel_id=channel.id, user_id=uid))

    # Add other members
    for uid in payload.member_ids:
        if uid != str(current_user.id):
            db.add(ChannelMember(channel_id=channel.id, user_id=uid))

    await db.commit()
    await db.refresh(channel)
    return await _serialize_channel(channel, db)


@router.post("/dm/{other_user_id}", response_model=ChannelOut, status_code=201)
async def get_or_create_dm(other_user_id: str, current_user: CurrentUser, db: DB):
    try:
        other_uuid = uuid.UUID(other_user_id)
    except (TypeError, ValueError):
        raise ValidationError(message="Invalid user id")

    if str(other_uuid) == str(current_user.id):
        raise ValidationError(message="Cannot DM yourself")

    # Find existing DM channel that has exactly these two members
    my_channels = await db.execute(
        select(Channel)
        .join(ChannelMember, ChannelMember.channel_id == Channel.id)
        .where(Channel.type == "dm", ChannelMember.user_id == current_user.id)
    )
    for ch in my_channels.scalars().all():
        members = await db.execute(
            select(ChannelMember).where(ChannelMember.channel_id == ch.id)
        )
        member_ids = sorted([str(m.user_id) for m in members.scalars().all()])
        if member_ids == sorted([str(current_user.id), str(other_uuid)]):
            return await _serialize_channel(ch, db)

    # Create DM channel
    channel = Channel(project_id=None, name=None, type="dm")
    db.add(channel)
    await db.flush()
    db.add(ChannelMember(channel_id=channel.id, user_id=current_user.id))
    db.add(ChannelMember(channel_id=channel.id, user_id=other_uuid))
    await db.commit()
    await db.refresh(channel)
    return await _serialize_channel(channel, db)


@router.get("/channels/{channel_id}/messages")
async def get_messages(
    channel_id: str,
    skip: int = 0,
    limit: int = 50,
    cursor: str | None = Query(None),
    paginate: bool = Query(False),
    current_user: CurrentUser = None,
    db: DB = None,
):
    # Verify membership
    result = await db.execute(
        select(ChannelMember).where(
            ChannelMember.channel_id == channel_id,
            ChannelMember.user_id == current_user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise ForbiddenError(message="Not a member of this channel")

    if cursor or paginate:
        query = (
            select(Message)
            .options(selectinload(Message.sender))
            .where(Message.channel_id == channel_id)
        )
        if cursor:
            cursor_dt, cursor_id = decode_cursor(cursor)
            query = query.where(
                or_(
                    Message.created_at < cursor_dt,
                    and_(Message.created_at == cursor_dt, Message.id < cursor_id),
                )
            )
        query = query.order_by(Message.created_at.desc(), Message.id.desc()).limit(
            limit + 1
        )
        result = await db.execute(query)
        items = list(result.scalars().all())

        has_more = len(items) > limit
        if has_more:
            items = items[:limit]
            last_item = items[-1]
            next_cursor = encode_cursor(last_item.created_at, str(last_item.id))
        else:
            next_cursor = None

        # Reverse to chronological order (oldest first) for chat rendering
        items.reverse()
        return {"items": items, "next_cursor": next_cursor, "has_more": has_more}

    # Backward-compatible flat array response
    result = await db.execute(
        select(Message)
        .options(selectinload(Message.sender))
        .where(Message.channel_id == channel_id)
        .order_by(Message.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    messages = result.scalars().all()
    return list(reversed(messages))


# ─── WebSocket Endpoint ────────────────────────────────────────────────────────


@router.websocket("/ws/{room_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, user_id: str):
    # Authenticate via token query param
    try:
        token = websocket.query_params.get("token", "")
        payload = decode_token(token)
        if not payload or payload.get("sub") != user_id:
            await websocket.close(code=4001)
            return
    except Exception as e:
        logger.error(f"WebSocket handshake JWT validation failed: {e}")
        try:
            await websocket.close(code=4001)
        except Exception:
            pass
        return

    # Verify room access
    try:
        if room_id.startswith("project_"):
            project_id = room_id.replace("project_", "")
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(ProjectMember).where(
                        ProjectMember.project_id == project_id,
                        ProjectMember.user_id == user_id,
                    )
                )
                if not result.scalar_one_or_none():
                    await websocket.close(code=4003)
                    return
        elif room_id.startswith("dm_"):
            if user_id not in room_id:
                await websocket.close(code=4003)
                return
    except Exception as e:
        logger.error(f"WebSocket room access verification failed: {e}")
        try:
            await websocket.close(code=4003)
        except Exception:
            pass
        return

    try:
        await manager.connect(room_id, user_id, websocket)
    except Exception as e:
        logger.error(f"WebSocket manager connection failed: {e}")
        return

    # Auto-join presence for project rooms (Kanban, activity, etc.)
    if room_id.startswith("project_"):
        try:
            await _presence_join(room_id, user_id, websocket)
        except Exception as e:
            logger.error(f"WebSocket presence join failed: {e}")

    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)
            event_type = data.get("type", "chat_message")

            if event_type == "chat_message":
                await _handle_chat_message(room_id, user_id, data)
            elif event_type == "typing":
                await manager.broadcast_to_room(
                    room_id,
                    {
                        "type": "typing",
                        "user_id": user_id,
                        "is_typing": data.get("is_typing", True),
                    },
                    exclude_user=user_id,
                )
            elif event_type == "presence:join":
                if room_id.startswith("project_"):
                    project_id = room_id.replace("project_", "", 1)
                    await presence_util.heartbeat(project_id, user_id)
                    async with AsyncSessionLocal() as db:
                        user_brief = await _fetch_user_brief(user_id, db)
                    if user_brief:
                        await manager.broadcast_to_room(
                            room_id,
                            {"type": "presence:joined", "user": user_brief},
                            exclude_user=user_id,
                        )
            elif event_type == "presence:leave":
                await _presence_leave(room_id, user_id)
            elif event_type == "ping":
                if room_id.startswith("project_"):
                    project_id = room_id.replace("project_", "", 1)
                    await presence_util.heartbeat(project_id, user_id)
                await websocket.send_text(json.dumps({"type": "pong"}))

    except WebSocketDisconnect:
        manager.disconnect(room_id, user_id)
        if room_id.startswith("project_"):
            await _presence_leave(room_id, user_id)
        else:
            await manager.broadcast_to_room(
                room_id,
                {"type": "user_left", "user_id": user_id},
            )
    except Exception as e:
        logger.error(f"WebSocket error in loop for room {room_id}, user {user_id}: {e}")
        manager.disconnect(room_id, user_id)
        if room_id.startswith("project_"):
            try:
                await _presence_leave(room_id, user_id)
            except Exception:
                pass
        else:
            try:
                await manager.broadcast_to_room(
                    room_id,
                    {"type": "user_left", "user_id": user_id},
                )
            except Exception:
                pass


async def _handle_chat_message(room_id: str, sender_id: str, data: dict):
    content = data.get("content", "").strip()
    content = sanitize_html(content)  # Sanitize user input
    channel_id = data.get("channel_id")
    if not content or not channel_id:
        return

    async with AsyncSessionLocal() as db:
        # Enforce channel membership for sender
        mem = await db.execute(
            select(ChannelMember).where(
                ChannelMember.channel_id == channel_id,
                ChannelMember.user_id == sender_id,
            )
        )
        if not mem.scalar_one_or_none():
            return

        msg = Message(
            channel_id=channel_id,
            sender_id=sender_id,
            content=content,
            message_type=data.get("message_type", "text"),
        )
        db.add(msg)
        await db.commit()
        await db.refresh(msg)

        result = await db.execute(
            select(Message)
            .options(selectinload(Message.sender))
            .where(Message.id == msg.id)
        )
        msg = result.scalar_one()

        # If DM: create unread notification for the other member and push via user room
        ch = await db.execute(select(Channel).where(Channel.id == channel_id))
        channel = ch.scalar_one_or_none()
        if channel and channel.type == "dm":
            members = await db.execute(
                select(ChannelMember).where(ChannelMember.channel_id == channel_id)
            )
            member_ids = [str(m.user_id) for m in members.scalars().all()]
            other_id = next((uid for uid in member_ids if uid != str(sender_id)), None)
            if other_id:
                notif = Notification(
                    user_id=other_id,
                    type="dm_unread",
                    content=f"New message: {msg.content[:120]}",
                )
                db.add(notif)
                await db.commit()
                await db.refresh(notif)
                await manager.send_to_user(
                    other_id,
                    {
                        "type": "notification",
                        "notification": {
                            "id": str(notif.id),
                            "type": notif.type,
                            "content": notif.content,
                            "read": notif.read,
                            "created_at": notif.created_at.isoformat(),
                        },
                    },
                )

    broadcast_data = {
        "type": "chat_message",
        "message": {
            "id": str(msg.id),
            "channel_id": str(msg.channel_id),
            "sender_id": str(msg.sender_id) if msg.sender_id else None,
            "content": msg.content,
            "message_type": msg.message_type,
            "created_at": msg.created_at.isoformat(),
            "sender": {
                "id": str(msg.sender.id),
                "name": msg.sender.name,
                "avatar_url": msg.sender.avatar_url,
            }
            if msg.sender
            else None,
        },
    }
    await manager.broadcast_to_room(room_id, broadcast_data)
