from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta
from models.user import User
from schemas.auth import (
    RegisterEmailRequest,
    LoginEmailRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    ResendVerificationRequest,
    TokenResponse,
)
from core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    generate_secure_token,
)
from core.database import get_db
from services.email_service import send_verification_email, send_password_reset_email
import logging
from utils.exceptions import (
    ProjectHubException,
    ConflictError,
    ValidationError,
    UnauthorizedError,
    ForbiddenError,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/email", tags=["auth-email"])


@router.post("/register")
async def register(
    req: RegisterEmailRequest,
    bg_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Register a new user with email and password."""
    try:
        # Check if email exists
        result = await db.execute(select(User).where(User.email == req.email))
        if result.scalar_one_or_none():
            raise ConflictError(message="An account with this email already exists")

        # Create user
        verify_token = generate_secure_token()
        verify_token_exp = datetime.utcnow() + timedelta(hours=24)

        user = User(
            name=req.name,
            email=req.email,
            hashed_password=hash_password(req.password),
            auth_provider="email",
            is_verified=False,
            verify_token=verify_token,
            verify_token_exp=verify_token_exp,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

        logger.info(f"User registered successfully: {user.email}")

        # Send verification email via background task
        bg_tasks.add_task(send_verification_email, req.email, req.name, verify_token)

        return {
            "message": "Check your email to verify your account",
            "email": user.email,
        }
    except ProjectHubException:
        raise
    except Exception as e:
        logger.exception(f"Registration error: {str(e)}")
        raise ProjectHubException(
            status_code=500,
            code="SERVER_ERROR",
            message=f"Registration failed: {str(e)}",
        )


@router.get("/verify-email")
async def verify_email(token: str, db: AsyncSession = Depends(get_db)):
    """Verify email address using token."""
    # Find user by verify_token
    result = await db.execute(select(User).where(User.verify_token == token))
    user = result.scalar_one_or_none()

    if not user:
        raise ValidationError(message="Invalid verification link")

    # Check if expired
    if user.verify_token_exp and user.verify_token_exp < datetime.utcnow():
        raise ValidationError(message="Link expired. Request a new one.")

    # Check if already verified
    if user.is_verified:
        return {"message": "Already verified. Please log in."}

    # Mark as verified
    user.is_verified = True
    user.verify_token = None
    user.verify_token_exp = None
    user.last_login = datetime.utcnow()
    await db.commit()
    await db.refresh(user)

    # Return tokens (auto-login)
    access_token = create_access_token({"sub": str(user.id), "email": user.email})
    refresh_token = create_refresh_token({"sub": str(user.id), "email": user.email})

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user={"id": str(user.id), "email": user.email, "name": user.name},
    )


@router.post("/resend-verification")
async def resend_verification(
    req: ResendVerificationRequest,
    bg_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Resend verification email."""
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()

    # Return generic success even if user not found or already verified (no info leak)
    if user and not user.is_verified:
        # Generate new token
        verify_token = generate_secure_token()
        verify_token_exp = datetime.utcnow() + timedelta(hours=24)

        user.verify_token = verify_token
        user.verify_token_exp = verify_token_exp
        await db.commit()

        # Send verification email
        bg_tasks.add_task(send_verification_email, user.email, user.name, verify_token)

    return {"message": "Verification email resent if account exists"}


@router.post("/login")
async def login(req: LoginEmailRequest, db: AsyncSession = Depends(get_db)):
    """Login with email and password."""
    # Find user by email
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()

    # User not found or wrong password
    if not user or not verify_password(req.password, user.hashed_password):
        raise UnauthorizedError(message="Invalid email or password")

    # Not verified
    if not user.is_verified:
        raise ForbiddenError(
            message="Please verify your email first. Check your inbox or request a new link."
        )

    # Not active
    if not user.is_active:
        raise ForbiddenError(message="Account deactivated. Contact support.")

    # Update last login
    user.last_login = datetime.utcnow()
    await db.commit()
    await db.refresh(user)

    # Create tokens
    access_token = create_access_token({"sub": str(user.id), "email": user.email})
    refresh_token = create_refresh_token({"sub": str(user.id), "email": user.email})

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user={"id": str(user.id), "email": user.email, "name": user.name},
    )


@router.post("/refresh")
async def refresh(refresh_data: dict, db: AsyncSession = Depends(get_db)):
    """Refresh access token using refresh token."""
    try:
        payload = decode_token(refresh_data.get("refresh_token", ""))

        # Verify it's a refresh token
        if payload.get("type") != "refresh":
            raise UnauthorizedError(message="Invalid token type")

        user_id = payload.get("sub")

        # Find user
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

        if not user:
            raise UnauthorizedError(message="User not found")

        # Create new access token
        access_token = create_access_token({"sub": str(user.id), "email": user.email})

        return {"access_token": access_token, "token_type": "bearer"}

    except ProjectHubException:
        raise
    except Exception as e:
        logger.error(f"Refresh token error: {e}")
        raise UnauthorizedError(message="Invalid refresh token")


@router.post("/forgot-password")
async def forgot_password(
    req: ForgotPasswordRequest,
    bg_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Request password reset email."""
    result = await db.execute(select(User).where(User.email == req.email))
    user = result.scalar_one_or_none()

    # Return generic success for security (no info leak)
    if user:
        # Check if OAuth account
        if user.auth_provider != "email":
            return {
                "message": f"This account uses {user.auth_provider} login. Password reset is not available for OAuth accounts."
            }

        # Generate reset token
        reset_token = generate_secure_token()
        reset_token_exp = datetime.utcnow() + timedelta(hours=1)

        user.reset_token = reset_token
        user.reset_token_exp = reset_token_exp
        await db.commit()

        # Send reset email
        bg_tasks.add_task(send_password_reset_email, user.email, user.name, reset_token)

    return {"message": "Password reset email sent if account exists"}


@router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Reset password using token."""
    # Find user by reset_token
    result = await db.execute(select(User).where(User.reset_token == req.token))
    user = result.scalar_one_or_none()

    if not user:
        raise ValidationError(message="Invalid reset link")

    # Check if expired
    if user.reset_token_exp and user.reset_token_exp < datetime.utcnow():
        raise ValidationError(message="Reset link expired. Request a new one.")

    # Hash and save new password
    user.hashed_password = hash_password(req.new_password)
    user.reset_token = None
    user.reset_token_exp = None
    await db.commit()

    return {"message": "Password reset successful. You can now log in."}
