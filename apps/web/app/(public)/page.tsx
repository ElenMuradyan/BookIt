"use client";

import { publicBusinesses, searchBusinesses, useBookItState } from "@bookit/api-client";
import { categoryLabels } from "@bookit/ui";
import { formatMoney } from "@bookit/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const shortcuts = ["beauty", "wellness", "healthcare", "fitness", "auto", "restaurant"] as const;

export default function LandingPage() {
  const state = useBookItState();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [city, setCity] = useState("Seattle");
  const featured = publicBusinesses(state).slice(0, 3);
  const reviews = state.reviews.filter((review) => review.status === "published").slice(0, 2);
  return (
    <main className="page">
      <section className="hero">
        <span className="kicker">Seamless scheduling</span>
        <h1>Your next appointment, effortlessly booked</h1>
        <p className="lede">Discover local salons, clinics, gyms, restaurants, and shops. Book a time or buy a product from the same account.</p>
        <form
          className="search-bar"
          onSubmit={(event) => {
            event.preventDefault();
            router.push(`/login?next=${encodeURIComponent(`/explore?q=${q}&city=${city}`)}`);
          }}
        >
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="What service? Haircut, cleaning, class" aria-label="Service" />
          <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Location" aria-label="Location" />
          <button className="btn" type="submit">
            Search availability
          </button>
        </form>
      </section>

      <div className="section-head">
        <h2>Popular categories</h2>
        <Link href="/login?next=/explore" className="tiny">
          View all
        </Link>
      </div>
      <div className="grid-3">
        {shortcuts.map((category) => (
          <Link key={category} href={`/login?next=${encodeURIComponent(`/explore?category=${category}`)}`} className="panel">
            <strong>{categoryLabels[category]}</strong>
            <div className="tiny">{searchBusinesses(state, { category }).length} businesses</div>
          </Link>
        ))}
      </div>

      <div className="section-head">
        <h2>Featured businesses</h2>
      </div>
      <div className="grid-3">
        {featured.map((business) => (
          <article key={business.id} className="card">
            {business.coverUrl ? <img className="cover" src={business.coverUrl} alt="" /> : <div className="cover" />}
            <div className="body">
              <h3>{business.name}</h3>
              <div className="stars">★ {business.rating.toFixed(1)} · {business.reviewCount} reviews</div>
              <p className="tiny">{business.city} · from {formatMoney(Math.min(...state.services.filter((service) => service.businessId === business.id).map((service) => service.price), 0))}</p>
              <Link className="btn small" href={`/login?next=${encodeURIComponent(`/explore/${business.id}`)}`}>
                Book now
              </Link>
            </div>
          </article>
        ))}
      </div>

      <div className="section-head">
        <h2>Customer reviews</h2>
      </div>
      <div className="grid-2">
        {reviews.map((review) => {
          const author = state.users.find((user) => user.id === review.authorId);
          return (
            <blockquote key={review.id} className="panel" style={{ margin: 0 }}>
              <div className="stars">{"★".repeat(review.rating)}</div>
              <p>“{review.body}”</p>
              <footer className="tiny">{author ? `${author.firstName} ${author.lastName}` : "BookIt customer"}</footer>
            </blockquote>
          );
        })}
      </div>
      <footer className="footer">
        <span>© {new Date().getFullYear()} BookIt</span>
        <span className="row">
          <Link href="/legal/privacy">Privacy</Link>
          <Link href="/legal/terms">Terms</Link>
        </span>
      </footer>
    </main>
  );
}
