"use client";

import { displayUser, setReportStatus, useBookItState } from "@bookit/api-client";
import type { Report } from "@bookit/types";
import { formatDate } from "@bookit/utils";
import { Badge, Button } from "@/components/ui";

const STATUSES: Report["status"][] = ["open", "reviewing", "resolved", "dismissed"];

export default function AdminReportsPage() {
  const state = useBookItState();

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <h1 style={{ margin: 0 }}>Reports & Complaints</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Review complaints concerning users, businesses, orders, and reviews.
        </p>
      </div>

      <div className="stack">
        {state.reports.map((report) => (
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
                  onClick={() => setReportStatus(report.id, status)}
                >
                  {status}
                </Button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
