import re
from datetime import datetime
from typing import Literal

from pydantic import EmailStr, Field, field_validator, model_validator

from app.schemas.common import CamelModel


def validate_strong_password(password: str) -> str:
    if len(password) < 8:
        raise ValueError("Use at least 8 characters")
    if not re.search(r"[a-z]", password):
        raise ValueError("Add a lowercase letter")
    if not re.search(r"[A-Z]", password):
        raise ValueError("Add an uppercase letter")
    if not re.search(r"\d", password):
        raise ValueError("Add a number")
    if not re.search(r"[^A-Za-z0-9]", password):
        raise ValueError("Add a symbol")
    return password


class NotificationPreferencesOut(CamelModel):
    booking: bool = True
    order: bool = True
    promotion: bool = False
    message: bool = True
    security: bool = True


class UserOut(CamelModel):
    id: str
    first_name: str
    last_name: str
    username: str
    email: str
    phone: str
    avatar_url: str | None = None
    date_of_birth: str | None = None
    gender: str | None = None
    location: str | None = None
    language: str
    interests: list[str]
    email_verified: bool
    phone_verified: bool
    status: str
    is_platform_admin: bool
    created_at: datetime
    updated_at: datetime


class CustomerProfileOut(CamelModel):
    user_id: str
    interests: list[str]
    language: str
    marketing_opt_in: bool
    personalization_consent: bool
    consent_updated_at: datetime | None = None
    spending_visibility: Literal["recorded_only", "include_estimates"]
    theme: Literal["dark", "light", "system"]
    notification_preferences: NotificationPreferencesOut


class AddressOut(CamelModel):
    id: str
    user_id: str
    label: str
    line1: str
    line2: str | None = None
    city: str
    region: str
    postal_code: str
    country: str
    is_default: bool


class AddressCreateIn(CamelModel):
    label: str = Field(min_length=2, max_length=80)
    line1: str = Field(min_length=4, max_length=255)
    line2: str | None = Field(default=None, max_length=255)
    city: str = Field(min_length=2, max_length=120)
    region: str = Field(min_length=2, max_length=120)
    postal_code: str = Field(min_length=3, max_length=32)
    country: str = Field(min_length=2, max_length=120)


class WorkspaceOut(CamelModel):
    business_id: str
    business_name: str
    role: str
    status: str
    category: str
    city: str


class RegisterIn(CamelModel):
    first_name: str = Field(min_length=1, max_length=120)
    last_name: str = Field(min_length=1, max_length=120)
    username: str = Field(min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_]+$")
    email: EmailStr
    phone: str = Field(min_length=7, max_length=40)
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str
    date_of_birth: str | None = None
    gender: str | None = None
    location: str | None = None
    language: str = "English"
    interests: list[str] = Field(default_factory=list)
    personalization_consent: bool = False
    accept_terms: bool

    @field_validator("password")
    @classmethod
    def check_password_strength(cls, v: str) -> str:
        return validate_strong_password(v)

    @model_validator(mode="after")
    def check_confirm_and_terms(self) -> "RegisterIn":
        if not self.accept_terms:
            raise ValueError("Accept the terms to continue")
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


class LoginIn(CamelModel):
    identifier: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    remember: bool = False


class RefreshIn(CamelModel):
    refresh_token: str | None = None


class AuthSessionOut(CamelModel):
    user_id: str
    business_id: str | None = None
    token_type: str = "bearer"
    expires_in: int
    access_token: str | None = None
    refresh_token: str | None = None
    csrf_token: str | None = None
    user: UserOut
    profile: CustomerProfileOut | None = None
    workspaces: list[WorkspaceOut] = Field(default_factory=list)


class VerifyContactIn(CamelModel):
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")
    identifier: str | None = Field(default=None, min_length=3, max_length=255)
    email: EmailStr | None = None


class VerifyTokenIn(CamelModel):
    token: str = Field(min_length=20, max_length=256)


class VerifyResendIn(CamelModel):
    identifier: str | None = Field(default=None, min_length=3, max_length=255)
    email: EmailStr | None = None


class PasswordResetRequestIn(CamelModel):
    identifier: str = Field(min_length=3, max_length=255)


class PasswordResetConfirmIn(CamelModel):
    identifier: str = Field(min_length=3, max_length=255)
    code: str = Field(min_length=6, max_length=6)
    password: str = Field(min_length=8, max_length=128)
    confirm_password: str

    @field_validator("password")
    @classmethod
    def check_password_strength(cls, v: str) -> str:
        return validate_strong_password(v)

    @model_validator(mode="after")
    def check_match(self) -> "PasswordResetConfirmIn":
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


class ChangePasswordIn(CamelModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)
    confirm_password: str

    @field_validator("new_password")
    @classmethod
    def check_password_strength(cls, v: str) -> str:
        return validate_strong_password(v)

    @model_validator(mode="after")
    def check_match(self) -> "ChangePasswordIn":
        if self.new_password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


class ProfileUpdateIn(CamelModel):
    first_name: str | None = Field(default=None, min_length=1, max_length=120)
    last_name: str | None = Field(default=None, min_length=1, max_length=120)
    phone: str | None = Field(default=None, min_length=7, max_length=40)
    location: str | None = Field(default=None, max_length=255)
    language: str | None = Field(default=None, max_length=64)
    interests: list[str] | None = None
    avatar_url: str | None = None
    date_of_birth: str | None = None
    gender: str | None = None


class ConsentUpdateIn(CamelModel):
    consent: bool


class ThemeUpdateIn(CamelModel):
    theme: Literal["dark", "light", "system"]


class SpendingVisibilityIn(CamelModel):
    visibility: Literal["recorded_only", "include_estimates"]


class NotificationPrefsUpdateIn(CamelModel):
    booking: bool | None = None
    order: bool | None = None
    promotion: bool | None = None
    message: bool | None = None
    security: bool | None = None
