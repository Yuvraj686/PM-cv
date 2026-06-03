from datetime import datetime, date
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field, field_validator


# ─── Auth Schemas ──────────────────────────────────────────────────────────────


class UserRegister(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=72)

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


# ─── User Schemas ──────────────────────────────────────────────────────────────


class UserOut(BaseModel):
    id: UUID
    name: str | None
    username: str | None
    email: str | None
    avatar_url: str | None
    github_username: str | None
    onboarding_complete: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    name: str | None = None
    avatar_url: str | None = None


class OnboardingSetup(BaseModel):
    username: str
    github_username: str | None = None

    @field_validator("username")
    @classmethod
    def username_format(cls, v: str) -> str:
        import re

        v = v.strip().lower()
        if len(v) < 3:
            raise ValueError("Username must be at least 3 characters")
        if len(v) > 30:
            raise ValueError("Username must be at most 30 characters")
        if not re.match(r"^[a-z0-9_\-]+$", v):
            raise ValueError(
                "Username can only contain letters, numbers, underscores, and hyphens"
            )
        return v


# ─── Project Schemas ───────────────────────────────────────────────────────────


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    repo_url: str | None = None
    deadline: str | None = None  # ISO date string YYYY-MM-DD


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    repo_url: str | None = None
    deadline: str | None = None


class ProjectOut(BaseModel):
    id: UUID
    name: str
    description: str | None
    repo_url: str | None
    deadline: date | None
    owner_id: UUID
    created_at: datetime

    model_config = {"from_attributes": True}


class MemberAdd(BaseModel):
    user_id: str | None = None
    email: EmailStr | None = None
    role: str = "developer"


class MemberRoleUpdate(BaseModel):
    role: str


class MemberOut(BaseModel):
    user_id: UUID
    role: str
    user: UserOut

    model_config = {"from_attributes": True}


# ─── Task Schemas ──────────────────────────────────────────────────────────────


class TaskCreate(BaseModel):
    project_id: str
    title: str = Field(..., min_length=1, max_length=500)
    description: str | None = Field(default=None, max_length=10000)
    status: str = "todo"
    priority: str = "medium"
    story_points: int | None = Field(default=None, ge=0, le=100)
    assignee_id: str | None = None
    due_date: str | None = None
    position: int = 0


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = Field(default=None, max_length=10000)
    status: str | None = None
    priority: str | None = None
    story_points: int | None = Field(default=None, ge=0, le=100)
    assignee_id: str | None = None
    due_date: str | None = None
    position: int | None = None


class TaskStatusUpdate(BaseModel):
    status: str
    position: int | None = None


class TaskOut(BaseModel):
    id: UUID
    project_id: UUID
    title: str
    description: str | None
    status: str
    priority: str
    story_points: int | None
    assignee_id: UUID | None
    due_date: date | None
    alert_sent: bool
    external_id: str | None
    external_source: str | None
    position: int
    created_at: datetime
    updated_at: datetime
    assignee: UserOut | None = None
    comment_count: int = 0

    model_config = {"from_attributes": True}


class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=5000)
    parent_comment_id: str | None = None


class CommentOut(BaseModel):
    id: UUID
    task_id: UUID
    author_id: UUID
    content: str
    parent_comment_id: UUID | None
    created_at: datetime
    author: UserOut | None = None
    replies: list["CommentOut"] = []

    model_config = {"from_attributes": True}


# ─── Chat Schemas ──────────────────────────────────────────────────────────────


class ChannelCreate(BaseModel):
    project_id: str | None = None
    name: str | None = None
    type: str = "group"
    member_ids: list[str] = []


class ChannelOut(BaseModel):
    id: UUID
    project_id: UUID | None
    name: str | None
    type: str
    room_id: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MessageOut(BaseModel):
    id: UUID
    channel_id: UUID
    sender_id: UUID | None
    content: str
    message_type: str
    created_at: datetime
    sender: UserOut | None = None

    model_config = {"from_attributes": True}


# ─── AI Schemas ────────────────────────────────────────────────────────────────


class AIChatMessage(BaseModel):
    role: str  # user|assistant
    content: str


class AIChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=10000)
    history: list[AIChatMessage] = []


class AIGenerateTasksRequest(BaseModel):
    project_id: str
    project_goal: str = Field(..., min_length=1, max_length=5000)
    context: str | None = Field(default=None, max_length=10000)


class AITranscriptRequest(BaseModel):
    transcript: str = Field(..., min_length=10, max_length=50000)
    project_id: str


class AIImproveTextRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)
    context: str = Field(default="task_description")  # task_description | pr_summary

    @field_validator("context")
    @classmethod
    def valid_context(cls, v: str) -> str:
        if v not in ("task_description", "pr_summary"):
            raise ValueError("context must be task_description or pr_summary")
        return v


class AIAcceptTasksRequest(BaseModel):
    task_ids: list[str] = Field(..., min_length=1)


# ─── Commit Schemas ────────────────────────────────────────────────────────────


class CommitOut(BaseModel):
    id: UUID
    project_id: UUID
    sha: str
    author_name: str | None
    commit_messages: list | None
    file_changes: list | None
    ai_summary: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ─── Notification Schemas ──────────────────────────────────────────────────────


class NotificationOut(BaseModel):
    id: UUID
    user_id: UUID
    type: str
    content: str
    read: bool
    created_at: datetime

    model_config = {"from_attributes": True}
