"use client";

import {
  addToCart,
  addToCartRemote,
  searchProducts,
  toggleFavorite,
  toggleFavoriteRemote,
  useBookItState,
  usingMocks,
} from "@bookit/api-client";
import { formatMoney } from "@bookit/utils";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Empty } from "@/components/ui";
import { useAuth } from "@/lib/session";

export default function MarketplacePage() {
  const auth = useAuth();
  const state = useBookItState();
  const [q, setQ] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "featured" | "popular" | "discounts">("all");
  const [sort, setSort] = useState<"newest" | "price_asc" | "price_desc">("newest");
  const [inStock, setInStock] = useState(false);
  const [notice, setNotice] = useState("");
  const [busyProductId, setBusyProductId] = useState("");
  const [busyFavId, setBusyFavId] = useState("");

  const sponsoredAd = state.advertisements.find((ad) => ad.placement === "marketplace" && ad.status === "active");
  const sponsoredBiz = sponsoredAd ? state.businesses.find((b) => b.id === sponsoredAd.businessId) : undefined;

  let products = searchProducts(state, {
    q,
    productCategory: productCategory || undefined,
    sort,
    inStock,
  });

  if (filterMode === "featured") products = products.filter((p) => p.featured);
  else if (filterMode === "popular") products = products.filter((p) => p.popular);
  else if (filterMode === "discounts") products = products.filter((p) => p.compareAtPrice && p.compareAtPrice > p.price);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Marketplace</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Multi-vendor goods from local studios, electronics shops, home makers, and fitness brands.
          </p>
        </div>
        <Link href="/cart" className="btn">
          View Cart ({auth.userId ? state.carts.find((c) => c.userId === auth.userId)?.items.reduce((s, i) => s + i.quantity, 0) ?? 0 : 0})
        </Link>
      </div>

      {sponsoredAd && sponsoredBiz ? (
        <div className="panel row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div className="row">
            <Badge tone="brand">Sponsored</Badge>
            <strong>{sponsoredBiz.name}</strong>
            <span className="muted">— {sponsoredAd.title}</span>
          </div>
          <Link href={`/business/${sponsoredBiz.id}`} className="btn ghost small">
            Visit seller
          </Link>
        </div>
      ) : null}

      <div className="panel stack" style={{ gap: 12 }}>
        <div className="grid-4" style={{ gridTemplateColumns: "2fr 1fr 1fr auto" }}>
          <label className="field">
            <span>Search products</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Headphones, ceramics, runners, serum..." />
          </label>
          <label className="field">
            <span>Category</span>
            <select value={productCategory} onChange={(e) => setProductCategory(e.target.value)}>
              <option value="">All categories</option>
              {state.productCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="newest">New arrivals</option>
              <option value="price_asc">Price: low to high</option>
              <option value="price_desc">Price: high to low</option>
            </select>
          </label>
          <label className="check" style={{ alignSelf: "end", paddingBottom: 10 }}>
            <input type="checkbox" checked={inStock} onChange={(e) => setInStock(e.target.checked)} /> In stock only
          </label>
        </div>
        <div className="tabs">
          {(
            [
              ["all", "All products"],
              ["featured", "Featured"],
              ["popular", "Popular"],
              ["discounts", "Discounts"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" className={`tab ${filterMode === id ? "on" : ""}`} onClick={() => setFilterMode(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {notice ? <p className="tiny" style={{ color: "var(--lavender)" }}>{notice}</p> : null}

      {products.length === 0 ? (
        <Empty title="No matching products" body="Try clearing a filter or search term." />
      ) : (
        <div className="grid-cards">
          {products.map((product) => {
            const seller = state.businesses.find((b) => b.id === product.businessId);
            const isFav = auth.userId
              ? state.favorites.some((f) => f.userId === auth.userId && f.targetType === "product" && f.targetId === product.id)
              : false;
            return (
              <article key={product.id} className="card">
                <Link href={`/marketplace/${product.id}`}>
                  <img className="cover" src={product.imageUrl} alt={product.name} referrerPolicy="no-referrer" />
                </Link>
                <div className="body stack" style={{ gap: 6 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="tiny">{seller?.name}</span>
                    {product.discountLabel ? <Badge tone="success">{product.discountLabel}</Badge> : null}
                  </div>
                  <Link href={`/marketplace/${product.id}`}>
                    <h3>{product.name}</h3>
                  </Link>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <div className="row" style={{ gap: 6 }}>
                      <strong className="tabular">{formatMoney(product.price)}</strong>
                      {product.compareAtPrice ? (
                        <span className="tiny tabular" style={{ textDecoration: "line-through" }}>
                          {formatMoney(product.compareAtPrice)}
                        </span>
                      ) : null}
                    </div>
                    <span className="tiny stars">★ {product.rating.toFixed(1)}</span>
                  </div>
                  <div className="row" style={{ justifyContent: "space-between", marginTop: 4 }}>
                    <Button
                      tone="soft"
                      small
                      disabled={product.stock <= 0 || busyProductId === product.id}
                      onClick={async () => {
                        if (!auth.userId) return;
                        if (usingMocks()) {
                          const res = addToCart(auth.userId, product.id, 1, product.variants[0]?.id);
                          setNotice(res.ok ? `Added ${product.name} to cart` : res.error);
                          return;
                        }
                        setBusyProductId(product.id);
                        try {
                          const res = await addToCartRemote(product.id, 1, product.variants[0]?.id);
                          setNotice(res.ok ? `Added ${product.name} to cart` : res.error);
                        } finally {
                          setBusyProductId("");
                        }
                      }}
                    >
                      {busyProductId === product.id ? "Adding…" : product.stock > 0 ? "Add to cart" : "Out of stock"}
                    </Button>
                    <Button
                      tone="ghost"
                      small
                      disabled={busyFavId === product.id}
                      onClick={async () => {
                        if (!auth.userId) return;
                        if (usingMocks()) {
                          toggleFavorite(auth.userId, "product", product.id, "Gifts");
                          setNotice(isFav ? "Removed from favorites" : "Saved to favorites");
                          return;
                        }
                        setBusyFavId(product.id);
                        try {
                          const res = await toggleFavoriteRemote("product", product.id, "Gifts");
                          setNotice(res.ok ? (isFav ? "Removed from favorites" : "Saved to favorites") : res.error);
                        } finally {
                          setBusyFavId("");
                        }
                      }}
                    >
                      {busyFavId === product.id ? "Saving…" : isFav ? "Saved" : "Save"}
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
