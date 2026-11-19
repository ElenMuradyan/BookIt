"use client";

import { cartFor, setCartQuantity, useBookItState } from "@bookit/api-client";
import { formatMoney } from "@bookit/utils";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Empty } from "@/components/ui";
import { useAuth } from "@/lib/session";

export default function CartPage() {
  const auth = useAuth();
  const state = useBookItState();
  const [deliveryMethod, setDeliveryMethod] = useState<"standard" | "express" | "pickup">("standard");

  if (!auth.userId) return null;
  const userId = auth.userId;
  const cart = cartFor(state, userId);
  const items = cart?.items ?? [];

  if (items.length === 0) {
    return (
      <div className="stack">
        <h1>Shopping Cart</h1>
        <Empty title="Your cart is empty" body="Browse the multi-vendor marketplace to add items from local businesses." />
        <div>
          <Link href="/marketplace" className="btn">
            Explore Marketplace
          </Link>
        </div>
      </div>
    );
  }

  const lines = items.map((line) => {
    const product = state.products.find((p) => p.id === line.productId);
    const variant = product?.variants.find((v) => v.id === line.variantId);
    const seller = state.businesses.find((b) => b.id === line.sellerId);
    const unitPrice = (product?.price ?? 0) + (variant?.priceDelta ?? 0);
    return { line, product, variant, seller, unitPrice };
  });

  const sellerCount = new Set(items.map((i) => i.sellerId)).size;
  const subtotal = lines.reduce((sum, l) => sum + l.unitPrice * l.line.quantity, 0);
  const feePerSeller = deliveryMethod === "express" ? 12 : deliveryMethod === "standard" ? 6 : 0;
  const deliveryEstimate = feePerSeller * sellerCount;
  const total = subtotal + deliveryEstimate;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Shopping Cart</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            {items.reduce((s, i) => s + i.quantity, 0)} items across {sellerCount} {sellerCount === 1 ? "seller" : "sellers"}.
          </p>
        </div>
        <Link href="/marketplace" className="btn ghost">
          Continue shopping
        </Link>
      </div>

      <div className="split-detail">
        <div className="stack">
          {lines.map(({ line, product, variant, seller, unitPrice }) => (
            <article key={line.id} className="panel row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
              <div className="row" style={{ gap: 14 }}>
                {product ? (
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    referrerPolicy="no-referrer"
                    style={{ width: 68, height: 68, borderRadius: 12, objectFit: "cover" }}
                  />
                ) : null}
                <div>
                  <Link href={`/marketplace/${line.productId}`}>
                    <strong>{product?.name ?? "Product"}</strong>
                  </Link>
                  <div className="tiny">
                    Seller: {seller?.name} {variant ? `· ${variant.label}` : ""}
                  </div>
                  <div className="tabular tiny">{formatMoney(unitPrice)} each</div>
                </div>
              </div>
              <div className="row">
                <Button tone="ghost" small onClick={() => setCartQuantity(userId, line.id, line.quantity - 1)}>
                  -
                </Button>
                <strong className="tabular">{line.quantity}</strong>
                <Button tone="ghost" small onClick={() => setCartQuantity(userId, line.id, line.quantity + 1)}>
                  +
                </Button>
                <strong className="tabular" style={{ minWidth: 64, textAlign: "right" }}>
                  {formatMoney(unitPrice * line.quantity)}
                </strong>
                <Button tone="danger" small onClick={() => setCartQuantity(userId, line.id, 0)}>
                  Remove
                </Button>
              </div>
            </article>
          ))}
        </div>

        <aside className="panel stack">
          <h2 style={{ margin: 0 }}>Order Summary</h2>
          <div className="stack" style={{ gap: 6 }}>
            <span className="label">Delivery estimate</span>
            <div className="chips">
              {(
                [
                  ["standard", "Standard ($6/seller)"],
                  ["express", "Express ($12/seller)"],
                  ["pickup", "Pickup (Free)"],
                ] as const
              ).map(([method, label]) => (
                <button key={method} type="button" className={`slot ${deliveryMethod === method ? "on" : ""}`} onClick={() => setDeliveryMethod(method)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="muted">Subtotal</span>
            <span className="tabular">{formatMoney(subtotal)}</span>
          </div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="muted">Delivery ({sellerCount} seller shipments)</span>
            <span className="tabular">{formatMoney(deliveryEstimate)}</span>
          </div>
          <div className="row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <strong>Total</strong>
            <strong className="tabular" style={{ fontSize: 22 }}>
              {formatMoney(total)}
            </strong>
          </div>
          <Badge tone="brand">Multi-vendor checkout splits into one order per seller</Badge>
          <Link href={`/checkout?delivery=${deliveryMethod}`} className="btn">
            Proceed to Checkout
          </Link>
        </aside>
      </div>
    </div>
  );
}
