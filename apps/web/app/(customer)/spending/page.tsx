"use client";

import { setSpendingVisibility, setSpendingVisibilityRemote, useBookItState, usingMocks } from "@bookit/api-client";
import { formatDate, formatMoney, spendingBuckets } from "@bookit/utils";
import { useState } from "react";
import { Badge, Bars } from "@/components/ui";
import { useAuth } from "@/lib/session";

export default function SpendingPage() {
  const auth = useAuth();
  const state = useBookItState();
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!auth.userId) return null;
  const userId = auth.userId;
  const profile = state.customerProfiles.find((p) => p.userId === userId);
  const visibility = profile?.spendingVisibility ?? "recorded_only";
  const myPayments = state.payments.filter((p) => p.payerId === userId);
  const buckets = spendingBuckets(myPayments);
  const visibleRows = visibility === "recorded_only" ? myPayments.filter((p) => p.status === "recorded") : myPayments;

  const serviceTotal = myPayments.filter((p) => p.status === "recorded" && p.referenceType === "appointment").reduce((s, p) => s + p.amount, 0);
  const productTotal = myPayments.filter((p) => p.status === "recorded" && p.referenceType === "order").reduce((s, p) => s + p.amount, 0);

  async function handleVisibility(next: "recorded_only" | "include_estimates") {
    setErrorMsg("");
    if (usingMocks()) {
      const res = setSpendingVisibility(userId, next);
      if (!res.ok) setErrorMsg(res.error);
      return;
    }
    setBusy(true);
    try {
      const res = await setSpendingVisibilityRemote(next);
      if (!res.ok) setErrorMsg(res.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>My Spending</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Recorded ledger charges are separated from estimates.
          </p>
        </div>
        <div className="tabs">
          <button
            type="button"
            disabled={busy}
            className={`tab ${visibility === "recorded_only" ? "on" : ""}`}
            onClick={() => void handleVisibility("recorded_only")}
          >
            Recorded only
          </button>
          <button
            type="button"
            disabled={busy}
            className={`tab ${visibility === "include_estimates" ? "on" : ""}`}
            onClick={() => void handleVisibility("include_estimates")}
          >
            Include estimates
          </button>
        </div>
      </div>

      {errorMsg ? <p className="error" style={{ margin: 0 }}>{errorMsg}</p> : null}

      <div className="grid-4">
        <div className="panel stat">
          <span className="tiny">Recorded spending</span>
          <strong className="tabular">{formatMoney(buckets.recorded)}</strong>
        </div>
        <div className="panel stat">
          <span className="tiny">Estimated / uncaptured</span>
          <strong className="tabular">{formatMoney(buckets.estimated)}</strong>
        </div>
        <div className="panel stat">
          <span className="tiny">Services</span>
          <strong className="tabular">{formatMoney(serviceTotal)}</strong>
        </div>
        <div className="panel stat">
          <span className="tiny">Marketplace products</span>
          <strong className="tabular">{formatMoney(productTotal)}</strong>
        </div>
      </div>

      <section className="panel stack">
        <h3>Spending by Category</h3>
        <Bars points={buckets.byCategory.length ? buckets.byCategory : [{ label: "None", value: 0 }]} />
      </section>

      <section className="panel stack">
        <h3>Transaction History</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Business</th>
              <th>Type</th>
              <th>Method</th>
              <th>Ledger Status</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((pay) => {
              const biz = state.businesses.find((b) => b.id === pay.businessId);
              return (
                <tr key={pay.id}>
                  <td className="tiny">{formatDate(pay.createdAt)}</td>
                  <td>{biz?.name ?? pay.businessId}</td>
                  <td className="tiny">{pay.referenceType}</td>
                  <td className="tiny">{pay.method.replaceAll("_", " ")}</td>
                  <td>
                    <Badge tone={pay.status === "recorded" ? "success" : "warning"}>{pay.status}</Badge>
                  </td>
                  <td className="tabular">{formatMoney(pay.amount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
