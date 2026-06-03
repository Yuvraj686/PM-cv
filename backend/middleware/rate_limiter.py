"""
Rate limiter configuration for ProjectHub API.

Uses slowapi to enforce per-route and global rate limits by IP address.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

# Shared limiter instance — import this wherever rate limits are needed
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["60/minute"],  # Global default: 60 req/min per IP
)

# ─── Per-Route Limits (apply as decorators) ────────────────────────────────────
# Usage in routers:
#   from middleware.rate_limiter import limiter
#   @limiter.limit("5/minute")
#   @router.post("/login")
#   async def login(request: Request, ...):
#
# Route-specific limits:
#   POST /api/auth/login       →  5/minute
#   POST /api/auth/otp/send    →  3/minute
#   POST /api/auth/register    → 10/minute
#   All other routes           → 60/minute (global default)
