"use client";

import { displayUser, setReportStatus, setReportStatusRemote, useBookItState, usingMocks } from "@bookit/api-client";
import type { Report } from "@bookit/types";
import { formatDate } from "@bookit/utils";
import { useState } from "react";
import { Badge, Button } from "@/components/ui";

const STATUSES: Report["status"][] = ["open", "reviewing", "resolved", "dismissed"];

export default function AdminReportsPage() {
  const state = useBookItState();
  const [busyId, setBusyId] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [notice, setNotice] = useState("");

  async function handleStatus(reportId: string, status: Report["status"]) {
    setErrorMsg("");
    setNotice("");
    if (usingMocks()) {
      const res = setReportStatus(reportId, status);
      if (!res.ok) setErrorMsg(res.error);
      else setNotice(`Report marked ${status}.`);
      return;
    }
    setBusyId(reportId);
    try {
      const res = await setReportStatusRemote(reportId, status);
      if (!res.ok) setErrorMsg(res.error);
      else setNotice(`Report marked ${status}.`);
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <h1 style={{ margin: 0 }}>Reports & Complaints</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Review complaints concerning users, businesses, orders, and reviews.
        </p>
      </div>

      {notice ? <div className="notice">{notice}</div> : null}
      {errorMsg ? <p className="error" style={{ margin: 0 }}>{errorMsg}</p> : null}

      <div className="stack">
        {state.reports.map((report) => {
          const isBusy = busyId === report.id;
          return (
            <article key={report.id} className="panel stack" style={{ gap: 10 }}>
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                <div className="row">
                  <Badge tone="brand">{report.targetType}</Badge>
                  <strong>{report.reason}</strong>
                  <Badge tone={report.status === "resolved" ? "success" : report.status === "open" ? "danger" : "warning"}>
                    {report.status}
                  </Badge>
                </div>
                <span className="tiny">
                  Reported by {displayUser(state, report.reporterId)} · {formatDate(report.createdAt)}
                </span>
              </div>
              <p className="muted" style={{ margin: 0 }}>
                {report.details}
              </p>
              <div className="row" style={{ flexWrap: "wrap" }}>
                {STATUSES.map((status) => (
                  <Button
                    key={status}
                    tone={report.status === status ? "soft" : "ghost"}
                    small
                    disabled={isBusy}
                    onClick={() => void handleStatus(report.id, status)}
                  >
                    {status}
                  </Button>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
