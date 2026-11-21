"use client";

import {
  addToCart,
  enabledModelsForBusiness,
  searchBusinesses,
  searchProducts,
  searchServices,
  useBookItState,
} from "@bookit/api-client";
import type { BookingModel, BusinessCategory } from "@bookit/types";
import { categoryLabels, exploreFilterHints } from "@bookit/ui";
import { bookingModelLabel, formatDateTime, formatMoney } from "@bookit/utils";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Badge, Button, Empty } from "@/components/ui";
import { useAuth } from "@/lib/session";

const CATEGORIES = Object.keys(categoryLabels) as BusinessCategory[];
const BOOKING_MODELS: BookingModel[] = ["appointment", "resource", "ticket", "capacity"];

function ExploreContent() {
  const auth = useAuth();
  const state = useBookItState();
  const params = useSearchParams();
  const [tab, setTab] = useState<"businesses" | "services" | "events" | "products">(
    (params.get("tab") as "businesses" | "services" | "events" | "products") || "businesses",
  );
  const [q, setQ] = useState(params.get("q") ?? "");
  const [category, setCategory] = useState(params.get("category") ?? "");
  const [modelFilter, setModelFilter] = useState<BookingModel | "">((params.get("model") as BookingModel) || "");
  const [minRating, setMinRating] = useState(0);
  const [maxPrice, setMaxPrice] = useState<number | undefined>(undefined);
  const [sort, setSort] = useState<"rating" | "distance" | "price_asc" | "price_desc">("rating");
  const [cartNote, setCartNote] = useState("");

  const businesses = searchBusinesses(state, {
    q,
    category: category || undefined,
    minRating: minRating || undefined,
    sort: sort === "distance" ? "distance" : "rating",
  }).filter((biz) => {
    if (!modelFilter) return true;
    return enabledModelsForBusiness(state, biz.id).includes(modelFilter);
  });

  const services = searchServices(state, { q, category: category || undefined, maxPrice });
  const offerings = (state.eventOfferings ?? []).filter((off) => {
    if (!off.active) return false;
    const biz = state.businesses.find((b) => b.id === off.businessId && b.isPublic && b.status === "approved");
    if (!biz) return false;
    if (category && biz.category !== category) return false;
    if (modelFilter && off.bookingModel !== modelFilter) return false;
    if (q.trim() && !`${off.title} ${off.description} ${off.category} ${biz.name}`.toLowerCase().includes(q.trim().toLowerCase())) {
      return false;
    }
    return true;
  });
  const products = searchProducts(state, {
    q,
    maxPrice,
    minRating: minRating || undefined,
    sort: sort === "price_asc" || sort === "price_desc" ? sort : undefined,
  });

  const hints = exploreFilterHints[category || "other"] ?? exploreFilterHints.other;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Explore BookIt</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Discover approved businesses, bookable spaces, events, classes, services, and products.
          </p>
        </div>
        <div className="tabs">
          {(
            [
              ["businesses", "Businesses"],
              ["services", "Services"],
              ["events", "Events & Classes"],
              ["products", "Products"],
            ] as const
          ).map(([item, label]) => (
            <button key={item} type="button" className={`tab ${tab === item ? "on" : ""}`} onClick={() => setTab(item)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="panel stack" style={{ gap: 12 }}>
        <div className="grid-4" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr" }}>
          <label className="field">
            <span>Search</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Salon, dining table, workshop, pottery..." />
          </label>
          <label className="field">
            <span>Category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">All categories</option>
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {categoryLabels[cat]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Booking Type</span>
            <select value={modelFilter} onChange={(e) => setModelFilter(e.target.value as BookingModel | "")}>
              <option value="">All booking models</option>
              {BOOKING_MODELS.map((m) => (
                <option key={m} value={m}>
                  {bookingModelLabel(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="rating">Top rated</option>
              <option value="distance">Nearest</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </select>
          </label>
        </div>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div className="tiny">
            Active category filters: {hints.join(" · ")}
          </div>
          <div className="row" style={{ gap: 12 }}>
            <label className="row tiny">
              <span>Min rating:</span>
              <select value={minRating} onChange={(e) => setMinRating(Number(e.target.value))}>
                <option value={0}>Any</option>
                <option value={4.5}>4.5★+</option>
                <option value={4.8}>4.8★+</option>
              </select>
            </label>
            {tab !== "businesses" ? (
              <label className="row tiny">
                <span>Max price:</span>
                <select value={maxPrice ?? ""} onChange={(e) => setMaxPrice(e.target.value ? Number(e.target.value) : undefined)}>
                  <option value="">Any</option>
                  <option value="50">Under $50</option>
                  <option value="100">Under $100</option>
                  <option value="200">Under $200</option>
                </select>
              </label>
            ) : null}
          </div>
        </div>
      </div>

      {cartNote ? <p className="tiny" style={{ color: "var(--lavender)" }}>{cartNote}</p> : null}

      {tab === "businesses" ? (
        businesses.length === 0 ? (
          <Empty title="No matching businesses" body="Try clearing your search or category filter." />
        ) : (
          <div className="grid-3">
            {businesses.map((biz) => {
              const models = enabledModelsForBusiness(state, biz.id);
              const primaryModel = models[0] ?? "appointment";
              return (
                <article key={biz.id} className="card">
                  <Link href={`/business/${biz.id}`}>
                    {biz.coverUrl ? (
                      <img className="cover" src={biz.coverUrl} alt={biz.name} referrerPolicy="no-referrer" />
                    ) : (
                      <div className="cover" />
                    )}
                  </Link>
                  <div className="body stack" style={{ gap: 6 }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <Badge tone="brand">{categoryLabels[biz.category]}</Badge>
                      <span className="tiny">{biz.distanceMiles} mi</span>
                    </div>
                    <Link href={`/business/${biz.id}`}>
                      <h3>{biz.name}</h3>
                    </Link>
                    <div className="stars">
                      ★ {biz.rating.toFixed(1)} · {biz.reviewCount} reviews
                    </div>
                    <p className="tiny" style={{ margin: 0 }}>
                      {biz.city} · {models.map((m) => bookingModelLabel(m)).join(" · ") || biz.tags.join(" · ")}
                    </p>
                    <div className="row" style={{ marginTop: 6 }}>
                      <Link href={`/business/${biz.id}`} className="btn ghost small">
                        Profile
                      </Link>
                      <Link href={`/book/${biz.id}?model=${primaryModel}`} className="btn small">
                        Book now
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : null}

      {tab === "services" ? (
        services.length === 0 ? (
          <Empty title="No matching services" body="Adjust your category or price filters." />
        ) : (
          <div className="grid-3">
            {services.map((svc) => {
              const biz = state.businesses.find((b) => b.id === svc.businessId);
              return (
                <article key={svc.id} className="card">
                  {svc.imageUrl ? (
                    <img className="cover" src={svc.imageUrl} alt={svc.name} referrerPolicy="no-referrer" />
                  ) : (
                    <div className="cover" />
                  )}
                  <div className="body stack" style={{ gap: 6 }}>
                    <span className="tiny">{biz?.name}</span>
                    <Link href={`/services/${svc.id}`}>
                      <h3>{svc.name}</h3>
                    </Link>
                    <p className="tiny" style={{ margin: 0 }}>{svc.description}</p>
                    <div className="row" style={{ justifyContent: "space-between", marginTop: 6, flexWrap: "wrap" }}>
                      <strong className="tabular">
                        {svc.price === 0 ? "Free" : formatMoney(svc.price)} · {svc.durationMinutes} min
                      </strong>
                      <div className="row">
                        <Link href={`/services/${svc.id}`} className="btn ghost small">
                          Details
                        </Link>
                        <Link href={`/book/${svc.businessId}?model=appointment&service=${svc.id}`} className="btn small">
                          Book
                        </Link>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : null}

      {tab === "events" ? (
        offerings.length === 0 ? (
          <Empty title="No upcoming events or classes" body="Try clearing your search or category filter." />
        ) : (
          <div className="grid-3">
            {offerings.map((off) => {
              const biz = state.businesses.find((b) => b.id === off.businessId);
              const nextSession = off.sessions.find((s) => s.status === "on_sale" || s.status === "scheduled");
              const minPrice = nextSession?.tiers.length
                ? Math.min(...nextSession.tiers.map((t) => t.price))
                : 0;
              return (
                <article key={off.id} className="card">
                  <div className="body stack" style={{ gap: 6 }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <Badge tone={off.bookingModel === "ticket" ? "brand" : "info"}>
                        {off.bookingModel === "ticket" ? "Ticketed Event" : "Group Class"}
                      </Badge>
                      {nextSession ? (
                        <span className="tiny tabular">{nextSession.remainingCapacity} spots left</span>
                      ) : null}
                    </div>
                    <h3>{off.title}</h3>
                    <span className="tiny">
                      {biz?.name} {off.venueArea ? `· ${off.venueArea}` : ""}
                    </span>
                    <p className="tiny" style={{ margin: 0 }}>{off.description}</p>
                    {nextSession ? (
                      <span className="tiny tabular">{formatDateTime(nextSession.startAt)}</span>
                    ) : null}
                    <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
                      <strong className="tabular">
                        {minPrice === 0 ? "Free" : `From ${formatMoney(minPrice)}`}
                      </strong>
                      <Link
                        href={`/book/${off.businessId}?model=${off.bookingModel}&offering=${off.id}`}
                        className="btn small"
                      >
                        {off.bookingModel === "ticket" ? "Get Tickets" : "Reserve Spot"}
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : null}

      {tab === "products" ? (
        products.length === 0 ? (
          <Empty title="No matching products" body="Try broadening your search terms." />
        ) : (
          <div className="grid-4">
            {products.map((product) => {
              const seller = state.businesses.find((b) => b.id === product.businessId);
              return (
                <article key={product.id} className="card">
                  <Link href={`/marketplace/${product.id}`}>
                    <img className="cover" src={product.imageUrl} alt={product.name} referrerPolicy="no-referrer" />
                  </Link>
                  <div className="body stack" style={{ gap: 6 }}>
                    <span className="tiny">{seller?.name}</span>
                    <Link href={`/marketplace/${product.id}`}>
                      <h3>{product.name}</h3>
                    </Link>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <strong className="tabular">{formatMoney(product.price)}</strong>
                      <Button
                        tone="soft"
                        small
                        onClick={() => {
                          if (!auth.userId) return;
                          const res = addToCart(auth.userId, product.id, 1, product.variants[0]?.id);
                          setCartNote(res.ok ? `Added ${product.name} to cart` : res.error);
                        }}
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )
      ) : null}
    </div>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<div className="app-boot">Loading Explore…</div>}>
      <ExploreContent />
    </Suspense>
  );
}
