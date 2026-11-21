import asyncio
import logging
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage as StdEmailMessage
from typing import Protocol

import httpx
from fastapi import BackgroundTasks

from app.core.config import get_settings

logger = logging.getLogger("bookit.notifications")


@dataclass(frozen=True)
class DispatchedEmail:
    to_email: str
    subject: str
    body: str
    html_body: str | None = None


_test_email_outbox: list[DispatchedEmail] = []


def get_test_email_outbox() -> list[DispatchedEmail]:
    """Only populated when ENVIRONMENT == 'test' for automated verification assertions."""
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
    ) -> None: ...

    async def send_push(self, *, user_id: str, title: str, body: str) -> None: ...


class LogOnlyDispatcher:
    async def send_email(
        self,
        *,
        to_email: str,
        subject: str,
        body: str,
        html_body: str | None = None,
    ) -> None:
        settings = get_settings()
        if settings.environment == "test":
            _test_email_outbox.append(
                DispatchedEmail(to_email=to_email, subject=subject, body=body, html_body=html_body)
            )
        logger.info("Notification email queued (log_only)", extra={"path": to_email, "method": subject})

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
    ) -> None:
        try:
            await asyncio.to_thread(
                self._send_sync,
                to_email=to_email,
                subject=subject,
                body=body,
                html_body=html_body,
            )
            logger.info("Notification email sent via SMTP", extra={"path": to_email, "method": subject})
        except Exception:
            logger.exception("Failed to send SMTP email", extra={"path": to_email, "method": subject})

    async def send_push(self, *, user_id: str, title: str, body: str) -> None:
        logger.info("Notification push queued (smtp fallback log)", extra={"user_id": user_id, "method": title})


class ResendDispatcher:
    def __init__(self, *, api_key: str, from_email: str) -> None:
        self.api_key = api_key
        self.from_email = from_email

    async def send_email(
        self,
        *,
        to_email: str,
        subject: str,
        body: str,
        html_body: str | None = None,
    ) -> None:
        payload: dict[str, object] = {
            "from": self.from_email,
            "to": [to_email],
            "subject": subject,
            "text": body,
        }
        if html_body:
            payload["html"] = html_body
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                resp.raise_for_status()
            logger.info("Notification email sent via Resend", extra={"path": to_email, "method": subject})
        except Exception:
            logger.exception("Failed to send Resend email", extra={"path": to_email, "method": subject})

    async def send_push(self, *, user_id: str, title: str, body: str) -> None:
        logger.info("Notification push queued (resend fallback log)", extra={"user_id": user_id, "method": title})


def get_dispatcher() -> NotificationDispatcher:
    settings = get_settings()
    if settings.email_provider == "smtp" and settings.smtp_host:
        return SMTPDispatcher(
            host=settings.smtp_host,
            port=settings.smtp_port,
            from_email=settings.email_from,
            user=settings.smtp_user,
            password=settings.smtp_password,
            use_tls=settings.smtp_use_tls,
        )
    if settings.email_provider == "resend" and settings.resend_api_key:
        return ResendDispatcher(
            api_key=settings.resend_api_key,
            from_email=settings.email_from,
        )
    if settings.email_provider != "log_only":
        logger.warning(
            "Configured email provider is missing credentials; falling back to log_only",
            extra={"path": settings.email_provider},
        )
    return LogOnlyDispatcher()


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
        dispatcher.send_email,
        to_email=to_email,
        subject=subject,
        body=body,
        html_body=html_body,
    )
