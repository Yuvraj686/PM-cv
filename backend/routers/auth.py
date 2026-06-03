import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from core.database import get_db
from core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    blacklist_token,
    is_token_blacklisted,
)
from models.user import User
from schemas.schemas import (
    UserRegister,
    UserLogin,
    TokenResponse,
    RefreshRequest,
    UserOut,
)
from middleware.rate_limiter import limiter
from utils.exceptions import ConflictError, NotFoundError, UnauthorizedError

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post(
    "/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED
)
@limiter.limit("10/minute")
async def register(
    request: Request, payload: UserRegister, db: AsyncSession = Depends(get_db)
):
    normalized_email = payload.email.lower().strip()

    # Check if email already exists
    result = await db.execute(select(User).where(User.email == normalized_email))
    if result.scalar_one_or_none():
        raise ConflictError(message="Email already registered")

    user = User(
        name=payload.name,
        email=normalized_email,
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token_data = {"sub": str(user.id), "email": user.email}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(
    request: Request, payload: UserLogin, db: AsyncSession = Depends(get_db)
):
    normalized_email = payload.email.lower().strip()
    result = await db.execute(select(User).where(User.email == normalized_email))
    user = result.scalar_one_or_none()

    if not user:
        raise NotFoundError(message="Email is not registered")

    if not user.hashed_password:
        raise UnauthorizedError(message="Invalid credentials")

    if not verify_password(payload.password, user.hashed_password):
        raise UnauthorizedError(message="Invalid credentials")

    token_data = {"sub": str(user.id), "email": user.email}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_tokens(payload: RefreshRequest, db: AsyncSession = Depends(get_db)):
    token_payload = decode_token(payload.refresh_token)

    if not token_payload or token_payload.get("type") != "refresh":
        raise UnauthorizedError(message="Invalid refresh token")

    # ── Check if this token has been blacklisted (already rotated) ─────────
    jti = token_payload.get("jti")
    if jti and await is_token_blacklisted(jti):
        raise UnauthorizedError(message="Refresh token has been revoked")

    user_id = token_payload.get("sub")
    try:
        user_uuid = uuid.UUID(str(user_id))
    except (TypeError, ValueError):
        raise UnauthorizedError(message="Invalid token payload")

    result = await db.execute(select(User).where(User.id == user_uuid))
    user = result.scalar_one_or_none()

    if not user:
        raise UnauthorizedError(message="User not found")

    # ── Blacklist the old refresh token in Redis ───────────────────────────
    if jti:
        exp = token_payload.get("exp", 0)
        ttl = max(int(exp - datetime.utcnow().timestamp()), 1)
        await blacklist_token(jti, ttl)

    # ── Issue new token pair ───────────────────────────────────────────────
    token_data = {"sub": str(user.id), "email": user.email}
    return TokenResponse(
        access_token=create_access_token(token_data),
        refresh_token=create_refresh_token(token_data),
    )


@router.get("/me", response_model=UserOut)
async def get_me(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(
        __import__("core.dependencies", fromlist=["get_current_user"]).get_current_user
    ),
):
    return current_user
