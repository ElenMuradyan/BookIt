"use client";

import {
  addExpense,
  businessAppointments,
  sellerOrders,
  useBookItState,
} from "@bookit/api-client";
import { can, DEMO_TODAY, formatDate, formatMoney } from "@bookit/utils";
import { useState } from "react";
import { AreaChart } from "@/components/Charts";
import { Badge, Button, Field, Modal } from "@/components/ui";
import { useAuth } from "@/lib/session";

export default function WorkspaceFinancePage() {
  const auth = useAuth();
  const state = useBookItState();
  const [period, setPeriod] = useState<"daily" | "monthly" | "yearly">("monthly");
  const [showExpense, setShowExpense] = useState(false);
  const [form, setForm] = useState({ category: "Supplies", amount: "120", note: "", incurredOn: DEMO_TODAY });
  const [error, setError] = useState("");

  if (!auth.workspace) return null;
  const bizId = auth.workspace.businessId;
  const canManage = can(auth.workspace.role, "finance.manage");

  const appts = businessAppointments(state, bizId);
  const orders = sellerOrders(state, bizId);
  const serviceRev = appts.filter((a) => a.status !== "cancelled" && a.status !== "rejected").reduce((s, a) => s + a.price, 0);
  const productRev = orders.filter((o) => o.status !== "cancelled" && o.status !== "refunded").reduce((s, o) => s + o.total, 0);
  const refunds = orders.filter((o) => o.status === "refunded").reduce((s, o) => s + o.total, 0);
  const expenses = state.expenses.filter((e) => e.businessId === bizId);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const gross = serviceRev + productRev;
  const estFees = Math.round(gross * 0.029 * 100) / 100;
  const estNet = gross - totalExpenses - estFees - refunds;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Finance</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Recorded ledger figures are clearly separated from manual expenses and estimates.
          </p>
        </div>
        <div className="row">
          <div className="tabs">
            {(["daily", "monthly", "yearly"] as const).map((p) => (
              <button key={p} type="button" className={`tab ${period === p ? "on" : ""}`} onClick={() => setPeriod(p)}>
                {p[0].toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          {canManage ? <Button onClick={() => setShowExpense(true)}>+ Add Expense</Button> : null}
        </div>
      </div>

      <div className="grid-4">
        <div className="panel stat">
          <span className="tiny">Service Revenue</span>
          <strong className="tabular">{formatMoney(serviceRev)}</strong>
        </div>
        <div className="panel stat">
          <span className="tiny">Product Revenue</span>
          <strong className="tabular">{formatMoney(productRev)}</strong>
        </div>
        <div className="panel stat">
          <span className="tiny">Expenses ({expenses.length})</span>
          <strong className="tabular">{formatMoney(totalExpenses)}</strong>
        </div>
        <div className="panel stat kpi-glow">
          <span className="tiny">Estimated Net ({period})</span>
          <strong className="tabular">{formatMoney(estNet)}</strong>
          <span className="tiny tabular">Est. fees: {formatMoney(estFees)}</span>
        </div>
      </div>

      <section className="panel stack">
        <h3 style={{ margin: 0 }}>Revenue Trend</h3>
        <AreaChart points={state.revenueSeries} />
      </section>

      <div className="grid-2">
        <section className="panel stack">
          <h3 style={{ margin: 0 }}>Expenses Ledger</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Note</th>
                <th>Source</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((exp) => (
                <tr key={exp.id}>
                  <td className="tiny">{exp.incurredOn}</td>
                  <td>{exp.category}</td>
                  <td className="tiny">{exp.note}</td>
                  <td>
                    <Badge tone={exp.source === "recorded" ? "success" : "warning"}>{exp.source}</Badge>
                  </td>
                  <td className="tabular">{formatMoney(exp.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel stack">
          <h3 style={{ margin: 0 }}>Billing Invoices</h3>
          {state.invoices
            .filter((i) => i.businessId === bizId)
            .map((inv) => (
              <div key={inv.id} className="select-card row" style={{ justifyContent: "space-between", padding: 12 }}>
                <div>
                  <strong>{inv.description}</strong>
                  <div className="tiny">{formatDate(inv.issuedAt)}</div>
                </div>
                <div className="row">
                  <Badge tone="brand">{inv.status}</Badge>
                  <strong className="tabular">{formatMoney(inv.amount)}</strong>
                </div>
              </div>
            ))}
        </section>
      </div>

      {showExpense ? (
        <Modal title="Add Manual Expense" onClose={() => setShowExpense(false)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const res = addExpense(bizId, form);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setForm({ category: "Supplies", amount: "120", note: "", incurredOn: DEMO_TODAY });
              setError("");
              setShowExpense(false);
            }}
          >
            <Field label="Category">
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </Field>
            <div className="grid-2">
              <Field label="Amount ($)">
                <input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </Field>
              <Field label="Date">
                <input type="date" value={form.incurredOn} onChange={(e) => setForm({ ...form, incurredOn: e.target.value })} />
              </Field>
            </div>
            <Field label="Note">
              <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Salon supplies restock" />
            </Field>
            {error ? <p className="error">{error}</p> : null}
            <Button type="submit">Save expense</Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
