from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.responses import RedirectResponse
import httpx
from core.config import settings
from core.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models.user import User
from core.security import create_access_token, create_refresh_token
from services.email_service import send_welcome_email
from datetime import datetime
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/github", tags=["github-oauth"])

GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"
GITHUB_EMAIL_URL = "https://api.github.com/user/emails"


@router.get("/")
async def github_auth():
    """Redirect to GitHub OAuth login."""
    params = {
        "client_id": settings.GITHUB_CLIENT_ID,
        "redirect_uri": settings.GITHUB_REDIRECT_URI,
        "scope": "read:user user:email",
    }

    query_string = "&".join([f"{k}={v}" for k, v in params.items()])
    return RedirectResponse(url=f"{GITHUB_AUTH_URL}?{query_string}")


@router.get("/callback")
async def github_callback(
    code: str,
    db: AsyncSession = Depends(get_db),
    bg_tasks: BackgroundTasks = BackgroundTasks(),
):
    """Handle GitHub OAuth callback."""
    try:
        # Step 1: Exchange code for token
        token_data = {
            "client_id": settings.GITHUB_CLIENT_ID,
            "client_secret": settings.GITHUB_CLIENT_SECRET,
            "code": code,
        }

        async with httpx.AsyncClient() as client:
            token_response = await client.post(
                GITHUB_TOKEN_URL,
                data=token_data,
                headers={"Accept": "application/json"},
            )
            token_response.raise_for_status()
            token_json = token_response.json()
            access_token = token_json.get("access_token")

        if not access_token:
            return RedirectResponse(
                url=f"{settings.FRONTEND_URL}/login?error=github_failed"
            )

        # Step 2: Get user info from GitHub
        async with httpx.AsyncClient() as client:
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github+json",
            }
            user_response = await client.get(GITHUB_USER_URL, headers=headers)
            user_response.raise_for_status()
            user_data = user_response.json()

        github_id = user_data.get("id")
        login = user_data.get("login")
        name = user_data.get("name") or login
        avatar_url = user_data.get("avatar_url")
        email = user_data.get("email")

        # Step 3: If email is null, fetch from emails endpoint
        if not email:
            async with httpx.AsyncClient() as client:
                headers = {
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github+json",
                }
                emails_response = await client.get(GITHUB_EMAIL_URL, headers=headers)
                emails_response.raise_for_status()
                emails_data = emails_response.json()

                for email_item in emails_data:
                    if email_item.get("primary") and email_item.get("verified"):
                        email = email_item.get("email")
                        break

        if not email:
            logger.error(f"No verified email found for GitHub user {login}")
            return RedirectResponse(
                url=f"{settings.FRONTEND_URL}/login?error=github_no_email"
            )

        # Step 4: Find or create user
        # Check by github_id first
        result = await db.execute(select(User).where(User.github_id == github_id))
        user = result.scalar_one_or_none()

        if user:
            # Update avatar if empty and update last_login
            if not user.avatar_url and avatar_url:
                user.avatar_url = avatar_url
            user.last_login = datetime.utcnow()
            await db.commit()
        else:
            # Check by email
            result = await db.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()

            if user:
                # Link github_id to existing user
                user.github_id = github_id
                user.github_username = login
                user.auth_provider = "github"
                user.is_verified = True
                if not user.avatar_url and avatar_url:
                    user.avatar_url = avatar_url
                user.last_login = datetime.utcnow()
                await db.commit()
            else:
                # Create new user
                user = User(
                    name=name,
                    email=email,
                    github_id=github_id,
                    github_username=login,
                    avatar_url=avatar_url,
                    auth_provider="github",
                    is_verified=True,
                    last_login=datetime.utcnow(),
                )
                db.add(user)
                await db.commit()
                await db.refresh(user)

                # Send welcome email
                bg_tasks.add_task(send_welcome_email, email, name, "github")

        # Step 5: Issue JWT tokens
        access_jwt = create_access_token({"sub": str(user.id), "email": user.email})
        refresh_jwt = create_refresh_token({"sub": str(user.id), "email": user.email})

        # Step 5: Redirect to frontend with tokens
        # New users who haven't set a username yet go to onboarding
        needs_onboarding = not user.onboarding_complete
        callback_url = (
            f"{settings.FRONTEND_URL}/auth/callback"
            f"?access_token={access_jwt}&refresh_token={refresh_jwt}"
            f"&needs_onboarding={'true' if needs_onboarding else 'false'}"
        )
        return RedirectResponse(url=callback_url)

    except Exception as e:
        logger.error(f"GitHub OAuth error: {e}")
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/login?error=github_failed"
        )
