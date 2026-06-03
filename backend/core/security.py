import uuid
import logging
import bcrypt
import base64
import hashlib
import hmac
from datetime import timezone
from functools import lru_cache
from cryptography.fernet import Fernet

# Patch bcrypt.hashpw to truncate passwords to 72 bytes before hashing,
# fixing a compatibility bug between passlib and modern bcrypt versions.
_orig_hashpw = bcrypt.hashpw


def _patched_hashpw(password: bytes, salt: bytes) -> bytes:
    if len(password) > 72:
        password = password[:72]
    return _orig_hashpw(password, salt)


bcrypt.hashpw = _patched_hashpw

from passlib.context import CryptContext  # noqa: E402
from jose import jwt  # noqa: E402
from datetime import datetime, timedelta  # noqa: E402
from core.config import settings  # noqa: E402
import secrets  # noqa: E402
import random  # noqa: E402
import string  # noqa: E402
import redis.asyncio as aioredis  # noqa: E402

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
logger = logging.getLogger(__name__)


def hash_password(password: str) -> str:
    # Bcrypt has a 72-byte limit for passwords
    # Truncate to 72 bytes to prevent errors
    truncated_password = password[:72]
    return pwd_context.hash(truncated_password)


def verify_password(plain: str, hashed: str) -> bool:
    # Truncate plain password to 72 bytes to match hashing
    truncated_password = plain[:72]
    return pwd_context.verify(truncated_password, hashed)


def create_access_token(data: dict) -> str:
    payload = {
        **data,
        "exp": datetime.utcnow()
        + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        "type": "access",
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(data: dict) -> str:
    payload = {
        **data,
        "exp": datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        "type": "refresh",
        "jti": str(uuid.uuid4()),  # Unique token ID for rotation/blacklisting
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except jwt.JWTError:
        return None


def generate_secure_token() -> str:
    return secrets.token_urlsafe(32)


def generate_otp() -> str:
    return "".join(random.choices(string.digits, k=6))


# ─── Redis Token Blacklist ─────────────────────────────────────────────────────

_redis_client = None


async def get_redis_client():
    """Get or create an async Redis client."""
    global _redis_client
    if _redis_client is None:
        _redis_client = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
        )
    return _redis_client


async def blacklist_token(jti: str, ttl_seconds: int) -> None:
    """Add a token JTI to the blacklist with the given TTL."""
    try:
        r = await get_redis_client()
        await r.setex(f"blacklist:{jti}", ttl_seconds, "1")
    except Exception:
        logger.warning(
            "Redis unavailable; refresh token blacklist write skipped", exc_info=True
        )


async def is_token_blacklisted(jti: str) -> bool:
    """Check whether a token JTI has been blacklisted."""
    try:
        r = await get_redis_client()
        return await r.exists(f"blacklist:{jti}") > 0
    except Exception:
        logger.warning(
            "Redis unavailable; refresh token blacklist check skipped", exc_info=True
        )
        return False


def _normalize_encryption_key(raw_key: str) -> bytes:
    candidate = raw_key.strip().encode("utf-8")
    try:
        decoded = base64.urlsafe_b64decode(candidate)
        if len(decoded) == 32:
            return candidate
    except Exception:
        pass
    digest = hashlib.sha256(candidate).digest()
    return base64.urlsafe_b64encode(digest)


@lru_cache()
def get_fernet() -> Fernet:
    if not settings.ENCRYPTION_KEY:
        raise ValueError("ENCRYPTION_KEY is not set")
    return Fernet(_normalize_encryption_key(settings.ENCRYPTION_KEY))


def encrypt_text(value: str) -> str:
    token = get_fernet().encrypt(value.encode("utf-8"))
    return token.decode("utf-8")


def decrypt_text(value: str) -> str:
    plain = get_fernet().decrypt(value.encode("utf-8"))
    return plain.decode("utf-8")


def create_calendar_token(project_id: str, user_id: str, days_valid: int = 30) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(days=days_valid)
    expires_ts = int(expires_at.timestamp())
    payload = f"{project_id}:{user_id}:{expires_ts}"
    digest = hmac.new(
        settings.SECRET_KEY.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
    ).digest()
    signature = base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")
    return f"{user_id}.{expires_ts}.{signature}"


def verify_calendar_token(project_id: str, token: str) -> str | None:
    try:
        user_id, expires_ts_raw, signature = token.split(".", 2)
        expires_ts = int(expires_ts_raw)
    except Exception:
        return None
    now_ts = int(datetime.now(timezone.utc).timestamp())
    if expires_ts < now_ts:
        return None
    payload = f"{project_id}:{user_id}:{expires_ts}"
    expected_digest = hmac.new(
        settings.SECRET_KEY.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
    ).digest()
    expected_signature = (
        base64.urlsafe_b64encode(expected_digest).decode("utf-8").rstrip("=")
    )
    if not hmac.compare_digest(signature, expected_signature):
        return None
    return user_id
