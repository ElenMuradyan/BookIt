"use client";

import {
  businessAppointments,
  businessUniversalBookings,
  checkInUniversalQr,
  checkInUniversalQrRemote,
  displayUser,
  fetchAvailabilityRemote,
  rescheduleAppointment,
  rescheduleAppointmentRemote,
  resourcesForBusiness,
  setAppointmentStatus,
  setAppointmentStatusRemote,
  setUniversalBookingStatus,
  setUniversalBookingStatusRemote,
  updateAppointmentNotes,
  updateAppointmentNotesRemote,
  useBookItState,
  usingMocks,
} from "@bookit/api-client";
import type { Appointment, AppointmentStatus, UniversalBookingStatus } from "@bookit/types";
import { appointmentStatus, universalBookingStatus } from "@bookit/ui";
import {
  addDays,
  availableSlots,
  bookingModelLabel,
  can,
  DEMO_TODAY,
  formatDateTime,
  formatMoney,
  todayInput,
} from "@bookit/utils";
import { useEffect, useState } from "react";
import { Badge, Button, Empty, Field, Modal } from "@/components/ui";
import { useAuth } from "@/lib/session";

const TABS = ["all", "pending", "confirmed", "completed", "cancelled", "rejected", "no_show"] as const;

export default function WorkspaceBookingsPage() {
  const auth = useAuth();
  const state = useBookItState();
  const today = usingMocks() ? DEMO_TODAY : todayInput();
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [notesTarget, setNotesTarget] = useState<Appointment | null>(null);
  const [noteText, setNoteText] = useState("");
  const [date, setDate] = useState(addDays(today, 1));
  const [time, setTime] = useState("10:00");
  const [checkInCode, setCheckInCode] = useState("");
  const [checkInFeedback, setCheckInFeedback] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [modalError, setModalError] = useState("");
  const [busy, setBusy] = useState(false);
  const [remoteSlots, setRemoteSlots] = useState<string[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");

  const bizId = auth.workspace?.businessId ?? "";
  useEffect(() => {
    if (!rescheduleTarget || !bizId || usingMocks()) {
      setRemoteSlots(null);
      setSlotsError("");
      return;
    }
    let active = true;
    setSlotsLoading(true);
    setSlotsError("");
    void fetchAvailabilityRemote(bizId, rescheduleTarget.serviceId, date, rescheduleTarget.employeeId).then((res) => {
      if (!active) return;
      setSlotsLoading(false);
      if (res.ok) {
        setRemoteSlots(res.data);
      } else {
        setRemoteSlots([]);
        setSlotsError(res.error);
      }
    });
    return () => {
      active = false;
    };
  }, [rescheduleTarget, bizId, date]);

  if (!auth.workspace || !auth.userId) return null;
  const actorId = auth.userId;
  const biz = state.businesses.find((b) => b.id === bizId);
  const resources = resourcesForBusiness(state, bizId, true);
  const canManage = can(auth.workspace.role, "bookings.manage");
  const canViewCustomers = can(auth.workspace.role, "customers.view");
  const rows = businessAppointments(state, bizId).filter((a) => tab === "all" || a.status === tab);
  const universalRows = businessUniversalBookings(state, bizId).filter((ub) => {
    if (ub.bookingModel === "appointment" && ub.legacyAppointmentId) return false;
    return tab === "all" || ub.status === tab;
  });

  const headingTitle =
    biz?.category === "restaurant"
      ? "Reservations Management"
      : biz?.category === "hotel"
        ? "Stays & Guests"
        : biz?.category === "events" || biz?.category === "travel"
          ? "Ticket & Tour Orders"
          : "Bookings Management";

  const rescheduleSvc = rescheduleTarget ? state.services.find((s) => s.id === rescheduleTarget.serviceId) : undefined;
  const openSlots = usingMocks()
    ? rescheduleTarget && rescheduleSvc && biz
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
      : []
    : (remoteSlots ?? []);

  async function handleAppointmentStatus(appointmentId: string, status: AppointmentStatus) {
    setCheckInFeedback(null);
    setBusy(true);
    try {
      const res = usingMocks()
        ? setAppointmentStatus(appointmentId, status, actorId)
        : await setAppointmentStatusRemote(appointmentId, status);
      if (!res.ok) {
        setCheckInFeedback({ tone: "err", text: res.error });
        return;
      }
      setCheckInFeedback({ tone: "ok", text: `Appointment updated to ${status.replaceAll("_", " ")}.` });
    } finally {
      setBusy(false);
    }
  }

  async function handleUniversalStatus(bookingId: string, status: UniversalBookingStatus) {
    setCheckInFeedback(null);
    setBusy(true);
    try {
      const res = usingMocks()
        ? setUniversalBookingStatus(bookingId, status, actorId)
        : await setUniversalBookingStatusRemote(bookingId, status);
      if (!res.ok) {
        setCheckInFeedback({ tone: "err", text: res.error });
        return;
      }
      setCheckInFeedback({ tone: "ok", text: `Booking updated to ${status.replaceAll("_", " ")}.` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>{headingTitle}</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Approval mode: <strong>{biz?.bookingApproval ?? "automatic"}</strong> · Use check-in codes or ticket passes at arrival.
          </p>
        </div>
      </div>

      {canManage ? (
        <form
          className="panel row"
          style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!checkInCode.trim()) return;
            setBusy(true);
            setCheckInFeedback(null);
            try {
              const res = usingMocks()
                ? checkInUniversalQr(bizId, checkInCode, actorId)
                : await checkInUniversalQrRemote(bizId, checkInCode);
              if (!res.ok) {
                setCheckInFeedback({ tone: "err", text: res.error });
                return;
              }
              setCheckInFeedback({
                tone: "ok",
                text: `Checked in ${res.data.kind === "ticket_pass" ? "pass" : "booking"} ${res.data.code} (${res.data.title}).`,
              });
              setCheckInCode("");
            } finally {
              setBusy(false);
            }
          }}
        >
          <div style={{ flex: 1, minWidth: 240 }}>
            <Field label="Front-Desk QR / Pass Check-In">
              <input
                value={checkInCode}
                onChange={(e) => setCheckInCode(e.target.value)}
                placeholder="Enter BK-xxxxxx or TKT-xxxxxx code..."
              />
            </Field>
          </div>
          <Button type="submit" disabled={busy || !checkInCode.trim()}>
            {busy ? "Working..." : "Check In Guest"}
          </Button>
          {checkInFeedback ? (
            <p
              className={checkInFeedback.tone === "err" ? "error" : "tiny"}
              style={{ width: "100%", margin: 0, color: checkInFeedback.tone === "ok" ? "var(--lavender)" : undefined }}
            >
              {checkInFeedback.text}
            </p>
          ) : null}
        </form>
      ) : null}

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} type="button" className={`tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
            {t.replaceAll("_", " ")}
          </button>
        ))}
      </div>

      {rows.length === 0 && universalRows.length === 0 ? (
        <Empty title="No bookings in this view" body="Switch status tabs or create a booking from your catalog or calendar." />
      ) : (
        <div className="stack" style={{ gap: 18 }}>
          {rows.length > 0 ? (
            <div className="panel" style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Service &amp; Notes</th>
                    <th>Employee</th>
                    <th>Date &amp; Time</th>
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
                                  <Button tone="soft" small disabled={busy} onClick={() => void handleAppointmentStatus(apt.id, "confirmed")}>
                                    Confirm
                                  </Button>
                                  <Button tone="danger" small disabled={busy} onClick={() => void handleAppointmentStatus(apt.id, "rejected")}>
                                    Reject
                                  </Button>
                                </>
                              ) : null}
                              {apt.status === "confirmed" ? (
                                <>
                                  <Button tone="soft" small disabled={busy} onClick={() => void handleAppointmentStatus(apt.id, "completed")}>
                                    Complete
                                  </Button>
                                  <Button tone="ghost" small disabled={busy} onClick={() => void handleAppointmentStatus(apt.id, "no_show")}>
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
                                    setModalError("");
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
                                  setModalError("");
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
          ) : null}

          {universalRows.length > 0 ? (
            <div className="panel stack" style={{ overflowX: "auto" }}>
              <div>
                <h2 style={{ margin: 0 }}>
                  {biz?.category === "restaurant"
                    ? "Table Reservations"
                    : biz?.category === "hotel"
                      ? "Room Stays & Guests"
                      : "Spaces, Events & Class Bookings"}
                </h2>
                <p className="tiny" style={{ margin: "2px 0 0" }}>
                  Resource allocations, issued event tickets, party sizes, and check-in codes.
                </p>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Booking / Space</th>
                    <th>Model</th>
                    <th>Schedule &amp; Guests</th>
                    <th>Codes &amp; Passes</th>
                    <th>Total / Deposit</th>
                    <th>Status</th>
                    {canManage ? <th>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {universalRows.map((ub) => {
                    const customer = state.users.find((u) => u.id === ub.customerId);
                    const st = universalBookingStatus(ub.status);
                    const alloc = ub.resourceAllocations[0];
                    const res = alloc ? resources.find((r) => r.id === alloc.resourceId) : undefined;
                    return (
                      <tr key={ub.id}>
                        <td>
                          <strong>{displayUser(state, ub.customerId)}</strong>
                          {canViewCustomers && customer ? (
                            <div className="tiny">
                              {customer.phone} · {customer.email}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <strong>{res?.name ?? ub.title}</strong>
                          {res && ub.title !== res.name ? <div className="tiny">{ub.title}</div> : null}
                          {ub.notes ? <div className="tiny">Note: {ub.notes}</div> : null}
                        </td>
                        <td>
                          <Badge tone="brand">{bookingModelLabel(ub.bookingModel)}</Badge>
                        </td>
                        <td className="tiny tabular">
                          <div>
                            {ub.startAt ? formatDateTime(ub.startAt) : formatDateTime(ub.createdAt)}
                            {ub.endAt && ub.bookingModel === "resource" ? ` → ${formatDateTime(ub.endAt)}` : ""}
                          </div>
                          <div>
                            {ub.quantity}x{alloc?.partySize ? ` · ${alloc.partySize} guests` : ""}
                          </div>
                        </td>
                        <td className="tiny tabular">
                          {ub.checkInCode ? <div>{ub.checkInCode}</div> : null}
                          {ub.ticketPasses.slice(0, 3).map((p) => (
                            <div key={p.id}>
                              {p.passCode} ({p.status})
                            </div>
                          ))}
                          {ub.ticketPasses.length > 3 ? <div>+{ub.ticketPasses.length - 3} more</div> : null}
                        </td>
                        <td className="tabular">
                          <div>{formatMoney(ub.totalAmount)}</div>
                          {ub.depositDueAmount > 0 ? (
                            <div className="tiny">Dep: {formatMoney(ub.depositDueAmount)}</div>
                          ) : null}
                        </td>
                        <td>
                          <Badge tone={st.tone}>{st.label}</Badge>
                        </td>
                        {canManage ? (
                          <td>
                            <div className="row" style={{ flexWrap: "wrap" }}>
                              {ub.status === "pending" || ub.status === "held" ? (
                                <>
                                  <Button tone="soft" small disabled={busy} onClick={() => void handleUniversalStatus(ub.id, "confirmed")}>
                                    Confirm
                                  </Button>
                                  <Button tone="danger" small disabled={busy} onClick={() => void handleUniversalStatus(ub.id, "rejected")}>
                                    Reject
                                  </Button>
                                </>
                              ) : null}
                              {ub.status === "confirmed" ? (
                                <>
                                  <Button tone="soft" small disabled={busy} onClick={() => void handleUniversalStatus(ub.id, "completed")}>
                                    Complete
                                  </Button>
                                  <Button tone="ghost" small disabled={busy} onClick={() => void handleUniversalStatus(ub.id, "no_show")}>
                                    No-show
                                  </Button>
                                  <Button tone="danger" small disabled={busy} onClick={() => void handleUniversalStatus(ub.id, "cancelled")}>
                                    Cancel
                                  </Button>
                                </>
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
          ) : null}
        </div>
      )}

      {rescheduleTarget ? (
        <Modal title="Reschedule Booking" onClose={() => setRescheduleTarget(null)}>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setModalError("");
              setBusy(true);
              try {
                const res = usingMocks()
                  ? rescheduleAppointment(rescheduleTarget.id, date, time, actorId)
                  : await rescheduleAppointmentRemote(rescheduleTarget.id, date, time);
                if (!res.ok) {
                  setModalError(res.error);
                  return;
                }
                setRescheduleTarget(null);
                setCheckInFeedback({ tone: "ok", text: `Rescheduled to ${date} at ${time}.` });
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Date">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            {slotsLoading ? (
              <p className="tiny">Checking live availability...</p>
            ) : slotsError ? (
              <p className="error">{slotsError}</p>
            ) : openSlots.length > 0 ? (
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
            {modalError ? <p className="error">{modalError}</p> : null}
            <Button type="submit" disabled={busy}>
              {busy ? "Updating..." : "Update booking"}
            </Button>
          </form>
        </Modal>
      ) : null}

      {notesTarget ? (
        <Modal title={`Notes — ${displayUser(state, notesTarget.customerId)}`} onClose={() => setNotesTarget(null)}>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setModalError("");
              setBusy(true);
              try {
                const res = usingMocks()
                  ? updateAppointmentNotes(bizId, notesTarget.id, noteText)
                  : await updateAppointmentNotesRemote(notesTarget.id, noteText);
                if (!res.ok) {
                  setModalError(res.error);
                  return;
                }
                setNotesTarget(null);
                setCheckInFeedback({ tone: "ok", text: "Appointment notes saved." });
              } finally {
                setBusy(false);
              }
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
            {modalError ? <p className="error">{modalError}</p> : null}
            <Button type="submit" disabled={busy}>
              {busy ? "Saving..." : "Save notes"}
            </Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
