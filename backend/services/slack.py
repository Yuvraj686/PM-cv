from __future__ import annotations

from typing import Any

import httpx
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.security import decrypt_text
from models.integrations import SlackIntegration
from models.project_member import ProjectMember
from models.user import User

logger = structlog.get_logger()

SLACK_API_BASE = "https://slack.com/api"


async def exchange_oauth_code(code: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            f"{SLACK_API_BASE}/oauth.v2.access",
            data={
                "client_id": settings.SLACK_CLIENT_ID,
                "client_secret": settings.SLACK_CLIENT_SECRET,
                "code": code,
                "redirect_uri": settings.SLACK_REDIRECT_URI,
            },
        )
        response.raise_for_status()
        payload = response.json()
    if not payload.get("ok"):
        raise ValueError(payload.get("error", "Slack OAuth failed"))
    return payload


async def fetch_workspace_channels(bot_token: str) -> list[dict[str, str]]:
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            f"{SLACK_API_BASE}/conversations.list",
            headers={"Authorization": f"Bearer {bot_token}"},
            params={
                "types": "public_channel,private_channel",
                "exclude_archived": "true",
                "limit": 200,
            },
        )
        response.raise_for_status()
        payload = response.json()
    if not payload.get("ok"):
        raise ValueError(payload.get("error", "Failed to fetch Slack channels"))
    channels = payload.get("channels", [])
    return [
        {"id": c.get("id"), "name": c.get("name")}
        for c in channels
        if c.get("id") and c.get("name")
    ]


async def post_message(
    *,
    bot_token: str,
    channel_id: str,
    text: str,
) -> bool:
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.post(
            f"{SLACK_API_BASE}/chat.postMessage",
            headers={"Authorization": f"Bearer {bot_token}"},
            json={"channel": channel_id, "text": text},
        )
        response.raise_for_status()
        payload = response.json()
    return bool(payload.get("ok"))


async def _get_slack_user_mention(
    db: AsyncSession,
    integration: SlackIntegration,
    assignee_user_id: str | None,
    mentioned_usernames: list[str],
) -> str:
    mappings = (
        integration.user_mappings if isinstance(integration.user_mappings, dict) else {}
    )
    mentions: list[str] = []

    if assignee_user_id and assignee_user_id in mappings:
        mentions.append(f"<@{mappings[assignee_user_id]}>")

    if mentioned_usernames:
        result = await db.execute(
            select(User)
            .join(ProjectMember, ProjectMember.user_id == User.id)
            .where(ProjectMember.project_id == integration.project_id)
        )
        users = result.scalars().all()
        lookup = {u.username.lower(): str(u.id) for u in users if u.username}
        for username in mentioned_usernames:
            user_id = lookup.get(username.lower())
            if user_id and user_id in mappings:
                mentions.append(f"<@{mappings[user_id]}>")

    return " ".join(dict.fromkeys(mentions))


async def notify_project_channel(
    db: AsyncSession,
    *,
    project_id: str,
    event: str,
    message: str,
    assignee_user_id: str | None = None,
    mentioned_usernames: list[str] | None = None,
) -> tuple[bool, str]:
    result = await db.execute(
        select(SlackIntegration).where(
            SlackIntegration.project_id == project_id,
            SlackIntegration.default_active,
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        return False, "Slack is not connected for this project"
    if not integration.channel_id:
        return False, "Slack channel is not configured"

    bot_token = decrypt_text(integration.bot_token_encrypted)
    mention_prefix = await _get_slack_user_mention(
        db,
        integration,
        assignee_user_id=assignee_user_id,
        mentioned_usernames=mentioned_usernames or [],
    )
    text = f"{mention_prefix} {message}".strip() if mention_prefix else message
    sent = await post_message(
        bot_token=bot_token, channel_id=integration.channel_id, text=text
    )
    if sent:
        logger.info(
            "slack_message_sent",
            project_id=project_id,
            event=event,
            channel_id=integration.channel_id,
        )
        return True, "sent"
    return False, "Slack API returned unsuccessful response"
