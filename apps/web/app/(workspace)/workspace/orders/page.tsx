"use client";

import { displayUser, sellerOrders, setOrderStatus, setOrderStatusRemote, useBookItState, usingMocks } from "@bookit/api-client";
import type { OrderStatus } from "@bookit/types";
import { orderStatus } from "@bookit/ui";
import { can, formatDate, formatMoney } from "@bookit/utils";
import { useState } from "react";
import { Badge, Button, Empty } from "@/components/ui";
import { useAuth } from "@/lib/session";

const STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "processing",
  "ready_for_pickup",
  "shipped",
  "completed",
  "cancelled",
  "refunded",
];

export default function WorkspaceOrdersPage() {
  const auth = useAuth();
  const state = useBookItState();
  const [filter, setFilter] = useState<"all" | OrderStatus>("all");
  const [busyId, setBusyId] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [notice, setNotice] = useState("");

  if (!auth.workspace) return null;
  const bizId = auth.workspace.businessId;
  const canManage = can(auth.workspace.role, "orders.manage");
  const orders = sellerOrders(state, bizId).filter((o) => filter === "all" || o.status === filter);

  async function handleStatusChange(orderId: string, nextStatus: OrderStatus) {
    setErrorMsg("");
    setNotice("");
    if (usingMocks()) {
      const res = setOrderStatus(bizId, orderId, nextStatus);
      if (!res.ok) setErrorMsg(res.error);
      else setNotice(`Order updated to ${nextStatus.replaceAll("_", " ")}.`);
      return;
    }
    setBusyId(orderId);
    try {
      const res = await setOrderStatusRemote(bizId, orderId, nextStatus);
      if (!res.ok) setErrorMsg(res.error);
      else setNotice(`Order updated to ${nextStatus.replaceAll("_", " ")}.`);
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <h1 style={{ margin: 0 }}>Orders Management</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Process marketplace orders for pickup or shipping.
        </p>
      </div>

      <div className="tabs">
        <button type="button" className={`tab ${filter === "all" ? "on" : ""}`} onClick={() => setFilter("all")}>
          All
        </button>
        {STATUSES.map((s) => (
          <button key={s} type="button" className={`tab ${filter === s ? "on" : ""}`} onClick={() => setFilter(s)}>
            {s.replaceAll("_", " ")}
          </button>
        ))}
      </div>

      {notice ? <div className="notice">{notice}</div> : null}
      {errorMsg ? <p className="error" style={{ margin: 0 }}>{errorMsg}</p> : null}

      {orders.length === 0 ? (
        <Empty title="No matching orders" body="Marketplace orders for this business appear here." />
      ) : (
        <div className="panel" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Delivery</th>
                <th>Status</th>
                {canManage ? <th>Update Status</th> : null}
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const st = orderStatus(order.status);
                const isBusy = busyId === order.id;
                return (
                  <tr key={order.id}>
                    <td className="tabular">
                      <strong>{order.id.toUpperCase()}</strong>
                      <div className="tiny">{formatDate(order.createdAt)}</div>
                    </td>
                    <td>{displayUser(state, order.userId)}</td>
                    <td className="tiny">{order.items.map((i) => `${i.name} ×${i.quantity}`).join(", ")}</td>
                    <td className="tabular">{formatMoney(order.total)}</td>
                    <td className="tiny">{order.deliveryMethod}</td>
                    <td>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </td>
                    {canManage ? (
                      <td>
                        <div className="row" style={{ flexWrap: "wrap" }}>
                          <select
                            aria-label="Order status"
                            value={order.status}
                            disabled={isBusy}
                            onChange={(e) => void handleStatusChange(order.id, e.target.value as OrderStatus)}
                            style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, padding: "5px 8px" }}
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s.replaceAll("_", " ")}
                              </option>
                            ))}
                          </select>
                          {order.status === "pending" ? (
                            <Button tone="soft" small disabled={isBusy} onClick={() => void handleStatusChange(order.id, "confirmed")}>
                              {isBusy ? "Saving…" : "Confirm"}
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
