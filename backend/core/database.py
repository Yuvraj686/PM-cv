from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from core.config import settings
import uuid
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.types import UUID as SQL_UUID


def _patch_uuid_type(uuid_class):
    original_bind_processor = uuid_class.bind_processor

    def safe_bind_processor(self, dialect):
        proc = original_bind_processor(self, dialect)
        if not proc:
            return proc

        def process(value):
            if isinstance(value, str):
                try:
                    value = uuid.UUID(value)
                except ValueError:
                    pass
            return proc(value)

        return process

    uuid_class.bind_processor = safe_bind_processor


_patch_uuid_type(PG_UUID)
_patch_uuid_type(SQL_UUID)

DATABASE_URL = settings.DATABASE_URL
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# Remove sslmode from URL if present (causes conflicts with connect_args)
if "sslmode=" in DATABASE_URL:
    import re

    DATABASE_URL = re.sub(r"[?&]sslmode=\w+", "", DATABASE_URL)

# statement_cache_size=0 disables asyncpg prepared statements —
# required when behind Supabase PgBouncer (transaction pool mode).
# Must be passed as an int via connect_args, not as a URL query param.

# Railway internal network: no SSL needed
# Supabase / external DB: SSL + statement cache disabled
IS_SQLITE = DATABASE_URL.startswith("sqlite")
IS_RAILWAY_INTERNAL = "railway.internal" in DATABASE_URL

engine_kwargs = {
    "echo": False,
    "pool_pre_ping": True,
}
if not IS_SQLITE:
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20
    engine_kwargs["connect_args"] = (
        {"statement_cache_size": 0}
        if IS_RAILWAY_INTERNAL
        else {"ssl": "require", "statement_cache_size": 0}
    )

engine = create_async_engine(DATABASE_URL, **engine_kwargs)


AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def create_tables():
    """Create all tables (used for initial setup; prefer Alembic for production)."""
    from models import (  # noqa
        user,
        project,
        project_member,
        task,
        channel,
        channel_member,
        message,
        commit,
        notification,
        comment,
        activity,
        integrations,
        webhooks,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
