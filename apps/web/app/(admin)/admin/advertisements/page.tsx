"use client";

import { setAdvertisementStatus, useBookItState } from "@bookit/api-client";
import { formatDate, formatMoney } from "@bookit/utils";
import { Badge, Button } from "@/components/ui";

export default function AdminAdvertisementsPage() {
  const state = useBookItState();

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <h1 style={{ margin: 0 }}>Advertisements</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Moderate sponsored placements across Home, Explore, and Marketplace.
        </p>
      </div>

      <div className="stack">
        {state.advertisements.map((ad) => {
          const biz = state.businesses.find((b) => b.id === ad.businessId);
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
                  onClick={() => setAdvertisementStatus(ad.id, ad.status === "active" ? "paused" : "active")}
                >
                  {ad.status === "active" ? "Pause" : "Activate"}
                </Button>
                <Button tone="danger" small onClick={() => setAdvertisementStatus(ad.id, "ended")}>
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
