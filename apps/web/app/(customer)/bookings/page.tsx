"use client";

import {
  addReview,
  customerAppointments,
  customerUniversalBookings,
  displayUser,
  rescheduleAppointment,
  sendBusinessMessage,
  setAppointmentStatus,
  setUniversalBookingStatus,
  setUniversalBookingStatusRemote,
  useBookItState,
  usingMocks,
} from "@bookit/api-client";
import type { Appointment } from "@bookit/types";
import { appointmentStatus, universalBookingStatus } from "@bookit/ui";
import { addDays, availableSlots, bookingModelLabel, DEMO_TODAY, formatDateTime, formatMoney } from "@bookit/utils";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Button, Empty, Field, Modal } from "@/components/ui";
import { useAuth } from "@/lib/session";

const TABS = ["upcoming", "pending", "confirmed", "completed", "cancelled"] as const;

export default function CustomerBookingsPage() {
  const auth = useAuth();
  const state = useBookItState();
  const [tab, setTab] = useState<(typeof TABS)[number]>("upcoming");
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [newDate, setNewDate] = useState(addDays(DEMO_TODAY, 2));
  const [newTime, setNewTime] = useState("11:00");
  const [messageTarget, setMessageTarget] = useState<Appointment | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [reviewTarget, setReviewTarget] = useState<Appointment | null>(null);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [notice, setNotice] = useState("");

  const rescheduleSlots = useMemo(() => {
    if (!rescheduleTarget) return [];
    const biz = state.businesses.find((b) => b.id === rescheduleTarget.businessId);
    const svc = state.services.find((s) => s.id === rescheduleTarget.serviceId);
    if (!biz || !svc) return [];
    return availableSlots({
      date: newDate,
      service: svc,
      employees: state.employees.filter((e) => e.businessId === biz.id),
      appointments: state.appointments.filter((a) => a.businessId === biz.id && a.id !== rescheduleTarget.id),
      hours: biz.hours,
      holidays: biz.holidays,
      blocked: biz.blocked,
      employeeId: rescheduleTarget.employeeId,
    });
  }, [rescheduleTarget, newDate, state.businesses, state.services, state.employees, state.appointments]);

  if (!auth.userId) return null;
  const userId = auth.userId;
  const all = customerAppointments(state, userId);
  const filtered = all.filter((apt) => {
    if (tab === "upcoming") return apt.status === "pending" || apt.status === "confirmed";
    return apt.status === tab;
  });
  const universalOnly = customerUniversalBookings(state, userId).filter((ub) => {
    if (ub.bookingModel === "appointment" && ub.legacyAppointmentId) return false;
    if (tab === "upcoming") return ["held", "pending", "confirmed"].includes(ub.status);
    return ub.status === tab;
  });

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>My Bookings</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Track upcoming, pending, completed, and cancelled appointments.
          </p>
        </div>
        <Link href="/explore" className="btn">
          + New Booking
        </Link>
      </div>

      <div className="tabs">
        {TABS.map((item) => (
          <button key={item} type="button" className={`tab ${tab === item ? "on" : ""}`} onClick={() => setTab(item)}>
            {item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>

      {notice ? <p className="tiny" style={{ color: "var(--lavender)" }}>{notice}</p> : null}

      {filtered.length === 0 && universalOnly.length === 0 ? (
        <Empty title={`No ${tab} bookings`} body="Explore approved businesses to book your next appointment, space, or event." />
      ) : (
        <div className="stack">
          {universalOnly.map((ub) => {
            const biz = state.businesses.find((b) => b.id === ub.businessId);
            const st = universalBookingStatus(ub.status);
            return (
              <article key={ub.id} className="panel stack" style={{ gap: 10 }}>
                <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
                  <div className="stack" style={{ gap: 4 }}>
                    <div className="row">
                      <strong>{ub.title}</strong>
                      <Badge tone="brand">{bookingModelLabel(ub.bookingModel)}</Badge>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                    <span className="tiny">{biz?.name}</span>
                    <span className="tiny tabular">
                      {ub.startAt ? formatDateTime(ub.startAt) : formatDateTime(ub.createdAt)} ·{" "}
                      {formatMoney(ub.totalAmount)} ({ub.paymentStatus})
                    </span>
                    {ub.checkInCode ? (
                      <span className="tiny tabular">Check-in Code: <strong>{ub.checkInCode}</strong></span>
                    ) : null}
                  </div>
                  <div className="row">
                    {["held", "pending", "confirmed"].includes(ub.status) ? (
                      <Button
                        tone="danger"
                        small
                        onClick={async () => {
                          if (usingMocks()) {
                            setUniversalBookingStatus(ub.id, "cancelled", userId);
                          } else {
                            await setUniversalBookingStatusRemote(ub.id, "cancelled", "Customer cancelled");
                          }
                          setNotice("Booking cancelled");
                        }}
                      >
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </div>
                {ub.ticketPasses.length > 0 ? (
                  <div className="chips">
                    {ub.ticketPasses.map((p) => (
                      <span key={p.id} className="slot tabular">
                        {p.passCode} · {p.status}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
          {filtered.map((apt) => {
            const biz = state.businesses.find((b) => b.id === apt.businessId);
            const svc = state.services.find((s) => s.id === apt.serviceId);
            const emp = state.employees.find((e) => e.id === apt.employeeId);
            const st = appointmentStatus(apt.status);
            return (
              <article key={apt.id} className="panel row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
                <div className="stack" style={{ gap: 4 }}>
                  <div className="row">
                    <strong>{svc?.name ?? "Service"}</strong>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                  <span className="tiny">
                    {biz?.name} · with {emp ? displayUser(state, emp.userId) : "Staff"}
                  </span>
                  <span className="tiny tabular">
                    {formatDateTime(apt.start)} · {formatMoney(apt.price)}
                  </span>
                </div>
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <Link href={`/bookings/${apt.id}`} className="btn ghost small">
                    Details
                  </Link>
                  {apt.status === "pending" || apt.status === "confirmed" ? (
                    <>
                      <Button tone="soft" small onClick={() => setRescheduleTarget(apt)}>
                        Reschedule
                      </Button>
                      <Button
                        tone="danger"
                        small
                        onClick={() => {
                          setAppointmentStatus(apt.id, "cancelled", userId);
                          setNotice("Booking cancelled");
                        }}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : null}
                  {apt.status === "completed" ? (
                    <Button tone="soft" small onClick={() => setReviewTarget(apt)}>
                      Leave review
                    </Button>
                  ) : null}
                  <Button tone="ghost" small onClick={() => setMessageTarget(apt)}>
                    Contact
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {rescheduleTarget ? (
        <Modal title="Reschedule appointment" onClose={() => setRescheduleTarget(null)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const chosen = rescheduleSlots.includes(newTime) ? newTime : rescheduleSlots[0];
              if (!chosen) return;
              const res = rescheduleAppointment(rescheduleTarget.id, newDate, chosen, userId);
              if (res.ok) {
                setNotice(`Appointment rescheduled to ${newDate} at ${chosen}`);
                setRescheduleTarget(null);
              }
            }}
          >
            <Field label="New date">
              <input
                type="date"
                value={newDate}
                onChange={(e) => {
                  setNewDate(e.target.value);
                  setNewTime("");
                }}
              />
            </Field>
            <div className="stack" style={{ gap: 6 }}>
              <span className="tiny">Available slots</span>
              {rescheduleSlots.length === 0 ? (
                <p className="muted">Closed or booked out on this date. Pick another day.</p>
              ) : (
                <div className="chips">
                  {rescheduleSlots.map((slot) => {
                    const activeSlot = rescheduleSlots.includes(newTime) ? newTime : rescheduleSlots[0];
                    return (
                      <button
                        key={slot}
                        type="button"
                        className={`slot tabular ${activeSlot === slot ? "on" : ""}`}
                        onClick={() => setNewTime(slot)}
                      >
                        {slot}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <Button type="submit" disabled={rescheduleSlots.length === 0}>
              Save new time
            </Button>
          </form>
        </Modal>
      ) : null}

      {messageTarget ? (
        <Modal title="Message business" onClose={() => setMessageTarget(null)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const res = sendBusinessMessage(userId, messageTarget.businessId, messageBody);
              if (res.ok) {
                setNotice("Message sent");
                setMessageBody("");
                setMessageTarget(null);
              }
            }}
          >
            <Field label="Message">
              <textarea value={messageBody} onChange={(e) => setMessageBody(e.target.value)} placeholder="Running 10 minutes late..." />
            </Field>
            <Button type="submit">Send message</Button>
          </form>
        </Modal>
      ) : null}

      {reviewTarget ? (
        <Modal title="Leave a review" onClose={() => setReviewTarget(null)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const res = addReview({
                authorId: userId,
                businessId: reviewTarget.businessId,
                appointmentId: reviewTarget.id,
                rating,
                title,
                body,
              });
              if (res.ok) {
                setNotice("Review published");
                setTitle("");
                setBody("");
                setReviewTarget(null);
              }
            }}
          >
            <Field label="Rating">
              <select value={rating} onChange={(e) => setRating(Number(e.target.value))}>
                {[5, 4, 3, 2, 1].map((n) => (
                  <option key={n} value={n}>
                    {n} stars
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Headline">
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Details">
              <textarea value={body} onChange={(e) => setBody(e.target.value)} />
            </Field>
            <Button type="submit">Submit review</Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
