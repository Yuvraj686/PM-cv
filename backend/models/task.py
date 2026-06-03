import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column,
    String,
    DateTime,
    Text,
    Date,
    Boolean,
    Integer,
    ForeignKey,
    CheckConstraint,
    Index,
)
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from core.database import Base


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint(
            "story_points IS NULL OR (story_points >= 0 AND story_points <= 100)",
            name="ck_tasks_story_points_range",
        ),
        Index("ix_tasks_project_id", "project_id"),
        Index("ix_tasks_assignee_id", "assignee_id"),
        Index("ix_tasks_status", "status"),
        Index("ix_tasks_created_at_desc", sa.text("created_at DESC")),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), nullable=False, default="todo")  # todo|in_progress|done
    priority = Column(
        String(50), nullable=False, default="medium"
    )  # low|medium|high|critical
    story_points = Column(Integer, nullable=True)
    assignee_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    due_date = Column(Date, nullable=True)
    alert_sent = Column(Boolean, default=False, nullable=False)
    external_id = Column(String(255), nullable=True, index=True)  # GitHub issue ID
    external_source = Column(String(50), nullable=True)  # e.g., "github"
    position = Column(Integer, default=0, nullable=False)
    created_at = Column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    project = relationship("Project", back_populates="tasks")
    assignee = relationship(
        "User", back_populates="assigned_tasks", foreign_keys=[assignee_id]
    )
    comments = relationship(
        "Comment", back_populates="task", cascade="all, delete-orphan"
    )
