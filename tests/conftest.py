"""
Shared test fixtures for ProjectHub backend tests.

Provides an in-memory SQLite database, FastAPI TestClient, pre-built
auth headers, and sample project/task objects.  Each test runs inside
a DB transaction that is rolled back automatically.
"""
import sys
import asyncio
import uuid
import pytest
import pytest_asyncio
from typing import AsyncGenerator

# Detect E2E mode where asyncio is disabled to prevent event loop conflicts
is_e2e = (
    any(arg == "e2e" for arg in sys.argv)
    or any("no:asyncio" in arg for arg in sys.argv)
    or any("test_auth_" in arg for arg in sys.argv)
)


from sqlalchemy.ext.asyncio import (
    AsyncSession,
    create_async_engine,
    async_sessionmaker,
)
from httpx import AsyncClient, ASGITransport

# ── Bootstrap: override settings BEFORE any app code is imported ────────────
import os
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-ci")
os.environ.setdefault("ENV", "development")

from core.database import Base, get_db          # noqa: E402
from core.security import create_access_token, create_refresh_token  # noqa: E402
from main import app                            # noqa: E402
from models.user import User                    # noqa: E402
from models.project import Project              # noqa: E402
from models.project_member import ProjectMember # noqa: E402
from models.task import Task                    # noqa: E402

# ── In-memory SQLite engine (shared across the test session) ────────────────
TEST_DB_URL = "sqlite+aiosqlite:///:memory:"
engine = create_async_engine(TEST_DB_URL, echo=False)
TestSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

if is_e2e:
    # ── Mock sync fixtures for E2E mode (avoids asyncio event loop conflicts) ──
    @pytest.fixture(scope="session", autouse=True)
    def setup_database():
        yield

    @pytest.fixture
    def db_session():
        yield

    @pytest.fixture(autouse=True)
    def override_db():
        yield

    @pytest.fixture
    def test_client():
        yield

    @pytest.fixture
    def test_user():
        yield

    @pytest.fixture
    def auth_headers():
        yield {}

    @pytest.fixture
    def auth_refresh_token():
        yield ""

    @pytest.fixture
    def test_project():
        yield

    @pytest.fixture
    def test_task():
        yield

else:
    # ── Real async fixtures for Integration/Unit tests ────────────────────────
    # ── Create all tables once per session ──────────────────────────────────────
    @pytest_asyncio.fixture(scope="session", autouse=True)
    async def setup_database():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        yield
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)


    # ── Per-test DB session with fresh in-memory database ───────────────────────
    @pytest_asyncio.fixture
    async def db_session() -> AsyncGenerator[AsyncSession, None]:
        test_engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
        async with test_engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            
        session_factory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)
        async with session_factory() as session:
            yield session
            
        await test_engine.dispose()


    # ── Override FastAPI's get_db dependency ─────────────────────────────────────
    @pytest_asyncio.fixture(autouse=True)
    async def override_db(db_session: AsyncSession):
        async def _get_test_db():
            yield db_session

        app.dependency_overrides[get_db] = _get_test_db
        yield
        app.dependency_overrides.pop(get_db, None)


    # ── Async HTTP client against the FastAPI app ───────────────────────────────
    @pytest_asyncio.fixture
    async def test_client() -> AsyncGenerator[AsyncClient, None]:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://testserver") as client:
            yield client


    # ── Test user + JWT auth headers ────────────────────────────────────────────
    @pytest_asyncio.fixture
    async def test_user(db_session: AsyncSession) -> User:
        from core.security import hash_password

        user = User(
            id=uuid.uuid4(),
            name="Test User",
            email="testuser@example.com",
            hashed_password=hash_password("TestPass123"),
            is_verified=True,
        )
        db_session.add(user)
        await db_session.flush()
        return user


    @pytest_asyncio.fixture
    async def auth_headers(test_user: User) -> dict[str, str]:
        token = create_access_token({"sub": str(test_user.id), "email": test_user.email})
        return {"Authorization": f"Bearer {token}"}


    @pytest_asyncio.fixture
    async def auth_refresh_token(test_user: User) -> str:
        return create_refresh_token({"sub": str(test_user.id), "email": test_user.email})


    # ── Test project ────────────────────────────────────────────────────────────
    @pytest_asyncio.fixture
    async def test_project(db_session: AsyncSession, test_user: User) -> Project:
        project = Project(
            id=uuid.uuid4(),
            name="Test Project",
            description="A project for testing",
            owner_id=test_user.id,
        )
        db_session.add(project)
        await db_session.flush()

        # Add user as admin member
        member = ProjectMember(
            project_id=project.id,
            user_id=test_user.id,
            role="admin",
        )
        db_session.add(member)
        await db_session.flush()
        return project


    # ── Test task ───────────────────────────────────────────────────────────────
    @pytest_asyncio.fixture
    async def test_task(db_session: AsyncSession, test_project: Project, test_user: User) -> Task:
        task = Task(
            id=uuid.uuid4(),
            project_id=test_project.id,
            title="Test Task",
            description="A task for testing",
            status="todo",
            priority="medium",
            assignee_id=test_user.id,
            position=0,
        )
        db_session.add(task)
        await db_session.flush()
        return task
