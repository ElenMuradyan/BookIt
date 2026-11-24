"use client";

import {
  bookingConfigsForBusiness,
  businessAppointments,
  businessUniversalBookings,
  displayUser,
  offeringsForBusiness,
  resourcesForBusiness,
  sellerOrders,
  useBookItState,
} from "@bookit/api-client";
import { categoryLabels, inventoryNavLabelForBusiness, universalBookingStatus } from "@bookit/ui";
import { bookingModelLabel, can, DEMO_TODAY, formatDateTime, formatMoney, initials } from "@bookit/utils";
import Link from "next/link";
import { AreaChart, Sparkline } from "@/components/Charts";
import { Badge, Bars, Empty } from "@/components/ui";
import { useAuth } from "@/lib/session";

export default function WorkspaceOverviewPage() {
  const auth = useAuth();
  const state = useBookItState();

  if (!auth.workspace) return null;
  const bizId = auth.workspace.businessId;
  const role = auth.workspace.role;
  const biz = state.businesses.find((b) => b.id === bizId);
  if (!biz) return <Empty title="Workspace missing" body="Select another workspace from the menu." />;

  const appts = businessAppointments(state, bizId);
  const universalBks = businessUniversalBookings(state, bizId);
  const legacyCoveredIds = new Set(
    universalBks.map((b) => b.legacyAppointmentId).filter(Boolean) as string[],
  );
  const standaloneAppts = appts.filter((a) => !legacyCoveredIds.has(a.id));

  const combinedBookings = [
    ...universalBks.map((b) => ({
      id: b.id,
      customerId: b.customerId,
      title: b.title,
      start: b.startAt ?? b.createdAt,
      status: b.status,
      price: b.totalAmount,
      modelLabel: bookingModelLabel(b.bookingModel),
      meta:
        b.resourceAllocations.length > 0
          ? `Party ${b.resourceAllocations[0]!.partySize} · ${b.resourceAllocations[0]!.quantityUnits} unit(s)`
          : b.ticketPasses.length > 0
            ? `${b.ticketPasses.length} pass(es)`
            : "",
    })),
    ...standaloneAppts.map((a) => {
      const svc = state.services.find((s) => s.id === a.serviceId);
      const emp = state.employees.find((e) => e.id === a.employeeId);
      return {
        id: a.id,
        customerId: a.customerId,
        title: svc?.name ?? "Appointment",
        start: a.start,
        status: a.status,
        price: a.price,
        modelLabel: "Appointment",
        meta: emp ? displayUser(state, emp.userId) : "Staff",
      };
    }),
  ].sort((a, b) => (a.start > b.start ? 1 : -1));

  const orders = sellerOrders(state, bizId);
  const employees = state.employees.filter((e) => e.businessId === bizId);
  const resources = resourcesForBusiness(state, bizId, true);
  const offerings = offeringsForBusiness(state, bizId, undefined, true);
  const services = state.services.filter((s) => s.businessId === bizId);
  const configs = bookingConfigsForBusiness(state, bizId);

  const customerIds = new Set([
    ...combinedBookings.map((b) => b.customerId),
    ...orders.map((o) => o.userId),
  ]);

  const inactiveStatuses = new Set(["cancelled", "rejected", "expired", "no_show"]);
  const todayRevenue = combinedBookings
    .filter((b) => b.start.startsWith(DEMO_TODAY) && !inactiveStatuses.has(b.status))
    .reduce((sum, b) => sum + b.price, 0);
  const bookingRevenue = combinedBookings
    .filter((b) => !inactiveStatuses.has(b.status))
    .reduce((sum, b) => sum + b.price, 0);
  const productRev = orders
    .filter((o) => o.status !== "cancelled" && o.status !== "refunded")
    .reduce((sum, o) => sum + o.total, 0);
  const monthlyRevenue = bookingRevenue + productRev;

  const pending = combinedBookings.filter((b) => b.status === "pending" || b.status === "held").length;
  const confirmed = combinedBookings.filter((b) => b.status === "confirmed").length;
  const cancelled = combinedBookings.filter((b) => b.status === "cancelled").length;
  const upcoming = combinedBookings
    .filter((b) => b.status === "confirmed" || b.status === "pending" || b.status === "held")
    .slice(0, 6);

  const inventoryLabel = inventoryNavLabelForBusiness(biz.category, configs);
  const bookingNoun =
    biz.category === "restaurant"
      ? "Reservations"
      : biz.category === "hotel"
        ? "Stays"
        : biz.category === "events" || biz.category === "travel"
          ? "Ticket Orders"
          : "Bookings";

  return (
    <div className="stack" style={{ gap: 20 }}>
      {auth.user && !auth.user.emailVerified ? (
        <div className="notice row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
          <span>
            Verify your owner email (<strong>{auth.user.email}</strong>) to complete account security and verification.
          </span>
          <Link href={`/verify?email=${encodeURIComponent(auth.user.email)}`} className="btn small">
            Verify email
          </Link>
        </div>
      ) : null}

      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>{biz.name} Overview</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            {categoryLabels[biz.category]} · Status: <strong>{biz.status.replaceAll("_", " ")}</strong> ·{" "}
            {biz.isPublic ? "Live in public search" : "Hidden from public search until approved"}
          </p>
        </div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <Link href="/workspace/services" className="btn ghost">
            Manage {inventoryLabel}
          </Link>
          {can(role, "calendar.manage") ? (
            <Link href="/workspace/calendar?create=1" className="btn">
              + New Booking
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid-4">
        <div className="panel stat kpi-glow stack" style={{ gap: 6 }}>
          <span className="tiny">Today&apos;s Revenue</span>
          <strong className="tabular">{formatMoney(todayRevenue)}</strong>
          <Sparkline points={[220, 310, 290, 410, 380, Math.max(todayRevenue, 320)]} />
        </div>
        <div className="panel stat stack" style={{ gap: 6 }}>
          <span className="tiny">Monthly Revenue</span>
          <strong className="tabular">{formatMoney(monthlyRevenue)}</strong>
          <Sparkline points={[620, 740, 810, 920, 990, monthlyRevenue]} />
        </div>
        <div className="panel stat stack" style={{ gap: 6 }}>
          <span className="tiny">{bookingNoun}</span>
          <strong className="tabular">{combinedBookings.length}</strong>
          <span className="tiny">
            {confirmed} confirmed · {pending} pending · {cancelled} cancelled
          </span>
        </div>
        <div className="panel stat stack" style={{ gap: 6 }}>
          <span className="tiny">Active Inventory &amp; Guests</span>
          <strong className="tabular">
            {resources.length + offerings.length + services.length}
          </strong>
          <span className="tiny tabular">
            {customerIds.size} guests · {orders.length} orders ({formatMoney(productRev)})
          </span>
        </div>
      </div>

      <div className="grid-2">
        <section className="panel stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3>Weekly Revenue Trend</h3>
            <span className="tiny">Overview series</span>
          </div>
          <AreaChart points={state.revenueSeries} />
        </section>

        <section className="panel stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3>Daily {bookingNoun}</h3>
            <Link href="/workspace/bookings" className="tiny">
              Manage →
            </Link>
          </div>
          <Bars points={state.bookingSeries} />
        </section>
      </div>

      <div className="grid-2">
        <section className="panel stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3>Upcoming {bookingNoun}</h3>
            <Link href="/workspace/calendar" className="tiny">
              Open calendar →
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="muted">No upcoming bookings yet.</p>
          ) : (
            upcoming.map((item) => {
              const st = universalBookingStatus(item.status as Parameters<typeof universalBookingStatus>[0]);
              return (
                <div
                  key={item.id}
                  className="row"
                  style={{ justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--line)" }}
                >
                  <div>
                    <strong>{displayUser(state, item.customerId)}</strong>{" "}
                    <span className="tiny">({item.modelLabel})</span>
                    <div className="tiny">
                      {item.title} {item.meta ? `· ${item.meta}` : ""} · {formatDateTime(item.start)}
                    </div>
                  </div>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </div>
              );
            })
          )}
        </section>

        <section className="panel stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3>
              {biz.category === "restaurant" || biz.category === "hotel"
                ? `${inventoryLabel} Snapshot`
                : "Team Performance"}
            </h3>
            <Link
              href={
                biz.category === "restaurant" || biz.category === "hotel"
                  ? "/workspace/services"
                  : "/workspace/team"
              }
              className="tiny"
            >
              View all →
            </Link>
          </div>
          {biz.category === "restaurant" || biz.category === "hotel" ? (
            resources.length === 0 ? (
              <p className="muted">
                No {biz.category === "restaurant" ? "tables" : "rooms"} configured yet. Add them in {inventoryLabel}.
              </p>
            ) : (
              resources.slice(0, 6).map((res) => (
                <div
                  key={res.id}
                  className="row"
                  style={{ justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--line)" }}
                >
                  <div>
                    <strong>{res.name}</strong>
                    <div className="tiny">
                      {res.capacityPeople} guests · {res.unitsTotal} unit(s)
                      {res.attributes?.area ? ` · ${String(res.attributes.area)}` : ""}
                      {res.attributes?.roomType ? ` · ${String(res.attributes.roomType)}` : ""}
                    </div>
                  </div>
                  <strong className="tabular">
                    {res.basePrice === 0 ? "Free" : formatMoney(res.basePrice)}{" "}
                    <span className="tiny">{res.pricingUnit.replace("_", " ")}</span>
                  </strong>
                </div>
              ))
            )
          ) : employees.length === 0 ? (
            <p className="muted">No staff assigned yet. Add staff from the Team tab.</p>
          ) : (
            employees.map((emp) => {
              const count = appts.filter((a) => a.employeeId === emp.id).length;
              const rev = appts
                .filter((a) => a.employeeId === emp.id && a.status !== "cancelled")
                .reduce((s, a) => s + a.price, 0);
              const name = displayUser(state, emp.userId);
              return (
                <div
                  key={emp.id}
                  className="row"
                  style={{ justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--line)" }}
                >
                  <div className="person">
                    <span className="avatar">{initials(name)}</span>
                    <div>
                      <strong>{name}</strong>
                      <div className="tiny">{emp.title}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <strong className="tabular">{formatMoney(rev)}</strong>
                    <div className="tiny tabular">
                      {count} bookings · ★ {emp.rating.toFixed(1)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}
