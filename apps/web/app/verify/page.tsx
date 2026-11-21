"use client";

import {
  resendVerificationRemote,
  usingMocks,
  verifyContact,
  verifyContactRemote,
  verifyEmailTokenRemote,
} from "@bookit/api-client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/session";

function VerifyForm() {
  const auth = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const tokenParam = params.get("token")?.trim() ?? "";
  const mockMode = usingMocks();

  const [email, setEmail] = useState(params.get("email") ?? "");
  const [code, setCode] = useState(params.get("code") ?? "");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [verifyingToken, setVerifyingToken] = useState(Boolean(tokenParam));
  const attemptedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!email && auth.user?.email) {
      setEmail(auth.user.email);
    }
  }, [auth.user?.email, email]);

  useEffect(() => {
    if (!tokenParam || mockMode) {
      setVerifyingToken(false);
      return;
    }
    if (attemptedTokenRef.current === tokenParam) return;
    attemptedTokenRef.current = tokenParam;

    let active = true;
    setVerifyingToken(true);
    setError("");
    setNotice("");

    void (async () => {
      const result = await verifyEmailTokenRemote(tokenParam);
      if (!active) return;
      if (!result.ok) {
        setError(result.error);
        setVerifyingToken(false);
        return;
      }
      if (auth.userId) {
        await auth.refreshSession();
      }
      if (!active) return;
      setVerified(true);
      setNotice("Your email address is now verified.");
      setVerifyingToken(false);
    })();

    return () => {
      active = false;
    };
  }, [auth, mockMode, tokenParam]);

  async function handleOtpSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (mockMode) {
      if (!auth.userId) {
        setError("Sign in before verifying in offline preview mode.");
        return;
      }
      const result = verifyContact(auth.userId, code);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/home");
      return;
    }

    const effectiveIdentifier = email.trim() || auth.user?.email || "";
    if (!auth.userId && !effectiveIdentifier) {
      setError("Enter the email address used for your account.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await verifyContactRemote(
        code,
        auth.userId ? undefined : effectiveIdentifier,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (auth.userId) {
        await auth.refreshSession();
        router.push("/home");
        return;
      }
      setVerified(true);
      setNotice("Your email address is verified. You can sign in now.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    setError("");
    setNotice("");
    if (mockMode) {
      setNotice("Offline preview mode uses demo verification code 482913.");
      return;
    }
    const effectiveIdentifier = email.trim() || auth.user?.email || "";
    if (!auth.userId && !effectiveIdentifier) {
      setError("Enter your account email before requesting a new verification message.");
      return;
    }
    setResending(true);
    try {
      const result = await resendVerificationRemote(
        auth.userId && !email.trim() ? undefined : effectiveIdentifier,
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(result.data.message);
    } finally {
      setResending(false);
    }
  }

  if (verifyingToken) {
    return (
      <main className="page">
        <div className="panel stack" style={{ maxWidth: 460 }}>
          <h2 style={{ margin: 0 }}>Verifying your email…</h2>
          <p className="muted">Validating your single-use verification link.</p>
        </div>
      </main>
    );
  }

  if (verified) {
    return (
      <main className="page">
        <div className="panel stack" style={{ maxWidth: 460 }}>
          <h2 style={{ margin: 0 }}>Email verified</h2>
          <p className="muted">{notice || "Your BookIt email address has been confirmed."}</p>
          <Link className="btn" href={auth.userId ? "/home" : "/login"}>
            {auth.userId ? "Continue to BookIt" : "Sign in to continue"}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <form className="panel stack" style={{ maxWidth: 460 }} onSubmit={handleOtpSubmit}>
        <h2 style={{ margin: 0 }}>Verify your email</h2>
        <p className="muted">
          {mockMode
            ? "Offline preview mode: enter verification code 482913."
            : "Enter the 6-digit code sent to your email, or open the verification link directly from your inbox."}
        </p>
        {!mockMode && (!auth.userId || email) ? (
          <label className="field">
            <span>Account email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>
        ) : null}
        <label className="field">
          <span>6-digit verification code</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            maxLength={6}
            placeholder="123456"
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        {notice ? <p className="muted">{notice}</p> : null}
        <button className="btn" type="submit" disabled={submitting}>
          {submitting ? "Verifying…" : "Confirm verification code"}
        </button>
        {!mockMode ? (
          <button
            className="btn ghost"
            type="button"
            disabled={resending}
            onClick={() => void handleResend()}
          >
            {resending ? "Sending…" : "Resend verification email"}
          </button>
        ) : null}
      </form>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="app-boot">Loading verification…</div>}>
      <VerifyForm />
    </Suspense>
  );
}
