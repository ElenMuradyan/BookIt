"use client";

import {
  displayUser,
  moveFavorite,
  moveFavoriteRemote,
  toggleFavorite,
  toggleFavoriteRemote,
  useBookItState,
  usingMocks,
} from "@bookit/api-client";
import { categoryLabels } from "@bookit/ui";
import { formatMoney } from "@bookit/utils";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Empty } from "@/components/ui";
import { useAuth } from "@/lib/session";

const TYPES = ["all", "business", "service", "employee", "product"] as const;

export default function FavoritesPage() {
  const auth = useAuth();
  const state = useBookItState();
  const [type, setType] = useState<(typeof TYPES)[number]>("all");
  const [collection, setCollection] = useState("All");
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");

  if (!auth.userId) return null;
  const userId = auth.userId;
  const mine = state.favorites.filter((f) => f.userId === userId);
  const collections = ["All", ...new Set(mine.map((f) => f.collection))];
  const filtered = mine.filter((f) => (type === "all" || f.targetType === type) && (collection === "All" || f.collection === collection));

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <h1 style={{ margin: 0 }}>Favorites</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Saved businesses, services, specialists, and products organized into collections.
        </p>
      </div>

      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div className="tabs">
          {TYPES.map((t) => (
            <button key={t} type="button" className={`tab ${type === t ? "on" : ""}`} onClick={() => setType(t)}>
              {t === "all" ? "All items" : `${t[0].toUpperCase() + t.slice(1)}s`}
            </button>
          ))}
        </div>
        <div className="chips">
          {collections.map((c) => (
            <button key={c} type="button" className={`slot ${collection === c ? "on" : ""}`} onClick={() => setCollection(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {notice ? <p className="tiny" style={{ color: "var(--lavender)", margin: 0 }}>{notice}</p> : null}

      {filtered.length === 0 ? (
        <Empty title="Nothing saved here yet" body="Save businesses, services, or products while browsing Explore or Marketplace." />
      ) : (
        <div className="grid-3">
          {filtered.map((fav) => {
            let title = fav.targetId;
            let subtitle = "";
            let href = "/explore";
            if (fav.targetType === "business") {
              const biz = state.businesses.find((b) => b.id === fav.targetId);
              title = biz?.name ?? title;
              subtitle = biz ? `${categoryLabels[biz.category]} · ${biz.city}` : "";
              href = `/business/${fav.targetId}`;
            } else if (fav.targetType === "service") {
              const svc = state.services.find((s) => s.id === fav.targetId);
              title = svc?.name ?? title;
              subtitle = svc ? `${svc.durationMinutes} min · ${formatMoney(svc.price)}` : "";
              href = svc ? `/book/${svc.businessId}?service=${svc.id}` : "/explore";
            } else if (fav.targetType === "employee") {
              const emp = state.employees.find((e) => e.id === fav.targetId);
              title = emp ? displayUser(state, emp.userId) : title;
              subtitle = emp?.title ?? "";
              href = emp ? `/book/${emp.businessId}?employee=${emp.id}` : "/explore";
            } else if (fav.targetType === "product") {
              const prd = state.products.find((p) => p.id === fav.targetId);
              title = prd?.name ?? title;
              subtitle = prd ? formatMoney(prd.price) : "";
              href = `/marketplace/${fav.targetId}`;
            }

            return (
              <article key={fav.id} className="panel stack" style={{ gap: 10 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <Badge tone="brand">{fav.targetType}</Badge>
                  <select
                    aria-label="Collection"
                    value={fav.collection}
                    disabled={busyId === fav.id}
                    onChange={async (e) => {
                      const nextCol = e.target.value;
                      if (usingMocks()) {
                        moveFavorite(userId, fav.id, nextCol);
                        return;
                      }
                      setBusyId(fav.id);
                      try {
                        const res = await moveFavoriteRemote(fav.id, nextCol);
                        setNotice(res.ok ? `Moved to ${nextCol}` : res.error);
                      } finally {
                        setBusyId("");
                      }
                    }}
                    style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, padding: "4px 8px", fontSize: 12 }}
                  >
                    {["Saved", "Weekends", "Gifts", "Restock"].map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </div>
                <Link href={href}>
                  <strong>{title}</strong>
                  <div className="tiny">{subtitle}</div>
                </Link>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <Link href={href} className="btn soft small">
                    Open
                  </Link>
                  <Button
                    tone="ghost"
                    small
                    disabled={busyId === fav.id}
                    onClick={async () => {
                      if (usingMocks()) {
                        toggleFavorite(userId, fav.targetType, fav.targetId);
                        return;
                      }
                      setBusyId(fav.id);
                      try {
                        const res = await toggleFavoriteRemote(fav.targetType, fav.targetId, fav.collection);
                        setNotice(res.ok ? "Removed from favorites" : res.error);
                      } finally {
                        setBusyId("");
                      }
                    }}
                  >
                    {busyId === fav.id ? "Removing…" : "Remove"}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
