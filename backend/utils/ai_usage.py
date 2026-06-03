"""Track daily AI API usage per user in Redis."""

from datetime import datetime, timezone

from core.config import settings
from core.security import get_redis_client

AI_USAGE_TTL = 86400


def _daily_limit() -> int:
    return settings.AI_DAILY_LIMIT


def _usage_key(user_id: str) -> str:
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return f"ai_usage:{user_id}:{date_str}"


async def get_ai_usage(user_id: str) -> dict:
    r = await get_redis_client()
    limit = _daily_limit()
    used = int(await r.get(_usage_key(user_id)) or 0)
    remaining = max(0, limit - used)
    return {
        "used": used,
        "limit": limit,
        "remaining": remaining,
    }


async def check_and_increment_ai_usage(user_id: str) -> tuple[bool, int, int]:
    """Returns (allowed, used_after, limit). Increments counter when allowed."""
    r = await get_redis_client()
    limit = _daily_limit()
    key = _usage_key(user_id)
    used = int(await r.get(key) or 0)

    if used >= limit:
        return False, used, limit

    new_count = await r.incr(key)
    if new_count == 1:
        await r.expire(key, AI_USAGE_TTL)

    return True, new_count, limit
