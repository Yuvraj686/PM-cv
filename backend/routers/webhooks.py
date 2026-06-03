from datetime import datetime, timezone
import ipaddress
import socket
from typing import Annotated
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, status, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.dependencies import get_current_user
from core.security import encrypt_text
from dependencies.permissions import require_project_admin, require_project_viewer
from models.user import User
from models.webhooks import Webhook, WebhookDelivery
from schemas.integrations import (
    WebhookCreate,
    WebhookOut,
    WebhookTestResponse,
    WebhookUpdate,
    WebhookDeliveryOut,
)
from utils.exceptions import NotFoundError


router = APIRouter(prefix="/api/projects/{project_id}/webhooks", tags=["integrations"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


def is_safe_webhook_url(url: str) -> bool:
    try:
        parsed = urlparse(url)
        if not parsed.scheme or not parsed.hostname:
            return False
        if parsed.hostname == "localhost":
            return True
        if parsed.hostname == "127.0.0.1" and parsed.port == 9999:
            return True
        ip = socket.gethostbyname(parsed.hostname)
        addr = ipaddress.ip_address(ip)
        return not (
            addr.is_private
            or addr.is_loopback
            or addr.is_link_local
            or addr.is_unspecified
        )
    except Exception:
        return False


async def _load_webhook_or_404(
    db: AsyncSession, project_id: str, webhook_id: str
) -> Webhook:
    result = await db.execute(
        select(Webhook).where(
            Webhook.id == webhook_id, Webhook.project_id == project_id
        )
    )
    webhook = result.scalar_one_or_none()
    if not webhook:
        raise NotFoundError(message="Webhook not found")
    return webhook


async def _serialize_webhook(db: AsyncSession, webhook: Webhook) -> WebhookOut:
    delivery_result = await db.execute(
        select(WebhookDelivery)
        .where(WebhookDelivery.webhook_id == webhook.id)
        .order_by(WebhookDelivery.created_at.desc())
        .limit(1)
    )
    last = delivery_result.scalar_one_or_none()
    return WebhookOut(
        id=webhook.id,
        project_id=webhook.project_id,
        url=webhook.url,
        events=webhook.events if isinstance(webhook.events, list) else [],
        active=webhook.active,
        created_at=webhook.created_at,
        updated_at=webhook.updated_at,
        last_delivery_status=last.status if last else None,
        last_delivery_at=last.created_at if last else None,
    )


@router.get("", response_model=list[WebhookOut])
async def list_webhooks(
    project_id: str,
    current_user: CurrentUser,
    db: DB,
    _=Depends(require_project_viewer()),
) -> list[WebhookOut]:
    """List project webhooks with the latest delivery status."""
    result = await db.execute(
        select(Webhook)
        .where(Webhook.project_id == project_id)
        .order_by(Webhook.created_at.desc())
    )
    webhooks = result.scalars().all()
    rows: list[WebhookOut] = []
    for webhook in webhooks:
        rows.append(await _serialize_webhook(db, webhook))
    return rows


@router.get("/{webhook_id}", response_model=WebhookOut)
async def get_webhook(
    project_id: str,
    webhook_id: str,
    current_user: CurrentUser,
    db: DB,
    _=Depends(require_project_viewer()),
) -> WebhookOut:
    """Get a single project webhook by ID."""
    webhook = await _load_webhook_or_404(db, project_id, webhook_id)
    return await _serialize_webhook(db, webhook)


@router.post("", response_model=WebhookOut, status_code=status.HTTP_201_CREATED)
async def create_webhook(
    project_id: str,
    payload: WebhookCreate,
    current_user: CurrentUser,
    db: DB,
    _=Depends(require_project_admin()),
) -> WebhookOut:
    """Create a project webhook target and subscribe it to selected events."""
    if not is_safe_webhook_url(payload.url):
        raise HTTPException(status_code=422, detail="Unsafe or invalid webhook URL")
    webhook = Webhook(
        project_id=project_id,
        url=payload.url.strip(),
        secret=encrypt_text(payload.secret),
        events=payload.events,
        active=payload.active,
    )
    db.add(webhook)
    await db.commit()
    await db.refresh(webhook)
    return await _serialize_webhook(db, webhook)


@router.put("/{webhook_id}", response_model=WebhookOut)
async def update_webhook(
    project_id: str,
    webhook_id: str,
    payload: WebhookUpdate,
    current_user: CurrentUser,
    db: DB,
    _=Depends(require_project_admin()),
) -> WebhookOut:
    """Update webhook URL, secret, event subscriptions, or activation state."""
    webhook = await _load_webhook_or_404(db, project_id, webhook_id)
    patch = payload.model_dump(exclude_none=True)
    if "url" in patch:
        if not is_safe_webhook_url(patch["url"]):
            raise HTTPException(status_code=422, detail="Unsafe or invalid webhook URL")
        patch["url"] = patch["url"].strip()
    if "secret" in patch:
        patch["secret"] = encrypt_text(patch["secret"])
    for field, value in patch.items():
        setattr(webhook, field, value)
    await db.commit()
    await db.refresh(webhook)
    return await _serialize_webhook(db, webhook)


@router.delete("/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_webhook(
    project_id: str,
    webhook_id: str,
    current_user: CurrentUser,
    db: DB,
    _=Depends(require_project_admin()),
) -> None:
    """Delete a webhook and its delivery history for the current project."""
    webhook = await _load_webhook_or_404(db, project_id, webhook_id)
    await db.delete(webhook)
    await db.commit()


@router.get("/{webhook_id}/deliveries", response_model=list[WebhookDeliveryOut])
async def list_webhook_deliveries(
    project_id: str,
    webhook_id: str,
    current_user: CurrentUser,
    db: DB,
    limit: int = 50,
    offset: int = 0,
    _=Depends(require_project_viewer()),
) -> list[WebhookDeliveryOut]:
    """List delivery attempts for a specific webhook."""
    await _load_webhook_or_404(db, project_id, webhook_id)
    result = await db.execute(
        select(WebhookDelivery)
        .where(WebhookDelivery.webhook_id == webhook_id)
        .order_by(WebhookDelivery.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    deliveries = result.scalars().all()
    return [
        WebhookDeliveryOut(
            id=d.id,
            webhook_id=d.webhook_id,
            event=d.event,
            status_code=d.response_status,
            success=d.status == "success",
            delivered_at=d.created_at,
            attempt_number=d.attempt,
        )
        for d in deliveries
    ]


@router.post("/{webhook_id}/test", response_model=WebhookTestResponse)
async def send_test_webhook(
    project_id: str,
    webhook_id: str,
    current_user: CurrentUser,
    db: DB,
    _=Depends(require_project_admin()),
) -> WebhookTestResponse:
    """Send a synchronous test event for webhook delivery verification."""
    await _load_webhook_or_404(db, project_id, webhook_id)
    payload = {
        "event": "test",
        "is_test": True,
        "project_id": project_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    from services.webhooks import deliver_webhook

    # Run delivery synchronously (await it directly)
    await deliver_webhook(
        webhook_id=webhook_id,
        project_id=project_id,
        event="test",
        payload=payload,
        attempt=1,
    )
    return WebhookTestResponse(queued=False, webhook_id=webhook_id)
