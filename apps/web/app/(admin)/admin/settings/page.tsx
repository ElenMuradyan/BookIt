"use client";

import { resetDemoState, usingMocks } from "@bookit/api-client";
import { useState } from "react";
import { Button } from "@/components/ui";

export default function AdminSettingsPage() {
  const [notice, setNotice] = useState("");
  const mockMode = usingMocks();

  return (
    <div className="stack" style={{ gap: 18, maxWidth: 720 }}>
      <div>
        <h1 style={{ margin: 0 }}>Platform Settings</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          {mockMode
            ? "Preview mode active: platform admin actions run against local seed state."
            : "Platform admin access and RBAC checks are enforced server-side by the BookIt FastAPI service."}
        </p>
      </div>

      {notice ? <div className="notice">{notice}</div> : null}

      <section className="panel stack">
        <h3 style={{ margin: 0 }}>Trial & Onboarding Rules</h3>
        <p className="muted" style={{ margin: 0 }}>
          Approved businesses automatically receive a 30-day Professional trial and become visible in public search.
        </p>
      </section>

      {mockMode ? (
        <section className="panel stack">
          <h3 style={{ margin: 0 }}>Demo Environment</h3>
          <p className="muted" style={{ margin: 0 }}>
            Restore all seeded users, businesses, applications, bookings, products, and orders.
          </p>
          <div>
            <Button
              tone="danger"
              onClick={() => {
                resetDemoState();
                setNotice("In-memory demo store restored to initial seed state.");
              }}
            >
              Reset demo state
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
