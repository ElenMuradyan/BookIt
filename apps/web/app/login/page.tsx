"use client";

import { demoPasswordHint, login } from "@bookit/api-client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Mark } from "@/components/ui";
import { useAuth } from "@/lib/session";

const demos = [
  ["customer@bookit.demo", "Customer"],
  ["business@bookit.demo", "Business owner"],
  ["employee@bookit.demo", "Employee"],
  ["admin@bookit.demo", "Platform admin"],
];

function LoginForm() {
  const auth = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/home";
  const [identifier, setIdentifier] = useState("customer@bookit.demo");
  const [password, setPassword] = useState(demoPasswordHint());
  const [remember, setRemember] = useState(true);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const result = login({ identifier, password, remember });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    auth.setToken(result.data.token, remember);
    router.push(identifier.startsWith("admin@") && next === "/home" ? "/admin" : next);
  }

  return (
    <div className="auth-layout">
      <section className="auth-art">
        <Link href="/" className="brand">
          <Mark /> BookIt
        </Link>
        <div>
          <h1 style={{ fontSize: 42, letterSpacing: "-0.04em" }}>One account. Personal bookings and every workspace you belong to.</h1>
          <p className="lede">Demo accounts use a shared preview password. It is not stored in the browser.</p>
        </div>
      </section>
      <section className="auth-panel">
        <form className="stack auth-card" onSubmit={submit}>
          <h2 style={{ margin: 0 }}>Log in</h2>
          <label className="field">
            <span>Email or username</span>
            <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} autoComplete="username" />
          </label>
          <label className="field">
            <span>Password</span>
            <input type={show ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" />
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
          <button className="btn" type="submit">Sign in</button>
          <button type="button" className="btn ghost" onClick={() => setError("Google sign-in connects when the BookIt API is available. Use a demo account for this preview.")}>
            Continue with Google
          </button>
          <button type="button" className="btn ghost" onClick={() => setError("Apple sign-in connects when the BookIt API is available. Use a demo account for this preview.")}>
            Continue with Apple
          </button>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <Link href="/forgot">Forgot password</Link>
            <Link href="/register">Create account</Link>
          </div>
          <div className="chips">
            {demos.map(([email, label]) => (
              <button
                key={email}
                type="button"
                className="tab"
                onClick={() => {
                  setIdentifier(email);
                  setPassword(demoPasswordHint());
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="tiny">Preview password: {demoPasswordHint()}. Passwords stay in the mock service, not local storage.</p>
        </form>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="app-boot">Loading sign in…</div>}>
      <LoginForm />
    </Suspense>
  );
}
