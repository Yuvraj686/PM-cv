import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings
from core.database import create_tables
from routers import auth, projects, tasks, users, chat, ai, github, notifications

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 ProjectHub starting up...")
    await create_tables()
    logger.info("✅ Database tables verified")
    yield
    logger.info("👋 ProjectHub shutting down")


app = FastAPI(
    title="ProjectHub API",
    description="Full-stack project management platform API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow frontend origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all routers
app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(tasks.router)
app.include_router(users.router)
app.include_router(chat.router)
app.include_router(ai.router)
app.include_router(github.router)
app.include_router(notifications.router)


@app.get("/")
async def root():
    return {"message": "ProjectHub API", "version": "1.0.0", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
