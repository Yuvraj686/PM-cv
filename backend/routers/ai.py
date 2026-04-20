import json
import logging
from typing import Annotated, AsyncGenerator
from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from core.database import get_db
from core.dependencies import get_current_user
from models.user import User
from models.message import Message
from models.channel import Channel
from models.channel_member import ChannelMember
from schemas.schemas import AIChatRequest
from services.ai_service import build_project_context, stream_chat_response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai", tags=["ai"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.post("/chat/{project_id}")
async def ai_chat(
    project_id: str,
    payload: AIChatRequest,
    current_user: CurrentUser,
    db: DB,
):
    """Stream AI assistant response using SSE."""
    context = await build_project_context(project_id, db)

    # Build message history for Claude
    messages = [{"role": msg.role, "content": msg.content} for msg in payload.history]
    messages.append({"role": "user", "content": payload.message})

    async def generate() -> AsyncGenerator[str, None]:
        full_response = ""
        try:
            async for chunk in stream_chat_response(messages, context):
                full_response += chunk
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        except Exception as e:
            logger.error(f"AI stream error: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            yield f"data: {json.dumps({'done': True, 'full_response': full_response})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/history/{project_id}")
async def get_ai_history(project_id: str, current_user: CurrentUser, db: DB):
    """Get AI chat history for this user+project (from the AI channel)."""
    # Find the AI channel for this project
    result = await db.execute(
        select(Channel)
        .join(ChannelMember, ChannelMember.channel_id == Channel.id)
        .where(
            Channel.project_id == project_id,
            Channel.name == "ai-assistant",
            ChannelMember.user_id == current_user.id,
        )
    )
    channel = result.scalar_one_or_none()

    if not channel:
        return []

    msgs = await db.execute(
        select(Message)
        .where(Message.channel_id == channel.id)
        .order_by(Message.created_at)
        .limit(100)
    )
    return [
        {
            "role": "assistant" if m.message_type == "ai_summary" else "user",
            "content": m.content,
            "created_at": m.created_at.isoformat(),
        }
        for m in msgs.scalars().all()
    ]
