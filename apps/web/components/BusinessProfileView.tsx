"use client";

import {
  addReview,
  addReviewRemote,
  addToCart,
  bookingConfigsForBusiness,
  displayUser,
  enabledModelsForBusiness,
  offeringsForBusiness,
  publicBusinessById,
  resourcesForBusiness,
  servicesForBusiness,
  toggleFavorite,
  useBookItState,
  usingMocks,
} from "@bookit/api-client";
import { categoryLabels, primaryCtaLabelForBusiness } from "@bookit/ui";
import { formatDate, formatDateTime, formatMoney, initials } from "@bookit/utils";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Empty, Field, Modal } from "@/components/ui";
import { useAuth } from "@/lib/session";

const DAYS = [
  ["mon", "Mon"],
  ["tue", "Tue"],
  ["wed", "Wed"],
  ["thu", "Thu"],
  ["fri", "Fri"],
  ["sat", "Sat"],
  ["sun", "Sun"],
] as const;

export function BusinessProfileView({ id }: { id: string }) {
  const auth = useAuth();
  const state = useBookItState();
  const business = publicBusinessById(state, id);
  const [notice, setNotice] = useState("");
  const [showDirections, setShowDirections] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);

  if (!business) {
    return (
      <div className="stack">
        <Empty title="Business not found" body="This business may be pending approval or unavailable." />
        <div>
          <Link href="/explore" className="btn">
            Back to Explore
          </Link>
        </div>
      </div>
    );
  }

  const services = servicesForBusiness(state, business.id);
  const resources = resourcesForBusiness(state, business.id);
  const offerings = offeringsForBusiness(state, business.id);
  const configs = bookingConfigsForBusiness(state, business.id);
  const enabledModels = enabledModelsForBusiness(state, business.id);
  const primaryModel = enabledModels[0] ?? "appointment";
  const ctaLabel = primaryCtaLabelForBusiness(business.category, enabledModels);
  const resourceCfg = configs.find((c) => c.bookingModel === "resource");
  const seatingAreas = Array.isArray(resourceCfg?.settings?.seatingAreas)
    ? (resourceCfg.settings.seatingAreas as string[])
    : [];

  const employees = state.employees.filter((emp) => emp.businessId === business.id);
  const products = state.products.filter((prd) => prd.businessId === business.id && prd.active);
  const reviews = state.reviews.filter((rev) => rev.businessId === business.id && rev.status === "published");
  const isFav = auth.userId
    ? state.favorites.some((fav) => fav.userId === auth.userId && fav.targetType === "business" && fav.targetId === business.id)
    : false;

  const spacesHeading =
    business.category === "restaurant"
      ? "Dining Tables & Seating"
      : business.category === "hotel"
        ? "Rooms & Suites"
        : business.category === "sports"
          ? "Courts & Fields"
          : "Spaces & Resources";

  return (
    <div className="stack" style={{ gap: 18 }}>
      <section className="cover-wrap">
        {business.coverUrl ? (
          <img className="cover-hero" src={business.coverUrl} alt={business.name} referrerPolicy="no-referrer" />
        ) : (
          <div className="cover-hero" />
        )}
        <div className="body" style={{ padding: 20 }}>
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div className="row" style={{ gap: 16 }}>
              {business.logoUrl ? (
                <img className="logo-overlap" src={business.logoUrl} alt="" referrerPolicy="no-referrer" style={{ marginTop: -44 }} />
              ) : (
                <div className="logo-overlap" style={{ marginTop: -44 }}>
                  {initials(business.name)}
                </div>
              )}
              <div>
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <h1 style={{ margin: 0, fontSize: 26, letterSpacing: "-0.03em" }}>{business.name}</h1>
                  <Badge tone="brand">{categoryLabels[business.category]}</Badge>
                </div>
                <p className="muted" style={{ margin: "4px 0" }}>
                  {business.description}
                </p>
                <div className="tiny row" style={{ flexWrap: "wrap" }}>
                  <span className="stars">★ {business.rating.toFixed(1)}</span>
                  <span>({business.reviewCount} reviews)</span>
                  <span>·</span>
                  <span>{business.address}, {business.city}</span>
                  <span>·</span>
                  <span>{business.distanceMiles} mi away</span>
                </div>
              </div>
            </div>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <Link href={`/book/${business.id}?model=${primaryModel}`} className="btn">
                {ctaLabel}
              </Link>
              <Button
                tone={isFav ? "soft" : "ghost"}
                onClick={() => {
                  if (!auth.userId) {
                    setNotice("Please sign in first.");
                    return;
                  }
                  toggleFavorite(auth.userId, "business", business.id, "Weekends");
                  setNotice(isFav ? "Removed from favorites" : "Saved to favorites");
                }}
              >
                {isFav ? "Saved" : "Save"}
              </Button>
              <Button
                tone="ghost"
                onClick={() => {
                  setNotice("Profile link copied to clipboard");
                  if (typeof navigator !== "undefined" && navigator.clipboard) {
                    navigator.clipboard.writeText(window.location.href).catch(() => {});
                  }
                }}
              >
                Share
              </Button>
            </div>
          </div>
          {notice ? <p className="tiny" style={{ color: "var(--lavender)", marginTop: 10 }}>{notice}</p> : null}
        </div>
      </section>

      <div className="split-detail">
        <div className="stack" style={{ gap: 18 }}>
          {resources.length > 0 ? (
            <section className="panel stack">
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                <div>
                  <h2 style={{ margin: 0 }}>{spacesHeading}</h2>
                  {business.category === "hotel" && resourceCfg?.settings ? (
                    <div className="tiny">
                      Check-in: {String(resourceCfg.settings.checkInTime ?? "15:00")} · Check-out:{" "}
                      {String(resourceCfg.settings.checkOutTime ?? "11:00")}
                    </div>
                  ) : null}
                  {seatingAreas.length > 0 ? (
                    <div className="tiny">Areas: {seatingAreas.join(" · ")}</div>
                  ) : null}
                </div>
                <Link href={`/book/${business.id}?model=resource`} className="btn soft small">
                  {business.category === "hotel" ? "Search Stay Dates" : business.category === "restaurant" ? "Find a Table" : "Check Availability"}
                </Link>
              </div>
              {resources.map((res) => {
                const area = typeof res.attributes?.area === "string" ? res.attributes.area : "";
                const amenities = Array.isArray(res.attributes?.amenities) ? (res.attributes.amenities as string[]) : [];
                return (
                  <div
                    key={res.id}
                    className="row"
                    style={{ justifyContent: "space-between", padding: "12px 0", borderTop: "1px solid var(--line)", gap: 12 }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <strong>{res.name}</strong>
                      <div className="tiny">
                        Up to {res.capacityPeople} guests · {res.unitsTotal} unit(s)
                        {area ? ` · ${area}` : ""}
                      </div>
                      {res.description ? <div className="tiny">{res.description}</div> : null}
                      {amenities.length > 0 ? <div className="tiny">Amenities: {amenities.join(", ")}</div> : null}
                    </div>
                    <div className="row" style={{ flexShrink: 0 }}>
                      <strong className="tabular">
                        {res.basePrice === 0 ? "Free reservation" : `${formatMoney(res.basePrice)}/${res.pricingUnit.replace("per_", "")}`}
                      </strong>
                      <Link href={`/book/${business.id}?model=resource&resource=${res.id}`} className="btn soft small">
                        Reserve
                      </Link>
                    </div>
                  </div>
                );
              })}
            </section>
          ) : null}

          {offerings.length > 0 ? (
            <section className="panel stack">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h2 style={{ margin: 0 }}>Events, Tours &amp; Classes</h2>
                <span className="tiny">{offerings.length} scheduled</span>
              </div>
              {offerings.map((off) => {
                const nextSession = off.sessions.find((s) => s.status === "on_sale" || s.status === "scheduled");
                const minPrice = nextSession?.tiers.length ? Math.min(...nextSession.tiers.map((t) => t.price)) : 0;
                return (
                  <div
                    key={off.id}
                    className="row"
                    style={{ justifyContent: "space-between", padding: "12px 0", borderTop: "1px solid var(--line)", gap: 12 }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div className="row" style={{ gap: 8 }}>
                        <strong>{off.title}</strong>
                        <Badge tone={off.bookingModel === "ticket" ? "brand" : "info"}>
                          {off.bookingModel === "ticket" ? "Tickets" : "Class"}
                        </Badge>
                      </div>
                      <div className="tiny">{off.description}</div>
                      {nextSession ? (
                        <div className="tiny tabular">
                          Next: {formatDateTime(nextSession.startAt)} · {nextSession.remainingCapacity} spots left
                        </div>
                      ) : null}
                    </div>
                    <div className="row" style={{ flexShrink: 0 }}>
                      <strong className="tabular">{minPrice === 0 ? "Free" : `From ${formatMoney(minPrice)}`}</strong>
                      <Link href={`/book/${business.id}?model=${off.bookingModel}&offering=${off.id}`} className="btn soft small">
                        {off.bookingModel === "ticket" ? "Get Tickets" : "Reserve"}
                      </Link>
                    </div>
                  </div>
                );
              })}
            </section>
          ) : null}

          {services.length > 0 || (resources.length === 0 && offerings.length === 0) ? (
            <section className="panel stack">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h2>Services</h2>
                <span className="tiny">{services.length} available</span>
              </div>
              {services.length === 0 ? (
                <p className="muted">No active services listed yet.</p>
              ) : (
                services.map((service) => (
                  <div
                    key={service.id}
                    className="row"
                    style={{ justifyContent: "space-between", padding: "12px 0", borderTop: "1px solid var(--line)" }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <Link href={`/services/${service.id}`}>
                        <strong>{service.name}</strong>
                      </Link>
                      <div className="tiny">
                        {service.durationMinutes} min · {service.description}
                      </div>
                    </div>
                    <div className="row" style={{ flexShrink: 0 }}>
                      <strong className="tabular">{service.price === 0 ? "Free" : formatMoney(service.price)}</strong>
                      <Link href={`/services/${service.id}`} className="btn ghost small">
                        Details
                      </Link>
                      <Link href={`/book/${business.id}?model=appointment&service=${service.id}`} className="btn soft small">
                        Book
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </section>
          ) : null}

          {employees.length > 0 ? (
            <section className="panel stack">
              <h2>Our Specialists</h2>
              <div className="grid-3">
                {employees.map((employee) => {
                  const person = state.users.find((u) => u.id === employee.userId);
                  const name = displayUser(state, employee.userId);
                  return (
                    <Link key={employee.id} href={`/book/${business.id}?model=appointment&employee=${employee.id}`} className="select-card stack" style={{ gap: 6 }}>
                      <div className="person">
                        {person?.avatarUrl ? (
                          <img className="avatar-img" src={person.avatarUrl} alt={name} referrerPolicy="no-referrer" />
                        ) : (
                          <span className="avatar">{initials(name)}</span>
                        )}
                        <div>
                          <strong style={{ fontSize: 14 }}>{name}</strong>
                          <div className="tiny">{employee.title}</div>
                        </div>
                      </div>
                      <div className="tiny stars">★ {employee.rating.toFixed(1)}</div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}

          {products.length > 0 ? (
            <section className="panel stack">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <h2>Products from {business.name}</h2>
                <Link href="/marketplace" className="tiny">
                  Browse marketplace
                </Link>
              </div>
              <div className="grid-cards">
                {products.map((product) => (
                  <article key={product.id} className="card">
                    <Link href={`/marketplace/${product.id}`}>
                      <img className="cover" src={product.imageUrl} alt={product.name} referrerPolicy="no-referrer" />
                    </Link>
                    <div className="body stack" style={{ gap: 6 }}>
                      <Link href={`/marketplace/${product.id}`}>
                        <strong>{product.name}</strong>
                      </Link>
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <strong className="tabular">{formatMoney(product.price)}</strong>
                        <Button
                          tone="soft"
                          small
                          onClick={() => {
                            if (!auth.userId) {
                              setNotice("Please sign in first.");
                              return;
                            }
                            const res = addToCart(auth.userId, product.id, 1, product.variants[0]?.id);
                            setNotice(res.ok ? `Added ${product.name} to cart` : res.error);
                          }}
                        >
                          Add to cart
                        </Button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {business.gallery.length > 0 ? (
            <section className="panel stack">
              <h2>Gallery</h2>
              <div className="grid-3">
                {business.gallery.map((photo) => (
                  <img
                    key={photo.id}
                    src={photo.url}
                    alt={photo.alt}
                    referrerPolicy="no-referrer"
                    style={{ borderRadius: 12, height: 132, width: "100%", objectFit: "cover" }}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <div className="stack" style={{ gap: 18 }}>
          <section className="panel stack">
            <h3>Hours &amp; Availability</h3>
            <div className="stack" style={{ gap: 6 }}>
              {DAYS.map(([key, label]) => {
                const row = business.hours[key];
                return (
                  <div key={key} className="row" style={{ justifyContent: "space-between", fontSize: 13 }}>
                    <span className="muted">{label}</span>
                    <span className="tabular">{row.closed ? "Closed" : `${row.open} – ${row.close}`}</span>
                  </div>
                );
              })}
            </div>
            <p className="tiny">{business.cancellationPolicy}</p>
          </section>

          <section className="panel stack">
            <h3>Location</h3>
            <div className="map-box">
              <div className="stack" style={{ justifyItems: "center", gap: 4 }}>
                <Badge tone="brand">Map Preview</Badge>
                <span className="tiny tabular">
                  {business.location.geo.lat.toFixed(3)}, {business.location.geo.lng.toFixed(3)}
                </span>
              </div>
            </div>
            <div className="tiny">
              {business.address}, {business.city} · {business.phone}
            </div>
            <Button tone="ghost" small onClick={() => setShowDirections(true)}>
              Get Directions
            </Button>
          </section>

          <section className="panel stack">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h3>Client Reviews</h3>
              <Button
                tone="soft"
                small
                onClick={() => {
                  if (!auth.userId) {
                    setNotice("Please sign in to write a review.");
                    return;
                  }
                  setReviewError("");
                  setShowReview(true);
                }}
              >
                Write review
              </Button>
            </div>
            {reviews.length === 0 ? (
              <p className="muted">No reviews yet.</p>
            ) : (
              reviews.map((review) => (
                <div key={review.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="stars">{"★".repeat(review.rating)}</span>
                    <span className="tiny">{formatDate(review.createdAt)}</span>
                  </div>
                  <strong style={{ fontSize: 14 }}>{review.title}</strong>
                  <p className="tiny" style={{ margin: "4px 0" }}>
                    {review.body}
                  </p>
                  <div className="tiny">{displayUser(state, review.authorId)}</div>
                </div>
              ))
            )}
          </section>
        </div>
      </div>

      {showDirections ? (
        <Modal title="Directions" onClose={() => setShowDirections(false)}>
          <div className="stack">
            <p className="muted">
              {business.name} — {business.address}, {business.city}
            </p>
            <p className="tiny tabular">
              Coordinates: {business.location.geo.lat}, {business.location.geo.lng}
            </p>
            <p className="tiny">Native turn-by-turn map links connect via Google Maps or Apple Maps in production.</p>
          </div>
        </Modal>
      ) : null}

      {showReview ? (
        <Modal title={`Review ${business.name}`} onClose={() => setShowReview(false)}>
          <form
            className="stack"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!auth.userId) {
                setReviewError("Please sign in to publish a review.");
                return;
              }
              setReviewError("");
              if (usingMocks()) {
                const res = addReview({ authorId: auth.userId, businessId: business.id, rating, title, body });
                if (!res.ok) {
                  setReviewError(res.error);
                  return;
                }
                setShowReview(false);
                setTitle("");
                setBody("");
                return;
              }
              setReviewBusy(true);
              try {
                const res = await addReviewRemote({ businessId: business.id, rating, title, body });
                if (!res.ok) {
                  setReviewError(res.error);
                  return;
                }
                setShowReview(false);
                setTitle("");
                setBody("");
                setNotice("Review published.");
              } finally {
                setReviewBusy(false);
              }
            }}
          >
            <Field label="Rating">
              <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} stars
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Title">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Calm and precise" />
            </Field>
            <Field label="Experience">
              <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Share how your visit went" />
            </Field>
            {reviewError ? <p className="error">{reviewError}</p> : null}
            <Button type="submit" disabled={reviewBusy}>
              {reviewBusy ? "Publishing…" : "Publish review"}
            </Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
