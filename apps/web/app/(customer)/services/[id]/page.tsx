"use client";

import {
  displayUser,
  publicBusinessById,
  serviceById,
  toggleFavorite,
  useBookItState,
} from "@bookit/api-client";
import { categoryLabels } from "@bookit/ui";
import { bookingTotals, formatMoney, initials } from "@bookit/utils";
import Link from "next/link";
import { use, useState } from "react";
import { Badge, Button, Empty } from "@/components/ui";
import { useAuth } from "@/lib/session";

export default function ServiceDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const auth = useAuth();
  const state = useBookItState();
  const [notice, setNotice] = useState("");

  const service = serviceById(state, id);
  const business = service ? publicBusinessById(state, service.businessId) : undefined;

  if (!service || !business) {
    return (
      <div className="stack">
        <Empty title="Service unavailable" body="This service may be inactive or belong to a pending business." />
        <div>
          <Link href="/explore?tab=services" className="btn">
            Explore services
          </Link>
        </div>
      </div>
    );
  }

  const eligibleEmployees = state.employees.filter(
    (emp) =>
      emp.businessId === business.id &&
      (service.employeeIds.includes(emp.id) || service.employeeIds.length === 0),
  );
  const totals = bookingTotals(service.price);
  const isFav = auth.userId
    ? state.favorites.some((f) => f.userId === auth.userId && f.targetType === "service" && f.targetId === service.id)
    : false;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <Link href={`/business/${business.id}`} className="tiny">
          ← {business.name}
        </Link>
        <Link href="/explore?tab=services" className="tiny">
          All services
        </Link>
      </div>

      <section className="panel stack" style={{ gap: 14 }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
          <div className="stack" style={{ gap: 6, flex: 1, minWidth: 260 }}>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <Badge tone="brand">{service.category}</Badge>
              <Badge tone={service.requiresApproval ? "warning" : "success"}>
                {service.requiresApproval ? "Approval required" : "Instant confirmation"}
              </Badge>
            </div>
            <h1 style={{ margin: 0, fontSize: 28, letterSpacing: "-0.03em" }}>{service.name}</h1>
            <p className="muted" style={{ margin: 0 }}>
              {service.description}
            </p>
            <div className="tiny row" style={{ flexWrap: "wrap" }}>
              <span>{business.name}</span>
              <span>·</span>
              <span>{categoryLabels[business.category]}</span>
              <span>·</span>
              <span>{business.address}, {business.city}</span>
            </div>
          </div>

          <div className="panel stack" style={{ minWidth: 240, gap: 8 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="muted">Duration</span>
              <strong className="tabular">{service.durationMinutes} min</strong>
            </div>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="muted">Service Price</span>
              <strong className="tabular">{service.price === 0 ? "Free" : formatMoney(totals.subtotal)}</strong>
            </div>
            {service.depositAmount ? (
              <div className="row" style={{ justifyContent: "space-between" }}>
                <span className="muted">Deposit</span>
                <span className="tabular">{formatMoney(service.depositAmount)}</span>
              </div>
            ) : null}
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="muted">Est. Tax (8%)</span>
              <span className="tabular">{formatMoney(totals.tax)}</span>
            </div>
            <div className="row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: 8 }}>
              <strong>Est. Total</strong>
              <strong className="tabular">{formatMoney(totals.total)}</strong>
            </div>
            <Link href={`/book/${business.id}?service=${service.id}`} className="btn">
              Book this service
            </Link>
            <Button
              tone={isFav ? "soft" : "ghost"}
              small
              onClick={() => {
                if (!auth.userId) return;
                toggleFavorite(auth.userId, "service", service.id, "Services");
                setNotice(isFav ? "Removed from favorites" : "Saved service to favorites");
              }}
            >
              {isFav ? "Saved" : "Save service"}
            </Button>
          </div>
        </div>
        {notice ? <p className="tiny" style={{ color: "var(--lavender)", margin: 0 }}>{notice}</p> : null}
      </section>

      <div className="split-detail">
        <section className="panel stack">
          <h2 style={{ margin: 0 }}>Available Specialists ({eligibleEmployees.length})</h2>
          {eligibleEmployees.length === 0 ? (
            <p className="muted">Any available team member at {business.name} can perform this service.</p>
          ) : (
            <div className="grid-2">
              {eligibleEmployees.map((emp) => {
                const person = state.users.find((u) => u.id === emp.userId);
                const name = displayUser(state, emp.userId);
                return (
                  <div key={emp.id} className="select-card stack" style={{ gap: 8 }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <div className="person">
                        {person?.avatarUrl ? (
                          <img className="avatar-img" src={person.avatarUrl} alt={name} referrerPolicy="no-referrer" />
                        ) : (
                          <span className="avatar">{initials(name)}</span>
                        )}
                        <div>
                          <strong>{name}</strong>
                          <div className="tiny">{emp.title}</div>
                        </div>
                      </div>
                      <span className="stars">★ {emp.rating.toFixed(1)}</span>
                    </div>
                    <p className="tiny" style={{ margin: 0 }}>{emp.bio}</p>
                    <div>
                      <Link
                        href={`/book/${business.id}?service=${service.id}&employee=${emp.id}`}
                        className="btn soft small"
                      >
                        Book with {person?.firstName ?? "specialist"}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <aside className="panel stack">
          <h3 style={{ margin: 0 }}>Policies &amp; Venue</h3>
          <p className="tiny" style={{ margin: 0 }}>
            <strong>Cancellation policy:</strong> {service.cancellationPolicy || business.cancellationPolicy}
          </p>
          <p className="tiny" style={{ margin: 0 }}>
            <strong>Venue:</strong> {business.name} · ★ {business.rating.toFixed(1)} ({business.reviewCount} reviews)
          </p>
          <p className="tiny" style={{ margin: 0 }}>
            <strong>Address:</strong> {business.address}, {business.city}
          </p>
          <Link href={`/business/${business.id}`} className="btn ghost small">
            View full business profile
          </Link>
        </aside>
      </div>
    </div>
  );
}
