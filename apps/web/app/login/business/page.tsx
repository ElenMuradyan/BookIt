"use client";

import { demoPasswordHint, loginBusiness } from "@bookit/api-client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Mark } from "@/components/ui";
import { useAuth } from "@/lib/session";

const BUSINESS_DEMOS = [
  ["business@bookit.demo", "Business Owner"],
  ["employee@bookit.demo", "Staff Member"],
] as const;

export default function BusinessLoginPage() {
  const auth = useAuth();
  const router = useRouter();
  const [identifier, setIdentifier] = useState("business@bookit.demo");
  const [password, setPassword] = useState(demoPasswordHint());
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const result = loginBusiness({ identifier, password, remember });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    auth.setToken(result.data.token, remember);
    auth.setWorkspaceId(result.data.businessId);
    router.push("/workspace");
  }

  return (
    <div className="auth-layout">
      <section className="auth-art">
        <Link href="/" className="brand">
          <Mark /> BookIt Business
        </Link>
        <div>
          <h1 style={{ fontSize: 40, letterSpacing: "-0.04em" }}>
            Run your calendar, services, team, and client bookings in one workspace.
          </h1>
          <p className="lede">
            Sign in with your business owner or staff credentials to manage availability, pricing, and upcoming appointments.
          </p>
        </div>
      </section>
      <section className="auth-panel">
        <form className="stack auth-card" onSubmit={submit}>
          <div className="tabs" style={{ marginBottom: 4 }}>
            <Link href="/login" className="tab">
              Customer Sign In
            </Link>
            <span className="tab on">Business Sign In</span>
          </div>
          <h2 style={{ margin: 0 }}>Business workspace login</h2>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Dedicated sign-in for business owners, managers, and staff members.
          </p>
          <label className="field">
            <span>Business or owner email / username</span>
            <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              type={show ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <label className="check">
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> Remember me
            </label>
            <button type="button" className="btn ghost small" onClick={() => setShow((value) => !value)}>
              {show ? "Hide" : "Show"}
            </button>
          </div>
          {error ? <p className="error">{error}</p> : null}
          <button className="btn" type="submit">
            Sign in to Workspace
          </button>
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <Link href="/forgot">Forgot password</Link>
            <Link href="/register/business">Register a business</Link>
          </div>
          <div className="chips">
            {BUSINESS_DEMOS.map(([email, label]) => (
              <button
                key={email}
                type="button"
                className="tab"
                onClick={() => {
                  setIdentifier(email);
                  setPassword(demoPasswordHint());
                  setError("");
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="tiny">
            Preview password: {demoPasswordHint()}. Credentials stay in the client/server service layer, never local storage.
          </p>
        </form>
      </section>
    </div>
  );
}
