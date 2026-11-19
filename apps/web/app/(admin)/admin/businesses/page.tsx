"use client";

import { displayUser, setBusinessStatus, useBookItState } from "@bookit/api-client";
import type { BusinessStatus } from "@bookit/types";
import { categoryLabels } from "@bookit/ui";
import { useState } from "react";
import { Badge, Button } from "@/components/ui";

export default function AdminBusinessesPage() {
  const state = useBookItState();
  const [filter, setFilter] = useState<"all" | BusinessStatus>("all");

  const rows = state.businesses.filter((b) => filter === "all" || b.status === filter);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <h1 style={{ margin: 0 }}>Businesses</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Manage approved, pending, rejected, and suspended businesses.
        </p>
      </div>

      <div className="tabs">
        {(["all", "approved", "under_review", "submitted", "rejected", "suspended"] as const).map((s) => (
          <button key={s} type="button" className={`tab ${filter === s ? "on" : ""}`} onClick={() => setFilter(s)}>
            {s.replaceAll("_", " ")}
          </button>
        ))}
      </div>

      <div className="panel" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Business</th>
              <th>Category</th>
              <th>Owner</th>
              <th>City</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((biz) => (
              <tr key={biz.id}>
                <td>
                  <strong>{biz.name}</strong>
                  <div className="tiny">{biz.legalName}</div>
                </td>
                <td className="tiny">{categoryLabels[biz.category]}</td>
                <td className="tiny">{displayUser(state, biz.ownerUserId)}</td>
                <td className="tiny">{biz.city}</td>
                <td>
                  <Badge tone={biz.status === "approved" ? "success" : biz.status === "suspended" || biz.status === "rejected" ? "danger" : "warning"}>
                    {biz.status.replaceAll("_", " ")}
                  </Badge>
                </td>
                <td>
                  <div className="row">
                    {biz.status !== "approved" ? (
                      <Button tone="soft" small onClick={() => setBusinessStatus(biz.id, "approved")}>
                        Approve
                      </Button>
                    ) : null}
                    {biz.status !== "suspended" ? (
                      <Button tone="danger" small onClick={() => setBusinessStatus(biz.id, "suspended")}>
                        Suspend
                      </Button>
                    ) : (
                      <Button tone="ghost" small onClick={() => setBusinessStatus(biz.id, "approved")}>
                        Reinstate
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
