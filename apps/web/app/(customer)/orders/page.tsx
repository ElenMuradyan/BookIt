"use client";

import { customerOrders, useBookItState } from "@bookit/api-client";
import { orderStatus } from "@bookit/ui";
import { formatDate, formatMoney } from "@bookit/utils";
import Link from "next/link";
import { useState } from "react";
import { Badge, Empty } from "@/components/ui";
import { useAuth } from "@/lib/session";

const TABS = ["all", "pending", "confirmed", "processing", "shipped", "completed", "cancelled", "refunded"] as const;

export default function OrdersPage() {
  const auth = useAuth();
  const state = useBookItState();
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");

  if (!auth.userId) return null;
  const all = customerOrders(state, auth.userId);
  const filtered = tab === "all" ? all : all.filter((o) => o.status === tab);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>My Orders</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Track purchases across all BookIt marketplace sellers.
          </p>
        </div>
        <Link href="/marketplace" className="btn soft">
          Shop Marketplace
        </Link>
      </div>

      <div className="tabs">
        {TABS.map((item) => (
          <button key={item} type="button" className={`tab ${tab === item ? "on" : ""}`} onClick={() => setTab(item)}>
            {item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Empty title={`No ${tab === "all" ? "" : tab} orders`} body="Marketplace purchases appear here once placed." />
      ) : (
        <div className="stack">
          {filtered.map((order) => {
            const seller = state.businesses.find((b) => b.id === order.sellerId);
            const st = orderStatus(order.status);
            return (
              <article key={order.id} className="panel row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
                <div className="stack" style={{ gap: 4 }}>
                  <div className="row">
                    <strong>{order.items.map((i) => `${i.name} ×${i.quantity}`).join(", ")}</strong>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                  <span className="tiny">
                    Seller: {seller?.name} · Placed {formatDate(order.createdAt)} · {order.deliveryMethod}
                  </span>
                  {order.trackingPlaceholder ? <span className="tiny">{order.trackingPlaceholder}</span> : null}
                </div>
                <div className="row">
                  <strong className="tabular">{formatMoney(order.total)}</strong>
                  <Link href={`/orders/${order.id}`} className="btn ghost small">
                    View details
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
