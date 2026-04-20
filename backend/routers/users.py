from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from core.database import get_db
from core.dependencies import get_current_user
from models.user import User
from schemas.schemas import UserOut, UserUpdate

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


@router.get("/search")
async def search_users(q: str, current_user: CurrentUser, db: DB):
    """Search users by email or name — for adding members."""
    result = await db.execute(
        select(User)
        .where(
            (User.email.ilike(f"%{q}%")) | (User.name.ilike(f"%{q}%"))
        )
        .limit(10)
    )
    users = result.scalars().all()
    return [{"id": str(u.id), "name": u.name, "email": u.email, "avatar_url": u.avatar_url} for u in users]
