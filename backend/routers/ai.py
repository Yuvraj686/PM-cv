import json
import uuid
import logging
from typing import Annotated, AsyncGenerator

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from core.database import get_db
from core.dependencies import get_current_user
from core.security import get_redis_client
from models.user import User
from models.message import Message
from models.channel import Channel
from models.channel_member import ChannelMember
from models.project_member import ProjectMember
from models.task import Task
from schemas.schemas import (
    AIChatRequest,
    AIGenerateTasksRequest,
    AITranscriptRequest,
    AIImproveTextRequest,
    AIAcceptTasksRequest,
)
from services.ai_service import build_project_context, stream_chat_response
from services.ai_openai import (
    analyze_project_risk,
    extract_tasks_from_transcript,
    stream_improve_text,
)
from services.ai_tasks import generate_tasks_celery
from utils.ai_usage import check_and_increment_ai_usage, get_ai_usage
from utils.exceptions import ForbiddenError, RateLimitError, NotFoundError
from core.celery_app import celery_app

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai", tags=["ai"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]

RISK_CACHE_TTL = 3600


async def _assert_ai_allowed(user: User) -> None:
    allowed, used, limit = await check_and_increment_ai_usage(str(user.id))
    if not allowed:
        raise RateLimitError(
            message="Daily AI limit reached. Resets at midnight UTC.",
            detail={"used": used, "limit": limit},
        )


async def _assert_project_member(project_id: str, user: User, db: AsyncSession) -> None:
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user.id,
        )
    )
    if not result.scalar_one_or_none():
        raise ForbiddenError(message="Not a member of this project")


# ─── Existing chat endpoints (unchanged) ───────────────────────────────────────


@router.post("/chat/{project_id}")
async def ai_chat(
    project_id: str,
    payload: AIChatRequest,
    current_user: CurrentUser,
    db: DB,
):
    """Stream AI assistant response using SSE."""
    context = await build_project_context(project_id, db)

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


# ─── AI usage ──────────────────────────────────────────────────────────────────


@router.get("/usage")
async def ai_usage(current_user: CurrentUser):
    """Return remaining AI requests for today."""
    return await get_ai_usage(str(current_user.id))


# ─── Task generator (Celery async) ─────────────────────────────────────────────


@router.post("/generate-tasks")
async def start_generate_tasks(
    payload: AIGenerateTasksRequest,
    current_user: CurrentUser,
    db: DB,
):
    await _assert_project_member(payload.project_id, current_user, db)
    await _assert_ai_allowed(current_user)

    celery_task = generate_tasks_celery.delay(
        payload.project_id,
        payload.project_goal,
        payload.context,
        str(current_user.id),
    )
    return {"task_id": celery_task.id}


@router.get("/generate-tasks/{task_id}")
async def get_generate_tasks_result(task_id: str, current_user: CurrentUser, db: DB):
    result = AsyncResult(task_id, app=celery_app)

    if result.state == "PENDING":
        return {"status": "pending", "tasks": []}
    if result.state == "STARTED":
        return {"status": "processing", "tasks": []}
    if result.state == "FAILURE":
        return {"status": "error", "error": str(result.result), "tasks": []}

    data = result.result or {}
    if data.get("status") == "error":
        return {
            "status": "error",
            "error": data.get("error", "Unknown error"),
            "tasks": [],
        }

    project_id = data.get("project_id")
    if project_id:
        await _assert_project_member(project_id, current_user, db)

    return {
        "status": "success",
        "tasks": data.get("tasks", []),
        "project_id": project_id,
    }


@router.post("/generate-tasks/{task_id}/accept")
async def accept_generated_tasks(
    task_id: str,
    payload: AIAcceptTasksRequest,
    current_user: CurrentUser,
    db: DB,
):
    """Keep only selected auto-generated tasks; delete the rest."""
    result = AsyncResult(task_id, app=celery_app)
    if not result.ready() or not result.result:
        raise NotFoundError(message="Generation task not found or not complete")

    data = result.result
    project_id = data.get("project_id")
    if not project_id:
        raise NotFoundError(message="Project not found in generation result")

    await _assert_project_member(project_id, current_user, db)

    all_tasks = data.get("tasks", [])
    all_ids = {t["id"] for t in all_tasks if t.get("id")}
    keep_ids = set(payload.task_ids)
    delete_ids = all_ids - keep_ids

    if delete_ids:
        uuid_ids = [uuid.UUID(i) for i in delete_ids]
        await db.execute(
            delete(Task).where(Task.id.in_(uuid_ids), Task.project_id == project_id)
        )
        await db.commit()

    kept = [t for t in all_tasks if t.get("id") in keep_ids]
    return {"tasks": kept, "deleted_count": len(delete_ids)}


@router.get("/generate-tasks/{task_id}/stream")
async def stream_generate_tasks_status(task_id: str, current_user: CurrentUser, db: DB):
    """SSE stream for task generation progress."""

    async def generate() -> AsyncGenerator[str, None]:
        import asyncio

        result = AsyncResult(task_id, app=celery_app)
        while not result.ready():
            yield f"data: {json.dumps({'status': result.state.lower(), 'chunk': ''})}\n\n"
            await asyncio.sleep(1)
            result = AsyncResult(task_id, app=celery_app)

        data = result.result or {}
        if data.get("status") == "error":
            yield f"data: {json.dumps({'error': data.get('error'), 'done': True})}\n\n"
            return

        project_id = data.get("project_id")
        if project_id:
            try:
                await _assert_project_member(project_id, current_user, db)
            except ForbiddenError:
                yield f"data: {json.dumps({'error': 'Forbidden', 'done': True})}\n\n"
                return

        tasks = data.get("tasks", [])
        preview = json.dumps({"tasks": tasks})
        for i, char in enumerate(preview):
            yield f"data: {json.dumps({'chunk': char, 'status': 'streaming'})}\n\n"
            if i % 20 == 0:
                await asyncio.sleep(0.01)

        yield f"data: {json.dumps({'done': True, 'tasks': tasks, 'project_id': project_id})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


# ─── Sprint risk analyzer ──────────────────────────────────────────────────────


@router.post("/analyze-risk/{project_id}")
async def analyze_risk(
    project_id: str,
    current_user: CurrentUser,
    db: DB,
    refresh: bool = Query(False),
):
    await _assert_project_member(project_id, current_user, db)

    cache_key = f"ai_risk:{project_id}"
    r = await get_redis_client()

    if not refresh:
        cached = await r.get(cache_key)
        if cached:
            return json.loads(cached)

    await _assert_ai_allowed(current_user)
    analysis = await analyze_project_risk(project_id, db)
    await r.setex(cache_key, RISK_CACHE_TTL, json.dumps(analysis))
    return analysis


# ─── Meeting transcript → tasks ────────────────────────────────────────────────


@router.post("/transcript-to-tasks")
async def transcript_to_tasks(
    payload: AITranscriptRequest,
    current_user: CurrentUser,
    db: DB,
):
    await _assert_project_member(payload.project_id, current_user, db)
    await _assert_ai_allowed(current_user)
    tasks = await extract_tasks_from_transcript(
        payload.transcript, payload.project_id, db
    )
    return {"tasks": tasks}


# ─── Writing assist (streaming) ────────────────────────────────────────────────


@router.post("/improve-text")
async def improve_text(
    payload: AIImproveTextRequest,
    current_user: CurrentUser,
):
    await _assert_ai_allowed(current_user)

    async def generate() -> AsyncGenerator[str, None]:
        full_response = ""
        try:
            async for chunk in stream_improve_text(payload.text, payload.context):
                full_response += chunk
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
        except Exception as e:
            logger.error(f"Improve text stream error: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            yield f"data: {json.dumps({'done': True, 'full_response': full_response})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
