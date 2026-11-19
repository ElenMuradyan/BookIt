"use client";

import { useBookItState } from "@bookit/api-client";
import { formatDate, formatMoney } from "@bookit/utils";
import { Badge } from "@/components/ui";

export default function AdminSubscriptionsPage() {
  const state = useBookItState();

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <h1 style={{ margin: 0 }}>Subscriptions & Plans</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          SaaS plans, 30-day trial expirations, and active business billing statuses.
        </p>
      </div>

      <div className="grid-3">
        {state.plans.map((plan) => (
          <div key={plan.id} className="panel stack" style={{ gap: 6 }}>
            <strong>{plan.name}</strong>
            <span className="tabular" style={{ fontSize: 24, fontWeight: 700 }}>
              {formatMoney(plan.monthlyPrice)}/mo
            </span>
            <span className="tiny">{plan.description}</span>
          </div>
        ))}
      </div>

      <div className="panel" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Business</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Trial Ends / Renews</th>
            </tr>
          </thead>
          <tbody>
            {state.subscriptions.map((sub) => {
              const biz = state.businesses.find((b) => b.id === sub.businessId);
              return (
                <tr key={sub.id}>
                  <td><strong>{biz?.name ?? sub.businessId}</strong></td>
                  <td><Badge tone="brand">{sub.planId}</Badge></td>
                  <td><Badge tone={sub.status === "active" ? "success" : "warning"}>{sub.status}</Badge></td>
                  <td className="tiny">{sub.renewsAt ? formatDate(sub.renewsAt) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
