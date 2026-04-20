import asyncio
from sqlalchemy import text
from core.database import engine

async def inspect():
    async with engine.connect() as conn:
        result = await conn.execute(text("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'projects' AND column_name = 'id'"))
        row = result.fetchone()
        print(f"projects.id type: {row}")
        
        result = await conn.execute(text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"))
        tables = result.fetchall()
        print(f"Existing tables: {[t[0] for t in tables]}")

if __name__ == '__main__':
    asyncio.run(inspect())
