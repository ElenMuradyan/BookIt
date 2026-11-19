"use client";

import { displayUser, reviewApplication, useBookItState } from "@bookit/api-client";
import { categoryLabels } from "@bookit/ui";
import { formatDate } from "@bookit/utils";
import { useState } from "react";
import { Badge, Button, Field } from "@/components/ui";

export default function AdminApplicationsPage() {
  const state = useBookItState();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <h1 style={{ margin: 0 }}>Business Applications</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Businesses appear on public search and start their 30-day free trial only after approval.
        </p>
      </div>

      {notice ? <div className="notice">{notice}</div> : null}

      <div className="stack">
        {state.applications.map((app) => {
          const biz = state.businesses.find((b) => b.id === app.businessId);
          const tone =
            app.status === "approved"
              ? "success"
              : app.status === "rejected"
                ? "danger"
                : "warning";
          return (
            <article key={app.id} className="panel stack" style={{ gap: 12 }}>
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                <div>
                  <div className="row">
                    <h2 style={{ margin: 0 }}>{biz?.name ?? app.businessId}</h2>
                    <Badge tone={tone}>{app.status.replaceAll("_", " ")}</Badge>
                  </div>
                  <div className="tiny">
                    {biz ? `${categoryLabels[biz.category]} · ${biz.address}, ${biz.city}` : ""} · Applicant:{" "}
                    {displayUser(state, app.applicantUserId)} · Submitted{" "}
                    {app.submittedAt ? formatDate(app.submittedAt) : "Draft"}
                  </div>
                </div>
                <div className="tiny">
                  Documents: {app.documents.map((d) => `${d.name} (${d.state})`).join(", ")}
                </div>
              </div>

              {app.reviewerNote ? <div className="tiny">Note: {app.reviewerNote}</div> : null}

              <div className="row" style={{ flexWrap: "wrap", alignItems: "end" }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <Field label="Reviewer note">
                    <input
                      value={notes[app.id] ?? ""}
                      onChange={(e) => setNotes({ ...notes, [app.id]: e.target.value })}
                      placeholder="Optional note for approval, rejection, or info request"
                    />
                  </Field>
                </div>
                <Button
                  small
                  onClick={() => {
                    reviewApplication(app.id, "approve", notes[app.id] ?? "");
                    setNotice(`${biz?.name ?? "Business"} approved and 30-day trial started.`);
                  }}
                >
                  Approve
                </Button>
                <Button
                  tone="soft"
                  small
                  onClick={() => {
                    reviewApplication(app.id, "request_info", notes[app.id] ?? "");
                    setNotice(`Requested additional info from ${biz?.name ?? "applicant"}.`);
                  }}
                >
                  Request info
                </Button>
                <Button
                  tone="danger"
                  small
                  onClick={() => {
                    reviewApplication(app.id, "reject", notes[app.id] ?? "");
                    setNotice(`${biz?.name ?? "Business"} rejected.`);
                  }}
                >
                  Reject
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
