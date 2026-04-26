from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from core.config import settings

DATABASE_URL = settings.DATABASE_URL
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# Remove sslmode from URL if present (causes conflicts with connect_args)
if "sslmode=" in DATABASE_URL:
    import re
    DATABASE_URL = re.sub(r"[?&]sslmode=\w+", "", DATABASE_URL)

# Railway internal network: no SSL needed
# If using Supabase or external DB: use ssl="require"
IS_RAILWAY_INTERNAL = "railway.internal" in DATABASE_URL

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    connect_args={} if IS_RAILWAY_INTERNAL else {"ssl": "require"},
)


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
    from models import user, project, project_member, task, channel, channel_member, message, commit, notification  # noqa
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
