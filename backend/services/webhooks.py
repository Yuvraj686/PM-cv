from __future__ import annotations

import hashlib
import hmac
import json
from datetime import datetime, timezone
from typing import Any

import httpx
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import AsyncSessionLocal
from core.security import decrypt_text
from models.webhooks import Webhook, WebhookDelivery

logger = structlog.get_logger()


def generate_webhook_signature(secret: str, payload: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), payload, hashlib.sha256).hexdigest()


def _event_enabled(webhook_events: list[str] | None, event: str) -> bool:
    if not webhook_events:
        return False
    return event in webhook_events or "*" in webhook_events


async def enqueue_project_webhooks(
    db: AsyncSession,
    *,
    project_id: str,
    event: str,
    data: dict[str, Any],
) -> int:
    from core.celery_app import celery_app

    result = await db.execute(
        select(Webhook).where(
            Webhook.project_id == project_id,
            Webhook.active,
        )
    )
    webhooks = result.scalars().all()
    payload = {
        "event": event,
        "project_id": project_id,
        "data": data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    scheduled = 0
    for webhook in webhooks:
        events = webhook.events if isinstance(webhook.events, list) else []
        if not _event_enabled(events, event):
            continue
        celery_app.send_task(
            "services.webhooks.deliver",
            kwargs={
                "webhook_id": str(webhook.id),
                "project_id": project_id,
                "event": event,
                "payload": payload,
                "attempt": 1,
            },
            queue="low_priority",
        )
        scheduled += 1
    return scheduled


async def _create_delivery(
    db: AsyncSession,
    *,
    webhook_id: str,
    project_id: str,
    event: str,
    payload: dict[str, Any],
    signature: str,
    status: str,
    attempt: int,
    response_status: int | None = None,
    response_body: str | None = None,
    error_message: str | None = None,
) -> WebhookDelivery:
    delivery = WebhookDelivery(
        webhook_id=webhook_id,
        project_id=project_id,
        event=event,
        payload=payload,
        signature=signature,
        status=status,
        attempt=attempt,
        response_status=response_status,
        response_body=response_body,
        error_message=error_message,
    )
    db.add(delivery)
    await db.flush()
    return delivery


async def deliver_webhook(
    *,
    webhook_id: str,
    project_id: str,
    event: str,
    payload: dict[str, Any],
    attempt: int,
) -> tuple[bool, str | None]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Webhook).where(
                Webhook.id == webhook_id,
                Webhook.project_id == project_id,
            )
        )
        webhook = result.scalar_one_or_none()
        if not webhook or not webhook.active:
            logger.info(
                "webhook_skipped", webhook_id=webhook_id, reason="missing_or_inactive"
            )
            return True, "inactive"

        try:
            secret = decrypt_text(webhook.secret)
        except Exception:
            secret = webhook.secret

        raw_payload = json.dumps(
            payload, separators=(",", ":"), ensure_ascii=False
        ).encode("utf-8")
        signature = generate_webhook_signature(secret, raw_payload)
        sig_header_val = f"sha256={signature}"

        from sqlalchemy.exc import IntegrityError

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    webhook.url,
                    json=payload,
                    headers={"X-ProjectHub-Signature": sig_header_val},
                )
            status = "success" if 200 <= response.status_code < 300 else "failed"
            try:
                await _create_delivery(
                    db,
                    webhook_id=webhook_id,
                    project_id=project_id,
                    event=event,
                    payload=payload,
                    signature=sig_header_val,
                    status=status,
                    attempt=attempt,
                    response_status=response.status_code,
                    response_body=response.text[:2000],
                    error_message=None if status == "success" else "non_2xx_response",
                )
                await db.commit()
            except IntegrityError:
                await db.rollback()
                logger.info(
                    "webhook_delivery_skipped",
                    webhook_id=webhook_id,
                    reason="webhook_deleted_mid_flight",
                )
                return True, "deleted"

            if status == "success":
                return True, None
            return False, f"Webhook returned {response.status_code}"
        except Exception as exc:  # pragma: no cover - network/runtime failures
            try:
                await _create_delivery(
                    db,
                    webhook_id=webhook_id,
                    project_id=project_id,
                    event=event,
                    payload=payload,
                    signature=sig_header_val,
                    status="failed",
                    attempt=attempt,
                    response_status=0,
                    response_body=None,
                    error_message=str(exc),
                )
                await db.commit()
            except IntegrityError:
                await db.rollback()
                logger.info(
                    "webhook_delivery_skipped",
                    webhook_id=webhook_id,
                    reason="webhook_deleted_mid_flight",
                )
                return True, "deleted"
            return False, str(exc)
