import httpx
import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import get_settings
from app.models.engagement import Notification
from tests.conftest import login_as


@pytest.mark.asyncio
async def test_transactional_emails_for_booking_reminder_application_subscription_and_preferences(
    client: AsyncClient,
    session_factory: async_sessionmaker[AsyncSession],
    monkeypatch: pytest.MonkeyPatch,
):
    settings = get_settings()
    prev = (
        settings.email_provider,
        settings.resend_api_key,
        settings.email_from,
        settings.resend_api_base_url,
    )
    settings.email_provider = "resend"
    settings.resend_api_key = "re_test_mock_key"
    settings.email_from = "BookIt <noreply@bookit-test.example>"
    settings.resend_api_base_url = "https://api.resend.com"

    sent_emails: list[dict] = []
    fail_resend = {"flag": False}
    original_post = httpx.AsyncClient.post

    async def fake_resend_post(self, url, *, headers=None, json=None, **kwargs):
        url_str = str(url)
        if not url_str.startswith("https://api.resend.com/emails"):
            return await original_post(self, url, headers=headers, json=json, **kwargs)
        if fail_resend["flag"]:
            return httpx.Response(
                502,
                json={"name": "application_error", "message": "Resend upstream error"},
                request=httpx.Request("POST", url_str),
            )
        sent_emails.append({"headers": dict(headers or {}), "json": dict(json or {})})
        return httpx.Response(
            200,
            json={"id": f"re_lifecycle_{len(sent_emails)}"},
            request=httpx.Request("POST", url_str),
        )

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_resend_post)

    try:
        cust = await login_as(client, "customer@bookit.demo")
        hc = {"Authorization": f"Bearer {cust['accessToken']}"}
        owner = await login_as(client, "business@bookit.demo")
        ho = {"Authorization": f"Bearer {owner['accessToken']}"}
        admin = await login_as(client, "admin@bookit.demo")
        ha = {"Authorization": f"Bearer {admin['accessToken']}"}

        # 1. Appointment creation dispatches transactional emails to customer & owner
        appt = await client.post(
            "/api/v1/bookings",
            headers=hc,
            json={
                "serviceId": "svc_signature",
                "employeeId": "emp_vance",
                "date": "2026-12-22",
                "time": "11:00",
                "paymentMethod": "in_person",
            },
        )
        assert appt.status_code == 201, appt.text
        booking_id = appt.json()["bookingId"]
        recipients = {m["json"]["to"][0] for m in sent_emails}
        assert {"customer@bookit.demo", "business@bookit.demo"}.issubset(recipients)

        # 2. Staff manual booking reminder creates Notification + dispatches Resend reminder email
        # Customer is denied (403); business owner succeeds
        denied_remind = await client.post(
            f"/api/v1/bookings/universal/{booking_id}/remind",
            headers=hc,
            json={"message": "See you soon!"},
        )
        assert denied_remind.status_code == 403

        sent_before_remind = len(sent_emails)
        ok_remind = await client.post(
            f"/api/v1/bookings/universal/{booking_id}/remind",
            headers=ho,
            json={"message": "Doors open 10 minutes before your appointment."},
        )
        assert ok_remind.status_code == 200, ok_remind.text
        assert ok_remind.json()["delivered"] is True
        assert ok_remind.json()["deliveryStatus"].startswith("sent:")
        assert len(sent_emails) == sent_before_remind + 1
        assert sent_emails[-1]["json"]["to"] == ["customer@bookit.demo"]
        assert "reminder" in sent_emails[-1]["json"]["subject"].lower()

        async with session_factory() as db:
            rem_notif = (
                await db.execute(
                    select(Notification).where(
                        Notification.user_id == "usr_elena",
                        Notification.category == "reminder",
                    )
                )
            ).scalar_one_or_none()
            assert rem_notif is not None

        # 3. Appointment cancellation sends lifecycle email
        sent_before_cancel = len(sent_emails)
        cancelled = await client.patch(
            f"/api/v1/bookings/universal/{booking_id}/status",
            headers=ho,
            json={"status": "cancelled", "reason": "Stylist rescheduled"},
        )
        assert cancelled.status_code == 200
        assert len(sent_emails) == sent_before_cancel + 1
        assert "cancelled" in sent_emails[-1]["json"]["subject"].lower()

        # 4. Admin application approval dispatches email to applicant
        sent_before_review = len(sent_emails)
        reviewed = await client.post(
            "/api/v1/admin/applications/app_luxe/review",
            headers=ha,
            json={"action": "approve", "note": "License verified"},
        )
        assert reviewed.status_code == 200
        assert len(sent_emails) == sent_before_review + 1
        assert sent_emails[-1]["json"]["to"] == ["sophia.bennett@bookit.demo"]

        # 5. Subscription plan change dispatches email to owner
        sent_before_sub = len(sent_emails)
        plan_change = await client.patch(
            "/api/v1/workspaces/biz_aura/subscription",
            headers=ho,
            json={"planId": "enterprise"},
        )
        assert plan_change.status_code == 200
        assert len(sent_emails) == sent_before_sub + 1
        assert sent_emails[-1]["json"]["to"] == ["business@bookit.demo"]

        # 6. Respecting NotificationPreferences (booking=False skips reminder emails, while failed Resend reports delivered=False)
        ticket_bk = await client.post(
            "/api/v1/bookings/universal",
            headers=hc,
            json={
                "bookingModel": "ticket",
                "businessId": "biz_aura",
                "sessionId": "ses_aura_live_1",
                "tickets": [{"tierId": "tier_aura_ga", "quantity": 1}],
                "paymentMethod": "in_person",
            },
        )
        assert ticket_bk.status_code == 201
        ticket_bk_id = ticket_bk.json()["id"]

        pref_off = await client.patch(
            "/api/v1/users/me/notification-preferences",
            headers=hc,
            json={"booking": False},
        )
        assert pref_off.status_code == 200

        sent_before_skip = len(sent_emails)
        skipped_remind = await client.post(
            f"/api/v1/bookings/universal/{ticket_bk_id}/remind",
            headers=ho,
            json={"message": "Event reminder"},
        )
        assert skipped_remind.status_code == 200
        assert skipped_remind.json()["delivered"] is False
        assert skipped_remind.json()["deliveryStatus"] == "skipped_by_preference"
        assert len(sent_emails) == sent_before_skip

        # Re-enable booking emails, then simulate Resend HTTP 502 error -> delivered=False, deliveryStatus="failed"
        await client.patch("/api/v1/users/me/notification-preferences", headers=hc, json={"booking": True})
        fail_resend["flag"] = True
        failed_remind = await client.post(
            f"/api/v1/bookings/universal/{ticket_bk_id}/remind",
            headers=ho,
            json={"message": "Should report failure cleanly"},
        )
        assert failed_remind.status_code == 200
        assert failed_remind.json()["delivered"] is False
        assert failed_remind.json()["deliveryStatus"] == "failed"
    finally:
        (
            settings.email_provider,
            settings.resend_api_key,
            settings.email_from,
            settings.resend_api_base_url,
        ) = prev
