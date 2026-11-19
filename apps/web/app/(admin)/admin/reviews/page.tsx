"use client";

import { displayUser, moderateReview, useBookItState } from "@bookit/api-client";
import { formatDate } from "@bookit/utils";
import { Badge, Button } from "@/components/ui";

export default function AdminReviewsPage() {
  const state = useBookItState();

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <h1 style={{ margin: 0 }}>Reviews Moderation</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Publish or hide reported customer reviews.
        </p>
      </div>

      <div className="stack">
        {state.reviews.map((review) => {
          const biz = state.businesses.find((b) => b.id === review.businessId);
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
                <Button tone="soft" small onClick={() => moderateReview(review.id, "published")}>
                  Publish
                </Button>
                <Button tone="danger" small onClick={() => moderateReview(review.id, "hidden")}>
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
