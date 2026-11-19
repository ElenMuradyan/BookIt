"use client";

import { displayUser, useBookItState } from "@bookit/api-client";
import { roleLabels } from "@bookit/ui";
import { Badge } from "@/components/ui";

export default function AdminWorkspacesPage() {
  const state = useBookItState();

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <h1 style={{ margin: 0 }}>Workspaces</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Inspect business tenants and all assigned member roles across BookIt.
        </p>
      </div>

      <div className="grid-2">
        {state.businesses.map((biz) => {
          const members = state.memberships.filter((m) => m.businessId === biz.id);
          return (
            <article key={biz.id} className="panel stack" style={{ gap: 10 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>{biz.name}</strong>
                <Badge tone={biz.status === "approved" ? "success" : "warning"}>{biz.status.replaceAll("_", " ")}</Badge>
              </div>
              <div className="tiny">
                Owner: {displayUser(state, biz.ownerUserId)} · {members.length} members
              </div>
              <div className="stack" style={{ gap: 6 }}>
                {members.map((m) => (
                  <div key={m.id} className="row" style={{ justifyContent: "space-between", fontSize: 13 }}>
                    <span>{displayUser(state, m.userId)}</span>
                    <Badge tone="brand">{roleLabels[m.role]}</Badge>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
