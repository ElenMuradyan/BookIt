"use client";

import { useBookItState } from "@bookit/api-client";
import { formatMoney, formatNumber } from "@bookit/utils";
import { AreaChart } from "@/components/Charts";
import { Bars } from "@/components/ui";

export default function AdminAnalyticsPage() {
  const state = useBookItState();
  const stats = state.platformStats;

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <h1 style={{ margin: 0 }}>Platform Analytics</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Growth, booking volume, and marketplace revenue trends (demo aggregate dataset).
        </p>
      </div>

      <div className="grid-4">
        <div className="panel stat">
          <span className="tiny">Total Bookings</span>
          <strong className="tabular">{formatNumber(stats.totalBookings)}</strong>
        </div>
        <div className="panel stat">
          <span className="tiny">Total Orders</span>
          <strong className="tabular">{formatNumber(stats.totalOrders)}</strong>
        </div>
        <div className="panel stat">
          <span className="tiny">Approved Businesses</span>
          <strong className="tabular">{formatNumber(stats.approvedBusinesses)}</strong>
        </div>
        <div className="panel stat">
          <span className="tiny">Platform Revenue</span>
          <strong className="tabular">{formatMoney(stats.platformRevenue)}</strong>
        </div>
      </div>

      <div className="grid-2">
        <section className="panel stack">
          <h3 style={{ margin: 0 }}>Revenue Trend</h3>
          <AreaChart points={state.revenueSeries} />
        </section>
        <section className="panel stack">
          <h3 style={{ margin: 0 }}>Business Growth</h3>
          <AreaChart points={state.growthSeries} money={false} />
        </section>
      </div>

      <section className="panel stack">
        <h3 style={{ margin: 0 }}>Weekly Booking Volume</h3>
        <Bars points={state.bookingSeries} />
      </section>
    </div>
  );
}
