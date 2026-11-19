"use client";

import { displayUser, useBookItState } from "@bookit/api-client";
import { formatDate, formatMoney } from "@bookit/utils";
import { Badge } from "@/components/ui";

export default function AdminPaymentsPage() {
  const state = useBookItState();

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <h1 style={{ margin: 0 }}>Payments Ledger</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Recorded charges, estimated rows, and refunds across bookings, orders, and subscriptions.
        </p>
      </div>

      <div className="panel" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Payer</th>
              <th>Business</th>
              <th>Reference</th>
              <th>Method</th>
              <th>Status</th>
              <th>Amount</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {state.payments.map((pay) => {
              const biz = state.businesses.find((b) => b.id === pay.businessId);
              return (
                <tr key={pay.id}>
                  <td className="tiny tabular">{pay.id}</td>
                  <td>{displayUser(state, pay.payerId)}</td>
                  <td>{biz?.name ?? pay.businessId}</td>
                  <td className="tiny">{pay.referenceType}</td>
                  <td className="tiny">{pay.method.replaceAll("_", " ")}</td>
                  <td>
                    <Badge tone={pay.status === "recorded" ? "success" : pay.status === "refunded" ? "danger" : "warning"}>
                      {pay.status}
                    </Badge>
                  </td>
                  <td className="tabular">{formatMoney(pay.amount)}</td>
                  <td className="tiny">{formatDate(pay.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
