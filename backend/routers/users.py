from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from core.database import get_db
from core.dependencies import get_current_user
from core.security import verify_password, hash_password
from models.user import User
from models.project_member import ProjectMember
from models.task import Task
from schemas.schemas import (
    UserOut,
    UserUpdate,
    OnboardingSetup,
    ProfileOut,
    ProfileUpdate,
    PasswordChange,
    DeleteAccountRequest,
)
from utils.exceptions import ConflictError

router = APIRouter(prefix="/api/users", tags=["users"])

CurrentUser = Annotated[User, Depends(get_current_user)]
DB = Annotated[AsyncSession, Depends(get_db)]


@router.get("/me", response_model=UserOut)
async def get_profile(current_user: CurrentUser, db: DB):
    return current_user


@router.put("/me", response_model=UserOut)
async def update_profile(payload: UserUpdate, current_user: CurrentUser, db: DB):
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(current_user, field, value)
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/me/onboarding", response_model=UserOut)
async def complete_onboarding(
    payload: OnboardingSetup, current_user: CurrentUser, db: DB
):
    """Complete the onboarding flow — set username and optional GitHub handle."""
    # Check username uniqueness
    result = await db.execute(select(User).where(User.username == payload.username))
    existing = result.scalar_one_or_none()
    if existing and existing.id != current_user.id:
        raise ConflictError(message="Username already taken")

    current_user.username = payload.username
    if payload.github_username:
        current_user.github_username = payload.github_username
    current_user.onboarding_complete = True
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.get("/check-username")
async def check_username(username: str, current_user: CurrentUser, db: DB):
    """Returns {available: bool} for real-time username availability check."""
    import re

    username = username.strip().lower()
    if (
        not re.match(r"^[a-z0-9_\-]+$", username)
        or len(username) < 3
        or len(username) > 30
    ):
        return {"available": False, "reason": "invalid_format"}
    result = await db.execute(select(User).where(User.username == username))
    existing = result.scalar_one_or_none()
    if existing and existing.id != current_user.id:
        return {"available": False, "reason": "taken"}
    return {"available": True}


@router.get("/search")
async def search_users(q: str, current_user: CurrentUser, db: DB):
    """Search users by email or name — for adding members."""
    result = await db.execute(
        select(User)
        .where(
            (User.email.ilike(f"%{q}%"))
            | (User.name.ilike(f"%{q}%"))
            | (User.username.ilike(f"%{q}%"))
        )
        .limit(10)
    )
    users = result.scalars().all()
    return [
        {"id": str(u.id), "name": u.name, "email": u.email, "avatar_url": u.avatar_url}
        for u in users
    ]


# ─── Profile Endpoints ─────────────────────────────────────────────────────────


@router.get("/me/profile", response_model=ProfileOut)
async def get_full_profile(current_user: CurrentUser, db: DB):
    """Return full profile including project count, task count, workspace count."""
    # Count memberships (= workspaces/projects)
    project_result = await db.execute(
        select(func.count(ProjectMember.id)).where(
            ProjectMember.user_id == current_user.id
        )
    )
    project_count = project_result.scalar() or 0

    # Count tasks assigned to user
    task_result = await db.execute(
        select(func.count(Task.id)).where(Task.assignee_id == current_user.id)
    )
    task_count = task_result.scalar() or 0

    return ProfileOut(
        id=current_user.id,
        name=current_user.name,
        username=current_user.username,
        email=current_user.email,
        avatar_url=current_user.avatar_url,
        github_username=current_user.github_username,
        onboarding_complete=current_user.onboarding_complete,
        created_at=current_user.created_at,
        project_count=project_count,
        task_count=task_count,
        workspace_count=project_count,  # workspaces == distinct projects joined
    )


@router.put("/me/profile", response_model=UserOut)
async def update_full_profile(
    payload: ProfileUpdate, current_user: CurrentUser, db: DB
):
    """Update display name only (email is not changeable)."""
    current_user.name = payload.name
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.put("/me/password")
async def change_password(payload: PasswordChange, current_user: CurrentUser, db: DB):
    """Change password — verifies current password first, then saves new hash."""
    # Must have a hashed password (email-auth users only)
    if not current_user.hashed_password:
        raise HTTPException(
            status_code=400,
            detail="Password change is not available for OAuth accounts.",
        )

    # Verify current password
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    # Confirm new passwords match
    if payload.new_password != payload.confirm_password:
        raise HTTPException(status_code=400, detail="New passwords do not match.")

    current_user.hashed_password = hash_password(payload.new_password)
    await db.commit()
    return {"message": "Password updated successfully."}


@router.delete("/me")
async def delete_account(
    payload: DeleteAccountRequest, current_user: CurrentUser, db: DB
):
    """
    Permanently delete the current user's account.
    Requires the user to send confirmation='DELETE' in the request body.
    All memberships and tasks assigned to the user are cascade-deleted by the DB.
    """
    if payload.confirmation != "DELETE":
        raise HTTPException(
            status_code=400,
            detail='You must type "DELETE" to confirm account deletion.',
        )

    await db.delete(current_user)
    await db.commit()
    return {"message": "Account deleted successfully."}
