"use client";

import { setAdvertisementStatus, setAdvertisementStatusRemote, useBookItState, usingMocks } from "@bookit/api-client";
import type { Advertisement } from "@bookit/types";
import { formatDate, formatMoney } from "@bookit/utils";
import { useState } from "react";
import { Badge, Button } from "@/components/ui";

export default function AdminAdvertisementsPage() {
  const state = useBookItState();
  const [busyId, setBusyId] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [notice, setNotice] = useState("");

  async function handleStatus(adId: string, status: Advertisement["status"]) {
    setErrorMsg("");
    setNotice("");
    if (usingMocks()) {
      const res = setAdvertisementStatus(adId, status);
      if (!res.ok) setErrorMsg(res.error);
      else setNotice(`Advertisement updated to ${status}.`);
      return;
    }
    setBusyId(adId);
    try {
      const res = await setAdvertisementStatusRemote(adId, status);
      if (!res.ok) setErrorMsg(res.error);
      else setNotice(`Advertisement updated to ${status}.`);
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <h1 style={{ margin: 0 }}>Advertisements</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Moderate sponsored placements across Home, Explore, and Marketplace.
        </p>
      </div>

      {notice ? <div className="notice">{notice}</div> : null}
      {errorMsg ? <p className="error" style={{ margin: 0 }}>{errorMsg}</p> : null}

      <div className="stack">
        {state.advertisements.map((ad) => {
          const biz = state.businesses.find((b) => b.id === ad.businessId);
          const isBusy = busyId === ad.id;
          return (
            <article key={ad.id} className="panel row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div className="row">
                  <strong>{ad.title}</strong>
                  <Badge tone="brand">{ad.placement}</Badge>
                  <Badge tone={ad.status === "active" ? "success" : "neutral"}>{ad.status}</Badge>
                </div>
                <div className="tiny">
                  {biz?.name} · {ad.body} · Budget {formatMoney(ad.budget)} · {formatDate(ad.startsAt)} – {formatDate(ad.endsAt)}
                </div>
              </div>
              <div className="row">
                <Button
                  tone={ad.status === "active" ? "ghost" : "soft"}
                  small
                  disabled={isBusy}
                  onClick={() => void handleStatus(ad.id, ad.status === "active" ? "paused" : "active")}
                >
                  {isBusy ? "Saving…" : ad.status === "active" ? "Pause" : "Activate"}
                </Button>
                <Button tone="danger" small disabled={isBusy} onClick={() => void handleStatus(ad.id, "ended")}>
                  End
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
