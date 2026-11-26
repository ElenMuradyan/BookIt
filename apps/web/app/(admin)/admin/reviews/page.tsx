"use client";

import { displayUser, moderateReview, moderateReviewRemote, useBookItState, usingMocks } from "@bookit/api-client";
import type { Review } from "@bookit/types";
import { formatDate } from "@bookit/utils";
import { useState } from "react";
import { Badge, Button } from "@/components/ui";

export default function AdminReviewsPage() {
  const state = useBookItState();
  const [busyId, setBusyId] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [notice, setNotice] = useState("");

  async function handleModerate(reviewId: string, status: Review["status"]) {
    setErrorMsg("");
    setNotice("");
    if (usingMocks()) {
      const res = moderateReview(reviewId, status);
      if (!res.ok) setErrorMsg(res.error);
      else setNotice(`Review ${status}.`);
      return;
    }
    setBusyId(reviewId);
    try {
      const res = await moderateReviewRemote(reviewId, status);
      if (!res.ok) setErrorMsg(res.error);
      else setNotice(`Review ${status}.`);
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <h1 style={{ margin: 0 }}>Reviews Moderation</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Publish or hide reported customer reviews.
        </p>
      </div>

      {notice ? <div className="notice">{notice}</div> : null}
      {errorMsg ? <p className="error" style={{ margin: 0 }}>{errorMsg}</p> : null}

      <div className="stack">
        {state.reviews.map((review) => {
          const biz = state.businesses.find((b) => b.id === review.businessId);
          const isBusy = busyId === review.id;
          return (
            <article key={review.id} className="panel row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
              <div className="stack" style={{ gap: 4 }}>
                <div className="row">
                  <span className="stars">{"★".repeat(review.rating)}</span>
                  <strong>{review.title}</strong>
                  <Badge tone={review.status === "published" ? "success" : review.status === "reported" ? "warning" : "danger"}>
                    {review.status}
                  </Badge>
                </div>
                <span className="muted">{review.body}</span>
                <span className="tiny">
                  {biz?.name} · by {displayUser(state, review.authorId)} · {formatDate(review.createdAt)}
                </span>
              </div>
              <div className="row">
                <Button tone="soft" small disabled={isBusy} onClick={() => void handleModerate(review.id, "published")}>
                  {isBusy ? "Saving…" : "Publish"}
                </Button>
                <Button tone="danger" small disabled={isBusy} onClick={() => void handleModerate(review.id, "hidden")}>
                  Hide
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
