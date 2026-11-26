"use client";

import { saveCampaign, saveCampaignRemote, savePromo, savePromoRemote, useBookItState, usingMocks } from "@bookit/api-client";
import { can } from "@bookit/utils";
import { useState } from "react";
import { Badge, Button, Field } from "@/components/ui";
import { useAuth } from "@/lib/session";

export default function WorkspaceMarketingPage() {
  const auth = useAuth();
  const state = useBookItState();
  const [promoCode, setPromoCode] = useState("SPRING20");
  const [percentOff, setPercentOff] = useState("20");
  const [expiresOn, setExpiresOn] = useState("2026-12-31");
  const [campaign, setCampaign] = useState({
    name: "",
    channel: "email" as const,
    audience: "Returning clients",
    startsOn: "2026-11-25",
    message: "",
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  if (!auth.workspace) return null;
  const bizId = auth.workspace.businessId;
  const canManage = can(auth.workspace.role, "marketing.manage");
  const promos = state.promoCodes.filter((p) => p.businessId === bizId);
  const campaigns = state.campaigns.filter((c) => c.businessId === bizId);
  const sponsored = state.advertisements.filter((a) => a.businessId === bizId);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <h1 style={{ margin: 0 }}>Marketing & Promotions</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Manage promo codes, customer campaigns, and sponsored listings.
        </p>
      </div>

      {notice ? <div className="notice">{notice}</div> : null}
      {error ? <p className="error">{error}</p> : null}

      <div className="grid-2">
        <section className="panel stack">
          <h3 style={{ margin: 0 }}>Promo Codes</h3>
          {promos.map((p) => (
            <div key={p.id} className="select-card row" style={{ justifyContent: "space-between", padding: 12 }}>
              <div>
                <strong>{p.code}</strong>
                <div className="tiny">
                  {p.percentOff}% off · expires {p.expiresOn} · {p.redemptions} redemptions
                </div>
              </div>
              <Badge tone={p.active ? "success" : "neutral"}>{p.active ? "Active" : "Ended"}</Badge>
            </div>
          ))}
          {canManage ? (
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                setError("");
                setNotice("");
                const normalized = promoCode.trim().toUpperCase();
                if (usingMocks()) {
                  const res = savePromo(bizId, normalized, Number(percentOff), expiresOn);
                  if (!res.ok) setError(res.error);
                  else setNotice(`Promo ${normalized} created`);
                  return;
                }
                setBusy(true);
                try {
                  const res = await savePromoRemote(bizId, normalized, Number(percentOff), expiresOn);
                  if (!res.ok) setError(res.error);
                  else setNotice(`Promo ${normalized} created`);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="grid-3">
                <Field label="Code">
                  <input value={promoCode} onChange={(e) => setPromoCode(e.target.value)} />
                </Field>
                <Field label="Discount %">
                  <input type="number" value={percentOff} onChange={(e) => setPercentOff(e.target.value)} />
                </Field>
                <Field label="Expires">
                  <input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} />
                </Field>
              </div>
              <Button type="submit" small disabled={busy}>
                {busy ? "Saving…" : "Create promo code"}
              </Button>
            </form>
          ) : null}
        </section>

        <section className="panel stack">
          <h3 style={{ margin: 0 }}>Campaigns & Sponsored Ads</h3>
          {campaigns.map((c) => (
            <div key={c.id} className="select-card row" style={{ justifyContent: "space-between", padding: 12 }}>
              <div>
                <strong>{c.name}</strong>
                <div className="tiny">
                  {c.channel} · {c.audience} · starts {c.startsOn}
                </div>
              </div>
              <Badge tone="brand">{c.status}</Badge>
            </div>
          ))}
          {sponsored.map((ad) => (
            <div key={ad.id} className="select-card row" style={{ justifyContent: "space-between", padding: 12 }}>
              <div>
                <strong>Sponsored: {ad.title}</strong>
                <div className="tiny">{ad.placement} placement</div>
              </div>
              <Badge tone={ad.status === "active" ? "success" : "neutral"}>{ad.status}</Badge>
            </div>
          ))}
          {canManage ? (
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                setError("");
                setNotice("");
                if (usingMocks()) {
                  const res = saveCampaign(bizId, campaign);
                  if (!res.ok) setError(res.error);
                  else {
                    setNotice(`Campaign "${campaign.name}" scheduled`);
                    setCampaign({ ...campaign, name: "", message: "" });
                  }
                  return;
                }
                setBusy(true);
                try {
                  const res = await saveCampaignRemote(bizId, campaign);
                  if (!res.ok) setError(res.error);
                  else {
                    setNotice(`Campaign "${campaign.name}" scheduled`);
                    setCampaign({ ...campaign, name: "", message: "" });
                  }
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Field label="Campaign name">
                <input value={campaign.name} onChange={(e) => setCampaign({ ...campaign, name: e.target.value })} placeholder="Holiday glow offer" />
              </Field>
              <Field label="Message">
                <input value={campaign.message} onChange={(e) => setCampaign({ ...campaign, message: e.target.value })} placeholder="15% off winter facials" />
              </Field>
              <Button type="submit" small disabled={busy}>
                {busy ? "Scheduling…" : "Schedule campaign"}
              </Button>
            </form>
          ) : null}
        </section>
      </div>
    </div>
  );
}
