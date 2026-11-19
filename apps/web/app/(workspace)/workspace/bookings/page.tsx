"use client";

import {
  businessAppointments,
  displayUser,
  rescheduleAppointment,
  setAppointmentStatus,
  useBookItState,
} from "@bookit/api-client";
import type { Appointment } from "@bookit/types";
import { appointmentStatus } from "@bookit/ui";
import { addDays, can, DEMO_TODAY, formatDateTime, formatMoney } from "@bookit/utils";
import { useState } from "react";
import { Badge, Button, Empty, Field, Modal } from "@/components/ui";
import { useAuth } from "@/lib/session";

const TABS = ["all", "pending", "confirmed", "completed", "cancelled", "rejected", "no_show"] as const;

export default function WorkspaceBookingsPage() {
  const auth = useAuth();
  const state = useBookItState();
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [date, setDate] = useState(addDays(DEMO_TODAY, 1));
  const [time, setTime] = useState("10:00");

  if (!auth.workspace || !auth.userId) return null;
  const bizId = auth.workspace.businessId;
  const biz = state.businesses.find((b) => b.id === bizId);
  const canManage = can(auth.workspace.role, "bookings.manage");
  const rows = businessAppointments(state, bizId).filter((a) => tab === "all" || a.status === tab);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Bookings Management</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Approval mode: <strong>{biz?.bookingApproval ?? "automatic"}</strong>.
          </p>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} type="button" className={`tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
            {t.replaceAll("_", " ")}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <Empty title="No bookings in this view" body="Switch status tabs or create an appointment from the calendar." />
      ) : (
        <div className="panel" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Service</th>
                <th>Employee</th>
                <th>Date & Time</th>
                <th>Price</th>
                <th>Status</th>
                {canManage ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((apt) => {
                const svc = state.services.find((s) => s.id === apt.serviceId);
                const emp = state.employees.find((e) => e.id === apt.employeeId);
                const st = appointmentStatus(apt.status);
                return (
                  <tr key={apt.id}>
                    <td>
                      <strong>{displayUser(state, apt.customerId)}</strong>
                    </td>
                    <td>{svc?.name}</td>
                    <td className="tiny">{emp ? displayUser(state, emp.userId) : "Staff"}</td>
                    <td className="tiny tabular">{formatDateTime(apt.start)}</td>
                    <td className="tabular">{formatMoney(apt.price)}</td>
                    <td>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </td>
                    {canManage ? (
                      <td>
                        <div className="row" style={{ flexWrap: "wrap" }}>
                          {apt.status === "pending" ? (
                            <>
                              <Button tone="soft" small onClick={() => setAppointmentStatus(apt.id, "confirmed", auth.userId!)}>
                                Confirm
                              </Button>
                              <Button tone="danger" small onClick={() => setAppointmentStatus(apt.id, "rejected", auth.userId!)}>
                                Reject
                              </Button>
                            </>
                          ) : null}
                          {apt.status === "confirmed" ? (
                            <>
                              <Button tone="soft" small onClick={() => setAppointmentStatus(apt.id, "completed", auth.userId!)}>
                                Complete
                              </Button>
                              <Button tone="ghost" small onClick={() => setAppointmentStatus(apt.id, "no_show", auth.userId!)}>
                                No-show
                              </Button>
                            </>
                          ) : null}
                          {apt.status === "pending" || apt.status === "confirmed" ? (
                            <Button tone="ghost" small onClick={() => setRescheduleTarget(apt)}>
                              Reschedule
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rescheduleTarget ? (
        <Modal title="Reschedule Booking" onClose={() => setRescheduleTarget(null)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              rescheduleAppointment(rescheduleTarget.id, date, time, auth.userId!);
              setRescheduleTarget(null);
            }}
          >
            <Field label="Date">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Time">
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
            <Button type="submit">Update booking</Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
