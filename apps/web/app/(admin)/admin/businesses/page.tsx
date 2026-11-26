"use client";

import { displayUser, setBusinessStatus, setBusinessStatusRemote, useBookItState, usingMocks } from "@bookit/api-client";
import type { BusinessStatus } from "@bookit/types";
import { categoryLabels } from "@bookit/ui";
import { useState } from "react";
import { Badge, Button } from "@/components/ui";

export default function AdminBusinessesPage() {
  const state = useBookItState();
  const [filter, setFilter] = useState<"all" | BusinessStatus>("all");
  const [busyId, setBusyId] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [notice, setNotice] = useState("");

  const rows = state.businesses.filter((b) => filter === "all" || b.status === filter);

  async function handleStatus(bizId: string, bizName: string, nextStatus: BusinessStatus) {
    setErrorMsg("");
    setNotice("");
    if (usingMocks()) {
      const res = setBusinessStatus(bizId, nextStatus);
      if (!res.ok) setErrorMsg(res.error);
      else setNotice(`${bizName} updated to ${nextStatus.replaceAll("_", " ")}.`);
      return;
    }
    setBusyId(bizId);
    try {
      const res = await setBusinessStatusRemote(bizId, nextStatus);
      if (!res.ok) setErrorMsg(res.error);
      else setNotice(`${bizName} updated to ${nextStatus.replaceAll("_", " ")}.`);
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <h1 style={{ margin: 0 }}>Businesses</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Manage approved, pending, rejected, and suspended businesses.
        </p>
      </div>

      <div className="tabs">
        {(["all", "approved", "under_review", "submitted", "rejected", "suspended"] as const).map((s) => (
          <button key={s} type="button" className={`tab ${filter === s ? "on" : ""}`} onClick={() => setFilter(s)}>
            {s.replaceAll("_", " ")}
          </button>
        ))}
      </div>

      {notice ? <div className="notice">{notice}</div> : null}
      {errorMsg ? <p className="error" style={{ margin: 0 }}>{errorMsg}</p> : null}

      <div className="panel" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Business</th>
              <th>Category</th>
              <th>Owner</th>
              <th>City</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((biz) => {
              const isBusy = busyId === biz.id;
              return (
                <tr key={biz.id}>
                  <td>
                    <strong>{biz.name}</strong>
                    <div className="tiny">{biz.legalName}</div>
                  </td>
                  <td className="tiny">{categoryLabels[biz.category]}</td>
                  <td className="tiny">{displayUser(state, biz.ownerUserId)}</td>
                  <td className="tiny">{biz.city}</td>
                  <td>
                    <Badge tone={biz.status === "approved" ? "success" : biz.status === "suspended" || biz.status === "rejected" ? "danger" : "warning"}>
                      {biz.status.replaceAll("_", " ")}
                    </Badge>
                  </td>
                  <td>
                    <div className="row">
                      {biz.status !== "approved" ? (
                        <Button tone="soft" small disabled={isBusy} onClick={() => void handleStatus(biz.id, biz.name, "approved")}>
                          {isBusy ? "Saving…" : "Approve"}
                        </Button>
                      ) : null}
                      {biz.status !== "suspended" ? (
                        <Button tone="danger" small disabled={isBusy} onClick={() => void handleStatus(biz.id, biz.name, "suspended")}>
                          Suspend
                        </Button>
                      ) : (
                        <Button tone="ghost" small disabled={isBusy} onClick={() => void handleStatus(biz.id, biz.name, "approved")}>
                          Reinstate
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
