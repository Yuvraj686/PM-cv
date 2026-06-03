from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

VALID_WEBHOOK_EVENTS = {
    "*",
    "task_created",
    "task_updated",
    "task_moved",
    "member_invited",
    "comment_added",
    "github_push",
}


class SlackStatusOut(BaseModel):
    connected: bool
    workspace_id: str | None = None
    workspace_name: str | None = None
    channel_id: str | None = None


class SlackChannelOut(BaseModel):
    id: str
    name: str


class SlackChannelUpdate(BaseModel):
    project_id: str
    channel_id: str | None = None


class SlackNotifyRequest(BaseModel):
    project_id: str
    event: str
    message: str
    assignee_user_id: str | None = None
    mentioned_usernames: list[str] = Field(default_factory=list)
    task_id: str | None = None


class SlackNotifyOut(BaseModel):
    delivered: bool
    detail: str


class WebhookCreate(BaseModel):
    url: str
    secret: str
    events: list[str]
    active: bool = True

    @field_validator("events")
    @classmethod
    def validate_events(cls, v: list[str]) -> list[str]:
        invalid = [e for e in v if e not in VALID_WEBHOOK_EVENTS]
        if invalid:
            raise ValueError(f"Invalid event type(s): {', '.join(invalid)}")
        return v


class WebhookUpdate(BaseModel):
    url: str | None = None
    secret: str | None = None
    events: list[str] | None = None
    active: bool | None = None

    @field_validator("events")
    @classmethod
    def validate_events(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        invalid = [e for e in v if e not in VALID_WEBHOOK_EVENTS]
        if invalid:
            raise ValueError(f"Invalid event type(s): {', '.join(invalid)}")
        return v


class WebhookOut(BaseModel):
    id: UUID
    project_id: UUID
    url: str
    events: list[str]
    active: bool
    created_at: datetime
    updated_at: datetime
    last_delivery_status: str | None = None
    last_delivery_at: datetime | None = None

    model_config = {"from_attributes": True}


class WebhookDeliveryOut(BaseModel):
    id: UUID
    webhook_id: UUID
    event: str
    status_code: int | None
    success: bool
    delivered_at: datetime
    attempt_number: int

    model_config = {"from_attributes": True}


class WebhookTestResponse(BaseModel):
    queued: bool
    webhook_id: str
