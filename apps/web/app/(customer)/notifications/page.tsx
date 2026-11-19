"use client";

import { markAllNotificationsRead, markNotificationRead, useBookItState } from "@bookit/api-client";
import type { NotificationCategory } from "@bookit/types";
import { formatDate } from "@bookit/utils";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Empty } from "@/components/ui";
import { useAuth } from "@/lib/session";

const CATS: Array<"all" | NotificationCategory> = ["all", "booking", "order", "promotion", "message", "security"];

export default function NotificationsPage() {
  const auth = useAuth();
  const state = useBookItState();
  const [cat, setCat] = useState<(typeof CATS)[number]>("all");

  if (!auth.userId) return null;
  const userId = auth.userId;
  const rows = state.notifications.filter((n) => n.userId === userId && (cat === "all" || n.category === cat));

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Notifications</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Booking updates, order shipments, promotions, messages, and security alerts.
          </p>
        </div>
        <Button tone="ghost" small onClick={() => markAllNotificationsRead(userId)}>
          Mark all read
        </Button>
      </div>

      <div className="tabs">
        {CATS.map((item) => (
          <button key={item} type="button" className={`tab ${cat === item ? "on" : ""}`} onClick={() => setCat(item)}>
            {item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <Empty title="All caught up" body="No notifications in this category." />
      ) : (
        <div className="stack">
          {rows.map((item) => (
            <article key={item.id} className="panel row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div className="stack" style={{ gap: 4 }}>
                <div className="row">
                  <Badge tone={item.read ? "neutral" : "brand"}>{item.category}</Badge>
                  <strong>{item.title}</strong>
                  {!item.read ? <Badge tone="info">New</Badge> : null}
                </div>
                <span className="muted">{item.body}</span>
                <span className="tiny">{formatDate(item.createdAt)}</span>
              </div>
              <div className="row">
                {item.href ? (
                  <Link href={item.href} className="btn soft small" onClick={() => markNotificationRead(item.id, userId)}>
                    Open
                  </Link>
                ) : null}
                {!item.read ? (
                  <Button tone="ghost" small onClick={() => markNotificationRead(item.id, userId)}>
                    Mark read
                  </Button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
