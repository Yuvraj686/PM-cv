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
from urllib.parse import urlencode

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/github", tags=["github-oauth"])

GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"
GITHUB_EMAIL_URL = "https://api.github.com/user/emails"
GITHUB_API_TIMEOUT = httpx.Timeout(10.0, connect=5.0)


@router.get("/")
async def github_auth():
    """Redirect to GitHub OAuth login."""
    params = {
        "client_id": settings.GITHUB_CLIENT_ID,
        "redirect_uri": settings.GITHUB_REDIRECT_URI,
        "scope": "read:user user:email",
    }

    query_string = urlencode(params)
    return RedirectResponse(url=f"{GITHUB_AUTH_URL}?{query_string}")


@router.get("/callback")
async def github_callback(
    code: str,
    bg_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Handle GitHub OAuth callback."""
    try:
        logger.info("GitHub callback: received callback from GitHub")
        logger.info(f"GitHub callback: configured redirect_uri={settings.GITHUB_REDIRECT_URI}")
        logger.info(f"GitHub callback: configured frontend_url={settings.FRONTEND_URL}")

        if not settings.GITHUB_CLIENT_ID or not settings.GITHUB_CLIENT_SECRET:
            raise ValueError("GitHub OAuth client credentials are not configured")

        # Step 1: Exchange code for token
        logger.info("GitHub callback: exchanging code for token")
        token_data = {
            "client_id": settings.GITHUB_CLIENT_ID,
            "client_secret": settings.GITHUB_CLIENT_SECRET,
            "code": code,
        }

        async with httpx.AsyncClient(timeout=GITHUB_API_TIMEOUT) as client:
            token_response = await client.post(
                GITHUB_TOKEN_URL,
                data=token_data,
                headers={"Accept": "application/json"},
            )
            logger.info(
                f"GitHub callback: got token response status {token_response.status_code}"
            )
            if token_response.status_code >= 400:
                logger.error(
                    f"GitHub callback: token response body {token_response.text[:500]}"
                )
            token_response.raise_for_status()
            token_json = token_response.json()
            access_token = token_json.get("access_token")

            if not access_token:
                logger.error(
                    "GitHub callback: token response missing access_token; "
                    f"error={token_json.get('error')} "
                    f"description={token_json.get('error_description')}"
                )
                return RedirectResponse(
                    url=f"{settings.FRONTEND_URL}/login?error=github_failed"
                )

            logger.info("GitHub callback: access token received")

            # Step 2: Get user info from GitHub
            logger.info("GitHub callback: fetching user profile")
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github+json",
            }
            user_response = await client.get(GITHUB_USER_URL, headers=headers)
            logger.info(
                f"GitHub callback: got user response status {user_response.status_code}"
            )
            if user_response.status_code >= 400:
                logger.error(
                    f"GitHub callback: user response body {user_response.text[:500]}"
                )
            user_response.raise_for_status()
            user_data = user_response.json()

            github_id_raw = user_data.get("id")
            github_id = str(github_id_raw) if github_id_raw is not None else None
            login = user_data.get("login")
            name = user_data.get("name") or login
            avatar_url = user_data.get("avatar_url")
            email = user_data.get("email")

            logger.info(f"GitHub callback: user github_id={github_id} login={login}")
            logger.info(f"GitHub callback: user email={email}")

            if not github_id or not login:
                raise ValueError("GitHub user profile is missing id or login")

            # Step 3: If email is null, fetch from emails endpoint
            if not email:
                logger.info("GitHub callback: user email missing, fetching user emails")
                emails_response = await client.get(GITHUB_EMAIL_URL, headers=headers)
                logger.info(
                    f"GitHub callback: got emails response status {emails_response.status_code}"
                )
                if emails_response.status_code >= 400:
                    logger.error(
                        f"GitHub callback: emails response body {emails_response.text[:500]}"
                    )
                emails_response.raise_for_status()
                emails_data = emails_response.json()
                logger.info(f"GitHub callback: received {len(emails_data)} email records")

                for email_item in emails_data:
                    if email_item.get("primary") and email_item.get("verified"):
                        email = email_item.get("email")
                        break

                logger.info(f"GitHub callback: selected fallback email={email}")

            if not email:
                logger.error(f"No verified email found for GitHub user {login}")
                return RedirectResponse(
                    url=f"{settings.FRONTEND_URL}/login?error=github_no_email"
                )

            email = email.lower().strip()

        # Step 4: Find or create user
        # Check by github_id first
        logger.info("GitHub callback: creating/finding user in DB")
        logger.info(f"GitHub callback: looking up user by github_id={github_id}")
        result = await db.execute(select(User).where(User.github_id == github_id))
        user = result.scalar_one_or_none()

        if user:
            logger.info(
                f"GitHub callback: found existing user by github_id user_id={user.id}"
            )
            # Update avatar if empty and update last_login
            if not user.avatar_url and avatar_url:
                user.avatar_url = avatar_url
            user.last_login = datetime.utcnow()
            await db.commit()
            logger.info(f"GitHub callback: updated existing user user_id={user.id}")
        else:
            # Check by email
            logger.info(
                f"GitHub callback: no user found by github_id; looking up by email={email}"
            )
            result = await db.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()

            if user:
                logger.info(
                    f"GitHub callback: found existing user by email user_id={user.id}"
                )
                # Link github_id to existing user
                user.github_id = github_id
                user.github_username = login
                user.auth_provider = "github"
                user.is_verified = True
                if not user.avatar_url and avatar_url:
                    user.avatar_url = avatar_url
                user.last_login = datetime.utcnow()
                await db.commit()
                logger.info(
                    f"GitHub callback: linked GitHub account to user_id={user.id}"
                )
            else:
                # Create new user
                logger.info("GitHub callback: creating new user in DB")
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
                logger.info(f"GitHub callback: created new user user_id={user.id}")

                # Send welcome email
                bg_tasks.add_task(send_welcome_email, email, name, "github")
                logger.info("GitHub callback: queued welcome email")

        # Step 5: Issue JWT tokens
        logger.info("GitHub callback: generating JWT")
        access_jwt = create_access_token({"sub": str(user.id), "email": user.email})
        refresh_jwt = create_refresh_token({"sub": str(user.id), "email": user.email})

        # Step 5: Redirect to frontend with tokens
        # New users who haven't set a username yet go to onboarding
        needs_onboarding = not user.onboarding_complete
        callback_params = {
            "access_token": access_jwt,
            "refresh_token": refresh_jwt,
            "needs_onboarding": "true" if needs_onboarding else "false",
        }
        callback_url = f"{settings.FRONTEND_URL}/auth/callback?{urlencode(callback_params)}"
        safe_callback_url = (
            f"{settings.FRONTEND_URL}/auth/callback"
            f"?access_token=<redacted>&refresh_token=<redacted>"
            f"&needs_onboarding={callback_params['needs_onboarding']}"
        )
        logger.info(f"GitHub callback: redirecting to {safe_callback_url}")
        return RedirectResponse(url=callback_url)

    except Exception:
        import traceback

        logger.error(f"GitHub callback failed: {traceback.format_exc()}")
        try:
            await db.rollback()
        except Exception:
            logger.error(f"GitHub callback rollback failed: {traceback.format_exc()}")
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL}/login?error=github_failed"
        )
