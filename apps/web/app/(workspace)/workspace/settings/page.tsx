"use client";

import { changePlan, updateBusiness, useBookItState } from "@bookit/api-client";
import { businessSettingSections, roleLabels } from "@bookit/ui";
import { can, formatDate, formatMoney, permissionsFor } from "@bookit/utils";
import { useState } from "react";
import { Badge, Button, Field } from "@/components/ui";
import { useAuth } from "@/lib/session";

export default function WorkspaceSettingsPage() {
  const auth = useAuth();
  const state = useBookItState();
  const [section, setSection] = useState("profile");
  const [notice, setNotice] = useState("");

  const bizId = auth.workspace?.businessId ?? "";
  const biz = state.businesses.find((b) => b.id === bizId);
  const sub = state.subscriptions.find((s) => s.businessId === bizId);
  const [form, setForm] = useState({
    name: biz?.name ?? "",
    description: biz?.description ?? "",
    phone: biz?.phone ?? "",
    email: biz?.email ?? "",
    website: biz?.website ?? "",
    address: biz?.address ?? "",
    city: biz?.city ?? "",
    cancellationPolicy: biz?.cancellationPolicy ?? "",
    bookingApproval: (biz?.bookingApproval ?? "automatic") as "automatic" | "manual",
  });

  if (!auth.workspace || !biz) return null;
  const role = auth.workspace.role;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <h1 style={{ margin: 0 }}>Business Settings & Subscription</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Configure workspace details, booking rules, permissions, and plan subscription.
        </p>
      </div>

      <div className="split-detail" style={{ gridTemplateColumns: "230px 1fr" }}>
        <aside className="panel stack" style={{ gap: 4, padding: 10 }}>
          {businessSettingSections.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`side-link ${section === item.id ? "active" : ""}`}
              style={{ background: section === item.id ? undefined : "transparent", border: 0, textAlign: "left", cursor: "pointer" }}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </aside>

        <section className="panel stack">
          {notice ? <div className="notice">{notice}</div> : null}

          {section === "profile" || section === "locations" ? (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                updateBusiness(bizId, form);
                setNotice("Business profile updated.");
              }}
            >
              <h2 style={{ margin: 0 }}>{section === "locations" ? "Locations" : "Business Profile"}</h2>
              <div className="grid-2">
                <Field label="Business name">
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
                <Field label="Phone">
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </Field>
                <Field label="Email">
                  <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </Field>
                <Field label="Website">
                  <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
                </Field>
                <Field label="Address">
                  <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </Field>
                <Field label="City">
                  <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                </Field>
              </div>
              <Field label="Description">
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
              <div>
                <Button type="submit">Save profile</Button>
              </div>
            </form>
          ) : null}

          {section === "hours" ? (
            <div className="stack">
              <h2 style={{ margin: 0 }}>Working Hours</h2>
              {(["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).map((day) => {
                const h = biz.hours[day];
                return (
                  <div key={day} className="row" style={{ justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                    <strong style={{ textTransform: "capitalize", width: 60 }}>{day}</strong>
                    <span className="tabular">{h.closed ? "Closed" : `${h.open} – ${h.close}`}</span>
                  </div>
                );
              })}
            </div>
          ) : null}

          {section === "booking" || section === "cancellation" ? (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                updateBusiness(bizId, {
                  bookingApproval: form.bookingApproval,
                  cancellationPolicy: form.cancellationPolicy,
                });
                setNotice("Policies updated.");
              }}
            >
              <h2 style={{ margin: 0 }}>Booking & Cancellation Policies</h2>
              <Field label="Appointment confirmation mode">
                <select
                  value={form.bookingApproval}
                  onChange={(e) => setForm({ ...form, bookingApproval: e.target.value as "automatic" | "manual" })}
                >
                  <option value="automatic">Automatic confirmation for open slots</option>
                  <option value="manual">Manual staff approval required</option>
                </select>
              </Field>
              <Field label="Cancellation policy">
                <textarea value={form.cancellationPolicy} onChange={(e) => setForm({ ...form, cancellationPolicy: e.target.value })} />
              </Field>
              <div>
                <Button type="submit">Save policy</Button>
              </div>
            </form>
          ) : null}

          {section === "permissions" ? (
            <div className="stack">
              <h2 style={{ margin: 0 }}>Team Permissions</h2>
              <p className="muted">Permissions are enforced per workspace role. FastAPI will validate these server-side.</p>
              {(["owner", "admin", "manager", "employee", "receptionist", "accountant"] as const).map((r) => (
                <div key={r} className="select-card stack" style={{ gap: 6 }}>
                  <strong>{roleLabels[r]}</strong>
                  <div className="tiny">{permissionsFor(r).join(" · ")}</div>
                </div>
              ))}
            </div>
          ) : null}

          {section === "subscription" ? (
            <div className="stack">
              <h2 style={{ margin: 0 }}>Subscription Management</h2>
              <div className="select-card row" style={{ justifyContent: "space-between" }}>
                <div>
                  <strong>Current plan: {(sub?.planId ?? "professional").toUpperCase()}</strong>
                  <div className="tiny">
                    Status: {sub?.status ?? "trialing"}{" "}
                    {sub?.trialEndsAt ? `· 30-day trial ends ${formatDate(sub.trialEndsAt)}` : ""}
                  </div>
                </div>
                <Badge tone="brand">{sub?.status ?? "trialing"}</Badge>
              </div>
              <div className="grid-3">
                {state.plans.map((plan) => {
                  const active = (sub?.planId ?? "professional") === plan.id;
                  return (
                    <div key={plan.id} className={`select-card stack ${active ? "on" : ""}`} style={{ gap: 8 }}>
                      <strong>{plan.name}</strong>
                      <span className="tabular" style={{ fontSize: 22, fontWeight: 700 }}>
                        {formatMoney(plan.monthlyPrice)}/mo
                      </span>
                      <span className="tiny">{plan.description}</span>
                      <div className="tiny">{plan.features.join(" · ")}</div>
                      {can(role, "subscription.manage") ? (
                        <Button
                          tone={active ? "soft" : "primary"}
                          small
                          disabled={active}
                          onClick={() => {
                            changePlan(bizId, plan.id);
                            setNotice(`Switched plan to ${plan.name} (no billing charged in preview).`);
                          }}
                        >
                          {active ? "Current plan" : "Select plan"}
                        </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {["payments", "notifications", "security", "integrations"].includes(section) ? (
            <div className="stack">
              <h2 style={{ margin: 0 }}>{businessSettingSections.find((s) => s.id === section)?.label}</h2>
              <p className="muted">
                Payment payouts, webhook endpoints, and tenant-scoped API keys connect when the FastAPI backend is deployed.
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
