"use client";

import { registerCustomer } from "@bookit/api-client";
import { passwordScore } from "@bookit/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Mark } from "@/components/ui";
import { useAuth } from "@/lib/session";

export default function RegisterPage() {
  const auth = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    location: "",
    language: "English",
    dateOfBirth: "",
    gender: "",
    personalizationConsent: false,
    acceptTerms: false,
  });
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const score = passwordScore(form.password);
  const set = (key: string, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const result = registerCustomer({
      ...form,
      gender: form.gender || undefined,
      personalizationConsent: form.personalizationConsent,
      interests: [],
      acceptTerms: form.acceptTerms ? true : (undefined as unknown as true),
    });
    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      setMessage(result.error);
      return;
    }
    auth.setToken(result.data.token, true);
    router.push(`/verify?code=${result.data.code}`);
  }

  return (
    <div className="auth-layout">
      <section className="auth-art">
        <Link href="/" className="brand"><Mark /> BookIt</Link>
        <h1>Create your customer account.</h1>
        <p className="lede">
          We only require basic contact info to manage your bookings. Optional details are clearly explained and never used for personalization without your consent.
        </p>
      </section>
      <section className="auth-panel">
        <form className="stack auth-card" onSubmit={submit}>
          <div className="tabs" style={{ marginBottom: 4 }}>
            <span className="tab on">Customer Sign Up</span>
            <Link href="/register/business" className="tab">
              Register a Business
            </Link>
          </div>
          <h2 style={{ margin: 0 }}>Create customer account</h2>
          <div className="grid-2">
            <Field name="firstName" label="First name" form={form} set={set} errors={errors} />
            <Field name="lastName" label="Last name" form={form} set={set} errors={errors} />
          </div>
          <Field name="username" label="Username" form={form} set={set} errors={errors} />
          <Field name="email" label="Email" form={form} set={set} errors={errors} type="email" />
          <Field name="phone" label="Phone" form={form} set={set} errors={errors} />
          <Field name="password" label="Password" form={form} set={set} errors={errors} type={show ? "text" : "password"} />
          <div className="strength" aria-hidden><i style={{ width: `${score.score * 25}%` }} /></div>
          <p className="tiny">{score.label}. {score.hints[0]}</p>
          <Field name="confirmPassword" label="Confirm password" form={form} set={set} errors={errors} type={show ? "text" : "password"} />
          <button type="button" className="btn ghost small" onClick={() => setShow((value) => !value)}>{show ? "Hide passwords" : "Show passwords"}</button>

          <div className="panel stack" style={{ gap: 10, padding: 12 }}>
            <strong style={{ fontSize: 13 }}>Optional details (for eligibility &amp; tailored results)</strong>
            <p className="tiny" style={{ margin: 0 }}>
              Location helps show nearby venues. Date of birth is only used to confirm minimum-age eligibility for spa/clinic treatments. Gender is completely optional and helps providers prepare for personal care appointments when relevant.
            </p>
            <div className="grid-2">
              <Field name="location" label="City / Location (optional)" form={form} set={set} errors={errors} />
              <Field name="language" label="Preferred language" form={form} set={set} errors={errors} />
              <Field name="dateOfBirth" label="Date of birth (optional)" form={form} set={set} errors={errors} type="date" />
              <label className="field">
                <span>Gender (optional)</span>
                <select value={form.gender} onChange={(event) => set("gender", event.target.value)}>
                  <option value="">Prefer not to say</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Self-describe">Other / Self-describe</option>
                </select>
              </label>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={form.personalizationConsent}
                onChange={(event) => set("personalizationConsent", event.target.checked)}
              />
              <span>I consent to BookIt using my optional profile details and saved interests for personalized service recommendations (you can withdraw anytime in Settings).</span>
            </label>
          </div>

          <label className="check">
            <input type="checkbox" checked={form.acceptTerms} onChange={(event) => set("acceptTerms", event.target.checked)} />
            <span>I agree to the <Link href="/legal/terms">Terms</Link> and <Link href="/legal/privacy">Privacy notice</Link>.</span>
          </label>
          {errors.acceptTerms ? <small className="error">{errors.acceptTerms}</small> : null}
          {message ? <p className="error">{message}</p> : null}
          <button className="btn" type="submit">Create customer account</button>
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <Link href="/login">Customer sign in</Link>
            <Link href="/login/business">Business sign in</Link>
          </div>
        </form>
      </section>
    </div>
  );
}

function Field({
  name,
  label,
  form,
  set,
  errors,
  type = "text",
}: {
  name: string;
  label: string;
  form: Record<string, string | boolean>;
  set: (key: string, value: string) => void;
  errors: Record<string, string>;
  type?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={String(form[name] ?? "")} onChange={(event) => set(name, event.target.value)} />
      {errors[name] ? <small>{errors[name]}</small> : null}
    </label>
  );
}
