import base64
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import AsyncSessionLocal, get_db
from core.dependencies import get_current_user
from core.security import encrypt_text
from models.integrations import SlackIntegration
from models.project_member import ProjectMember
from models.user import User
from schemas.integrations import (
    SlackChannelOut,
    SlackChannelUpdate,
    SlackNotifyOut,
    SlackNotifyRequest,
    SlackStatusOut,
)
from services.slack import (
    exchange_oauth_code,
    fetch_workspace_channels,
    notify_project_channel,
)
from utils.exceptions import ForbiddenError, ValidationError

router = APIRouter(prefix="/api/integrations/slack", tags=["integrations"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]

_ADMIN_ROLES = {"owner", "admin", "project_lead"}
_VIEWER_ROLES = {"owner", "admin", "project_lead", "member", "developer", "viewer"}
_STATE_MAX_AGE_MINUTES = 15


def _sign_state(project_id: str, user_id: str, issued_at: int) -> str:
    message = f"{project_id}:{user_id}:{issued_at}"
    return hmac.new(
        settings.SECRET_KEY.encode("utf-8"), message.encode("utf-8"), hashlib.sha256
    ).hexdigest()


def _encode_state(project_id: str, user_id: str) -> str:
    issued_at = int(datetime.now(timezone.utc).timestamp())
    payload = {
        "project_id": project_id,
        "user_id": user_id,
        "issued_at": issued_at,
        "signature": _sign_state(project_id, user_id, issued_at),
    }
    packed = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(packed).decode("utf-8")


def _decode_state(state: str) -> tuple[str, str]:
    try:
        decoded = base64.urlsafe_b64decode(state.encode("utf-8"))
        payload = json.loads(decoded.decode("utf-8"))
        project_id = payload["project_id"]
        user_id = payload["user_id"]
        issued_at = int(payload["issued_at"])
        signature = payload["signature"]
    except Exception as exc:  # pragma: no cover - invalid client payloads
        raise ValidationError(message="Invalid Slack OAuth state") from exc

    expected = _sign_state(project_id, user_id, issued_at)
    if not hmac.compare_digest(signature, expected):
        raise ValidationError(message="Invalid Slack OAuth signature")

    issued_dt = datetime.fromtimestamp(issued_at, tz=timezone.utc)
    if datetime.now(timezone.utc) - issued_dt > timedelta(
        minutes=_STATE_MAX_AGE_MINUTES
    ):
        raise ValidationError(message="Slack OAuth state expired")
    return project_id, user_id


async def _assert_project_role(
    db: AsyncSession,
    *,
    project_id: str,
    user_id: str,
    allowed: set[str],
) -> None:
    result = await db.execute(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    member = result.scalar_one_or_none()
    if not member or member.role not in allowed:
        raise ForbiddenError(message="You do not have permission for this project")


@router.get("/connect")
async def connect_slack(
    current_user: CurrentUser,
    db: DB,
    project_id: str = Query(...),
) -> RedirectResponse:
    """Redirect the user to Slack OAuth for a project workspace connection."""
    await _assert_project_role(
        db,
        project_id=project_id,
        user_id=str(current_user.id),
        allowed=_ADMIN_ROLES,
    )
    if not settings.SLACK_CLIENT_ID or not settings.SLACK_CLIENT_SECRET:
        raise ValidationError(message="Slack OAuth is not configured on the server")

    scope = "chat:write,channels:read,groups:read"
    state = _encode_state(project_id, str(current_user.id))
    redirect_url = (
        "https://slack.com/oauth/v2/authorize"
        f"?client_id={settings.SLACK_CLIENT_ID}"
        f"&scope={scope}"
        f"&redirect_uri={settings.SLACK_REDIRECT_URI}"
        f"&state={state}"
    )
    return RedirectResponse(
        url=redirect_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT
    )


@router.get("/callback")
async def slack_callback(code: str, state: str) -> RedirectResponse:
    """Complete Slack OAuth and persist encrypted bot credentials for the project."""
    project_id, user_id = _decode_state(state)
    oauth_payload = await exchange_oauth_code(code)

    access_token = oauth_payload.get("access_token")
    team = oauth_payload.get("team", {})
    workspace_id = team.get("id")
    workspace_name = team.get("name")
    if not access_token or not workspace_id:
        raise ValidationError(message="Slack OAuth response missing required fields")

    async with AsyncSessionLocal() as db:
        await _assert_project_role(
            db,
            project_id=project_id,
            user_id=user_id,
            allowed=_ADMIN_ROLES,
        )
        result = await db.execute(
            select(SlackIntegration).where(SlackIntegration.project_id == project_id)
        )
        integration = result.scalar_one_or_none()
        encrypted_token = encrypt_text(access_token)
        if integration:
            integration.workspace_id = workspace_id
            integration.workspace_name = workspace_name
            integration.bot_token_encrypted = encrypted_token
            integration.default_active = True
        else:
            integration = SlackIntegration(
                project_id=project_id,
                workspace_id=workspace_id,
                workspace_name=workspace_name,
                bot_token_encrypted=encrypted_token,
                default_active=True,
                user_mappings={},
            )
            db.add(integration)
        await db.commit()

    redirect_to = f"{settings.FRONTEND_URL}/projects/{project_id}/settings?integration=slack_connected"
    return RedirectResponse(
        url=redirect_to, status_code=status.HTTP_307_TEMPORARY_REDIRECT
    )


@router.get("/status", response_model=SlackStatusOut)
async def get_slack_status(
    current_user: CurrentUser,
    db: DB,
    project_id: str = Query(...),
) -> SlackStatusOut:
    """Return Slack connection status for the current project."""
    await _assert_project_role(
        db,
        project_id=project_id,
        user_id=str(current_user.id),
        allowed=_VIEWER_ROLES,
    )
    result = await db.execute(
        select(SlackIntegration).where(SlackIntegration.project_id == project_id)
    )
    integration = result.scalar_one_or_none()
    if not integration:
        return SlackStatusOut(connected=False)
    return SlackStatusOut(
        connected=True,
        workspace_id=integration.workspace_id,
        workspace_name=integration.workspace_name,
        channel_id=integration.channel_id,
    )


@router.get("/channels", response_model=list[SlackChannelOut])
async def get_slack_channels(
    current_user: CurrentUser,
    db: DB,
    project_id: str = Query(...),
) -> list[SlackChannelOut]:
    """Fetch available Slack channels for a connected workspace."""
    await _assert_project_role(
        db,
        project_id=project_id,
        user_id=str(current_user.id),
        allowed=_VIEWER_ROLES,
    )
    result = await db.execute(
        select(SlackIntegration).where(SlackIntegration.project_id == project_id)
    )
    integration = result.scalar_one_or_none()
    if not integration:
        return []
    from core.security import decrypt_text

    channels = await fetch_workspace_channels(
        decrypt_text(integration.bot_token_encrypted)
    )
    return [SlackChannelOut(id=entry["id"], name=entry["name"]) for entry in channels]


@router.patch("/channel", response_model=SlackStatusOut)
async def update_slack_channel(
    payload: SlackChannelUpdate,
    current_user: CurrentUser,
    db: DB,
) -> SlackStatusOut:
    """Persist the default Slack channel used for project notifications."""
    await _assert_project_role(
        db,
        project_id=payload.project_id,
        user_id=str(current_user.id),
        allowed=_ADMIN_ROLES,
    )
    result = await db.execute(
        select(SlackIntegration).where(
            SlackIntegration.project_id == payload.project_id
        )
    )
    integration = result.scalar_one_or_none()
    if not integration:
        raise ValidationError(message="Slack is not connected for this project")
    integration.channel_id = payload.channel_id
    await db.commit()
    await db.refresh(integration)
    return SlackStatusOut(
        connected=True,
        workspace_id=integration.workspace_id,
        workspace_name=integration.workspace_name,
        channel_id=integration.channel_id,
    )


@router.post("/notify", response_model=SlackNotifyOut)
async def slack_notify(
    payload: SlackNotifyRequest,
    db: DB,
    x_internal_token: str | None = Header(default=None),
) -> SlackNotifyOut:
    """Internal endpoint used by workers to push Slack notifications."""
    if x_internal_token != settings.SECRET_KEY:
        raise ForbiddenError(message="Invalid internal token")
    delivered, detail = await notify_project_channel(
        db,
        project_id=payload.project_id,
        event=payload.event,
        message=payload.message,
        assignee_user_id=payload.assignee_user_id,
        mentioned_usernames=payload.mentioned_usernames,
    )
    return SlackNotifyOut(delivered=delivered, detail=detail)
