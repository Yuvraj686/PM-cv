import functools
import json
import logging
from inspect import signature
from datetime import datetime, date, time
import uuid
from typing import Any
from pydantic import BaseModel
from core.security import get_redis_client

logger = logging.getLogger(__name__)


def serialize_val(val: Any) -> Any:
    """Recursively serialize Pydantic, SQLAlchemy models, datetimes, and UUIDs to JSON-native types."""
    if isinstance(val, list):
        return [serialize_val(item) for item in val]
    if isinstance(val, dict):
        return {k: serialize_val(v) for k, v in val.items()}
    if isinstance(val, BaseModel):
        return val.model_dump(mode="json")
    if isinstance(val, (datetime, date, time)):
        return val.isoformat()
    if isinstance(val, uuid.UUID):
        return str(val)
    if hasattr(val, "__dict__"):
        # Serialize SQLAlchemy model attributes
        data = {}
        for k, v in val.__dict__.items():
            if k.startswith("_"):
                continue
            data[k] = serialize_val(v)
        return data
    return val


def cache(ttl_seconds: int = 60):
    """Cache responses of async routes in Redis based on endpoint signature and request context."""

    def decorator(func):
        sig = signature(func)

        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            # Parse arguments by name to capture project_id and current_user
            bound = sig.bind(*args, **kwargs)
            bound.apply_defaults()
            params = bound.arguments

            user_id = None
            if "current_user" in params and params["current_user"]:
                # Check if it's an object with .id or a dict
                current_user = params["current_user"]
                if hasattr(current_user, "id"):
                    user_id = str(current_user.id)
                elif isinstance(current_user, dict) and "id" in current_user:
                    user_id = str(current_user["id"])
            elif "user_id" in params and params["user_id"]:
                user_id = str(params["user_id"])

            project_id = None
            if "project_id" in params and params["project_id"]:
                project_id = str(params["project_id"])

            # Construct standard cache key based on the function name
            func_name = func.__name__
            if func_name == "list_projects":
                cache_key = f"project_list:{user_id}"
            elif func_name in ("get_project_progress", "get_project_analytics"):
                cache_key = f"project_analytics:{project_id}"
            elif func_name == "list_members":
                cache_key = f"project_members:{project_id}"
            else:
                cache_key = f"cache:{func_name}"
                if user_id:
                    cache_key += f":u_{user_id}"
                if project_id:
                    cache_key += f":p_{project_id}"

            # Try fetching from Redis cache
            try:
                r = await get_redis_client()
                cached_val = await r.get(cache_key)
                if cached_val:
                    logger.info(f"🚀 Cache HIT for key: {cache_key}")
                    return json.loads(cached_val)
            except Exception as e:
                logger.error(f"❌ Redis cache GET exception for key {cache_key}: {e}")

            # Execute the endpoint
            result = await func(*args, **kwargs)

            # Serialize and store in Redis
            try:
                serialized = serialize_val(result)
                r = await get_redis_client()
                await r.setex(cache_key, ttl_seconds, json.dumps(serialized))
                logger.info(
                    f"💾 Cache MISS, stored key: {cache_key} with TTL: {ttl_seconds}s"
                )
            except Exception as e:
                logger.error(f"❌ Redis cache SET exception for key {cache_key}: {e}")

            return result

        return wrapper

    return decorator


async def invalidate(pattern: str):
    """Invalidate cache keys matching a pattern or exact match in Redis."""
    try:
        r = await get_redis_client()
        if "*" in pattern:
            keys = await r.keys(pattern)
            if keys:
                await r.delete(*keys)
                logger.info(
                    f"🧹 Cache Invalidated {len(keys)} keys matching: {pattern}"
                )
        else:
            await r.delete(pattern)
            logger.info(f"🧹 Cache Invalidated exact key: {pattern}")
    except Exception as e:
        logger.error(f"❌ Redis cache invalidate exception for pattern {pattern}: {e}")
