"use client";

import {
  addToCart,
  searchBusinesses,
  searchProducts,
  searchServices,
  useBookItState,
} from "@bookit/api-client";
import type { BusinessCategory } from "@bookit/types";
import { categoryLabels, exploreFilterHints } from "@bookit/ui";
import { formatMoney } from "@bookit/utils";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Badge, Button, Empty } from "@/components/ui";
import { useAuth } from "@/lib/session";

const CATEGORIES = Object.keys(categoryLabels) as BusinessCategory[];

function ExploreContent() {
  const auth = useAuth();
  const state = useBookItState();
  const params = useSearchParams();
  const [tab, setTab] = useState<"businesses" | "services" | "products">((params.get("tab") as "businesses" | "services" | "products") || "businesses");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [category, setCategory] = useState(params.get("category") ?? "");
  const [minRating, setMinRating] = useState(0);
  const [maxPrice, setMaxPrice] = useState<number | undefined>(undefined);
  const [sort, setSort] = useState<"rating" | "distance" | "price_asc" | "price_desc">("rating");
  const [cartNote, setCartNote] = useState("");

  const businesses = searchBusinesses(state, {
    q,
    category: category || undefined,
    minRating: minRating || undefined,
    sort: sort === "distance" ? "distance" : "rating",
  });
  const services = searchServices(state, { q, category: category || undefined, maxPrice });
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
            Discover approved businesses, bookable services, and multi-vendor products.
          </p>
        </div>
        <div className="tabs">
          {(["businesses", "services", "products"] as const).map((item) => (
            <button key={item} type="button" className={`tab ${tab === item ? "on" : ""}`} onClick={() => setTab(item)}>
              {item[0].toUpperCase() + item.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="panel stack" style={{ gap: 12 }}>
        <div className="grid-4" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr" }}>
          <label className="field">
            <span>Search</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Salon, dentist, running shoes, massage..." />
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
            <span>Min rating</span>
            <select value={minRating} onChange={(e) => setMinRating(Number(e.target.value))}>
              <option value={0}>Any rating</option>
              <option value={4.5}>4.5★ & up</option>
              <option value={4.8}>4.8★ & up</option>
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

      {cartNote ? <p className="tiny" style={{ color: "var(--lavender)" }}>{cartNote}</p> : null}

      {tab === "businesses" ? (
        businesses.length === 0 ? (
          <Empty title="No matching businesses" body="Try clearing your search or category filter." />
        ) : (
          <div className="grid-3">
            {businesses.map((biz) => (
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
                    {biz.city} · {biz.tags.join(" · ")}
                  </p>
                  <div className="row" style={{ marginTop: 6 }}>
                    <Link href={`/business/${biz.id}`} className="btn ghost small">
                      Profile
                    </Link>
                    <Link href={`/book/${biz.id}`} className="btn small">
                      Book now
                    </Link>
                  </div>
                </div>
              </article>
            ))}
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
                        <Link href={`/book/${svc.businessId}?service=${svc.id}`} className="btn small">
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
