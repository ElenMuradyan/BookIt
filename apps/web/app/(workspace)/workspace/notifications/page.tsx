"use client";

import {
  businessNotifications,
  markAllBusinessNotificationsRead,
  markAllBusinessNotificationsReadRemote,
  markBusinessNotificationRead,
  markBusinessNotificationReadRemote,
  useBookItState,
  usingMocks,
} from "@bookit/api-client";
import { formatDateTime } from "@bookit/utils";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Empty } from "@/components/ui";
import { useAuth } from "@/lib/session";

const FILTERS = ["all", "unread", "booking", "order", "message"] as const;

export default function WorkspaceNotificationsPage() {
  const auth = useAuth();
  const state = useBookItState();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!auth.workspace) return null;
  const bizId = auth.workspace.businessId;
  const all = businessNotifications(state, bizId);
  const unreadCount = all.filter((n) => !n.read).length;
  const rows = all.filter((n) => {
    if (filter === "unread") return !n.read;
    if (filter !== "all") return n.category === filter;
    return true;
  });

  async function handleMarkAll() {
    setErrorMsg("");
    if (usingMocks()) {
      markAllBusinessNotificationsRead(bizId);
      return;
    }
    setBusy(true);
    try {
      const res = await markAllBusinessNotificationsReadRemote(bizId);
      if (!res.ok) setErrorMsg(res.error);
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkOne(id: string) {
    setErrorMsg("");
    if (usingMocks()) {
      markBusinessNotificationRead(bizId, id);
      return;
    }
    setBusy(true);
    try {
      const res = await markBusinessNotificationReadRemote(bizId, id);
      if (!res.ok) setErrorMsg(res.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Workspace Notifications</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            {unreadCount} unread updates for {auth.workspace.businessName}.
          </p>
        </div>
        {unreadCount > 0 ? (
          <Button tone="soft" small disabled={busy} onClick={() => void handleMarkAll()}>
            {busy ? "Updating…" : "Mark all read"}
          </Button>
        ) : null}
      </div>

      {errorMsg ? <p className="error" style={{ margin: 0 }}>{errorMsg}</p> : null}

      <div className="tabs">
        {FILTERS.map((f) => (
          <button key={f} type="button" className={`tab ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
            {f === "all" ? `All (${all.length})` : f === "unread" ? `Unread (${unreadCount})` : f}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <Empty title="No workspace notifications" body="New booking requests, reschedules, customer messages, and order updates appear here." />
      ) : (
        <div className="stack">
          {rows.map((item) => {
            const targetHref = item.href?.startsWith("/workspace") ? item.href : "/workspace/bookings";
            return (
              <article
                key={item.id}
                className="panel row"
                style={{
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  gap: 12,
                  borderColor: item.read ? undefined : "rgba(124, 58, 237, 0.45)",
                }}
              >
                <div className="stack" style={{ gap: 4, flex: 1, minWidth: 220 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <Badge tone={item.read ? "neutral" : "brand"}>{item.category}</Badge>
                    {!item.read ? <Badge tone="info">New</Badge> : null}
                    <span className="tiny tabular">{formatDateTime(item.createdAt)}</span>
                  </div>
                  <strong>{item.title}</strong>
                  <p className="muted" style={{ margin: 0 }}>
                    {item.body}
                  </p>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <Link
                    href={targetHref}
                    className="btn soft small"
                    onClick={() => {
                      if (!item.read) void handleMarkOne(item.id);
                    }}
                  >
                    Open
                  </Link>
                  {!item.read ? (
                    <Button tone="ghost" small disabled={busy} onClick={() => void handleMarkOne(item.id)}>
                      Mark read
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
