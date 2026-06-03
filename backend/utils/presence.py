"""Redis-backed project presence tracking."""

from core.security import get_redis_client

PRESENCE_TTL = 30


def _key(project_id: str) -> str:
    return f"presence:{project_id}"


async def join(project_id: str, user_id: str) -> None:
    r = await get_redis_client()
    key = _key(project_id)
    await r.sadd(key, user_id)
    await r.expire(key, PRESENCE_TTL)


async def leave(project_id: str, user_id: str) -> None:
    r = await get_redis_client()
    await r.srem(_key(project_id), user_id)


async def heartbeat(project_id: str, user_id: str) -> None:
    await join(project_id, user_id)


async def get_user_ids(project_id: str) -> list[str]:
    r = await get_redis_client()
    members = await r.smembers(_key(project_id))
    return list(members) if members else []
