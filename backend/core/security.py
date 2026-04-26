from passlib.context import CryptContext
from jose import jwt
from datetime import datetime, timedelta
from core.config import settings
import secrets, random, string

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

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
    payload = {**data, "exp": datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES), "type": "access"}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

def create_refresh_token(data: dict) -> str:
    payload = {**data, "exp": datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS), "type": "refresh"}
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
