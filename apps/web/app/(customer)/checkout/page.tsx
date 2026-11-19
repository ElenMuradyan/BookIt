"use client";

import { addAddress, cartFor, checkout, useBookItState } from "@bookit/api-client";
import type { PaymentMethod } from "@bookit/types";
import { formatMoney } from "@bookit/utils";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Badge, Button, Empty, Field } from "@/components/ui";
import { useAuth } from "@/lib/session";

function CheckoutContent() {
  const auth = useAuth();
  const state = useBookItState();
  const params = useSearchParams();
  const initialDelivery = (params.get("delivery") as "standard" | "express" | "pickup") || "standard";

  const userId = auth.userId ?? "";
  const addresses = state.addresses.filter((a) => a.userId === userId);
  const [addressId, setAddressId] = useState(addresses[0]?.id ?? "");
  const [deliveryMethod, setDeliveryMethod] = useState<"standard" | "express" | "pickup">(initialDelivery);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card_token_pending");
  const [showNewAddress, setShowNewAddress] = useState(addresses.length === 0);
  const [addrForm, setAddrForm] = useState({ label: "Home", line1: "", city: "Seattle", region: "WA", postalCode: "98101", country: "United States" });
  const [error, setError] = useState("");
  const [orderIds, setOrderIds] = useState<string[] | null>(null);

  if (!auth.user) return null;
  const cart = cartFor(state, userId);

  if (orderIds) {
    return (
      <div className="panel stack" style={{ maxWidth: 640 }}>
        <Badge tone="success">Order confirmed</Badge>
        <h1 style={{ margin: 0 }}>Thank you, {auth.user.firstName}</h1>
        <p className="muted">
          Created {orderIds.length} seller {orderIds.length === 1 ? "order" : "orders"} ({orderIds.join(", ")}). Tracking updates appear once each seller ships.
        </p>
        <div className="row">
          <Link href="/orders" className="btn">
            View My Orders
          </Link>
          <Link href="/marketplace" className="btn ghost">
            Back to Marketplace
          </Link>
        </div>
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return <Empty title="Your cart is empty" body="Add items from the marketplace before checking out." />;
  }

  const lines = cart.items.map((line) => {
    const product = state.products.find((p) => p.id === line.productId);
    const variant = product?.variants.find((v) => v.id === line.variantId);
    return { line, product, unitPrice: (product?.price ?? 0) + (variant?.priceDelta ?? 0) };
  });
  const sellerCount = new Set(cart.items.map((i) => i.sellerId)).size;
  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.line.quantity, 0);
  const fee = (deliveryMethod === "express" ? 12 : deliveryMethod === "standard" ? 6 : 0) * sellerCount;
  const total = subtotal + fee;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <Link href="/cart" className="tiny">
        ← Back to Cart
      </Link>
      <h1 style={{ margin: 0 }}>Checkout</h1>
      <div className="split-detail">
        <div className="stack" style={{ gap: 18 }}>
          <section className="panel stack">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h3>1. Delivery Address</h3>
              <Button tone="ghost" small onClick={() => setShowNewAddress((v) => !v)}>
                {showNewAddress ? "Cancel" : "+ Add address"}
              </Button>
            </div>
            {addresses.map((addr) => (
              <button
                key={addr.id}
                type="button"
                className={`select-card ${addressId === addr.id ? "on" : ""}`}
                onClick={() => setAddressId(addr.id)}
              >
                <strong>{addr.label}</strong>
                <div className="tiny">
                  {addr.line1}, {addr.city}, {addr.region} {addr.postalCode}
                </div>
              </button>
            ))}
            {showNewAddress ? (
              <div className="panel stack" style={{ background: "var(--bg)" }}>
                <div className="grid-2">
                  <Field label="Label">
                    <input value={addrForm.label} onChange={(e) => setAddrForm({ ...addrForm, label: e.target.value })} />
                  </Field>
                  <Field label="Street address">
                    <input value={addrForm.line1} onChange={(e) => setAddrForm({ ...addrForm, line1: e.target.value })} />
                  </Field>
                  <Field label="City">
                    <input value={addrForm.city} onChange={(e) => setAddrForm({ ...addrForm, city: e.target.value })} />
                  </Field>
                  <Field label="Postal code">
                    <input value={addrForm.postalCode} onChange={(e) => setAddrForm({ ...addrForm, postalCode: e.target.value })} />
                  </Field>
                </div>
                <Button
                  tone="soft"
                  small
                  onClick={() => {
                    const res = addAddress(userId, addrForm);
                    if (!res.ok) setError(res.error);
                    else {
                      setShowNewAddress(false);
                      setError("");
                    }
                  }}
                >
                  Save address
                </Button>
              </div>
            ) : null}
          </section>

          <section className="panel stack">
            <h3>2. Delivery Method</h3>
            <div className="chips">
              {(
                [
                  ["standard", "Standard delivery"],
                  ["express", "Express delivery"],
                  ["pickup", "Store pickup"],
                ] as const
              ).map(([m, label]) => (
                <button key={m} type="button" className={`slot ${deliveryMethod === m ? "on" : ""}`} onClick={() => setDeliveryMethod(m)}>
                  {label}
                </button>
              ))}
            </div>
          </section>

          <section className="panel stack">
            <h3>3. Payment Method</h3>
            <div className="chips">
              {(
                [
                  ["card_token_pending", "Card token (API pending)"],
                  ["wallet", "BookIt demo wallet"],
                  ["pay_on_pickup", "Pay on pickup"],
                ] as const
              ).map(([m, label]) => (
                <button key={m} type="button" className={`slot ${paymentMethod === m ? "on" : ""}`} onClick={() => setPaymentMethod(m)}>
                  {label}
                </button>
              ))}
            </div>
            <p className="tiny" style={{ margin: 0 }}>
              Real card numbers are never entered or stored in the frontend stage.
            </p>
          </section>
        </div>

        <aside className="panel stack">
          <h2 style={{ margin: 0 }}>Summary</h2>
          {lines.map(({ line, product, unitPrice }) => (
            <div key={line.id} className="row" style={{ justifyContent: "space-between", fontSize: 13 }}>
              <span>
                {product?.name} × {line.quantity}
              </span>
              <span className="tabular">{formatMoney(unitPrice * line.quantity)}</span>
            </div>
          ))}
          <div className="row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <span className="muted">Delivery</span>
            <span className="tabular">{formatMoney(fee)}</span>
          </div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <strong>Total</strong>
            <strong className="tabular" style={{ fontSize: 22 }}>
              {formatMoney(total)}
            </strong>
          </div>
          {error ? <p className="error">{error}</p> : null}
          <Button
            onClick={() => {
              const targetAddr = addressId || state.addresses.find((a) => a.userId === userId)?.id || "";
              const res = checkout({ userId, addressId: targetAddr, deliveryMethod, paymentMethod });
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setOrderIds(res.data.orderIds);
            }}
          >
            Confirm Order
          </Button>
        </aside>
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div className="app-boot">Loading checkout…</div>}>
      <CheckoutContent />
    </Suspense>
  );
}
