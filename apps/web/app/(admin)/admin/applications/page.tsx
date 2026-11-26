"use client";

import { displayUser, reviewApplication, reviewApplicationRemote, useBookItState, usingMocks } from "@bookit/api-client";
import { categoryLabels } from "@bookit/ui";
import { formatDate } from "@bookit/utils";
import { useState } from "react";
import { Badge, Button, Field } from "@/components/ui";

export default function AdminApplicationsPage() {
  const state = useBookItState();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [busyId, setBusyId] = useState("");

  async function handleReview(appId: string, action: "approve" | "request_info" | "reject", bizName?: string) {
    setErrorMsg("");
    setNotice("");
    const note = notes[appId] ?? "";
    const successMsg =
      action === "approve"
        ? `${bizName ?? "Business"} approved and 30-day trial started.`
        : action === "request_info"
          ? `Requested additional info from ${bizName ?? "applicant"}.`
          : `${bizName ?? "Business"} rejected.`;

    if (usingMocks()) {
      const res = reviewApplication(appId, action, note);
      if (!res.ok) setErrorMsg(res.error);
      else setNotice(successMsg);
      return;
    }

    setBusyId(appId);
    try {
      const res = await reviewApplicationRemote(appId, action, note);
      if (!res.ok) setErrorMsg(res.error);
      else setNotice(successMsg);
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <h1 style={{ margin: 0 }}>Business Applications</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Businesses appear on public search and start their 30-day free trial only after approval.
        </p>
      </div>

      {notice ? <div className="notice">{notice}</div> : null}
      {errorMsg ? <p className="error" style={{ margin: 0 }}>{errorMsg}</p> : null}

      <div className="stack">
        {state.applications.map((app) => {
          const biz = state.businesses.find((b) => b.id === app.businessId);
          const tone =
            app.status === "approved"
              ? "success"
              : app.status === "rejected"
                ? "danger"
                : "warning";
          const isBusy = busyId === app.id;
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
                <Button small disabled={isBusy} onClick={() => void handleReview(app.id, "approve", biz?.name)}>
                  {isBusy ? "Saving…" : "Approve"}
                </Button>
                <Button tone="soft" small disabled={isBusy} onClick={() => void handleReview(app.id, "request_info", biz?.name)}>
                  Request info
                </Button>
                <Button tone="danger" small disabled={isBusy} onClick={() => void handleReview(app.id, "reject", biz?.name)}>
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
