from pydantic import BaseModel, EmailStr, field_validator
import re


class RegisterEmailRequest(BaseModel):
    name: str
    email: EmailStr
    password: str

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v):
        if not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip()

    @field_validator("password")
    @classmethod
    def strong_password(cls, v):
        if len(v) < 8:
            raise ValueError("Minimum 8 characters")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Must contain an uppercase letter")
        if not re.search(r"[0-9]", v):
            raise ValueError("Must contain a number")
        return v


class LoginEmailRequest(BaseModel):
    email: EmailStr
    password: str


class PhoneSendOTPRequest(BaseModel):
    phone_number: str

    @field_validator("phone_number")
    @classmethod
    def valid_e164(cls, v):
        if not re.match(r"^\+[1-9]\d{6,14}$", v):
            raise ValueError("Use E.164 format: +91XXXXXXXXXX")
        return v


class PhoneVerifyOTPRequest(BaseModel):
    phone_number: str
    otp: str
    name: str


class PhoneResendOTPRequest(BaseModel):
    phone_number: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class ResendVerificationRequest(BaseModel):
    email: EmailStr


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    user: dict
