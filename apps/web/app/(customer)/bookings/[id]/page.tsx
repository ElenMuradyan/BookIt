"use client";

import {
  addReview,
  displayUser,
  rescheduleAppointment,
  sendBusinessMessage,
  setAppointmentStatus,
  useBookItState,
} from "@bookit/api-client";
import { appointmentStatus } from "@bookit/ui";
import { addDays, availableSlots, bookingTotals, DEMO_TODAY, formatDateTime, formatMoney } from "@bookit/utils";
import Link from "next/link";
import { use, useMemo, useState } from "react";
import { Badge, Button, Empty, Field, Modal } from "@/components/ui";
import { useAuth } from "@/lib/session";

export default function BookingDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const auth = useAuth();
  const state = useBookItState();
  const apt = state.appointments.find((a) => a.id === id);

  const [showReschedule, setShowReschedule] = useState(false);
  const [newDate, setNewDate] = useState(apt ? apt.start.slice(0, 10) : addDays(DEMO_TODAY, 1));
  const [newTime, setNewTime] = useState("");
  const [showReview, setShowReview] = useState(false);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [showMessage, setShowMessage] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const [notice, setNotice] = useState("");

  const biz = apt ? state.businesses.find((b) => b.id === apt.businessId) : undefined;
  const svc = apt ? state.services.find((s) => s.id === apt.serviceId) : undefined;
  const emp = apt ? state.employees.find((e) => e.id === apt.employeeId) : undefined;

  const openSlots = useMemo(() => {
    if (!apt || !biz || !svc) return [];
    return availableSlots({
      date: newDate,
      service: svc,
      employees: state.employees.filter((e) => e.businessId === biz.id),
      appointments: state.appointments.filter((a) => a.businessId === biz.id && a.id !== apt.id),
      hours: biz.hours,
      holidays: biz.holidays,
      blocked: biz.blocked,
      employeeId: apt.employeeId,
    });
  }, [apt, biz, svc, newDate, state.employees, state.appointments]);

  if (!apt || (auth.userId && apt.customerId !== auth.userId && !auth.user?.isPlatformAdmin)) {
    return <Empty title="Booking not found" body="Check your bookings list for active appointments." />;
  }

  const st = appointmentStatus(apt.status);
  const totals = bookingTotals(apt.price);
  const selectedSlot = newTime && openSlots.includes(newTime) ? newTime : openSlots[0] ?? "";

  return (
    <div className="panel stack" style={{ maxWidth: 680, gap: 14 }}>
      <Link href="/bookings" className="tiny">
        ← Back to My Bookings
      </Link>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <span className="tiny tabular">Booking #{apt.id}</span>
          <h1 style={{ margin: "2px 0 0" }}>{svc?.name ?? "Appointment"}</h1>
        </div>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      {notice ? <div className="notice">{notice}</div> : null}
      <div className="stack" style={{ gap: 6 }}>
        <div>
          <span className="muted">Business:</span>{" "}
          <Link href={`/business/${apt.businessId}`} style={{ fontWeight: 600 }}>
            {biz?.name}
          </Link>
        </div>
        <div>
          <span className="muted">Specialist:</span> {emp ? displayUser(state, emp.userId) : "Staff"}
        </div>
        <div className="tabular">
          <span className="muted">When:</span> {formatDateTime(apt.start)}
        </div>
        <div className="tabular">
          <span className="muted">Service Fee:</span> {formatMoney(totals.subtotal)} + Est. Tax {formatMoney(totals.tax)} ={" "}
          <strong>{formatMoney(totals.total)}</strong> ({apt.paymentStatus}
          {apt.paymentMethod ? ` · ${apt.paymentMethod.replaceAll("_", " ")}` : ""})
        </div>
        {apt.notes ? (
          <div>
            <span className="muted">Your notes:</span> {apt.notes}
          </div>
        ) : null}
        <div className="tiny">{biz?.cancellationPolicy}</div>
      </div>
      <div className="row" style={{ flexWrap: "wrap" }}>
        {(apt.status === "pending" || apt.status === "confirmed") && auth.userId ? (
          <>
            <Button
              tone="soft"
              onClick={() => {
                setNewDate(apt.start.slice(0, 10) || addDays(DEMO_TODAY, 1));
                setShowReschedule(true);
              }}
            >
              Reschedule
            </Button>
            <Button
              tone="danger"
              onClick={() => {
                setAppointmentStatus(apt.id, "cancelled", auth.userId!);
                setNotice("Appointment cancelled.");
              }}
            >
              Cancel booking
            </Button>
          </>
        ) : null}
        {apt.status === "completed" ? (
          <Button tone="soft" onClick={() => setShowReview(true)}>
            Leave review
          </Button>
        ) : null}
        <Button tone="ghost" onClick={() => setShowMessage(true)}>
          Contact business
        </Button>
        <Link href={`/book/${apt.businessId}?service=${apt.serviceId}`} className="btn ghost">
          Book again
        </Link>
      </div>

      {showReschedule ? (
        <Modal title="Reschedule appointment" onClose={() => setShowReschedule(false)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (!auth.userId || !selectedSlot) return;
              const res = rescheduleAppointment(apt.id, newDate, selectedSlot, auth.userId);
              if (res.ok) {
                setNotice(`Rescheduled to ${newDate} at ${selectedSlot}.`);
                setShowReschedule(false);
              }
            }}
          >
            <Field label="Choose date">
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
              <span className="tiny">Available time slots</span>
              {openSlots.length === 0 ? (
                <p className="muted">No available slots on this date. Pick another day.</p>
              ) : (
                <div className="chips">
                  {openSlots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      className={`slot tabular ${selectedSlot === slot ? "on" : ""}`}
                      onClick={() => setNewTime(slot)}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button type="submit" disabled={!selectedSlot}>
              Save new time
            </Button>
          </form>
        </Modal>
      ) : null}

      {showReview ? (
        <Modal title="Leave a review" onClose={() => setShowReview(false)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (!auth.userId) return;
              const res = addReview({
                authorId: auth.userId,
                businessId: apt.businessId,
                appointmentId: apt.id,
                rating,
                title,
                body,
              });
              if (res.ok) {
                setNotice("Review published.");
                setTitle("");
                setBody("");
                setShowReview(false);
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

      {showMessage ? (
        <Modal title={`Message ${biz?.name ?? "business"}`} onClose={() => setShowMessage(false)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (!auth.userId) return;
              const res = sendBusinessMessage(auth.userId, apt.businessId, messageBody);
              if (res.ok) {
                setNotice("Message sent to business.");
                setMessageBody("");
                setShowMessage(false);
              }
            }}
          >
            <Field label="Message">
              <textarea value={messageBody} onChange={(e) => setMessageBody(e.target.value)} placeholder="Question or update for the provider..." />
            </Field>
            <Button type="submit">Send message</Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

