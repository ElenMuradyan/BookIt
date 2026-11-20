"use client";

import { usingMocks, verifyContact, verifyContactRemote } from "@bookit/api-client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAuth } from "@/lib/session";

function VerifyForm() {
  const auth = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [error, setError] = useState("");
  return (
    <main className="page">
      <form
        className="panel stack"
        style={{ maxWidth: 460 }}
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          if (!auth.userId) {
            setError("Sign in before verifying.");
            return;
          }
          if (usingMocks()) {
            const result = verifyContact(auth.userId, code);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.push("/home");
            return;
          }
          const result = await verifyContactRemote(code);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          await auth.refreshSession();
          router.push("/home");
        }}
      >
        <h2 style={{ margin: 0 }}>Verify your email</h2>
        <p className="muted">Enter the 6-digit code from this preview. A real email provider is not connected yet.</p>
        <label className="field">
          <span>Verification code</span>
          <input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button className="btn" type="submit">Confirm</button>
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
