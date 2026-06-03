import hashlib
import hmac
import json
import logging
from typing import Annotated
from fastapi import APIRouter, Depends, Request, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from core.database import get_db, AsyncSessionLocal
from core.dependencies import get_current_user
from core.config import settings
from models.user import User
from models.project import Project
from models.commit import Commit
from models.channel import Channel
from models.message import Message
from services.ai_service import summarize_commits
from services.github_service import sync_repo_issues
from services.activity_service import log_activity
from websocket.manager import manager
from utils.exceptions import (
    ForbiddenError,
    NotFoundError,
    ValidationError,
    ProjectHubException,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/github", tags=["github"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.post("/webhook/{project_id}")
async def github_webhook(
    project_id: str,
    request: Request,
    x_hub_signature_256: str = Header(None),
):
    """Receive GitHub push webhook, summarize with Claude, broadcast to project chat."""
    body = await request.body()

    # Verify HMAC signature
    if settings.GITHUB_WEBHOOK_SECRET:
        sig = (
            "sha256="
            + hmac.new(
                settings.GITHUB_WEBHOOK_SECRET.encode(),
                body,
                hashlib.sha256,
            ).hexdigest()
        )
        if not hmac.compare_digest(sig, x_hub_signature_256 or ""):
            raise ForbiddenError(message="Invalid webhook signature")

    payload = json.loads(body)
    event = request.headers.get("x-github-event", "")

    if event != "push":
        return {"status": "ignored", "reason": f"event={event}"}

    commits_data = payload.get("commits", [])
    if not commits_data:
        return {"status": "ignored", "reason": "no commits"}

    # Extract commit info
    commit_list = [
        {
            "sha": c.get("id", "")[:7],
            "author": c.get("author", {}).get("name", "Unknown"),
            "message": c.get("message", "").split("\n")[0],
            "added": c.get("added", []),
            "modified": c.get("modified", []),
            "removed": c.get("removed", []),
        }
        for c in commits_data[:20]  # limit to 20 commits
    ]

    # Generate AI summary
    try:
        ai_summary = await summarize_commits(commit_list)
    except Exception as e:
        logger.error(f"Claude summarize failed: {e}")
        ai_summary = "AI summary unavailable."

    # Save to DB
    async with AsyncSessionLocal() as db:
        commit = Commit(
            project_id=project_id,
            sha=commits_data[0].get("id", "")[:40],
            author_name=commit_list[0]["author"] if commit_list else None,
            commit_messages=[c["message"] for c in commit_list],
            file_changes=[
                f
                for c in commit_list
                for f in (c["modified"] + c["added"] + c["removed"])
            ],
            ai_summary=ai_summary,
        )
        db.add(commit)

        # Find project group channel and post AI summary message
        channel_result = await db.execute(
            select(Channel).where(
                Channel.project_id == project_id,
                Channel.type == "group",
                Channel.name == "general",
            )
        )
        channel = channel_result.scalar_one_or_none()

        if channel:
            bot_message = Message(
                channel_id=channel.id,
                sender_id=None,
                content=f"🤖 **GitHub Push Summary**\n\n{ai_summary}",
                message_type="ai_summary",
            )
            db.add(bot_message)

        await db.flush()

        await log_activity(
            db,
            project_id=project_id,
            actor_id=None,
            action="github_push",
            target_id=str(commit.id),
            target_type="commit",
            metadata={
                "author": commit_list[0]["author"] if commit_list else "Unknown",
                "commit_count": len(commit_list),
                "summary": ai_summary[:200],
            },
        )

        await db.commit()

        # Broadcast to WebSocket room
        await manager.broadcast_to_room(
            f"project_{project_id}",
            {
                "type": "commit_summary",
                "summary": ai_summary,
                "commits": commit_list,
                "author": commit_list[0]["author"] if commit_list else "Unknown",
            },
        )

    return {"status": "ok", "commits_processed": len(commit_list)}


@router.get("/commits/{project_id}")
async def list_commits(project_id: str, current_user: CurrentUser, db: DB):
    result = await db.execute(
        select(Commit)
        .where(Commit.project_id == project_id)
        .order_by(Commit.created_at.desc())
        .limit(50)
    )
    commits = result.scalars().all()
    return [
        {
            "id": str(c.id),
            "sha": c.sha,
            "author_name": c.author_name,
            "commit_messages": c.commit_messages,
            "file_changes": c.file_changes,
            "ai_summary": c.ai_summary,
            "created_at": c.created_at.isoformat(),
        }
        for c in commits
    ]


@router.post("/sync/{project_id}")
async def sync_github_issues(project_id: str, current_user: CurrentUser, db: DB):
    """Manually trigger a sync of GitHub issues for a project."""
    # Verify project exists and user is a member
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise NotFoundError(message="Project not found")

    # Simple membership check
    from models.project_member import ProjectMember

    mem = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == current_user.id,
        )
    )
    if not mem.scalar_one_or_none():
        raise ForbiddenError(message="Not a member of this project")

    if not project.repo_url:
        raise ValidationError(message="Project has no GitHub repository URL")

    try:
        await sync_repo_issues(project_id, project.repo_url, db)
        return {"status": "success", "message": "Issues synced from GitHub"}
    except Exception as e:
        logger.error(f"Manual sync failed: {e}")
        raise ProjectHubException(status_code=500, code="SERVER_ERROR", message=str(e))
