"use client";

import { useBookItState } from "@bookit/api-client";
import { orderStatus } from "@bookit/ui";
import { formatDate, formatMoney } from "@bookit/utils";
import Link from "next/link";
import { use } from "react";
import { Badge, Empty } from "@/components/ui";
import { useAuth } from "@/lib/session";

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const auth = useAuth();
  const state = useBookItState();
  const order = state.orders.find((o) => o.id === id);

  if (!order || (auth.userId && order.userId !== auth.userId && !auth.user?.isPlatformAdmin)) {
    return <Empty title="Order not found" body="Check My Orders for active purchases." />;
  }

  const seller = state.businesses.find((b) => b.id === order.sellerId);
  const addr = state.addresses.find((a) => a.id === order.addressId);
  const st = orderStatus(order.status);

  return (
    <div className="panel stack" style={{ maxWidth: 680 }}>
      <Link href="/orders" className="tiny">
        ← Back to My Orders
      </Link>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Order {order.id.toUpperCase()}</h1>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      <div className="tiny">
        Seller: <strong>{seller?.name}</strong> · Placed {formatDate(order.createdAt)}
      </div>
      <div className="stack" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
        {order.items.map((item) => (
          <div key={item.id} className="row" style={{ justifyContent: "space-between" }}>
            <span>
              {item.name} × {item.quantity}
            </span>
            <span className="tabular">{formatMoney(item.unitPrice * item.quantity)}</span>
          </div>
        ))}
      </div>
      <div className="row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: 12 }}>
        <span className="muted">Delivery ({order.deliveryMethod})</span>
        <span className="tabular">{formatMoney(order.deliveryFee)}</span>
      </div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <strong>Total ({order.paymentStatus})</strong>
        <strong className="tabular" style={{ fontSize: 20 }}>
          {formatMoney(order.total)}
        </strong>
      </div>
      {addr ? (
        <div className="tiny">
          Deliver to: {addr.label} — {addr.line1}, {addr.city}
        </div>
      ) : null}
      {order.trackingPlaceholder ? <div className="notice">{order.trackingPlaceholder}</div> : null}
    </div>
  );
}
