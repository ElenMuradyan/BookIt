"use client";

import {
  confirmPasswordReset,
  confirmPasswordResetRemote,
  requestPasswordReset,
  requestPasswordResetRemote,
  usingMocks,
} from "@bookit/api-client";
import { passwordScore } from "@bookit/utils";
import Link from "next/link";
import { useState } from "react";

export default function ForgotPage() {
  const [step, setStep] = useState<"request" | "confirm" | "done">("request");
  const [identifier, setIdentifier] = useState("customer@bookit.demo");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const score = passwordScore(password);

  return (
    <main className="page">
      <form
        className="panel stack"
        style={{ maxWidth: 480 }}
        onSubmit={async (event) => {
          event.preventDefault();
          if (submitting) return;
          setError("");
          setSubmitting(true);
          try {
            if (step === "request") {
              if (usingMocks()) {
                const result = requestPasswordReset(identifier);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                setCode(result.data.demoCode ?? "");
                setStep("confirm");
                return;
              }
              const result = await requestPasswordResetRemote(identifier);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setStep("confirm");
              return;
            }
            if (usingMocks()) {
              const result = confirmPasswordReset(identifier, code, password, confirmPassword);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setStep("done");
              return;
            }
            const result = await confirmPasswordResetRemote(identifier, code, password, confirmPassword);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setStep("done");
          } finally {
            setSubmitting(false);
          }
        }}
      >
        <h2 style={{ margin: 0 }}>Reset password</h2>
        {step === "request" ? (
          <label className="field">
            <span>Email or phone</span>
            <input value={identifier} onChange={(event) => setIdentifier(event.target.value)} />
          </label>
        ) : null}
        {step === "confirm" ? (
          <>
            <p className="notice">
              {usingMocks()
                ? `Preview code for ${identifier}: ${code}. Production would send this by email or SMS.`
                : `Enter the 6-digit verification code sent to ${identifier} if an account exists.`}
            </p>
            <label className="field">
              <span>Code</span>
              <input value={code} onChange={(event) => setCode(event.target.value)} />
            </label>
            <label className="field">
              <span>New password</span>
              <div className="row" style={{ gap: 8 }}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide new password" : "Show new password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </label>
            <div className="strength"><i style={{ width: `${score.score * 25}%` }} /></div>
            <label className="field">
              <span>Confirm password</span>
              <div className="row" style={{ gap: 8 }}>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
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
            </label>
          </>
        ) : null}
        {step === "done" ? (
          <p>Password updated. <Link href="/login">Sign in</Link></p>
        ) : (
          <button className="btn" type="submit" disabled={submitting}>
            {submitting
              ? step === "request" ? "Sending…" : "Saving…"
              : step === "request" ? "Send code" : "Save password"}
          </button>
        )}
        {error ? <p className="error">{error}</p> : null}
      </form>
    </main>
  );
}
