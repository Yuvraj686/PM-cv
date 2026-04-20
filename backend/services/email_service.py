import httpx
import logging
from datetime import datetime
from core.config import settings
from pathlib import Path
import os

logger = logging.getLogger(__name__)

async def send_verification_email(to: str, name: str, token: str):
    """Send email verification with dark theme HTML."""
    subject = "Verify your ProjectHub email"
    verification_url = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    
    html_body = f"""
    <html style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
    <body style="margin: 0; padding: 0; background-color: #0F1117;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0F1117;">
            <tr>
                <td align="center" style="padding: 40px 20px;">
                    <table width="100%" max-width="600px" cellpadding="0" cellspacing="0" style="background-color: #0F1117; border: 1px solid #30363D; border-radius: 12px; padding: 32px;">
                        <tr>
                            <td align="center">
                                <h2 style="color: #FFFFFF; margin: 0 0 16px 0; font-size: 24px; font-weight: 600;">Welcome to ProjectHub!</h2>
                                <p style="color: #8B949E; margin: 0 0 24px 0; font-size: 16px;">Hi {name},</p>
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <p style="color: #C9D1D9; margin: 0 0 24px 0; line-height: 1.6; font-size: 14px;">
                                    Please verify your email address to activate your ProjectHub account and start collaborating with your team.
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td align="center" style="padding: 24px 0;">
                                <a href="{verification_url}" style="display: inline-block; background-color: #6366F1; color: #FFFFFF; padding: 12px 32px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 14px;">
                                    Verify my email
                                </a>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 24px 0; border-top: 1px solid #30363D;">
                                <p style="color: #8B949E; margin: 0; font-size: 12px; line-height: 1.6;">
                                    This link expires in 24 hours. If you didn't create this account, please ignore this email.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    
    if not settings.RESEND_API_KEY:
        logger.info(f"📧 VERIFICATION EMAIL (Development Mode)")
        logger.info(f"   To: {to}")
        logger.info(f"   Subject: {subject}")
        logger.info(f"   Verification Link: {settings.FRONTEND_URL}/verify-email?token={token}")
        return
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
                json={
                    "from": settings.FROM_EMAIL,
                    "to": to,
                    "subject": subject,
                    "html": html_body
                }
            )
            response.raise_for_status()
            logger.info(f"✅ Verification email sent to {to}")
    except Exception as e:
        logger.error(f"Failed to send email via Resend (status 403 usually means invalid API key)")
        logger.info(f"📧 VERIFICATION EMAIL (Fallback - Development Mode)")
        logger.info(f"   To: {to}")
        logger.info(f"   Subject: {subject}")
        logger.info(f"   Verification Link: {settings.FRONTEND_URL}/verify-email?token={token}")


async def send_password_reset_email(to: str, name: str, token: str):
    """Send password reset email with dark theme HTML."""
    subject = "Reset your ProjectHub password"
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    
    html_body = f"""
    <html style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
    <body style="margin: 0; padding: 0; background-color: #0F1117;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0F1117;">
            <tr>
                <td align="center" style="padding: 40px 20px;">
                    <table width="100%" max-width="600px" cellpadding="0" cellspacing="0" style="background-color: #0F1117; border: 1px solid #30363D; border-radius: 12px; padding: 32px;">
                        <tr>
                            <td align="center">
                                <h2 style="color: #FFFFFF; margin: 0 0 16px 0; font-size: 24px; font-weight: 600;">Reset Your Password</h2>
                                <p style="color: #8B949E; margin: 0 0 24px 0; font-size: 16px;">Hi {name},</p>
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <p style="color: #C9D1D9; margin: 0 0 24px 0; line-height: 1.6; font-size: 14px;">
                                    We received a request to reset your ProjectHub password. Click the button below to set a new password.
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td align="center" style="padding: 24px 0;">
                                <a href="{reset_url}" style="display: inline-block; background-color: #6366F1; color: #FFFFFF; padding: 12px 32px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 14px;">
                                    Reset password
                                </a>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 24px 0; border-top: 1px solid #30363D;">
                                <p style="color: #8B949E; margin: 0; font-size: 12px; line-height: 1.6;">
                                    This link expires in 1 hour. If you didn't request a password reset, please ignore this email.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    
    if not settings.RESEND_API_KEY:
        logger.info(f"📧 PASSWORD RESET EMAIL (Development Mode)")
        logger.info(f"   To: {to}")
        logger.info(f"   Subject: {subject}")
        logger.info(f"   Reset Link: {settings.FRONTEND_URL}/reset-password?token={token}")
        return
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
                json={
                    "from": settings.FROM_EMAIL,
                    "to": to,
                    "subject": subject,
                    "html": html_body
                }
            )
            response.raise_for_status()
            logger.info(f"✅ Password reset email sent to {to}")
    except Exception as e:
        logger.error(f"Failed to send email via Resend (status 403 usually means invalid API key)")
        logger.info(f"📧 PASSWORD RESET EMAIL (Fallback - Development Mode)")
        logger.info(f"   To: {to}")
        logger.info(f"   Subject: {subject}")
        logger.info(f"   Reset Link: {settings.FRONTEND_URL}/reset-password?token={token}")


async def send_welcome_email(to: str, name: str, provider: str):
    """Send welcome email with dark theme HTML."""
    subject = "Welcome to ProjectHub!"
    dashboard_url = f"{settings.FRONTEND_URL}/dashboard"
    
    provider_text = {
        "google": "Google",
        "github": "GitHub",
        "email": "email and password"
    }.get(provider, provider)
    
    html_body = f"""
    <html style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
    <body style="margin: 0; padding: 0; background-color: #0F1117;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0F1117;">
            <tr>
                <td align="center" style="padding: 40px 20px;">
                    <table width="100%" max-width="600px" cellpadding="0" cellspacing="0" style="background-color: #0F1117; border: 1px solid #30363D; border-radius: 12px; padding: 32px;">
                        <tr>
                            <td align="center">
                                <h2 style="color: #FFFFFF; margin: 0 0 16px 0; font-size: 24px; font-weight: 600;">Welcome to ProjectHub, {name}!</h2>
                            </td>
                        </tr>
                        <tr>
                            <td>
                                <p style="color: #C9D1D9; margin: 0 0 16px 0; line-height: 1.6; font-size: 14px;">
                                    Your account has been successfully created using {provider_text}. You're all set to start collaborating with your team and managing projects like a pro.
                                </p>
                                <p style="color: #C9D1D9; margin: 0 0 24px 0; line-height: 1.6; font-size: 14px;">
                                    Head to your dashboard to create your first project or join an existing one.
                                </p>
                            </td>
                        </tr>
                        <tr>
                            <td align="center" style="padding: 24px 0;">
                                <a href="{dashboard_url}" style="display: inline-block; background-color: #6366F1; color: #FFFFFF; padding: 12px 32px; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 14px;">
                                    Go to Dashboard
                                </a>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 24px 0; border-top: 1px solid #30363D;">
                                <p style="color: #8B949E; margin: 0; font-size: 12px; line-height: 1.6;">
                                    If you have any questions, feel free to reach out to our support team.
                                </p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """
    
    if not settings.RESEND_API_KEY:
        _mock_email(to, subject)
        return
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
                json={
                    "from": settings.FROM_EMAIL,
                    "to": to,
                    "subject": subject,
                    "html": html_body
                }
            )
            response.raise_for_status()
            logger.info(f"Welcome email sent to {to}")
    except Exception as e:
        logger.error(f"Failed to send welcome email: {e}")
        _mock_email(to, subject)


def _mock_email(to: str, subject: str):
    """Fallback: write email to file when API is unavailable."""
    Path("/tmp/emails").mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"/tmp/emails/{to.replace('@', '_')}_{timestamp}.txt"
    
    with open(filename, "w") as f:
        f.write(f"Subject: {subject}\nTo: {to}\n")
    
    logger.info(f"MOCK EMAIL → {filename}")
