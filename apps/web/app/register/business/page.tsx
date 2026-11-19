"use client";

import { submitBusinessApplication, useBookItState } from "@bookit/api-client";
import type { BusinessCategory } from "@bookit/types";
import { categoryLabels } from "@bookit/ui";
import Link from "next/link";
import { useState } from "react";
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
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [businessId, setBusinessId] = useState("");
  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const created = state.businesses.find((business) => business.id === businessId);

  if (created) {
    return (
      <main className="page">
        <section className="panel stack" style={{ maxWidth: 640 }}>
          <h2 style={{ margin: 0 }}>{created.name} is {created.status.replaceAll("_", " ")}</h2>
          <p className="muted">This business stays off public search until a platform admin approves it. After approval it starts a 30-day trial.</p>
          <p>Status: <strong>{created.status}</strong></p>
          <div className="row">
            <Link className="btn" href="/login">Back to sign in</Link>
            {auth.user ? <Link className="btn ghost" href="/workspace">Open workspace</Link> : null}
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
        onSubmit={(event) => {
          event.preventDefault();
          const result = submitBusinessApplication({ ...form, applicantUserId: auth.userId ?? undefined });
          if (!result.ok) {
            setErrors(result.fieldErrors ?? {});
            return;
          }
          if (auth.userId) auth.setWorkspaceId(result.data.businessId);
          setBusinessId(result.data.businessId);
        }}
      >
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
        <Text name="website" label="Website" form={form} set={set} errors={errors} />
        <label className="field">
          <span>Description</span>
          <textarea value={form.description} onChange={(event) => set("description", event.target.value)} />
          {errors.description ? <small>{errors.description}</small> : null}
        </label>
        <h3>Owner</h3>
        <div className="grid-2">
          <Text name="ownerName" label="Full name" form={form} set={set} errors={errors} />
          <Text name="ownerEmail" label="Email" form={form} set={set} errors={errors} />
          <Text name="ownerPhone" label="Phone" form={form} set={set} errors={errors} />
        </div>
        <p className="tiny">License upload is a placeholder until document storage exists. The application still records a verification packet.</p>
        <button className="btn" type="submit">Submit application</button>
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
}: {
  name: string;
  label: string;
  form: Record<string, string>;
  set: (key: string, value: string) => void;
  errors: Record<string, string>;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={form[name] ?? ""} onChange={(event) => set(name, event.target.value)} />
      {errors[name] ? <small>{errors[name]}</small> : null}
    </label>
  );
}
