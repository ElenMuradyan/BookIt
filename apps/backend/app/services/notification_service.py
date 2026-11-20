import logging
from typing import Protocol

from fastapi import BackgroundTasks

from app.core.config import get_settings

logger = logging.getLogger("bookit.notifications")


class NotificationDispatcher(Protocol):
    async def send_email(self, *, to_email: str, subject: str, body: str) -> None: ...
    async def send_push(self, *, user_id: str, title: str, body: str) -> None: ...


class LogOnlyDispatcher:
    async def send_email(self, *, to_email: str, subject: str, body: str) -> None:
        logger.info("Notification email queued (log_only)", extra={"path": to_email, "method": subject})

    async def send_push(self, *, user_id: str, title: str, body: str) -> None:
        logger.info("Notification push queued (log_only)", extra={"user_id": user_id, "method": title})


def get_dispatcher() -> NotificationDispatcher:
    _ = get_settings()
    return LogOnlyDispatcher()


def schedule_email_notification(
    background_tasks: BackgroundTasks,
    *,
    to_email: str,
    subject: str,
    body: str,
) -> None:
    dispatcher = get_dispatcher()
    background_tasks.add_task(dispatcher.send_email, to_email=to_email, subject=subject, body=body)
