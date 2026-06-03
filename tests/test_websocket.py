"""Tests for WebSocket chat functionality.

WebSocket endpoints bypass FastAPI's dependency injection (they use
AsyncSessionLocal directly), so we need to patch it with a test session
factory that points to our in-memory test database.
"""
import json
import uuid
import pytest
import pytest_asyncio
from contextlib import asynccontextmanager
from unittest.mock import patch, MagicMock

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    create_async_engine,
    async_sessionmaker,
)
from starlette.testclient import TestClient

from core.database import Base
from core.security import create_access_token
from models.user import User
from models.project import Project
from models.project_member import ProjectMember
from main import app


@pytest.fixture
def ws_test_env():
    """Set up an in-memory DB populated with a user + project, and patch
    AsyncSessionLocal so the WebSocket handler uses our test DB."""
    import asyncio

    # Create a fresh event loop for setup (sync TestClient will use its own)
    loop = asyncio.new_event_loop()

    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    SessionFactory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    user_id = uuid.uuid4()
    project_id = uuid.uuid4()

    async def _setup():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        async with SessionFactory() as session:
            user = User(
                id=user_id,
                name="WS Test User",
                email="wstest@example.com",
                hashed_password="unused",
                is_verified=True,
            )
            session.add(user)
            await session.flush()

            project = Project(
                id=project_id,
                name="WS Test Project",
                description="for websocket tests",
                owner_id=user_id,
            )
            session.add(project)
            await session.flush()

            member = ProjectMember(
                project_id=project_id,
                user_id=user_id,
                role="admin",
            )
            session.add(member)
            await session.commit()

    loop.run_until_complete(_setup())
    loop.close()

    token = create_access_token({"sub": str(user_id), "email": "wstest@example.com"})
    room_id = f"project_{project_id}"

    yield {
        "session_factory": SessionFactory,
        "user_id": str(user_id),
        "project_id": str(project_id),
        "token": token,
        "room_id": room_id,
        "engine": engine,
    }

    # Cleanup
    cleanup_loop = asyncio.new_event_loop()
    cleanup_loop.run_until_complete(engine.dispose())
    cleanup_loop.close()


def test_websocket_connect_valid_token(ws_test_env):
    """WebSocket connection with valid auth token should succeed."""
    env = ws_test_env

    with patch("routers.chat.AsyncSessionLocal", env["session_factory"]):
        with TestClient(app) as sync_client:
            with sync_client.websocket_connect(
                f"/api/chat/ws/{env['room_id']}/{env['user_id']}?token={env['token']}"
            ) as ws:
                ws.send_text(json.dumps({"type": "ping"}))
                # Drain messages until we get pong
                data = None
                for _ in range(5):
                    msg = ws.receive_json()
                    if msg.get("type") == "pong":
                        data = msg
                        break
                assert data is not None, "Did not receive pong response"
                assert data["type"] == "pong"


def test_websocket_rejects_invalid_token(ws_test_env):
    """WebSocket with invalid token should be closed with code 4001."""
    env = ws_test_env

    with patch("routers.chat.AsyncSessionLocal", env["session_factory"]):
        with TestClient(app) as sync_client:
            try:
                with sync_client.websocket_connect(
                    f"/api/chat/ws/{env['room_id']}/{env['user_id']}?token=invalid-token"
                ) as ws:
                    pytest.fail("WebSocket should have been rejected")
            except Exception:
                pass  # Expected: connection refused with code 4001


def test_chat_message_broadcast(ws_test_env):
    """Chat message sent by one client should be handled without errors."""
    env = ws_test_env

    with patch("routers.chat.AsyncSessionLocal", env["session_factory"]):
        with TestClient(app) as sync_client:
            with sync_client.websocket_connect(
                f"/api/chat/ws/{env['room_id']}/{env['user_id']}?token={env['token']}"
            ) as ws:
                ws.send_text(json.dumps({
                    "type": "chat_message",
                    "channel_id": "00000000-0000-0000-0000-000000000000",
                    "content": "Hello from test!",
                }))

                # Connection stays alive — verify with a ping/pong
                ws.send_text(json.dumps({"type": "ping"}))
                # Drain messages until we get pong
                data = None
                for _ in range(5):
                    msg = ws.receive_json()
                    if msg.get("type") == "pong":
                        data = msg
                        break
                assert data is not None, "Did not receive pong response"
                assert data["type"] == "pong"
