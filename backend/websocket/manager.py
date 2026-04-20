import json
import asyncio
from typing import DefaultDict
from collections import defaultdict
from fastapi import WebSocket
import logging

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Room-based WebSocket connection manager.
    
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

    async def broadcast_to_room(self, room_id: str, data: dict, exclude_user: str | None = None):
        """Send a message to all users in a room."""
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

    async def send_to_user(self, user_id: str, data: dict):
        """Send a message to a specific user across all their rooms."""
        payload = json.dumps(data, default=str)
        user_notification_room = f"user_{user_id}"

        ws = self.rooms.get(user_notification_room, {}).get(user_id)
        if ws:
            try:
                await ws.send_text(payload)
            except Exception:
                self.disconnect(user_notification_room, user_id)

    def get_room_users(self, room_id: str) -> list[str]:
        return list(self.rooms.get(room_id, {}).keys())

    def is_user_online(self, user_id: str) -> bool:
        return bool(self.user_rooms.get(user_id))


# Global singleton instance
manager = ConnectionManager()
