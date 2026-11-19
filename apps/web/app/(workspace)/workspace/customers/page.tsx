"use client";

import {
  addCustomerNote,
  businessAppointments,
  sellerOrders,
  useBookItState,
} from "@bookit/api-client";
import { can, formatDate, formatMoney, fullName, initials } from "@bookit/utils";
import { useState } from "react";
import { Badge, Button, Empty } from "@/components/ui";
import { useAuth } from "@/lib/session";

export default function WorkspaceCustomersPage() {
  const auth = useAuth();
  const state = useBookItState();
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [notice, setNotice] = useState("");

  if (!auth.workspace || !auth.userId) return null;
  const bizId = auth.workspace.businessId;
  const canNotes = can(auth.workspace.role, "customers.notes");

  const appts = businessAppointments(state, bizId);
  const orders = sellerOrders(state, bizId);
  const customerIds = [...new Set([...appts.map((a) => a.customerId), ...orders.map((o) => o.userId)])];
  const customers = customerIds
    .map((id) => state.users.find((u) => u.id === id))
    .filter((u): u is NonNullable<typeof u> => Boolean(u))
    .filter((u) => !q.trim() || `${fullName(u)} ${u.email} ${u.phone}`.toLowerCase().includes(q.trim().toLowerCase()));

  const activeCustomer = customers.find((c) => c.id === selectedId) ?? customers[0];

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Customer Management</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Booking history, purchases, and staff notes scoped to this workspace.
          </p>
        </div>
        <Button
          tone="ghost"
          small
          onClick={() => {
            setNotice("Customer CSV summary prepared in memory.");
          }}
        >
          Export CSV
        </Button>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name, email, or phone..."
        style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 14px" }}
      />

      {notice ? <div className="notice">{notice}</div> : null}

      {customers.length === 0 ? (
        <Empty title="No matching customers" body="Customers appear here after booking a service or buying a product." />
      ) : (
        <div className="split-detail">
          <div className="panel" style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Contact</th>
                  <th>Visits</th>
                  <th>Spend</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((customer) => {
                  const custAppts = appts.filter((a) => a.customerId === customer.id);
                  const custOrders = orders.filter((o) => o.userId === customer.id);
                  const spend =
                    custAppts.filter((a) => a.status !== "cancelled").reduce((s, a) => s + a.price, 0) +
                    custOrders.reduce((s, o) => s + o.total, 0);
                  const selected = activeCustomer?.id === customer.id;
                  return (
                    <tr
                      key={customer.id}
                      onClick={() => setSelectedId(customer.id)}
                      style={{
                        cursor: "pointer",
                        background: selected ? "color-mix(in srgb, var(--primary) 12%, transparent)" : undefined,
                      }}
                    >
                      <td>
                        <div className="person">
                          {customer.avatarUrl ? (
                            <img className="avatar-img" src={customer.avatarUrl} alt="" referrerPolicy="no-referrer" />
                          ) : (
                            <span className="avatar">{initials(fullName(customer))}</span>
                          )}
                          <strong>{fullName(customer)}</strong>
                        </div>
                      </td>
                      <td className="tiny">
                        {canNotes ? (
                          <>
                            {customer.email}
                            <br />
                            {customer.phone}
                          </>
                        ) : (
                          "Restricted by role"
                        )}
                      </td>
                      <td className="tabular">{custAppts.length}</td>
                      <td className="tabular">{formatMoney(spend)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {activeCustomer ? (
            <aside className="panel stack" style={{ gap: 14 }}>
              <div className="person">
                {activeCustomer.avatarUrl ? (
                  <img className="avatar-img" src={activeCustomer.avatarUrl} alt="" referrerPolicy="no-referrer" style={{ width: 52, height: 52 }} />
                ) : (
                  <span className="avatar" style={{ width: 52, height: 52 }}>{initials(fullName(activeCustomer))}</span>
                )}
                <div>
                  <h2 style={{ margin: 0 }}>{fullName(activeCustomer)}</h2>
                  <Badge tone="brand">
                    {appts.filter((a) => a.customerId === activeCustomer.id).length >= 2 ? "Returning Customer" : "Active"}
                  </Badge>
                </div>
              </div>

              {canNotes ? (
                <div className="tiny stack" style={{ gap: 4 }}>
                  <span>Email: {activeCustomer.email}</span>
                  <span>Phone: {activeCustomer.phone}</span>
                  <span>Location: {activeCustomer.location ?? "Seattle, WA"}</span>
                </div>
              ) : (
                <p className="tiny">Detailed contact fields and internal notes are hidden for your workspace role.</p>
              )}

              <div className="stack" style={{ gap: 6 }}>
                <strong style={{ fontSize: 14 }}>Booking History</strong>
                {appts
                  .filter((a) => a.customerId === activeCustomer.id)
                  .map((a) => {
                    const svc = state.services.find((s) => s.id === a.serviceId);
                    return (
                      <div key={a.id} className="select-card row" style={{ justifyContent: "space-between", padding: 10 }}>
                        <div>
                          <strong style={{ fontSize: 13 }}>{svc?.name}</strong>
                          <div className="tiny">{formatDate(a.start)}</div>
                        </div>
                        <span className="tabular">{formatMoney(a.price)}</span>
                      </div>
                    );
                  })}
              </div>

              {canNotes ? (
                <div className="stack" style={{ gap: 8 }}>
                  <strong style={{ fontSize: 14 }}>Internal Notes</strong>
                  {state.notes
                    .filter((n) => n.businessId === bizId && n.customerId === activeCustomer.id)
                    .map((note) => (
                      <div key={note.id} className="select-card" style={{ padding: 10, fontSize: 13 }}>
                        {note.body}
                      </div>
                    ))}
                  <form
                    className="stack"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const res = addCustomerNote(bizId, activeCustomer.id, auth.userId!, noteBody);
                      if (res.ok) setNoteBody("");
                    }}
                  >
                    <textarea
                      value={noteBody}
                      onChange={(e) => setNoteBody(e.target.value)}
                      placeholder="Add internal customer note..."
                      style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 12, padding: 10, minHeight: 72 }}
                    />
                    <Button type="submit" small>
                      Save note
                    </Button>
                  </form>
                </div>
              ) : null}
            </aside>
          ) : null}
        </div>
      )}
    </div>
  );
}
