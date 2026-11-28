"use client";

import { addToCart, addToCartRemote, toggleFavorite, toggleFavoriteRemote, useBookItState, usingMocks } from "@bookit/api-client";
import { formatMoney } from "@bookit/utils";
import Link from "next/link";
import { use, useState } from "react";
import { Badge, Button, Empty } from "@/components/ui";
import { useAuth } from "@/lib/session";

export default function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const auth = useAuth();
  const state = useBookItState();
  const product = state.products.find((p) => p.id === id);
  const [variantId, setVariantId] = useState(product?.variants[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [favBusy, setFavBusy] = useState(false);

  if (!product) return <Empty title="Product not found" body="Browse the marketplace for available items." />;
  const seller = state.businesses.find((b) => b.id === product.businessId);
  const selectedVariant = product.variants.find((v) => v.id === variantId);
  const stock = selectedVariant ? selectedVariant.stock : product.stock;
  const price = product.price + (selectedVariant?.priceDelta ?? 0);
  const related = state.products.filter((p) => p.id !== product.id && p.categoryId === product.categoryId).slice(0, 3);
  const isFav = auth.userId
    ? state.favorites.some((f) => f.userId === auth.userId && f.targetType === "product" && f.targetId === product.id)
    : false;

  return (
    <div className="stack" style={{ gap: 22 }}>
      <Link href="/marketplace" className="tiny">
        ← Back to Marketplace
      </Link>
      <div className="grid-2">
        <div className="card">
          <img
            src={product.imageUrl}
            alt={product.name}
            referrerPolicy="no-referrer"
            style={{ width: "100%", height: 360, objectFit: "cover" }}
          />
        </div>
        <div className="panel stack" style={{ gap: 12 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <Link href={`/business/${product.businessId}`} className="tiny">
              Sold by <strong>{seller?.name}</strong>
            </Link>
            <Badge tone={stock > 0 ? "success" : "danger"}>{stock > 0 ? `${stock} in stock` : "Out of stock"}</Badge>
          </div>
          <h1 style={{ margin: 0 }}>{product.name}</h1>
          <div className="row">
            <strong className="tabular" style={{ fontSize: 28 }}>
              {formatMoney(price)}
            </strong>
            {product.compareAtPrice ? (
              <span className="muted tabular" style={{ textDecoration: "line-through" }}>
                {formatMoney(product.compareAtPrice)}
              </span>
            ) : null}
            {product.discountLabel ? <Badge tone="success">{product.discountLabel}</Badge> : null}
          </div>
          <p className="muted" style={{ margin: 0 }}>
            {product.description}
          </p>

          {product.variants.length > 0 ? (
            <div className="stack" style={{ gap: 6 }}>
              <span className="label">Options</span>
              <div className="chips">
                {product.variants.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    className={`slot ${variant.id === variantId ? "on" : ""}`}
                    onClick={() => setVariantId(variant.id)}
                  >
                    {variant.label} ({variant.stock})
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="row">
            <span className="label">Quantity</span>
            <Button tone="ghost" small onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
              -
            </Button>
            <strong className="tabular">{quantity}</strong>
            <Button tone="ghost" small onClick={() => setQuantity((q) => Math.min(Math.max(stock, 1), q + 1))}>
              +
            </Button>
          </div>

          {notice ? <p className="tiny" style={{ color: "var(--lavender)", margin: 0 }}>{notice}</p> : null}

          <div className="row" style={{ flexWrap: "wrap" }}>
            <Button
              disabled={stock <= 0 || busy}
              onClick={async () => {
                if (!auth.userId) return;
                if (usingMocks()) {
                  const res = addToCart(auth.userId, product.id, quantity, variantId || undefined);
                  setNotice(res.ok ? `Added ${quantity} to cart` : res.error);
                  return;
                }
                setBusy(true);
                try {
                  const res = await addToCartRemote(product.id, quantity, variantId || undefined);
                  setNotice(res.ok ? `Added ${quantity} to cart` : res.error);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Adding…" : "Add to Cart"}
            </Button>
            <Button
              tone="ghost"
              disabled={favBusy}
              onClick={async () => {
                if (!auth.userId) return;
                if (usingMocks()) {
                  toggleFavorite(auth.userId, "product", product.id, "Gifts");
                  setNotice(isFav ? "Removed from favorites" : "Saved to favorites");
                  return;
                }
                setFavBusy(true);
                try {
                  const res = await toggleFavoriteRemote("product", product.id, "Gifts");
                  setNotice(res.ok ? (isFav ? "Removed from favorites" : "Saved to favorites") : res.error);
                } finally {
                  setFavBusy(false);
                }
              }}
            >
              {favBusy ? "Saving…" : isFav ? "Saved" : "Save"}
            </Button>
            <Link href="/cart" className="btn soft">
              Go to Cart
            </Link>
          </div>
        </div>
      </div>

      {related.length > 0 ? (
        <section className="stack">
          <h2>Related Products</h2>
          <div className="grid-3">
            {related.map((item) => (
              <Link key={item.id} href={`/marketplace/${item.id}`} className="card">
                <img className="cover" src={item.imageUrl} alt={item.name} referrerPolicy="no-referrer" />
                <div className="body">
                  <strong>{item.name}</strong>
                  <div className="tabular tiny">{formatMoney(item.price)}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
