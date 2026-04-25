from sqlalchemy import Column, String, Boolean, DateTime, Text, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from core.database import Base
import uuid
from datetime import datetime

class User(Base):
    __tablename__ = "users"
    id                     = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name                   = Column(String(100), nullable=True)
    username               = Column(String(50), unique=True, nullable=True, index=True)
    email                  = Column(String(255), unique=True, nullable=True, index=True)
    hashed_password        = Column(String(255), nullable=True)
    avatar_url             = Column(Text, nullable=True)
    auth_provider          = Column(String(20), default="email")
    is_verified            = Column(Boolean, default=False)
    verify_token           = Column(String(255), nullable=True)
    verify_token_exp       = Column(DateTime, nullable=True)
    reset_token            = Column(String(255), nullable=True)
    reset_token_exp        = Column(DateTime, nullable=True)
    google_id              = Column(String(255), nullable=True, unique=True)
    github_id              = Column(String(255), nullable=True, unique=True)
    github_username        = Column(String(100), nullable=True)
    phone_number           = Column(String(20), nullable=True, unique=True)
    phone_otp              = Column(String(6), nullable=True)
    phone_otp_exp          = Column(DateTime, nullable=True)
    phone_otp_attempts     = Column(Integer, default=0)
    phone_otp_locked_until = Column(DateTime, nullable=True)
    phone_verified         = Column(Boolean, default=False)
    is_active              = Column(Boolean, default=True)
    onboarding_complete    = Column(Boolean, default=False)
    created_at             = Column(DateTime, default=datetime.utcnow)
    last_login             = Column(DateTime, nullable=True)

    # Relationships
    owned_projects = relationship("Project", back_populates="owner", foreign_keys="Project.owner_id")
    memberships = relationship("ProjectMember", back_populates="user")
    sent_messages = relationship("Message", back_populates="sender")
    notifications = relationship("Notification", back_populates="user")
    assigned_tasks = relationship("Task", back_populates="assignee", foreign_keys="Task.assignee_id")
