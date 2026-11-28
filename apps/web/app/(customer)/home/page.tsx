"use client";

import {
  customerAppointments,
  customerOrders,
  displayUser,
  personalizedBusinesses,
  searchProducts,
  toggleFavorite,
  toggleFavoriteRemote,
  useBookItState,
  usingMocks,
} from "@bookit/api-client";
import { appointmentStatus, categoryLabels, orderStatus } from "@bookit/ui";
import { formatDate, formatDateTime, formatMoney, initials } from "@bookit/utils";
import Link from "next/link";
import { useState } from "react";
import { Badge, Button } from "@/components/ui";
import { useAuth } from "@/lib/session";

const shortcuts = ["beauty", "wellness", "healthcare", "fitness", "restaurant", "retail"] as const;

export default function CustomerHomePage() {
  const auth = useAuth();
  const state = useBookItState();
  const [city, setCity] = useState("Seattle");
  const [favBusyId, setFavBusyId] = useState("");
  const [notice, setNotice] = useState("");
  if (!auth.user) return null;

  const userId = auth.user.id;
  const upcoming = customerAppointments(state, userId).filter((a) => a.status === "confirmed" || a.status === "pending");
  const favBizIds = state.favorites.filter((f) => f.userId === userId && f.targetType === "business").map((f) => f.targetId);
  const favBusinesses = state.businesses.filter((b) => favBizIds.includes(b.id));
  const recentOrders = customerOrders(state, userId).slice(0, 3);
  const recResult = personalizedBusinesses(state, userId);
  const featuredBusinesses = recResult.items;
  const popularServices = state.services.filter((s) => s.active).slice(0, 3);
  const recommendedProducts = searchProducts(state, { sort: "newest" }).slice(0, 4);
  const sponsoredAd = state.advertisements.find((ad) => ad.placement === "home" && ad.status === "active");
  const sponsoredBiz = sponsoredAd ? state.businesses.find((b) => b.id === sponsoredAd.businessId) : undefined;

  return (
    <div className="stack" style={{ gap: 22 }}>
      <section className="banner">
        <div>
          <span className="badge" style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}>
            {city} · Personal account
          </span>
          <h1 style={{ margin: "8px 0 4px", fontSize: 28, letterSpacing: "-0.03em" }}>
            Welcome back, {auth.user.firstName}!
          </h1>
          <p style={{ margin: 0, opacity: 0.92 }}>
            You have {upcoming.length} upcoming {upcoming.length === 1 ? "appointment" : "appointments"} scheduled.
          </p>
        </div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <select
            aria-label="Select city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            style={{ background: "rgba(20,20,32,0.45)", border: "1px solid rgba(255,255,255,0.28)", borderRadius: 12, padding: "10px 12px", color: "#fff" }}
          >
            <option value="Seattle">Seattle, WA</option>
            <option value="Bellevue">Bellevue, WA</option>
            <option value="Portland">Portland, OR</option>
          </select>
          <Link href="/explore" className="btn" style={{ background: "#141420" }}>
            + New Booking
          </Link>
        </div>
      </section>

      <section className="stack">
        <div className="section-head" style={{ marginTop: 4 }}>
          <h2>Upcoming Appointments</h2>
          <Link href="/bookings" className="tiny">
            View all →
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <div className="panel row" style={{ justifyContent: "space-between" }}>
            <span className="muted">No upcoming appointments yet.</span>
            <Link href="/explore" className="btn small">
              Find a service
            </Link>
          </div>
        ) : (
          <div className="grid-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            {upcoming.slice(0, 2).map((apt) => {
              const biz = state.businesses.find((b) => b.id === apt.businessId);
              const svc = state.services.find((s) => s.id === apt.serviceId);
              const emp = state.employees.find((e) => e.id === apt.employeeId);
              const st = appointmentStatus(apt.status);
              return (
                <article key={apt.id} className="panel stack" style={{ gap: 10 }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <div className="person">
                      <span className="avatar">{initials(biz?.name ?? "B")}</span>
                      <div>
                        <strong>{biz?.name}</strong>
                        <div className="tiny">
                          {svc?.name} with {emp ? displayUser(state, emp.userId) : "Staff"}
                        </div>
                      </div>
                    </div>
                    <Badge tone="brand">{formatDateTime(apt.start)}</Badge>
                  </div>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <Badge tone={st.tone}>{st.label}</Badge>
                    <Link href={`/bookings/${apt.id}`} className="btn ghost small">
                      Manage / Reschedule
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="stack">
        <div className="section-head" style={{ marginTop: 4 }}>
          <h2>Categories</h2>
          <Link href="/explore" className="tiny">
            All categories
          </Link>
        </div>
        <div className="chips">
          {shortcuts.map((cat) => (
            <Link key={cat} href={`/explore?category=${cat}`} className="tab">
              {categoryLabels[cat]}
            </Link>
          ))}
        </div>
      </section>

      {sponsoredAd && sponsoredBiz ? (
        <section className="panel row" style={{ justifyContent: "space-between", flexWrap: "wrap", borderColor: "color-mix(in srgb, var(--primary) 45%, var(--line))" }}>
          <div className="stack" style={{ gap: 4 }}>
            <div className="row">
              <Badge tone="brand">Sponsored</Badge>
              <strong>{sponsoredBiz.name}</strong>
            </div>
            <span className="muted">
              {sponsoredAd.title} — {sponsoredAd.body}
            </span>
          </div>
          <Link href={`/business/${sponsoredBiz.id}`} className="btn soft small">
            View offer
          </Link>
        </section>
      ) : null}

      <section className="stack">
        <div className="section-head" style={{ marginTop: 4 }}>
          <div>
            <h2>{recResult.personalized ? "Recommended for You" : "Featured Businesses"}</h2>
            <span className="tiny">
              {recResult.personalized
                ? "Personalized from your saved interests (manage in Account Privacy)"
                : "Top-rated venues · enable personalized recommendations in Account Privacy"}
            </span>
          </div>
          <Link href="/favorites" className="tiny">
            Manage favorites →
          </Link>
        </div>
        <div className="grid-3">
          {(favBusinesses.length > 0 ? favBusinesses : featuredBusinesses).slice(0, 3).map((biz) => (
            <article key={biz.id} className="panel stack" style={{ gap: 10 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <Link href={`/business/${biz.id}`} className="person">
                  {biz.logoUrl ? (
                    <img className="avatar-img" src={biz.logoUrl} alt="" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="avatar">{initials(biz.name)}</span>
                  )}
                  <div>
                    <strong>{biz.name}</strong>
                    <div className="tiny">
                      {categoryLabels[biz.category]} · <span className="stars">★ {biz.rating.toFixed(1)}</span>
                    </div>
                  </div>
                </Link>
                <Button
                  tone="ghost"
                  small
                  disabled={favBusyId === biz.id}
                  onClick={async () => {
                    if (usingMocks()) {
                      toggleFavorite(userId, "business", biz.id);
                      return;
                    }
                    setFavBusyId(biz.id);
                    try {
                      const res = await toggleFavoriteRemote("business", biz.id);
                      setNotice(res.ok ? (favBizIds.includes(biz.id) ? "Removed from favorites" : "Saved to favorites") : res.error);
                    } finally {
                      setFavBusyId("");
                    }
                  }}
                >
                  {favBusyId === biz.id ? "Saving…" : favBizIds.includes(biz.id) ? "Saved" : "Save"}
                </Button>
              </div>
            </article>
          ))}
        </div>
        {notice ? <p className="tiny" style={{ color: "var(--lavender)", margin: 0 }}>{notice}</p> : null}
      </section>

      <section className="stack">
        <div className="section-head" style={{ marginTop: 4 }}>
          <h2>Popular Services</h2>
          <Link href="/explore?tab=services" className="tiny">
            Explore services
          </Link>
        </div>
        <div className="grid-3">
          {popularServices.map((svc) => {
            const biz = state.businesses.find((b) => b.id === svc.businessId);
            return (
              <Link key={svc.id} href={`/services/${svc.id}`} className="panel stack" style={{ gap: 6 }}>
                <strong>{svc.name}</strong>
                <span className="tiny">{biz?.name} · {svc.durationMinutes} min</span>
                <strong className="tabular">{svc.price === 0 ? "Free" : formatMoney(svc.price)}</strong>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="stack">
        <div className="section-head" style={{ marginTop: 4 }}>
          <h2>Marketplace Picks</h2>
          <Link href="/marketplace" className="tiny">
            Open marketplace →
          </Link>
        </div>
        <div className="grid-4">
          {recommendedProducts.map((product) => {
            const seller = state.businesses.find((b) => b.id === product.businessId);
            return (
              <Link key={product.id} href={`/marketplace/${product.id}`} className="card">
                <img className="cover" src={product.imageUrl} alt={product.name} referrerPolicy="no-referrer" />
                <div className="body stack" style={{ gap: 4 }}>
                  <strong>{product.name}</strong>
                  <span className="tiny">{seller?.name}</span>
                  <strong className="tabular">{formatMoney(product.price)}</strong>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="panel stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>Recent Orders</h2>
          <Link href="/orders" className="tiny">
            Order history →
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <p className="muted">No orders placed yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Seller</th>
                <th>Date</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.map((order) => {
                const seller = state.businesses.find((b) => b.id === order.sellerId);
                const st = orderStatus(order.status);
                return (
                  <tr key={order.id}>
                    <td>
                      <Link href={`/orders/${order.id}`} style={{ fontWeight: 600 }}>
                        {order.items[0]?.name ?? order.id}
                      </Link>
                    </td>
                    <td className="tiny">{seller?.name}</td>
                    <td className="tiny">{formatDate(order.createdAt)}</td>
                    <td className="tabular">{formatMoney(order.total)}</td>
                    <td>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
