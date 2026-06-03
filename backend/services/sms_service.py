import structlog
from datetime import datetime
from pathlib import Path

logger = structlog.get_logger()


def send_otp_sms(phone_number: str, otp: str):
    """Send OTP SMS — logs to console (no external SMS provider configured)."""
    logger.info("send_otp_sms_started", phone_number=mask_phone(phone_number))
    logger.info(f"📱 OTP SMS → {mask_phone(phone_number)}: {otp}")
    _mock_sms(phone_number, otp)


def _mock_sms(phone_number: str, otp: str):
    """Write OTP to a local file for development/testing."""
    Path("/tmp/sms").mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"/tmp/sms/{phone_number.replace('+', '')}_{timestamp}.txt"

    with open(filename, "w") as f:
        f.write(
            f"To: {phone_number}\n"
            f"OTP: {otp}\n"
            f"Message: Your ProjectHub verification code is: {otp}\n"
            f"Valid for 10 minutes. Do not share this code.\n"
        )

    logger.info(f"MOCK SMS → {filename}")


def mask_phone(phone: str) -> str:
    if len(phone) < 5:
        return phone
    return phone[:3] + "***" + phone[-2:]
