from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
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
router = APIRouter(prefix="/google", tags=["google-oauth"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USER_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


@router.get("/")
async def google_auth():
    """Redirect to Google OAuth login."""
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",
        "prompt": "select_account"
    }
    
    query_string = "&".join([f"{k}={v}" for k, v in params.items()])
    return RedirectResponse(url=f"{GOOGLE_AUTH_URL}?{query_string}")


@router.get("/callback")
async def google_callback(
    code: str,
    db: AsyncSession = Depends(get_db),
    bg_tasks: BackgroundTasks = BackgroundTasks()
):
    """Handle Google OAuth callback."""
    try:
        # Step 1: Exchange code for token
        token_data = {
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET,
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code"
        }
        
        async with httpx.AsyncClient() as client:
            token_response = await client.post(GOOGLE_TOKEN_URL, data=token_data)
            token_response.raise_for_status()
            token_json = token_response.json()
            access_token = token_json.get("access_token")
        
        if not access_token:
            return RedirectResponse(url=f"{settings.FRONTEND_URL}/login?error=google_failed")
        
        # Step 2: Get user info from Google
        async with httpx.AsyncClient() as client:
            headers = {"Authorization": f"Bearer {access_token}"}
            user_response = await client.get(GOOGLE_USER_URL, headers=headers)
            user_response.raise_for_status()
            user_data = user_response.json()
        
        google_id = user_data.get("id")
        email = user_data.get("email")
        name = user_data.get("name")
        picture = user_data.get("picture")
        
        # Step 3: Find or create user
        # Check by google_id first
        result = await db.execute(select(User).where(User.google_id == google_id))
        user = result.scalar_one_or_none()
        
        if user:
            # Update avatar if empty and update last_login
            if not user.avatar_url and picture:
                user.avatar_url = picture
            user.last_login = datetime.utcnow()
            await db.commit()
        else:
            # Check by email
            result = await db.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()
            
            if user:
                # Link google_id to existing user
                user.google_id = google_id
                user.auth_provider = "google"
                user.is_verified = True
                if not user.avatar_url and picture:
                    user.avatar_url = picture
                user.last_login = datetime.utcnow()
                await db.commit()
            else:
                # Create new user
                user = User(
                    name=name,
                    email=email,
                    google_id=google_id,
                    avatar_url=picture,
                    auth_provider="google",
                    is_verified=True,
                    last_login=datetime.utcnow()
                )
                db.add(user)
                await db.commit()
                await db.refresh(user)
                
                # Send welcome email
                bg_tasks.add_task(send_welcome_email, email, name, "google")
        
        # Step 4: Issue JWT tokens
        access_jwt = create_access_token({"sub": str(user.id), "email": user.email})
        refresh_jwt = create_refresh_token({"sub": str(user.id), "email": user.email})
        
        # Step 5: Redirect to frontend with tokens
        callback_url = f"{settings.FRONTEND_URL}/auth/callback?access_token={access_jwt}&refresh_token={refresh_jwt}"
        return RedirectResponse(url=callback_url)
    
    except Exception as e:
        logger.error(f"Google OAuth error: {e}")
        return RedirectResponse(url=f"{settings.FRONTEND_URL}/login?error=google_failed")
