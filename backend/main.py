import logging
from contextlib import asynccontextmanager
import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from core.config import settings
from core.database import create_tables
from routers import (
    auth,
    projects,
    tasks,
    users,
    chat,
    ai,
    github,
    notifications,
    analytics,
    webhooks,
)
from routers.integrations.slack import router as slack_integration_router
from routers.auth_email import router as email_router
from routers.auth_google import router as google_router
from routers.auth_github import router as github_oauth_router
from routers.auth_phone import router as phone_router
from middleware.rate_limiter import limiter
from middleware.logging_middleware import LoggingMiddleware
from slowapi.errors import RateLimitExceeded
from utils.exceptions import ProjectHubException

# Initialize Sentry if DSN is provided
if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        traces_sample_rate=0.2,
        environment=settings.ENV,
    )

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    from websocket.manager import manager

    logger.info("🚀 ProjectHub starting up...")
    await create_tables()
    logger.info("✅ Database tables verified")
    await manager.start_pubsub()
    logger.info("✅ WebSocket Pub/Sub fan-out initialized")
    yield
    await manager.stop_pubsub()
    logger.info("👋 ProjectHub shutting down")


app = FastAPI(
    title="ProjectHub API",
    description="Full-stack project management platform API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# Add rate limiter to app state
app.state.limiter = limiter

# Add Logging Middleware
app.add_middleware(LoggingMiddleware)


# Cache-Control middleware for main project endpoints
@app.middleware("http")
async def add_cache_control_header(request: Request, call_next):
    response = await call_next(request)
    if request.method == "GET" and request.url.path.startswith("/api/projects"):
        if "Cache-Control" not in response.headers:
            response.headers["Cache-Control"] = (
                "public, max-age=0, stale-while-revalidate=59"
            )
    return response


# Custom Global Exception Handlers
@app.exception_handler(ProjectHubException)
async def projecthub_exception_handler(request: Request, exc: ProjectHubException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "code": exc.code,
            "message": exc.message,
            "detail": exc.detail or {},
        },
    )


@app.exception_handler(StarletteHTTPException)
async def starlette_http_exception_handler(
    request: Request, exc: StarletteHTTPException
):
    code = "HTTP_ERROR"
    if exc.status_code == 404:
        code = "NOT_FOUND"
    elif exc.status_code == 403:
        code = "FORBIDDEN"
    elif exc.status_code == 401:
        code = "UNAUTHORIZED"
    elif exc.status_code == 409:
        code = "CONFLICT"
    elif exc.status_code == 429:
        code = "RATE_LIMIT"
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "code": code,
            "message": str(exc.detail),
            "detail": {},
        },
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    cleaned_errors = []
    for err in errors:
        cleaned_err = dict(err)
        if "ctx" in cleaned_err and isinstance(cleaned_err["ctx"], dict):
            ctx = dict(cleaned_err["ctx"])
            if "error" in ctx:
                ctx["error"] = str(ctx["error"])
            cleaned_err["ctx"] = ctx
        cleaned_errors.append(cleaned_err)

    return JSONResponse(
        status_code=422,
        content={
            "code": "VALIDATION_ERROR",
            "message": "Validation failed",
            "detail": {"errors": cleaned_errors},
        },
    )


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={
            "code": "RATE_LIMIT",
            "message": f"Rate limit exceeded: {exc.detail}",
            "detail": {},
        },
    )


# CORS — conditional on environment
if settings.ENV == "production" and settings.ALLOWED_ORIGINS:
    _origins = [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]
else:
    _origins = [
        settings.FRONTEND_URL,
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register all routers
app.include_router(auth.router)
app.include_router(email_router, prefix="/api/auth", tags=["Email Auth"])
app.include_router(google_router, prefix="/api/auth", tags=["Google OAuth"])
app.include_router(github_oauth_router, prefix="/api/auth", tags=["GitHub OAuth"])
app.include_router(phone_router, prefix="/api/auth", tags=["Phone OTP"])
app.include_router(projects.router)
app.include_router(analytics.router)
app.include_router(webhooks.router)
app.include_router(slack_integration_router)
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
    from datetime import datetime, timezone

    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/ready")
async def readiness():
    """Returns 200 if Redis AND DB are reachable, 503 otherwise."""
    from datetime import datetime, timezone
    import redis.asyncio as aioredis
    from sqlalchemy import text
    from core.database import AsyncSessionLocal

    checks = {"redis": False, "database": False}

    # ── Redis check ───────────────────────────────────────────────────────
    try:
        r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        await r.ping()
        checks["redis"] = True
        await r.aclose()
    except Exception:
        pass

    # ── Database check ────────────────────────────────────────────────────
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        checks["database"] = True
    except Exception:
        pass

    all_healthy = all(checks.values())
    status_code = 200 if checks["database"] else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ok"
            if all_healthy
            else ("degraded" if checks["database"] else "down"),
            "checks": checks,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    )
