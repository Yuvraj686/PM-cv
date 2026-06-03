from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from datetime import datetime, timedelta
from models.user import User
from schemas.auth import (
    PhoneSendOTPRequest,
    PhoneVerifyOTPRequest,
    PhoneResendOTPRequest,
    TokenResponse,
)
from core.security import generate_otp, create_access_token, create_refresh_token
from core.database import get_db
from services.sms_service import send_otp_sms
from middleware.rate_limiter import limiter
from utils.exceptions import ConflictError, ValidationError, RateLimitError
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/phone", tags=["auth-phone"])


def mask_phone(phone: str) -> str:
    """Mask phone number: +91***XX format."""
    if len(phone) < 5:
        return phone
    return phone[:3] + "***" + phone[-2:]


@router.post("/send-otp")
@limiter.limit("3/minute")
async def send_otp(
    request: Request, req: PhoneSendOTPRequest, db: AsyncSession = Depends(get_db)
):
    """Send OTP to phone number."""
    # Check if verified user already has this phone
    result = await db.execute(
        select(User).where(
            and_(User.phone_number == req.phone_number, User.phone_verified)
        )
    )
    verified_user = result.scalar_one_or_none()

    if verified_user:
        raise ConflictError(message="Phone already registered. Please log in.")

    # Generate OTP
    otp = generate_otp()
    otp_exp = datetime.utcnow() + timedelta(minutes=10)

    # Check if unverified user exists with this phone
    result = await db.execute(select(User).where(User.phone_number == req.phone_number))
    user = result.scalar_one_or_none()

    if user:
        # Update existing user
        user.phone_otp = otp
        user.phone_otp_exp = otp_exp
        user.phone_otp_attempts = 0
        user.phone_otp_locked_until = None
    else:
        # Create new user
        user = User(
            phone_number=req.phone_number,
            phone_otp=otp,
            phone_otp_exp=otp_exp,
            auth_provider="phone",
            is_verified=False,
            phone_verified=False,
        )
        db.add(user)

    await db.commit()

    # Send OTP via SMS
    send_otp_sms(req.phone_number, otp)

    masked_phone = mask_phone(req.phone_number)
    return {"message": f"OTP sent to {masked_phone}", "expires_in": 600}


@router.post("/verify-otp")
async def verify_otp(req: PhoneVerifyOTPRequest, db: AsyncSession = Depends(get_db)):
    """Verify OTP and complete phone authentication."""
    # Find user by phone number
    result = await db.execute(select(User).where(User.phone_number == req.phone_number))
    user = result.scalar_one_or_none()

    if not user:
        raise ValidationError(message="Request an OTP first")

    # Check if locked due to too many attempts
    if user.phone_otp_locked_until and user.phone_otp_locked_until > datetime.utcnow():
        lock_until = user.phone_otp_locked_until.strftime("%I:%M %p")
        raise ValidationError(
            message=f"Too many attempts. Try again after {lock_until}."
        )

    # Check if OTP expired
    if user.phone_otp_exp and user.phone_otp_exp < datetime.utcnow():
        raise ValidationError(message="OTP expired. Request a new one.")

    # Check OTP match
    if user.phone_otp != req.otp:
        # Increment attempts
        user.phone_otp_attempts = (user.phone_otp_attempts or 0) + 1

        if user.phone_otp_attempts >= 5:
            # Lock account for 10 minutes
            user.phone_otp_locked_until = datetime.utcnow() + timedelta(minutes=10)
            await db.commit()
            raise ValidationError(
                message="Too many wrong attempts. Locked for 10 minutes."
            )

        remaining = 5 - user.phone_otp_attempts
        await db.commit()
        raise ValidationError(message=f"Incorrect OTP. {remaining} attempts remaining.")

    # OTP correct - mark as verified
    user.phone_verified = True
    user.is_verified = True

    # Update name if null
    if not user.name:
        user.name = req.name

    # Clear OTP fields
    user.phone_otp = None
    user.phone_otp_exp = None
    user.phone_otp_attempts = 0
    user.phone_otp_locked_until = None
    user.last_login = datetime.utcnow()

    await db.commit()
    await db.refresh(user)

    # Create tokens (auto-login)
    access_token = create_access_token(
        {"sub": str(user.id), "phone": user.phone_number}
    )
    refresh_token = create_refresh_token(
        {"sub": str(user.id), "phone": user.phone_number}
    )

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        user={"id": str(user.id), "phone": user.phone_number, "name": user.name},
    )


@router.post("/resend-otp")
async def resend_otp(req: PhoneResendOTPRequest, db: AsyncSession = Depends(get_db)):
    """Resend OTP to phone number."""
    # Find user
    result = await db.execute(select(User).where(User.phone_number == req.phone_number))
    user = result.scalar_one_or_none()

    if not user:
        raise ValidationError(message="Request an OTP first")

    # Check if already verified
    if user.phone_verified:
        raise ConflictError(message="Already verified. Please log in.")

    # Check if trying to resend too quickly (within 60 seconds)
    if user.phone_otp_exp:
        time_since_otp = datetime.utcnow() - (
            user.phone_otp_exp - timedelta(minutes=10)
        )
        if time_since_otp.total_seconds() < 60:
            raise RateLimitError(message="Wait before requesting another OTP.")

    # Generate new OTP
    otp = generate_otp()
    otp_exp = datetime.utcnow() + timedelta(minutes=10)

    user.phone_otp = otp
    user.phone_otp_exp = otp_exp
    user.phone_otp_attempts = 0
    user.phone_otp_locked_until = None

    await db.commit()

    # Send OTP
    send_otp_sms(req.phone_number, otp)

    return {"message": "New OTP sent", "expires_in": 600}
