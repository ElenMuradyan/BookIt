"use client";

import { useBookItState } from "@bookit/api-client";
import { categoryLabels } from "@bookit/ui";
import { formatDate, formatMoney, formatNumber, fullName, initials } from "@bookit/utils";
import Link from "next/link";
import { AreaChart, Sparkline } from "@/components/Charts";
import { Badge } from "@/components/ui";

export default function AdminOverviewPage() {
  const state = useBookItState();
  const stats = state.platformStats;
  const pendingApps = state.applications.filter((a) => a.status === "submitted" || a.status === "under_review");
  const recentUsers = state.users.slice(0, 5);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Platform Overview</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Headline totals are aggregate demonstration figures; operational queues reflect live in-memory state.
          </p>
        </div>
        <Link href="/admin/applications" className="btn">
          Review Queue ({pendingApps.length})
        </Link>
      </div>

      <div className="grid-4">
        <div className="panel stat stack" style={{ gap: 6 }}>
          <span className="tiny">Total Users</span>
          <strong className="tabular">{formatNumber(stats.totalUsers)}</strong>
          <span className="tiny" style={{ color: "var(--success)" }}>{stats.userDelta}</span>
          <Sparkline points={[112, 121, 129, 134, 141, 148]} />
        </div>
        <div className="panel stat stack" style={{ gap: 6 }}>
          <span className="tiny">Active Businesses</span>
          <strong className="tabular">{formatNumber(stats.approvedBusinesses)}</strong>
          <span className="tiny" style={{ color: "var(--success)" }}>{stats.businessDelta}</span>
          <Sparkline points={[2200, 2410, 2560, 2700, 2810, 2890]} />
        </div>
        <div className="panel stat stack" style={{ gap: 6 }}>
          <span className="tiny">Active Subscriptions</span>
          <strong className="tabular">{formatNumber(stats.activeSubscriptions)}</strong>
          <span className="tiny">{stats.subscriptionNote}</span>
          <Sparkline points={[2100, 2320, 2490, 2610, 2750, 2890]} />
        </div>
        <div className="panel stat kpi-glow stack" style={{ gap: 6 }}>
          <span className="tiny">Platform Revenue</span>
          <strong className="tabular">{formatMoney(stats.platformRevenue)}</strong>
          <span className="tiny" style={{ color: "var(--success)" }}>{stats.revenueDelta}</span>
          <Sparkline points={[310, 345, 390, 420, 455, 482]} />
        </div>
      </div>

      <div className="grid-2">
        <section className="panel stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <h3 style={{ margin: 0 }}>Revenue Overview</h3>
              <span className="tiny">Weekly booking fees & subscription billing</span>
            </div>
            <Link href="/admin/analytics" className="tiny">
              Analytics →
            </Link>
          </div>
          <AreaChart points={state.revenueSeries} />
        </section>

        <section className="panel stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>Pending Verification</h3>
            <Link href="/admin/applications" className="tiny">
              View all →
            </Link>
          </div>
          {pendingApps.length === 0 ? (
            <p className="muted">All applications reviewed.</p>
          ) : (
            pendingApps.map((app) => {
              const biz = state.businesses.find((b) => b.id === app.businessId);
              return (
                <Link
                  key={app.id}
                  href="/admin/applications"
                  className="select-card row"
                  style={{ justifyContent: "space-between", padding: 12 }}
                >
                  <div>
                    <strong>{biz?.name ?? app.businessId}</strong>
                    <div className="tiny">{biz ? categoryLabels[biz.category] : ""}</div>
                  </div>
                  <Badge tone="warning">{app.status.replaceAll("_", " ")}</Badge>
                </Link>
              );
            })
          )}
        </section>
      </div>

      <div className="grid-2">
        <section className="panel stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>Recent Registrations</h3>
            <Link href="/admin/users" className="tiny">
              View all →
            </Link>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Location</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentUsers.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="person">
                      <span className="avatar">{initials(fullName(user))}</span>
                      <div>
                        <strong>{fullName(user)}</strong>
                        <div className="tiny">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="tiny">{user.location ?? "Seattle, WA"}</td>
                  <td>
                    <Badge tone={user.status === "active" ? "success" : "danger"}>{user.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel stack">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>Platform Activity</h3>
            <Link href="/admin/reports" className="tiny">
              Reports ({state.reports.filter((r) => r.status === "open").length}) →
            </Link>
          </div>
          {state.appointments.slice(0, 4).map((apt) => {
            const biz = state.businesses.find((b) => b.id === apt.businessId);
            return (
              <div key={apt.id} className="row" style={{ justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--line)" }}>
                <div>
                  <strong>{biz?.name}</strong>
                  <div className="tiny">Booking {apt.id.toUpperCase()} · {formatDate(apt.start)}</div>
                </div>
                <Badge tone="brand">{apt.status}</Badge>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
