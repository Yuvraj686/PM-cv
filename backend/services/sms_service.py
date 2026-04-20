import logging
from datetime import datetime
from pathlib import Path
from core.config import settings

logger = logging.getLogger(__name__)

def send_otp_sms(phone_number: str, otp: str):
    """Send OTP SMS via Twilio."""
    if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN or not settings.TWILIO_PHONE_NUMBER:
        _mock_sms(phone_number, otp)
        return
    
    try:
        from twilio.rest import Client
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        message = client.messages.create(
            body=f"Your ProjectHub verification code is: {otp}\nValid for 10 minutes. Do not share this code.",
            from_=settings.TWILIO_PHONE_NUMBER,
            to=phone_number
        )
        logger.info(f"OTP SMS sent to {phone_number} (SID: {message.sid})")
    except Exception as e:
        logger.error(f"Failed to send OTP SMS: {e}")
        _mock_sms(phone_number, otp)


def _mock_sms(phone_number: str, otp: str):
    """Fallback: write SMS to file when Twilio is unavailable."""
    Path("/tmp/sms").mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"/tmp/sms/{phone_number.replace('+', '')}_{timestamp}.txt"
    
    with open(filename, "w") as f:
        f.write(f"To: {phone_number}\nOTP: {otp}\nMessage: Your ProjectHub verification code is: {otp}\nValid for 10 minutes. Do not share this code.\n")
    
    logger.info(f"MOCK SMS → {filename}")
