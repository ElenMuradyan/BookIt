"use client";

import {
  bookingConfigsForBusiness,
  changePlan,
  changePlanRemote,
  saveBookingConfig,
  updateBusiness,
  updateBusinessHours,
  updateBusinessHoursRemote,
  updateBusinessRemote,
  upsertBookingConfigRemote,
  useBookItState,
  usingMocks,
} from "@bookit/api-client";
import type { BookingModel, BusinessCategory, DepositMode, WeeklyHours } from "@bookit/types";
import { businessSettingSections, categoryLabels, roleLabels } from "@bookit/ui";
import { bookingModelLabel, can, formatDate, formatMoney, permissionsFor, WEEKDAY_ORDER } from "@bookit/utils";
import { useEffect, useState } from "react";
import { Badge, Button, Field } from "@/components/ui";
import { useAuth } from "@/lib/session";

const BOOKING_MODELS: BookingModel[] = ["appointment", "resource", "ticket", "capacity"];
const CATEGORIES = Object.keys(categoryLabels) as BusinessCategory[];

const EMPTY_HOURS: WeeklyHours = {
  mon: { closed: false, open: "09:00", close: "18:00" },
  tue: { closed: false, open: "09:00", close: "18:00" },
  wed: { closed: false, open: "09:00", close: "18:00" },
  thu: { closed: false, open: "09:00", close: "18:00" },
  fri: { closed: false, open: "09:00", close: "18:00" },
  sat: { closed: true, open: "09:00", close: "17:00" },
  sun: { closed: true, open: "09:00", close: "17:00" },
};

export default function WorkspaceSettingsPage() {
  const auth = useAuth();
  const state = useBookItState();
  const [section, setSection] = useState("profile");
  const [notice, setNotice] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeModel, setActiveModel] = useState<BookingModel>("appointment");

  const bizId = auth.workspace?.businessId ?? "";
  const biz = state.businesses.find((b) => b.id === bizId);
  const sub = state.subscriptions.find((s) => s.businessId === bizId);
  const modelConfigs = bookingConfigsForBusiness(state, bizId);
  const currentModelCfg = modelConfigs.find((c) => c.bookingModel === activeModel);

  const [form, setForm] = useState({
    name: biz?.name ?? "",
    category: (biz?.category ?? "other") as BusinessCategory,
    timezone: biz?.timezone ?? "America/Los_Angeles",
    description: biz?.description ?? "",
    phone: biz?.phone ?? "",
    email: biz?.email ?? "",
    website: biz?.website ?? "",
    address: biz?.address ?? "",
    city: biz?.city ?? "",
    cancellationPolicy: biz?.cancellationPolicy ?? "",
    bookingApproval: (biz?.bookingApproval ?? "automatic") as "automatic" | "manual",
  });
  const [hours, setHours] = useState<WeeklyHours>(biz?.hours ?? EMPTY_HOURS);
  const [cfgForm, setCfgForm] = useState({
    enabled: currentModelCfg?.enabled ?? activeModel === "appointment",
    displayLabel: currentModelCfg?.displayLabel ?? bookingModelLabel(activeModel),
    approvalMode: (currentModelCfg?.approvalMode ?? "automatic") as "automatic" | "manual",
    minNoticeMinutes: String(currentModelCfg?.minNoticeMinutes ?? 60),
    maxAdvanceDays: String(currentModelCfg?.maxAdvanceDays ?? 90),
    cancellationCutoffHours: String(currentModelCfg?.cancellationCutoffHours ?? 24),
    cancellationFeePercent: String(currentModelCfg?.cancellationFeePercent ?? 0),
    depositMode: (currentModelCfg?.depositMode ?? "none") as DepositMode,
    depositValue: String(currentModelCfg?.depositValue ?? 0),
    cancellationPolicyText: currentModelCfg?.cancellationPolicyText ?? biz?.cancellationPolicy ?? "Free cancellation up to 24 hours before start.",
    slotIntervalMinutes: String((currentModelCfg?.settings?.slotIntervalMinutes as number | undefined) ?? 30),
    turnDurationMinutes: String((currentModelCfg?.settings?.turnDurationMinutes as number | undefined) ?? 90),
    seatingAreas: Array.isArray(currentModelCfg?.settings?.seatingAreas)
      ? (currentModelCfg.settings?.seatingAreas as string[]).join(", ")
      : "Main Dining, Patio, Counter",
    checkInTime: String((currentModelCfg?.settings?.checkInTime as string | undefined) ?? "15:00"),
    checkOutTime: String((currentModelCfg?.settings?.checkOutTime as string | undefined) ?? "11:00"),
  });

  useEffect(() => {
    if (!biz) return;
    setForm({
      name: biz.name,
      category: biz.category,
      timezone: biz.timezone ?? "America/Los_Angeles",
      description: biz.description,
      phone: biz.phone,
      email: biz.email,
      website: biz.website ?? "",
      address: biz.address,
      city: biz.city,
      cancellationPolicy: biz.cancellationPolicy,
      bookingApproval: biz.bookingApproval,
    });
    setHours(biz.hours);
  }, [bizId, biz]);

  useEffect(() => {
    if (!biz) return;
    const found = modelConfigs.find((c) => c.bookingModel === activeModel);
    const settings = found?.settings ?? {};
    setCfgForm({
      enabled: found?.enabled ?? activeModel === "appointment",
      displayLabel: found?.displayLabel ?? bookingModelLabel(activeModel),
      approvalMode: found?.approvalMode ?? "automatic",
      minNoticeMinutes: String(found?.minNoticeMinutes ?? 60),
      maxAdvanceDays: String(found?.maxAdvanceDays ?? 90),
      cancellationCutoffHours: String(found?.cancellationCutoffHours ?? 24),
      cancellationFeePercent: String(found?.cancellationFeePercent ?? 0),
      depositMode: found?.depositMode ?? "none",
      depositValue: String(found?.depositValue ?? 0),
      cancellationPolicyText: found?.cancellationPolicyText ?? biz.cancellationPolicy ?? "Free cancellation up to 24 hours before start.",
      slotIntervalMinutes: String((settings.slotIntervalMinutes as number | undefined) ?? 30),
      turnDurationMinutes: String((settings.turnDurationMinutes as number | undefined) ?? 90),
      seatingAreas: Array.isArray(settings.seatingAreas)
        ? (settings.seatingAreas as string[]).join(", ")
        : "Main Dining, Patio, Counter",
      checkInTime: String((settings.checkInTime as string | undefined) ?? "15:00"),
      checkOutTime: String((settings.checkOutTime as string | undefined) ?? "11:00"),
    });
  }, [activeModel, bizId, currentModelCfg]);

  if (!auth.workspace || !biz) return null;
  const role = auth.workspace.role;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <h1 style={{ margin: 0 }}>Business Settings &amp; Subscription</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Configure workspace category, booking models, operating rules, permissions, and plan subscription.
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
              onClick={() => {
                setSection(item.id);
                setNotice("");
                setErrorMsg("");
              }}
            >
              {item.label}
            </button>
          ))}
        </aside>

        <section className="panel stack">
          {notice ? <div className="notice">{notice}</div> : null}
          {errorMsg ? <p className="error">{errorMsg}</p> : null}

          {section === "profile" || section === "locations" ? (
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                setNotice("");
                setErrorMsg("");
                setSaving(true);
                try {
                  const res = usingMocks()
                    ? updateBusiness(bizId, form)
                    : await updateBusinessRemote(bizId, {
                        name: form.name,
                        category: form.category,
                        timezone: form.timezone,
                        description: form.description,
                        phone: form.phone,
                        email: form.email,
                        website: form.website || undefined,
                        address: form.address,
                        city: form.city,
                      });
                  if (!res.ok) {
                    setErrorMsg(res.error);
                    return;
                  }
                  setNotice("Business profile updated.");
                } finally {
                  setSaving(false);
                }
              }}
            >
              <h2 style={{ margin: 0 }}>{section === "locations" ? "Locations" : "Business Profile"}</h2>
              <div className="grid-2">
                <Field label="Business name">
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
                <Field label="Primary Category">
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as BusinessCategory })}>
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {categoryLabels[cat]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Timezone">
                  <select value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                    <option value="America/Los_Angeles">Pacific (America/Los_Angeles)</option>
                    <option value="America/Denver">Mountain (America/Denver)</option>
                    <option value="America/Chicago">Central (America/Chicago)</option>
                    <option value="America/New_York">Eastern (America/New_York)</option>
                    <option value="Europe/London">London (Europe/London)</option>
                    <option value="UTC">UTC</option>
                  </select>
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
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save profile"}
                </Button>
              </div>
            </form>
          ) : null}

          {section === "hours" ? (
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                setNotice("");
                setErrorMsg("");
                setSaving(true);
                try {
                  const res = usingMocks()
                    ? updateBusinessHours(bizId, hours)
                    : await updateBusinessHoursRemote(bizId, hours);
                  if (!res.ok) {
                    setErrorMsg(res.error);
                    return;
                  }
                  setNotice("Working hours updated.");
                } finally {
                  setSaving(false);
                }
              }}
            >
              <h2 style={{ margin: 0 }}>Working Hours</h2>
              <p className="muted" style={{ margin: 0 }}>
                Customer booking slots automatically respect these opening hours.
              </p>
              {WEEKDAY_ORDER.map(({ key, label }) => {
                const h = hours[key];
                return (
                  <div
                    key={key}
                    className="row"
                    style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--line)" }}
                  >
                    <strong style={{ width: 100 }}>{label}</strong>
                    <label className="row" style={{ gap: 6, fontSize: 13 }}>
                      <input
                        type="checkbox"
                        checked={h.closed}
                        disabled={!can(role, "settings.profile")}
                        onChange={(e) =>
                          setHours({
                            ...hours,
                            [key]: { ...h, closed: e.target.checked },
                          })
                        }
                      />
                      Closed
                    </label>
                    <div className="row" style={{ gap: 8 }}>
                      <input
                        type="time"
                        value={h.open}
                        disabled={h.closed || !can(role, "settings.profile")}
                        onChange={(e) =>
                          setHours({
                            ...hours,
                            [key]: { ...h, open: e.target.value },
                          })
                        }
                        style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, padding: "4px 8px" }}
                      />
                      <span className="muted">–</span>
                      <input
                        type="time"
                        value={h.close}
                        disabled={h.closed || !can(role, "settings.profile")}
                        onChange={(e) =>
                          setHours({
                            ...hours,
                            [key]: { ...h, close: e.target.value },
                          })
                        }
                        style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, padding: "4px 8px" }}
                      />
                    </div>
                  </div>
                );
              })}
              {can(role, "settings.profile") ? (
                <div>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving..." : "Save working hours"}
                  </Button>
                </div>
              ) : null}
            </form>
          ) : null}

          {section === "booking" || section === "cancellation" ? (
            <div className="stack" style={{ gap: 20 }}>
              <form
                className="stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setNotice("");
                  setErrorMsg("");
                  setSaving(true);
                  try {
                    const patch = {
                      bookingApproval: form.bookingApproval,
                      cancellationPolicy: form.cancellationPolicy,
                    };
                    const res = usingMocks()
                      ? updateBusiness(bizId, patch)
                      : await updateBusinessRemote(bizId, patch);
                    if (!res.ok) {
                      setErrorMsg(res.error);
                      return;
                    }
                    setNotice("Default venue policies updated.");
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <h2 style={{ margin: 0 }}>Booking &amp; Cancellation Policies</h2>
                <Field label="Default confirmation mode">
                  <select
                    value={form.bookingApproval}
                    onChange={(e) => setForm({ ...form, bookingApproval: e.target.value as "automatic" | "manual" })}
                  >
                    <option value="automatic">Automatic confirmation for open slots</option>
                    <option value="manual">Manual staff approval required</option>
                  </select>
                </Field>
                <Field label="Default cancellation policy">
                  <textarea value={form.cancellationPolicy} onChange={(e) => setForm({ ...form, cancellationPolicy: e.target.value })} />
                </Field>
                <div>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Saving..." : "Save venue policy"}
                  </Button>
                </div>
              </form>

              <div className="stack" style={{ borderTop: "1px solid var(--line)", paddingTop: 18 }}>
                <div>
                  <h3 style={{ margin: 0 }}>Per-Model Booking Rules</h3>
                  <p className="tiny" style={{ margin: "2px 0 0" }}>
                    Enable models and configure cutoff hours, deposits, seating windows, and hotel check-in times.
                  </p>
                </div>
                <div className="tabs">
                  {BOOKING_MODELS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`tab ${activeModel === m ? "on" : ""}`}
                      onClick={() => {
                        setActiveModel(m);
                        setNotice("");
                        setErrorMsg("");
                      }}
                    >
                      {bookingModelLabel(m)}
                    </button>
                  ))}
                </div>
                <form
                  className="stack"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setNotice("");
                    setErrorMsg("");
                    setSaving(true);
                    try {
                      const nextSettings: Record<string, unknown> = { ...(currentModelCfg?.settings ?? {}) };
                      if (activeModel === "resource") {
                        if (biz.category === "hotel") {
                          nextSettings.checkInTime = cfgForm.checkInTime || "15:00";
                          nextSettings.checkOutTime = cfgForm.checkOutTime || "11:00";
                        } else {
                          nextSettings.slotIntervalMinutes = Math.max(15, Number(cfgForm.slotIntervalMinutes) || 30);
                          nextSettings.turnDurationMinutes = Math.max(30, Number(cfgForm.turnDurationMinutes) || 90);
                          nextSettings.seatingAreas = cfgForm.seatingAreas
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean);
                        }
                      }

                      if (usingMocks()) {
                        const res = saveBookingConfig(bizId, activeModel, {
                          ...cfgForm,
                          settings: nextSettings,
                        });
                        if (!res.ok) {
                          setErrorMsg(res.error);
                          return;
                        }
                      } else {
                        const res = await upsertBookingConfigRemote(bizId, activeModel, {
                          enabled: cfgForm.enabled,
                          displayLabel: cfgForm.displayLabel.trim() || bookingModelLabel(activeModel),
                          approvalMode: cfgForm.approvalMode,
                          minNoticeMinutes: Math.max(0, Number(cfgForm.minNoticeMinutes) || 0),
                          maxAdvanceDays: Math.max(1, Number(cfgForm.maxAdvanceDays) || 90),
                          bufferBeforeMinutes: currentModelCfg?.bufferBeforeMinutes ?? 0,
                          bufferAfterMinutes: currentModelCfg?.bufferAfterMinutes ?? 0,
                          cancellationCutoffHours: Math.max(0, Number(cfgForm.cancellationCutoffHours) || 0),
                          cancellationFeePercent: Math.min(100, Math.max(0, Number(cfgForm.cancellationFeePercent) || 0)),
                          cancellationPolicyText: cfgForm.cancellationPolicyText,
                          depositMode: cfgForm.depositMode,
                          depositValue: Math.max(0, Number(cfgForm.depositValue) || 0),
                          holdTtlMinutes: currentModelCfg?.holdTtlMinutes ?? 15,
                          allowOverbooking: currentModelCfg?.allowOverbooking ?? false,
                          settings: nextSettings,
                        });
                        if (!res.ok) {
                          setErrorMsg(res.error);
                          return;
                        }
                      }
                      setNotice(`${bookingModelLabel(activeModel)} configuration saved.`);
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  <label className="row" style={{ gap: 8, fontSize: 14 }}>
                    <input
                      type="checkbox"
                      checked={cfgForm.enabled}
                      disabled={!can(role, "settings.policies")}
                      onChange={(e) => setCfgForm({ ...cfgForm, enabled: e.target.checked })}
                    />
                    <strong>Enable {bookingModelLabel(activeModel)} for customer bookings</strong>
                  </label>
                  <div className="grid-2">
                    <Field label="Customer Tab Label">
                      <input value={cfgForm.displayLabel} onChange={(e) => setCfgForm({ ...cfgForm, displayLabel: e.target.value })} />
                    </Field>
                    <Field label="Approval Mode">
                      <select
                        value={cfgForm.approvalMode}
                        onChange={(e) => setCfgForm({ ...cfgForm, approvalMode: e.target.value as "automatic" | "manual" })}
                      >
                        <option value="automatic">Automatic</option>
                        <option value="manual">Manual approval</option>
                      </select>
                    </Field>
                    <Field label="Min Notice (minutes)">
                      <input type="number" value={cfgForm.minNoticeMinutes} onChange={(e) => setCfgForm({ ...cfgForm, minNoticeMinutes: e.target.value })} />
                    </Field>
                    <Field label="Max Advance (days)">
                      <input type="number" value={cfgForm.maxAdvanceDays} onChange={(e) => setCfgForm({ ...cfgForm, maxAdvanceDays: e.target.value })} />
                    </Field>
                    <Field label="Cancellation Cutoff (hours)">
                      <input type="number" value={cfgForm.cancellationCutoffHours} onChange={(e) => setCfgForm({ ...cfgForm, cancellationCutoffHours: e.target.value })} />
                    </Field>
                    <Field label="Late Cancellation Fee (%)">
                      <input type="number" value={cfgForm.cancellationFeePercent} onChange={(e) => setCfgForm({ ...cfgForm, cancellationFeePercent: e.target.value })} />
                    </Field>
                    <Field label="Deposit Mode">
                      <select
                        value={cfgForm.depositMode}
                        onChange={(e) => setCfgForm({ ...cfgForm, depositMode: e.target.value as DepositMode })}
                      >
                        <option value="none">No deposit</option>
                        <option value="fixed">Fixed amount ($)</option>
                        <option value="percent">Percent of total (%)</option>
                      </select>
                    </Field>
                    <Field label="Deposit Value">
                      <input type="number" value={cfgForm.depositValue} onChange={(e) => setCfgForm({ ...cfgForm, depositValue: e.target.value })} />
                    </Field>
                  </div>

                  {activeModel === "resource" && biz.category === "hotel" ? (
                    <div className="grid-2">
                      <Field label="Standard Check-In Time">
                        <input type="time" value={cfgForm.checkInTime} onChange={(e) => setCfgForm({ ...cfgForm, checkInTime: e.target.value })} />
                      </Field>
                      <Field label="Standard Check-Out Time">
                        <input type="time" value={cfgForm.checkOutTime} onChange={(e) => setCfgForm({ ...cfgForm, checkOutTime: e.target.value })} />
                      </Field>
                    </div>
                  ) : null}

                  {activeModel === "resource" && biz.category !== "hotel" ? (
                    <div className="grid-2">
                      <Field label="Reservation Slot Interval (min)">
                        <input type="number" value={cfgForm.slotIntervalMinutes} onChange={(e) => setCfgForm({ ...cfgForm, slotIntervalMinutes: e.target.value })} />
                      </Field>
                      <Field label="Default Turn / Stay Duration (min)">
                        <input type="number" value={cfgForm.turnDurationMinutes} onChange={(e) => setCfgForm({ ...cfgForm, turnDurationMinutes: e.target.value })} />
                      </Field>
                      <Field label="Seating / Space Areas (comma-separated)">
                        <input value={cfgForm.seatingAreas} onChange={(e) => setCfgForm({ ...cfgForm, seatingAreas: e.target.value })} placeholder="Main Dining, Patio, Bar" />
                      </Field>
                    </div>
                  ) : null}

                  <Field label="Model Cancellation Policy Copy">
                    <textarea value={cfgForm.cancellationPolicyText} onChange={(e) => setCfgForm({ ...cfgForm, cancellationPolicyText: e.target.value })} />
                  </Field>
                  {can(role, "settings.policies") ? (
                    <div>
                      <Button type="submit" disabled={saving}>
                        {saving ? "Saving..." : `Save ${bookingModelLabel(activeModel)} Rules`}
                      </Button>
                    </div>
                  ) : null}
                </form>
              </div>
            </div>
          ) : null}

          {section === "permissions" ? (
            <div className="stack">
              <h2 style={{ margin: 0 }}>Team Permissions</h2>
              <p className="muted">Permissions are enforced per workspace role server-side.</p>
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
                          disabled={active || saving}
                          onClick={async () => {
                            setNotice("");
                            setErrorMsg("");
                            setSaving(true);
                            try {
                              const res = usingMocks()
                                ? changePlan(bizId, plan.id)
                                : await changePlanRemote(bizId, plan.id);
                              if (!res.ok) {
                                setErrorMsg(res.error);
                                return;
                              }
                              setNotice(
                                usingMocks()
                                  ? `Switched plan to ${plan.name} (no billing charged in preview).`
                                  : `Switched subscription plan to ${plan.name}.`,
                              );
                            } finally {
                              setSaving(false);
                            }
                          }}
                        >
                          {active ? "Current plan" : saving ? "Updating..." : "Select plan"}
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
