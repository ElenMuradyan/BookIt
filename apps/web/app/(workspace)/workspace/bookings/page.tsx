"use client";

import {
  businessAppointments,
  displayUser,
  rescheduleAppointment,
  setAppointmentStatus,
  updateAppointmentNotes,
  useBookItState,
} from "@bookit/api-client";
import type { Appointment } from "@bookit/types";
import { appointmentStatus } from "@bookit/ui";
import { addDays, availableSlots, can, DEMO_TODAY, formatDateTime, formatMoney } from "@bookit/utils";
import { useState } from "react";
import { Badge, Button, Empty, Field, Modal } from "@/components/ui";
import { useAuth } from "@/lib/session";

const TABS = ["all", "pending", "confirmed", "completed", "cancelled", "rejected", "no_show"] as const;

export default function WorkspaceBookingsPage() {
  const auth = useAuth();
  const state = useBookItState();
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [notesTarget, setNotesTarget] = useState<Appointment | null>(null);
  const [noteText, setNoteText] = useState("");
  const [date, setDate] = useState(addDays(DEMO_TODAY, 1));
  const [time, setTime] = useState("10:00");

  if (!auth.workspace || !auth.userId) return null;
  const bizId = auth.workspace.businessId;
  const biz = state.businesses.find((b) => b.id === bizId);
  const canManage = can(auth.workspace.role, "bookings.manage");
  const canViewCustomers = can(auth.workspace.role, "customers.view");
  const rows = businessAppointments(state, bizId).filter((a) => tab === "all" || a.status === tab);

  const rescheduleSvc = rescheduleTarget ? state.services.find((s) => s.id === rescheduleTarget.serviceId) : undefined;
  const openSlots =
    rescheduleTarget && rescheduleSvc && biz
      ? availableSlots({
          date,
          service: rescheduleSvc,
          employees: state.employees.filter((e) => e.businessId === bizId),
          appointments: state.appointments.filter((a) => a.businessId === bizId && a.id !== rescheduleTarget.id),
          hours: biz.hours,
          holidays: biz.holidays,
          blocked: biz.blocked,
          employeeId: rescheduleTarget.employeeId,
        })
      : [];

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
                <th>Service & Notes</th>
                <th>Employee</th>
                <th>Date & Time</th>
                <th>Price</th>
                <th>Status</th>
                {canManage ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((apt) => {
                const customer = state.users.find((u) => u.id === apt.customerId);
                const svc = state.services.find((s) => s.id === apt.serviceId);
                const emp = state.employees.find((e) => e.id === apt.employeeId);
                const st = appointmentStatus(apt.status);
                return (
                  <tr key={apt.id}>
                    <td>
                      <strong>{displayUser(state, apt.customerId)}</strong>
                      {canViewCustomers && customer ? (
                        <div className="tiny">
                          {customer.phone} · {customer.email}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      <div>{svc?.name}</div>
                      {apt.notes ? <div className="tiny">Note: {apt.notes}</div> : null}
                    </td>
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
                            <Button
                              tone="ghost"
                              small
                              onClick={() => {
                                setRescheduleTarget(apt);
                                setDate(apt.start.slice(0, 10));
                                setTime(apt.start.slice(11, 16));
                              }}
                            >
                              Reschedule
                            </Button>
                          ) : null}
                          <Button
                            tone="ghost"
                            small
                            onClick={() => {
                              setNotesTarget(apt);
                              setNoteText(apt.notes ?? "");
                            }}
                          >
                            Notes
                          </Button>
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
            {openSlots.length > 0 ? (
              <div className="stack" style={{ gap: 6 }}>
                <span className="tiny">Open slots for {date}</span>
                <div className="chips">
                  {openSlots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      className={`slot ${time === slot ? "on" : ""}`}
                      onClick={() => setTime(slot)}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="tiny">No standard open slots for this provider on {date}; enter an override time below.</p>
            )}
            <Field label="Time">
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </Field>
            <Button type="submit">Update booking</Button>
          </form>
        </Modal>
      ) : null}

      {notesTarget ? (
        <Modal title={`Notes — ${displayUser(state, notesTarget.customerId)}`} onClose={() => setNotesTarget(null)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              updateAppointmentNotes(bizId, notesTarget.id, noteText);
              setNotesTarget(null);
            }}
          >
            <Field label="Appointment notes">
              <textarea
                rows={3}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Preparation details, customer requests, or staff notes"
              />
            </Field>
            <Button type="submit">Save notes</Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
