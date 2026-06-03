import json
import asyncio
from typing import DefaultDict
from collections import defaultdict
from fastapi import WebSocket
import logging

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Room-based WebSocket connection manager with Redis Pub/Sub fan-out.

    Rooms are string IDs like:
      - "project_{id}"   → project group chat
      - "dm_{minId}_{maxId}" → direct messages
      - "user_{id}"      → personal notifications
    """

    def __init__(self):
        # room_id → {user_id: WebSocket}
        self.rooms: DefaultDict[str, dict[str, WebSocket]] = defaultdict(dict)
        # user_id → set of room_ids (for targeted delivery)
        self.user_rooms: DefaultDict[str, set] = defaultdict(set)
        # Redis pub/sub state
        self._pubsub = None
        self._pubsub_task: asyncio.Task | None = None
        self._redis_client = None

    async def _get_redis(self):
        """Lazily get a dedicated Redis connection for pub/sub."""
        if self._redis_client is None:
            try:
                from core.security import get_redis_client

                self._redis_client = await get_redis_client()
            except Exception as e:
                logger.warning(f"Redis not available for pub/sub fan-out: {e}")
                self._redis_client = None
        return self._redis_client

    async def start_pubsub(self):
        """Start the Redis Pub/Sub listener as a background task."""
        redis = await self._get_redis()
        if redis is None:
            logger.warning("Skipping pub/sub startup — Redis unavailable")
            return

        try:
            self._pubsub = redis.pubsub()
            await self._pubsub.psubscribe("room:*")
            self._pubsub_task = asyncio.create_task(self._pubsub_listener())
            logger.info("🔗 Redis Pub/Sub listener started for WebSocket fan-out")
        except Exception as e:
            logger.error(f"Failed to start pub/sub listener: {e}")

    async def stop_pubsub(self):
        """Gracefully stop the Redis Pub/Sub listener."""
        if self._pubsub_task:
            self._pubsub_task.cancel()
            try:
                await self._pubsub_task
            except asyncio.CancelledError:
                pass
        if self._pubsub:
            try:
                await self._pubsub.punsubscribe("room:*")
                await self._pubsub.close()
            except Exception:
                pass
        logger.info("🔌 Redis Pub/Sub listener stopped")

    async def _pubsub_listener(self):
        """Long-running listener that receives messages from Redis and broadcasts locally."""
        try:
            async for message in self._pubsub.listen():
                if message["type"] != "pmessage":
                    continue
                try:
                    channel = message["channel"]
                    if isinstance(channel, bytes):
                        channel = channel.decode("utf-8")
                    # Channel format: "room:{room_id}"
                    room_id = channel.split(":", 1)[1] if ":" in channel else channel

                    raw_data = message["data"]
                    if isinstance(raw_data, bytes):
                        raw_data = raw_data.decode("utf-8")
                    payload = json.loads(raw_data)

                    data = payload.get("data", {})
                    exclude_user = payload.get("exclude_user")

                    await self._local_broadcast_to_room(room_id, data, exclude_user)
                except Exception as e:
                    logger.error(f"Pub/Sub message processing error: {e}")
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error(f"Pub/Sub listener crashed: {e}")

    async def connect(self, room_id: str, user_id: str, websocket: WebSocket):
        await websocket.accept()
        self.rooms[room_id][user_id] = websocket
        self.user_rooms[user_id].add(room_id)
        logger.info(f"User {user_id} connected to room {room_id}")

    def disconnect(self, room_id: str, user_id: str):
        self.rooms[room_id].pop(user_id, None)
        self.user_rooms[user_id].discard(room_id)
        if not self.rooms[room_id]:
            del self.rooms[room_id]
        logger.info(f"User {user_id} disconnected from room {room_id}")

    async def _local_broadcast_to_room(
        self, room_id: str, data: dict, exclude_user: str | None = None
    ):
        """Send a message to all LOCAL users in a room (this instance only)."""
        payload = json.dumps(data, default=str)
        disconnected = []

        for user_id, ws in list(self.rooms.get(room_id, {}).items()):
            if user_id == exclude_user:
                continue
            try:
                await ws.send_text(payload)
            except Exception:
                disconnected.append((room_id, user_id))

        for room, uid in disconnected:
            self.disconnect(room, uid)

    async def broadcast_to_room(
        self, room_id: str, data: dict, exclude_user: str | None = None
    ):
        """Send a message to all users in a room, using Redis Pub/Sub for cross-instance fan-out."""
        redis = await self._get_redis()
        if redis and self._pubsub_task:
            # Publish to Redis — all instances (including this one) will receive via _pubsub_listener
            try:
                pubsub_payload = json.dumps(
                    {
                        "data": data,
                        "exclude_user": exclude_user,
                    },
                    default=str,
                )
                await redis.publish(f"room:{room_id}", pubsub_payload)
                return
            except Exception as e:
                logger.warning(
                    f"Redis publish failed, falling back to local broadcast: {e}"
                )

        # Fallback: local-only broadcast (single instance mode)
        await self._local_broadcast_to_room(room_id, data, exclude_user)

    async def send_to_user(self, user_id: str, data: dict):
        """Send a message to a specific user via their personal notification room."""
        user_notification_room = f"user_{user_id}"

        redis = await self._get_redis()
        if redis and self._pubsub_task:
            try:
                pubsub_payload = json.dumps(
                    {
                        "data": data,
                        "exclude_user": None,
                    },
                    default=str,
                )
                await redis.publish(f"room:{user_notification_room}", pubsub_payload)
                return
            except Exception as e:
                logger.warning(
                    f"Redis publish to user failed, falling back to local: {e}"
                )

        # Fallback: local-only delivery
        ws = self.rooms.get(user_notification_room, {}).get(user_id)
        if ws:
            try:
                await ws.send_text(json.dumps(data, default=str))
            except Exception:
                self.disconnect(user_notification_room, user_id)

    def get_room_users(self, room_id: str) -> list[str]:
        return list(self.rooms.get(room_id, {}).keys())

    def is_user_online(self, user_id: str) -> bool:
        return bool(self.user_rooms.get(user_id))


# Global singleton instance
manager = ConnectionManager()
