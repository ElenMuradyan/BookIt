import asyncio
import logging
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage as StdEmailMessage
from typing import Protocol

import httpx
from fastapi import BackgroundTasks, status

from app.core.config import get_settings

logger = logging.getLogger("bookit.notifications")


class EmailDeliveryError(Exception):
    """Raised when transactional email delivery is misconfigured or rejected by the provider."""

    def __init__(self, message: str, *, status_code: int = status.HTTP_502_BAD_GATEWAY) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True)
class DispatchedEmail:
    to_email: str
    subject: str
    body: str
    html_body: str | None = None


_test_email_outbox: list[DispatchedEmail] = []


def get_test_email_outbox() -> list[DispatchedEmail]:
    """Only populated when ENVIRONMENT == 'test' and EMAIL_PROVIDER == 'log_only'."""
    return list(_test_email_outbox)


def clear_test_email_outbox() -> None:
    _test_email_outbox.clear()


class NotificationDispatcher(Protocol):
    async def send_email(
        self,
        *,
        to_email: str,
        subject: str,
        body: str,
        html_body: str | None = None,
        idempotency_key: str | None = None,
    ) -> str | None: ...

    async def send_push(self, *, user_id: str, title: str, body: str) -> None: ...


class LogOnlyDispatcher:
    async def send_email(
        self,
        *,
        to_email: str,
        subject: str,
        body: str,
        html_body: str | None = None,
        idempotency_key: str | None = None,
    ) -> str | None:
        del idempotency_key
        settings = get_settings()
        if settings.environment == "test":
            _test_email_outbox.append(
                DispatchedEmail(to_email=to_email, subject=subject, body=body, html_body=html_body)
            )
        logger.info("Notification email queued (log_only)", extra={"path": to_email, "method": subject})
        return None

    async def send_push(self, *, user_id: str, title: str, body: str) -> None:
        logger.info("Notification push queued (log_only)", extra={"user_id": user_id, "method": title})


class SMTPDispatcher:
    def __init__(
        self,
        *,
        host: str,
        port: int,
        from_email: str,
        user: str | None,
        password: str | None,
        use_tls: bool,
    ) -> None:
        self.host = host
        self.port = port
        self.from_email = from_email
        self.user = user
        self.password = password
        self.use_tls = use_tls

    def _send_sync(
        self,
        *,
        to_email: str,
        subject: str,
        body: str,
        html_body: str | None,
    ) -> None:
        msg = StdEmailMessage()
        msg["Subject"] = subject
        msg["From"] = self.from_email
        msg["To"] = to_email
        msg.set_content(body)
        if html_body:
            msg.add_alternative(html_body, subtype="html")

        with smtplib.SMTP(self.host, self.port, timeout=15) as server:
            server.ehlo()
            if self.use_tls:
                server.starttls()
                server.ehlo()
            if self.user and self.password:
                server.login(self.user, self.password)
            server.send_message(msg)

    async def send_email(
        self,
        *,
        to_email: str,
        subject: str,
        body: str,
        html_body: str | None = None,
        idempotency_key: str | None = None,
    ) -> str | None:
        del idempotency_key
        try:
            await asyncio.to_thread(
                self._send_sync,
                to_email=to_email,
                subject=subject,
                body=body,
                html_body=html_body,
            )
            logger.info("Notification email sent via SMTP", extra={"path": to_email, "method": subject})
            return None
        except Exception as exc:
            logger.error(
                "SMTP email delivery failed",
                extra={"path": to_email, "method": subject, "error_type": type(exc).__name__},
            )
            raise EmailDeliveryError(
                "Unable to send email right now. Please try again later.",
                status_code=status.HTTP_502_BAD_GATEWAY,
            ) from exc

    async def send_push(self, *, user_id: str, title: str, body: str) -> None:
        logger.info("Notification push queued (smtp fallback log)", extra={"user_id": user_id, "method": title})


class ResendDispatcher:
    def __init__(
        self,
        *,
        api_key: str,
        from_email: str,
        api_base_url: str = "https://api.resend.com",
    ) -> None:
        self.api_key = api_key
        self.from_email = from_email
        self.api_base_url = api_base_url.rstrip("/")

    async def send_email(
        self,
        *,
        to_email: str,
        subject: str,
        body: str,
        html_body: str | None = None,
        idempotency_key: str | None = None,
    ) -> str | None:
        payload: dict[str, object] = {
            "from": self.from_email,
            "to": [to_email],
            "subject": subject,
            "text": body,
        }
        if html_body:
            payload["html"] = html_body

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"{self.api_base_url}/emails",
                    headers=headers,
                    json=payload,
                )
        except httpx.HTTPError as exc:
            logger.error(
                "Resend HTTP transport error",
                extra={"path": to_email, "method": subject, "error_type": type(exc).__name__},
            )
            raise EmailDeliveryError(
                "Unable to reach email provider right now. Please try again later.",
                status_code=status.HTTP_502_BAD_GATEWAY,
            ) from exc

        if resp.status_code >= 400:
            error_name: str | None = None
            try:
                err_json = resp.json()
                if isinstance(err_json, dict) and isinstance(err_json.get("name"), str):
                    error_name = err_json["name"]
            except ValueError:
                error_name = None

            logger.error(
                "Resend API rejected email delivery",
                extra={
                    "path": to_email,
                    "method": subject,
                    "status_code": resp.status_code,
                    "provider_error": error_name,
                },
            )
            if resp.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
                raise EmailDeliveryError(
                    "Email service is temporarily busy. Please try again shortly.",
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            raise EmailDeliveryError(
                "Unable to send email right now. Please try again later.",
                status_code=status.HTTP_502_BAD_GATEWAY,
            )

        message_id: str | None = None
        try:
            body_json = resp.json()
            if isinstance(body_json, dict) and isinstance(body_json.get("id"), str):
                message_id = body_json["id"]
        except ValueError:
            message_id = None

        logger.info(
            "Notification email sent via Resend",
            extra={"path": to_email, "method": subject, "message_id": message_id},
        )
        return message_id

    async def send_push(self, *, user_id: str, title: str, body: str) -> None:
        logger.info("Notification push queued (resend fallback log)", extra={"user_id": user_id, "method": title})


def get_dispatcher() -> NotificationDispatcher:
    settings = get_settings()
    if settings.email_provider == "resend":
        if not settings.resend_api_key or not settings.email_from:
            logger.error("Resend email provider is enabled but missing RESEND_API_KEY or EMAIL_FROM")
            raise EmailDeliveryError(
                "Email delivery service is not configured. Please contact support or try again later.",
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return ResendDispatcher(
            api_key=settings.resend_api_key,
            from_email=settings.email_from,
            api_base_url=settings.resend_api_base_url,
        )

    if settings.email_provider == "smtp":
        if not settings.smtp_host or not settings.email_from:
            logger.error("SMTP email provider is enabled but missing SMTP_HOST or EMAIL_FROM")
            raise EmailDeliveryError(
                "Email delivery service is not configured. Please contact support or try again later.",
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        return SMTPDispatcher(
            host=settings.smtp_host,
            port=settings.smtp_port,
            from_email=settings.email_from,
            user=settings.smtp_user,
            password=settings.smtp_password,
            use_tls=settings.smtp_use_tls,
        )

    return LogOnlyDispatcher()


def ensure_email_provider_ready() -> NotificationDispatcher:
    return get_dispatcher()


async def send_email_notification(
    *,
    to_email: str,
    subject: str,
    body: str,
    html_body: str | None = None,
    idempotency_key: str | None = None,
) -> str | None:
    dispatcher = get_dispatcher()
    return await dispatcher.send_email(
        to_email=to_email,
        subject=subject,
        body=body,
        html_body=html_body,
        idempotency_key=idempotency_key,
    )


import html
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import CustomerProfile, User


async def _run_scheduled_email(
    dispatcher: NotificationDispatcher,
    *,
    to_email: str,
    subject: str,
    body: str,
    html_body: str | None,
) -> None:
    try:
        await dispatcher.send_email(
            to_email=to_email,
            subject=subject,
            body=body,
            html_body=html_body,
        )
    except EmailDeliveryError as exc:
        logger.error(
            "Background email delivery failed",
            extra={"path": to_email, "method": subject, "status_code": exc.status_code},
        )


def schedule_email_notification(
    background_tasks: BackgroundTasks,
    *,
    to_email: str,
    subject: str,
    body: str,
    html_body: str | None = None,
) -> None:
    dispatcher = get_dispatcher()
    background_tasks.add_task(
        _run_scheduled_email,
        dispatcher,
        to_email=to_email,
        subject=subject,
        body=body,
        html_body=html_body,
    )


def _render_transactional_html(*, heading: str, summary: str, details: list[tuple[str, str]]) -> str:
    rows = "".join(
        f"<tr><td style='padding:6px 12px 6px 0;color:#666;font-size:13px'>{html.escape(k)}</td>"
        f"<td style='padding:6px 0;color:#111;font-size:13px;font-weight:600'>{html.escape(v)}</td></tr>"
        for k, v in details
        if v
    )
    table_html = f"<table style='margin-top:12px;border-collapse:collapse'>{rows}</table>" if rows else ""
    return (
        "<div style='font-family:Arial,sans-serif;max-width:540px;margin:0 auto;padding:20px;color:#111'>"
        f"<h2 style='margin:0 0 8px;font-size:18px'>{html.escape(heading)}</h2>"
        f"<p style='margin:0 0 12px;color:#333;font-size:14px;line-height:1.5'>{html.escape(summary)}</p>"
        f"{table_html}"
        "<p style='margin-top:20px;color:#777;font-size:12px'>BookIt Marketplace</p>"
        "</div>"
    )


def build_booking_lifecycle_email(
    *,
    event_kind: str,
    recipient_name: str,
    business_name: str,
    title: str,
    when_label: str,
    status_label: str,
    check_in_code: str | None = None,
    reason: str | None = None,
) -> tuple[str, str, str]:
    subject_map = {
        "created": f"Booking {status_label}: {title} at {business_name}",
        "confirmed": f"Booking confirmed: {title} at {business_name}",
        "cancelled": f"Booking cancelled: {title} at {business_name}",
        "rejected": f"Booking update: {title} at {business_name}",
        "rescheduled": f"Booking rescheduled: {title} at {business_name}",
        "reminder": f"Reminder: upcoming {title} at {business_name}",
    }
    subject = subject_map.get(event_kind, f"Booking update: {title}")
    lines = [
        f"Hi {recipient_name},",
        "",
        f"{business_name} update for {title}:",
        f"When: {when_label}",
        f"Status: {status_label}",
    ]
    if check_in_code:
        lines.append(f"Check-in code: {check_in_code}")
    if reason:
        lines.append(f"Note: {reason}")
    body = "\n".join(lines)
    details = [
        ("Business", business_name),
        ("Booking", title),
        ("When", when_label),
        ("Status", status_label),
    ]
    if check_in_code:
        details.append(("Check-in code", check_in_code))
    if reason:
        details.append(("Note", reason))
    html_body = _render_transactional_html(
        heading=subject,
        summary=f"Hi {recipient_name}, here are your latest reservation details.",
        details=details,
    )
    return subject, body, html_body


def build_payment_lifecycle_email(
    *,
    event_kind: str,
    recipient_name: str,
    amount: float,
    currency: str,
    reference_type: str,
    reference_id: str,
    reason: str | None = None,
) -> tuple[str, str, str]:
    amt = f"{currency} {amount:.2f}"
    if event_kind == "succeeded":
        subject = f"Payment receipt ({amt})"
        summary = f"Hi {recipient_name}, your payment of {amt} for {reference_type} {reference_id} succeeded."
    elif event_kind == "failed":
        subject = f"Action required: payment failed ({amt})"
        summary = f"Hi {recipient_name}, your payment of {amt} for {reference_type} {reference_id} did not go through."
    else:
        subject = f"Refund processed ({amt})"
        summary = f"Hi {recipient_name}, a refund of {amt} for {reference_type} {reference_id} was recorded."
    lines = [summary]
    if reason:
        lines.append(f"Details: {reason}")
    body = "\n".join(lines)
    details = [
        ("Amount", amt),
        ("Reference", f"{reference_type} ({reference_id})"),
    ]
    if reason:
        details.append(("Details", reason))
    html_body = _render_transactional_html(heading=subject, summary=summary, details=details)
    return subject, body, html_body


def build_application_review_email(
    *,
    recipient_name: str,
    business_name: str,
    status_label: str,
    reviewer_note: str | None = None,
) -> tuple[str, str, str]:
    subject = f"Business application update for {business_name}: {status_label}"
    summary = f"Hi {recipient_name}, your BookIt merchant application for {business_name} is now '{status_label}'."
    lines = [summary]
    if reviewer_note:
        lines.append(f"Reviewer note: {reviewer_note}")
    body = "\n".join(lines)
    details = [("Business", business_name), ("Status", status_label)]
    if reviewer_note:
        details.append(("Reviewer note", reviewer_note))
    html_body = _render_transactional_html(heading=subject, summary=summary, details=details)
    return subject, body, html_body


def build_subscription_lifecycle_email(
    *,
    recipient_name: str,
    business_name: str,
    event_kind: str,
    plan_name: str,
    status_label: str,
    detail: str | None = None,
) -> tuple[str, str, str]:
    subject_map = {
        "changed": f"Subscription updated for {business_name}",
        "renewed": f"Subscription renewed for {business_name}",
        "canceled": f"Subscription canceled for {business_name}",
        "past_due": f"Subscription payment past due for {business_name}",
    }
    subject = subject_map.get(event_kind, f"Subscription update for {business_name}")
    summary = f"Hi {recipient_name}, {business_name} ({plan_name}) subscription status is '{status_label}'."
    lines = [summary]
    if detail:
        lines.append(detail)
    body = "\n".join(lines)
    details = [("Business", business_name), ("Plan", plan_name), ("Status", status_label)]
    if detail:
        details.append(("Detail", detail))
    html_body = _render_transactional_html(heading=subject, summary=summary, details=details)
    return subject, body, html_body


async def send_user_transactional_email(
    db: AsyncSession,
    *,
    user_id: str,
    category: str,
    subject: str,
    body: str,
    html_body: str | None = None,
    idempotency_key: str | None = None,
) -> tuple[bool, str]:
    """
    Dispatch transactional email respecting NotificationPreferences when applicable,
    and return an explicit (delivered, status) tuple without raising into callers unless raised directly.
    """
    user = await db.get(User, user_id)
    if not user or not user.email:
        return False, "recipient_missing"

    if category != "security":
        profile = await db.get(CustomerProfile, user_id)
        prefs = (profile.notification_preferences or {}) if profile else {}
        if category in ("booking", "reminder") and prefs.get("booking", True) is False:
            return False, "skipped_by_preference"
        if category == "order" and prefs.get("order", True) is False:
            return False, "skipped_by_preference"
        if category == "promotion" and prefs.get("promotion", False) is False:
            return False, "skipped_by_preference"
        if category == "message" and prefs.get("message", True) is False:
            return False, "skipped_by_preference"

    try:
        dispatcher = get_dispatcher()
        provider_id = await dispatcher.send_email(
            to_email=user.email,
            subject=subject,
            body=body,
            html_body=html_body,
            idempotency_key=idempotency_key,
        )
    except EmailDeliveryError as exc:
        logger.error(
            "Transactional email delivery failed",
            extra={"user_id": user_id, "method": subject, "status_code": exc.status_code},
        )
        return False, "failed"

    settings = get_settings()
    if settings.email_provider == "log_only":
        return True, "queued_log_only"
    return True, f"sent:{provider_id}" if provider_id else "sent"

