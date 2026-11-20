import hashlib
import hmac
import json

import pytest
from httpx import AsyncClient

from app.core.config import get_settings
from tests.conftest import login_as


@pytest.mark.asyncio
async def test_multi_vendor_checkout_stock_and_webhooks(client: AsyncClient):
    cust = await login_as(client, "customer@bookit.demo")
    headers = {"Authorization": f"Bearer {cust['accessToken']}"}

    # Customer seeded cart already has items from 2 sellers (biz_hearth & biz_circuit)
    cart = await client.get("/api/v1/cart", headers=headers)
    assert cart.status_code == 200
    assert len(cart.json()["items"]) == 2

    # Checkout splits into 2 orders
    checkout = await client.post(
        "/api/v1/checkout",
        headers=headers,
        json={
            "addressId": "addr_elena_home",
            "deliveryMethod": "standard",
            "paymentMethod": "card_token_pending",
        },
    )
    assert checkout.status_code == 201, checkout.text
    order_ids = checkout.json()["orderIds"]
    assert len(order_ids) == 2

    # Cart is now empty
    empty_cart = await client.get("/api/v1/cart", headers=headers)
    assert empty_cart.json()["items"] == []

    # Create payment intent for first order
    intent = await client.post(
        "/api/v1/payments/intents",
        headers=headers,
        json={
            "referenceType": "order",
            "referenceId": order_ids[0],
            "method": "card_token_pending",
            "idempotencyKey": "idem_pay_order_1",
        },
    )
    assert intent.status_code == 201
    pay_id = intent.json()["payment"]["id"]

    # Webhook signature validation
    webhook_payload = json.dumps({
        "eventId": "evt_test_001",
        "eventType": "payment.succeeded",
        "paymentId": pay_id,
    }).encode("utf-8")

    bad_wh = await client.post(
        "/api/v1/payments/webhooks/sandbox",
        content=webhook_payload,
        headers={"Content-Type": "application/json", "X-BookIt-Signature": "sha256=invalid"},
    )
    assert bad_wh.status_code == 401

    secret = get_settings().payment_webhook_secret
    valid_sig = hmac.new(secret.encode("utf-8"), webhook_payload, hashlib.sha256).hexdigest()

    good_wh = await client.post(
        "/api/v1/payments/webhooks/sandbox",
        content=webhook_payload,
        headers={"Content-Type": "application/json", "X-BookIt-Signature": f"sha256={valid_sig}"},
    )
    assert good_wh.status_code == 200
    assert good_wh.json()["duplicate"] is False

    # Replay same webhook -> idempotent duplicate=True
    dup_wh = await client.post(
        "/api/v1/payments/webhooks/sandbox",
        content=webhook_payload,
        headers={"Content-Type": "application/json", "X-BookIt-Signature": f"sha256={valid_sig}"},
    )
    assert dup_wh.status_code == 200
    assert dup_wh.json()["duplicate"] is True

    # Order payment status updated to paid
    orders = await client.get("/api/v1/orders", headers=headers)
    matched = next(o for o in orders.json() if o["id"] == order_ids[0])
    assert matched["paymentStatus"] == "paid"
