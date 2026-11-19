"use client";

import {
  businessAppointments,
  displayUser,
  sellerOrders,
  useBookItState,
} from "@bookit/api-client";
import { appointmentStatus } from "@bookit/ui";
import { can, DEMO_TODAY, formatDateTime, formatMoney, initials } from "@bookit/utils";
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
  const orders = sellerOrders(state, bizId);
  const employees = state.employees.filter((e) => e.businessId === bizId);
  const customerIds = new Set([...appts.map((a) => a.customerId), ...orders.map((o) => o.userId)]);

  const todayRevenue = appts
    .filter((a) => a.start.startsWith(DEMO_TODAY) && a.status !== "cancelled" && a.status !== "rejected")
    .reduce((sum, a) => sum + a.price, 0);
  const monthlyServiceRev = appts
    .filter((a) => a.status !== "cancelled" && a.status !== "rejected")
    .reduce((sum, a) => sum + a.price, 0);
  const productRev = orders.filter((o) => o.status !== "cancelled" && o.status !== "refunded").reduce((sum, o) => sum + o.total, 0);
  const monthlyRevenue = monthlyServiceRev + productRev;

  const pending = appts.filter((a) => a.status === "pending").length;
  const confirmed = appts.filter((a) => a.status === "confirmed").length;
  const cancelled = appts.filter((a) => a.status === "cancelled").length;
  const upcoming = appts.filter((a) => a.status === "confirmed" || a.status === "pending").slice(0, 5);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>{biz.name} Overview</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Status: <strong>{biz.status.replaceAll("_", " ")}</strong> ·{" "}
            {biz.isPublic ? "Live in public search" : "Hidden from public search until approved"}
          </p>
        </div>
        {can(role, "calendar.manage") ? (
          <Link href="/workspace/calendar?create=1" className="btn">
            + Create Appointment
          </Link>
        ) : null}
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
          <span className="tiny">Appointments</span>
          <strong className="tabular">{appts.length}</strong>
          <span className="tiny">
            {confirmed} confirmed · {pending} pending · {cancelled} cancelled
          </span>
        </div>
        <div className="panel stat stack" style={{ gap: 6 }}>
          <span className="tiny">Customers & Product Sales</span>
          <strong className="tabular">{customerIds.size}</strong>
          <span className="tiny tabular">{orders.length} orders ({formatMoney(productRev)})</span>
        </div>
      </div>

      <div className="grid-2">
        <section className="panel stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3>Weekly Revenue Trend</h3>
            <span className="tiny">Demo series</span>
          </div>
          <AreaChart points={state.revenueSeries} />
        </section>

        <section className="panel stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3>Daily Bookings</h3>
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
            <h3>Upcoming Appointments</h3>
            <Link href="/workspace/calendar" className="tiny">
              Open calendar →
            </Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="muted">No upcoming appointments.</p>
          ) : (
            upcoming.map((apt) => {
              const svc = state.services.find((s) => s.id === apt.serviceId);
              const emp = state.employees.find((e) => e.id === apt.employeeId);
              const st = appointmentStatus(apt.status);
              return (
                <div key={apt.id} className="row" style={{ justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--line)" }}>
                  <div>
                    <strong>{displayUser(state, apt.customerId)}</strong>
                    <div className="tiny">
                      {svc?.name} · {emp ? displayUser(state, emp.userId) : "Staff"} · {formatDateTime(apt.start)}
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
            <h3>Employee Performance</h3>
            <Link href="/workspace/team" className="tiny">
              Team →
            </Link>
          </div>
          {employees.length === 0 ? (
            <p className="muted">No employees assigned yet.</p>
          ) : (
            employees.map((emp) => {
              const count = appts.filter((a) => a.employeeId === emp.id).length;
              const rev = appts.filter((a) => a.employeeId === emp.id && a.status !== "cancelled").reduce((s, a) => s + a.price, 0);
              const name = displayUser(state, emp.userId);
              return (
                <div key={emp.id} className="row" style={{ justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--line)" }}>
                  <div className="person">
                    <span className="avatar">{initials(name)}</span>
                    <div>
                      <strong>{name}</strong>
                      <div className="tiny">{emp.title}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <strong className="tabular">{formatMoney(rev)}</strong>
                    <div className="tiny tabular">{count} bookings · ★ {emp.rating.toFixed(1)}</div>
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
