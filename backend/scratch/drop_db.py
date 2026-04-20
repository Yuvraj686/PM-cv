import asyncio
from sqlalchemy import text
from core.database import engine

async def drop():
    async with engine.begin() as conn:
        print("Dropping conflicting tables...")
        await conn.execute(text('DROP TABLE IF EXISTS project_members, tasks, projects, users, chat_messages, alembic_version, changelog_entries, chat_rooms, team_members, channels, channel_members, messages, commits, notifications CASCADE'))
        print("Tables dropped.")

if __name__ == '__main__':
    asyncio.run(drop())
