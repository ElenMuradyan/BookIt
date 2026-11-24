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
