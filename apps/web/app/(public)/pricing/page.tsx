"use client";

import { useBookItState } from "@bookit/api-client";
import { formatMoney } from "@bookit/utils";
import Link from "next/link";

export default function PricingPage() {
  const state = useBookItState();
  return (
    <main className="page">
      <h1>Plans</h1>
      <p className="muted">Billing is not charged in this preview. Approved businesses start a 30-day trial.</p>
      <div className="grid-3">
        {state.plans.map((plan) => (
          <article key={plan.id} className="panel stack">
            <h2>{plan.name}</h2>
            <strong style={{ fontSize: 32 }}>{formatMoney(plan.monthlyPrice)}<span className="tiny"> / month</span></strong>
            <p className="muted">{plan.description}</p>
            <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
            <Link className="btn" href="/register/business">Start with this plan</Link>
          </article>
        ))}
      </div>
    </main>
  );
}
