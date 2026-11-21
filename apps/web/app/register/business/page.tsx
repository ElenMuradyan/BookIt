"use client";

import { submitBusinessApplication, submitBusinessApplicationRemote, useBookItState, usingMocks } from "@bookit/api-client";
import type { BusinessCategory } from "@bookit/types";
import { categoryLabels } from "@bookit/ui";
import { passwordScore } from "@bookit/utils";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/session";

const categories = Object.keys(categoryLabels) as BusinessCategory[];

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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [signInRequired, setSignInRequired] = useState(false);
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

  if (businessId) {
    const businessName = created?.name ?? submittedName ?? "Your business";
    const businessStatus = created?.status ?? "submitted";
    return (
      <main className="page">
        <section className="panel stack" style={{ maxWidth: 640 }}>
          <h2 style={{ margin: 0 }}>{businessName} is {businessStatus.replaceAll("_", " ")}</h2>
          <p className="muted">
            Your business workspace is active so you can set up services, staff schedules, and working hours right away. Public booking goes live once a platform admin approves your verification packet.
          </p>
          <p>Status: <strong>{businessStatus}</strong></p>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {auth.user ? (
              <Link className="btn" href="/workspace">
                Open Business Workspace
              </Link>
            ) : null}
            <Link className="btn ghost" href="/login/business">
              Business Sign In
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <form
        className="panel stack"
        style={{ maxWidth: 760 }}
        onSubmit={async (event) => {
          event.preventDefault();
          if (submitting) return;
          setErrors({});
          setFormError("");
          setSignInRequired(false);
          setSubmitting(true);
          try {
            if (usingMocks()) {
              const result = submitBusinessApplication({ ...form, applicantUserId: auth.userId ?? undefined });
              if (!result.ok) {
                setErrors(result.fieldErrors ?? {});
                setFormError(result.error);
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
            } else if (auth.userId) {
              await auth.refreshSession();
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
        <h2 style={{ margin: 0 }}>Register a business</h2>
        <p className="muted">Applications are reviewed before the business can accept public bookings.</p>
        <div className="grid-2">
          <Text name="businessName" label="Business name" form={form} set={set} errors={errors} />
          <Text name="legalName" label="Legal business name" form={form} set={set} errors={errors} />
          <label className="field">
            <span>Category</span>
            <select value={form.category} onChange={(event) => set("category", event.target.value)}>
              {categories.map((category) => (
                <option key={category} value={category}>{categoryLabels[category]}</option>
              ))}
            </select>
          </label>
          <Text name="country" label="Country" form={form} set={set} errors={errors} />
          <Text name="city" label="City" form={form} set={set} errors={errors} />
          <Text name="phone" label="Business phone" form={form} set={set} errors={errors} />
        </div>
        <Text name="address" label="Address" form={form} set={set} errors={errors} />
        <Text name="email" label="Business email" form={form} set={set} errors={errors} />
        <Text name="website" label="Website (optional)" form={form} set={set} errors={errors} />
        <label className="field">
          <span>Description</span>
          <textarea value={form.description} onChange={(event) => set("description", event.target.value)} />
          {errors.description ? <small>{errors.description}</small> : null}
        </label>
        <h3>Owner &amp; Login Credentials</h3>
        <div className="grid-2">
          <Text name="ownerName" label="Full name" form={form} set={set} errors={errors} />
          <Text name="ownerEmail" label="Owner email" form={form} set={set} errors={errors} />
          <Text name="ownerPhone" label="Phone" form={form} set={set} errors={errors} />
        </div>
        {!auth.user ? (
          <div className="stack">
            <div className="grid-2">
              <Text name="ownerPassword" label="Create owner password" form={form} set={set} errors={errors} type="password" />
              <Text name="ownerConfirmPassword" label="Confirm password" form={form} set={set} errors={errors} type="password" />
            </div>
            <div className="strength" aria-hidden><i style={{ width: `${strength.score * 25}%` }} /></div>
            <p className="tiny" style={{ margin: 0 }}>Password strength: {strength.label}. {strength.hints[0]}</p>
          </div>
        ) : (
          <p className="tiny">This business will be added under your signed-in account ({auth.user.email}).</p>
        )}
        <p className="tiny">License upload is a placeholder until document storage connects in the FastAPI backend. The application still records a verification packet.</p>
        {formError ? (
          <div className="stack" style={{ gap: 8 }}>
            <p className="error" style={{ margin: 0 }}>{formError}</p>
            {signInRequired ? (
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <Link className="btn ghost small" href="/login?next=/register/business">
                  Sign in to existing account
                </Link>
                <Link className="btn ghost small" href="/login/business">
                  Business Sign In
                </Link>
              </div>
            ) : null}
          </div>
        ) : null}
        <button className="btn" type="submit" disabled={submitting}>
          {submitting ? "Submitting application…" : "Submit application"}
        </button>
      </form>
    </main>
  );
}

function Text({
  name,
  label,
  form,
  set,
  errors,
  type = "text",
}: {
  name: string;
  label: string;
  form: Record<string, string>;
  set: (key: string, value: string) => void;
  errors: Record<string, string>;
  type?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={form[name] ?? ""} onChange={(event) => set(name, event.target.value)} />
      {errors[name] ? <small>{errors[name]}</small> : null}
    </label>
  );
}
