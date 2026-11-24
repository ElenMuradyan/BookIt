"use client";

import { submitBusinessApplication, submitBusinessApplicationRemote, useBookItState, usingMocks } from "@bookit/api-client";
import type { BusinessCategory } from "@bookit/types";
import { categoryLabels } from "@bookit/ui";
import { passwordScore } from "@bookit/utils";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Mark } from "@/components/ui";
import { useAuth } from "@/lib/session";

const categories = Object.keys(categoryLabels) as BusinessCategory[];

const CATEGORY_PREVIEW: Partial<Record<BusinessCategory, { models: string; summary: string }>> = {
  restaurant: {
    models: "Tables & Dining Spaces",
    summary: "Auto-enables table inventory, seating areas, party-size search, and configurable turn times.",
  },
  hotel: {
    models: "Rooms & Multi-Night Stays",
    summary: "Auto-enables room pools, per-night rates, guest counts, and check-in/check-out windows.",
  },
  events: {
    models: "Tickets & Capacity Sessions",
    summary: "Auto-enables multi-tier ticketed events, QR passes, attendee rosters, and group experiences.",
  },
  travel: {
    models: "Tours, Tickets & Group Passes",
    summary: "Auto-enables scheduled departures, passenger limits, and scannable boarding passes.",
  },
  sports: {
    models: "Courts, Coaching & Clinics",
    summary: "Auto-enables hourly court bookings alongside private coaching and group clinics.",
  },
  fitness: {
    models: "Sessions & Group Classes",
    summary: "Auto-enables 1-on-1 personal training appointments and limited-capacity classes.",
  },
  wellness: {
    models: "Treatments & Workshops",
    summary: "Auto-enables spa appointments, private suites, and group wellness sessions.",
  },
};

export default function BusinessRegisterPage() {
  const auth = useAuth();
  const state = useBookItState();
  const [form, setForm] = useState({
    businessName: "",
    legalName: "",
    category: "beauty",
    country: "United States",
    city: "",
    address: "",
    phone: "",
    email: "",
    website: "",
    description: "",
    ownerName: auth.user ? `${auth.user.firstName} ${auth.user.lastName}` : "",
    ownerEmail: auth.user?.email ?? "",
    ownerPhone: auth.user?.phone ?? "",
    ownerPassword: "",
    ownerConfirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [signInRequired, setSignInRequired] = useState(false);
  const [autoLoginNotice, setAutoLoginNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [businessId, setBusinessId] = useState("");
  const [submittedName, setSubmittedName] = useState("");
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!auth.user) return;
    const fullName = `${auth.user.firstName} ${auth.user.lastName}`.trim();
    setForm((current) => ({
      ...current,
      ownerName: current.ownerName || fullName,
      ownerEmail: current.ownerEmail || auth.user?.email || "",
      ownerPhone: current.ownerPhone || auth.user?.phone || "",
    }));
  }, [auth.user]);

  const created = state.businesses.find((business) => business.id === businessId);
  const strength = passwordScore(form.ownerPassword);
  const descriptionLength = form.description.trim().length;

  if (businessId) {
    const businessName = created?.name ?? submittedName ?? "Your business";
    const businessStatus = created?.status ?? "submitted";
    return (
      <div className="auth-layout">
        <section className="auth-art">
          <Link href="/" className="brand">
            <Mark /> BookIt Business
          </Link>
          <div>
            <span className="badge tone-success">Application Received</span>
            <h1 style={{ fontSize: 42, letterSpacing: "-0.04em", margin: "12px 0" }}>
              {businessName} is ready for setup.
            </h1>
            <p className="lede">
              Configure your services, resources, staff roster, and operating hours immediately while platform verification runs in the background.
            </p>
          </div>
        </section>
        <section className="auth-panel">
          <div className="panel stack" style={{ width: "min(520px, 100%)", gap: 16 }}>
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
              <h2 style={{ margin: 0 }}>{businessName}</h2>
              <span className="badge tone-brand">{businessStatus.replaceAll("_", " ")}</span>
            </div>
            <p className="muted" style={{ margin: 0 }}>
              Your business workspace is active so you can set up services, staff schedules, and working hours right away. Public booking goes live once a platform admin approves your verification packet.
            </p>
            <div className="notice">
              Check <strong>{form.ownerEmail}</strong> for a 6-digit code and verification link to verify your owner account.
            </div>
            {autoLoginNotice ? (
              <div className="notice">
                Your application was saved, but automatic workspace sign-in could not complete ({autoLoginNotice}). Use Business Sign In below to open your workspace.
              </div>
            ) : null}
            <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
              {auth.user ? (
                <Link className="btn" href="/workspace">
                  Open Business Workspace
                </Link>
              ) : null}
              <Link className="btn ghost" href={`/verify?email=${encodeURIComponent(form.ownerEmail)}`}>
                Verify Owner Email
              </Link>
              <Link className={auth.user ? "btn ghost" : "btn"} href="/login/business">
                Business Sign In
              </Link>
              <Link className="btn ghost" href="/explore">
                Explore Marketplace
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="auth-layout">
      <section className="auth-art">
        <Link href="/" className="brand">
          <Mark /> BookIt Business
        </Link>
        <div className="stack" style={{ gap: 18 }}>
          <div>
            <h1 style={{ fontSize: 40, letterSpacing: "-0.04em", margin: "0 0 12px" }}>
              Bring your appointments, spaces, and events onto BookIt.
            </h1>
            <p className="lede" style={{ margin: 0 }}>
              One structured workspace for salons, clinics, studios, courts, tables, venues, and scheduled experiences.
            </p>
          </div>
          <div className="stack" style={{ gap: 10 }}>
            <div className="panel stack" style={{ gap: 4, padding: 14 }}>
              <strong>1. Instant workspace setup</strong>
              <span className="tiny">Configure hours, services, resources, and team members immediately after submitting.</span>
            </div>
            <div className="panel stack" style={{ gap: 4, padding: 14 }}>
              <strong>2. Verification review</strong>
              <span className="tiny">Our team reviews your legal details and contact info before enabling public discovery.</span>
            </div>
            <div className="panel stack" style={{ gap: 4, padding: 14 }}>
              <strong>3. Existing BookIt account?</strong>
              <span className="tiny">Sign in first to link this business directly to your current BookIt login.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="auth-panel">
        <form
          className="stack"
          style={{ width: "min(620px, 100%)", gap: 16 }}
          aria-busy={submitting}
          onSubmit={async (event) => {
            event.preventDefault();
            if (submitting) return;
            setErrors({});
            setFormError("");
            setSignInRequired(false);
            setAutoLoginNotice("");
            setSubmitting(true);
            try {
              if (usingMocks()) {
                const result = submitBusinessApplication({ ...form, applicantUserId: auth.userId ?? undefined });
                if (!result.ok) {
                  setErrors(result.fieldErrors ?? {});
                  setFormError(result.error);
                  setSignInRequired(result.status === 401);
                  return;
                }
                if (result.data.token) {
                  auth.setToken(result.data.token, true);
                }
                auth.setWorkspaceId(result.data.businessId);
                setSubmittedName(form.businessName.trim());
                setBusinessId(result.data.businessId);
                return;
              }
              const result = await submitBusinessApplicationRemote({ ...form, applicantUserId: auth.userId ?? undefined });
              if (!result.ok) {
                setErrors(result.fieldErrors ?? {});
                setFormError(result.error);
                setSignInRequired(result.status === 401);
                return;
              }
              if (result.data.session) {
                await auth.signInRemote(result.data.session);
              } else {
                if (result.data.autoLoginError) {
                  setAutoLoginNotice(result.data.autoLoginError);
                }
                if (auth.userId) {
                  await auth.refreshSession();
                }
              }
              auth.setWorkspaceId(result.data.businessId);
              setSubmittedName(form.businessName.trim());
              setBusinessId(result.data.businessId);
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <div className="tabs" style={{ marginBottom: 4 }}>
            <Link href="/register" className="tab">Customer Sign Up</Link>
            <span className="tab on">Register a Business</span>
            <Link href="/login/business" className="tab">Business Sign In</Link>
          </div>

          <div>
            <h2 style={{ margin: 0 }}>Register a business</h2>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
              Applications are reviewed before the business accepts public bookings.
            </p>
          </div>

          <section className="panel stack" style={{ gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Business Details</h3>
            <div className="grid-2">
              <Text name="businessName" label="Business name" placeholder="e.g. Cascade Sound Studio" form={form} set={set} errors={errors} />
              <Text name="legalName" label="Legal business name" placeholder="e.g. Cascade Sound Studio LLC" form={form} set={set} errors={errors} />
            </div>
            <label className="field">
              <span>Category</span>
              <select value={form.category} onChange={(event) => set("category", event.target.value)}>
                {categories.map((category) => (
                  <option key={category} value={category}>{categoryLabels[category]}</option>
                ))}
              </select>
              {errors.category ? <small>{errors.category}</small> : null}
            </label>
            {(() => {
              const preview = CATEGORY_PREVIEW[form.category as BusinessCategory] ?? {
                models: "Appointments & Staff Scheduling",
                summary: "Auto-enables appointment services, staff assignment, and live slot availability.",
              };
              return (
                <div className="notice stack" style={{ gap: 2 }}>
                  <strong>Default booking setup: {preview.models}</strong>
                  <span className="tiny">{preview.summary}</span>
                </div>
              );
            })()}
            <label className="field">
              <span>Description</span>
              <textarea
                value={form.description}
                placeholder="Describe what customers book at your business (at least 20 characters)."
                onChange={(event) => set("description", event.target.value)}
              />
              <div className="row" style={{ justifyContent: "space-between" }}>
                {errors.description ? <small>{errors.description}</small> : <span className="tiny">Shown on your public BookIt profile once approved.</span>}
                <span className="tiny tabular">{descriptionLength}/20 min</span>
              </div>
            </label>
          </section>

          <section className="panel stack" style={{ gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Location &amp; Contact</h3>
            <div className="grid-2">
              <Text name="country" label="Country" form={form} set={set} errors={errors} />
              <Text name="city" label="City" placeholder="Seattle" form={form} set={set} errors={errors} />
              <Text name="phone" label="Business phone" placeholder="+1 206 555 0100" form={form} set={set} errors={errors} />
              <Text name="email" label="Business email" placeholder="hello@yourbusiness.com" type="email" form={form} set={set} errors={errors} />
            </div>
            <Text name="address" label="Street address" placeholder="1205 Western Ave, Suite 4B" form={form} set={set} errors={errors} />
            <Text name="website" label="Website (optional)" placeholder="https://yourbusiness.com" form={form} set={set} errors={errors} />
          </section>

          <section className="panel stack" style={{ gap: 12 }}>
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Owner &amp; Login Credentials</h3>
              {auth.user ? <span className="badge tone-success">Signed in</span> : null}
            </div>

            {auth.user ? (
              <div className="notice row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <span>
                  This business will be created under your signed-in account: <strong>{auth.user.email}</strong>
                </span>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => void auth.signOut()}
                  disabled={submitting}
                >
                  Use another account
                </button>
              </div>
            ) : null}

            <div className="grid-2">
              <Text name="ownerName" label="Owner full name" placeholder="Taylor Brooks" form={form} set={set} errors={errors} />
              <Text name="ownerPhone" label="Owner phone" placeholder="+1 206 555 0189" form={form} set={set} errors={errors} />
            </div>
            <Text
              name="ownerEmail"
              label="Owner email"
              placeholder="owner@yourbusiness.com"
              type="email"
              form={form}
              set={set}
              errors={errors}
              readOnly={Boolean(auth.user)}
            />

            {!auth.user ? (
              <div className="stack" style={{ gap: 10 }}>
                <div className="grid-2">
                  <label className="field">
                    <span>Create owner password</span>
                    <div className="row" style={{ gap: 8 }}>
                      <input
                        type={showPassword ? "text" : "password"}
                        value={form.ownerPassword}
                        onChange={(event) => set("ownerPassword", event.target.value)}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => setShowPassword((value) => !value)}
                        aria-label={showPassword ? "Hide owner password" : "Show owner password"}
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                    {errors.ownerPassword ? <small>{errors.ownerPassword}</small> : null}
                  </label>
                  <label className="field">
                    <span>Confirm password</span>
                    <div className="row" style={{ gap: 8 }}>
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={form.ownerConfirmPassword}
                        onChange={(event) => set("ownerConfirmPassword", event.target.value)}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => setShowConfirmPassword((value) => !value)}
                        aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                      >
                        {showConfirmPassword ? "Hide" : "Show"}
                      </button>
                    </div>
                    {errors.ownerConfirmPassword ? <small>{errors.ownerConfirmPassword}</small> : null}
                  </label>
                </div>
                <div className="strength" aria-hidden><i style={{ width: `${strength.score * 25}%` }} /></div>
                <p className="tiny" style={{ margin: 0 }}>
                  Password strength: <strong>{strength.label}</strong>. {strength.hints[0]}
                </p>
              </div>
            ) : null}
          </section>

          <p className="tiny" style={{ margin: 0 }}>
            Verification packet placeholder: business documents can be completed from Workspace Settings once your account is created.
          </p>

          {formError ? (
            <div className="panel stack" style={{ gap: 10, borderColor: "var(--danger)" }}>
              <p className="error" style={{ margin: 0 }}>{formError}</p>
              {signInRequired ? (
                <div className="stack" style={{ gap: 8 }}>
                  <p className="tiny" style={{ margin: 0 }}>
                    Sign in with that email first, then return here to attach the new business to your existing account.
                  </p>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <Link className="btn small" href="/login?next=/register/business">
                      Sign in to existing account
                    </Link>
                    <Link className="btn ghost small" href="/login/business">
                      Business Sign In
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <button className="btn" type="submit" disabled={submitting}>
            {submitting ? "Submitting application…" : "Submit application"}
          </button>
        </form>
      </section>
    </div>
  );
}

function Text({
  name,
  label,
  form,
  set,
  errors,
  type = "text",
  placeholder,
  readOnly,
}: {
  name: string;
  label: string;
  form: Record<string, string>;
  set: (key: string, value: string) => void;
  errors: Record<string, string>;
  type?: string;
  placeholder?: string;
  readOnly?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type={type}
        value={form[name] ?? ""}
        placeholder={placeholder}
        readOnly={readOnly}
        onChange={(event) => set(name, event.target.value)}
      />
      {errors[name] ? <small>{errors[name]}</small> : null}
    </label>
  );
}
