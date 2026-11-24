"use client";

import {
  addReview,
  displayUser,
  rescheduleAppointment,
  rescheduleAppointmentRemote,
  resourcesForBusiness,
  sendBusinessMessage,
  setAppointmentStatus,
  setAppointmentStatusRemote,
  setUniversalBookingStatus,
  setUniversalBookingStatusRemote,
  universalBookingById,
  useBookItState,
  usingMocks,
} from "@bookit/api-client";
import { appointmentStatus, universalBookingStatus } from "@bookit/ui";
import {
  addDays,
  availableSlots,
  bookingModelLabel,
  bookingTotals,
  DEMO_TODAY,
  formatDateTime,
  formatMoney,
} from "@bookit/utils";
import Link from "next/link";
import { use, useMemo, useState } from "react";
import { Badge, Button, Empty, Field, Modal } from "@/components/ui";
import { useAuth } from "@/lib/session";

export default function BookingDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const auth = useAuth();
  const state = useBookItState();
  const apt = state.appointments.find((a) => a.id === id);
  const ub = universalBookingById(state, id);

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
  const [errorMsg, setErrorMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const bizId = apt?.businessId ?? ub?.businessId ?? "";
  const biz = bizId ? state.businesses.find((b) => b.id === bizId) : undefined;
  const svc = apt ? state.services.find((s) => s.id === apt.serviceId) : undefined;
  const emp = apt ? state.employees.find((e) => e.id === apt.employeeId) : undefined;
  const resources = bizId ? resourcesForBusiness(state, bizId, true) : [];

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

  // Universal booking detail view (hotel stay, restaurant table, event tickets, class)
  if (!apt && ub) {
    if (auth.userId && ub.customerId !== auth.userId && !auth.user?.isPlatformAdmin) {
      return <Empty title="Booking not found" body="Check your bookings list for active reservations." />;
    }
    const st = universalBookingStatus(ub.status);
    const alloc = ub.resourceAllocations[0];
    const res = alloc ? resources.find((r) => r.id === alloc.resourceId) : undefined;
    return (
      <div className="panel stack" style={{ maxWidth: 680, gap: 14 }}>
        <Link href="/bookings" className="tiny">
          ← Back to My Bookings
        </Link>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div>
            <span className="tiny tabular">Booking #{ub.id}</span>
            <h1 style={{ margin: "2px 0 0" }}>{ub.title}</h1>
          </div>
          <div className="row">
            <Badge tone="brand">{bookingModelLabel(ub.bookingModel)}</Badge>
            <Badge tone={st.tone}>{st.label}</Badge>
          </div>
        </div>
        {notice ? <div className="notice">{notice}</div> : null}
        {errorMsg ? <p className="error">{errorMsg}</p> : null}

        <div className="stack" style={{ gap: 6 }}>
          <div>
            <span className="muted">Business:</span>{" "}
            <Link href={`/business/${ub.businessId}`} style={{ fontWeight: 600 }}>
              {biz?.name ?? ub.businessId}
            </Link>
          </div>
          {res ? (
            <div>
              <span className="muted">Space / Resource:</span> {res.name}
            </div>
          ) : null}
          {ub.startAt ? (
            <div className="tabular">
              <span className="muted">Schedule:</span> {formatDateTime(ub.startAt)}
              {ub.endAt ? ` → ${formatDateTime(ub.endAt)}` : ""} ({ub.timezone})
            </div>
          ) : null}
          {alloc ? (
            <div>
              <span className="muted">Party / Units:</span> {alloc.partySize} guest(s) · {alloc.quantityUnits} unit(s)
            </div>
          ) : null}
          {ub.checkInCode ? (
            <div className="select-card stack" style={{ gap: 4, marginTop: 6 }}>
              <span className="tiny">Front-Desk Check-In Code</span>
              <strong className="tabular" style={{ fontSize: 18 }}>{ub.checkInCode}</strong>
            </div>
          ) : null}
          {ub.ticketPasses.length > 0 ? (
            <div className="stack" style={{ gap: 8, marginTop: 6 }}>
              <strong style={{ fontSize: 14 }}>Ticket Passes ({ub.ticketPasses.length})</strong>
              {ub.ticketPasses.map((pass) => (
                <div key={pass.id} className="select-card row" style={{ justifyContent: "space-between" }}>
                  <div>
                    <strong className="tabular">{pass.passCode}</strong>
                    <div className="tiny">
                      {pass.attendeeName || "Guest"} · {formatMoney(pass.unitPrice)}
                    </div>
                  </div>
                  <Badge tone={pass.status === "checked_in" ? "info" : pass.status === "valid" ? "success" : "neutral"}>
                    {pass.status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : null}
          <div className="tabular" style={{ marginTop: 6 }}>
            <span className="muted">Subtotal:</span> {formatMoney(ub.subtotalAmount)} + Tax {formatMoney(ub.taxAmount)} ={" "}
            <strong>{formatMoney(ub.totalAmount)}</strong> ({ub.paymentStatus}
            {ub.paymentMethod ? ` · ${ub.paymentMethod.replaceAll("_", " ")}` : ""})
          </div>
          {ub.depositDueAmount > 0 ? (
            <div className="tabular">
              <span className="muted">Deposit required:</span> {formatMoney(ub.depositDueAmount)}
            </div>
          ) : null}
          {ub.cancellationCutoffAt ? (
            <div className="tiny tabular">
              Free cancellation before: {formatDateTime(ub.cancellationCutoffAt)}
            </div>
          ) : null}
          {ub.notes ? (
            <div>
              <span className="muted">Notes:</span> {ub.notes}
            </div>
          ) : null}
          <div className="tiny">{ub.cancellationPolicySnapshot ?? biz?.cancellationPolicy}</div>
        </div>

        <div className="row" style={{ flexWrap: "wrap" }}>
          {["held", "pending", "confirmed"].includes(ub.status) && auth.userId ? (
            <Button
              tone="danger"
              disabled={busy}
              onClick={async () => {
                setErrorMsg("");
                setNotice("");
                setBusy(true);
                try {
                  const resCancel = usingMocks()
                    ? setUniversalBookingStatus(ub.id, "cancelled", auth.userId!)
                    : await setUniversalBookingStatusRemote(ub.id, "cancelled", "Customer cancelled");
                  if (!resCancel.ok) {
                    setErrorMsg(resCancel.error);
                    return;
                  }
                  setNotice("Booking cancelled.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Cancelling..." : "Cancel booking"}
            </Button>
          ) : null}
          <Button tone="ghost" onClick={() => setShowMessage(true)}>
            Contact business
          </Button>
          <Link href={`/book/${ub.businessId}?model=${ub.bookingModel}`} className="btn ghost">
            Book again
          </Link>
        </div>

        {showMessage ? (
          <Modal title={`Message ${biz?.name ?? "business"}`} onClose={() => setShowMessage(false)}>
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                if (!auth.userId) return;
                const resMsg = sendBusinessMessage(auth.userId, ub.businessId, messageBody);
                if (resMsg.ok) {
                  setNotice("Message sent to business.");
                  setMessageBody("");
                  setShowMessage(false);
                }
              }}
            >
              <Field label="Message">
                <textarea value={messageBody} onChange={(e) => setMessageBody(e.target.value)} placeholder="Question or update..." />
              </Field>
              <Button type="submit">Send message</Button>
            </form>
          </Modal>
        ) : null}
      </div>
    );
  }

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
      {errorMsg ? <p className="error">{errorMsg}</p> : null}
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
        {apt.checkInCode ? (
          <div className="tabular">
            <span className="muted">Check-in Code:</span> <strong>{apt.checkInCode}</strong>
          </div>
        ) : null}
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
                setErrorMsg("");
                setNewDate(apt.start.slice(0, 10) || addDays(DEMO_TODAY, 1));
                setShowReschedule(true);
              }}
            >
              Reschedule
            </Button>
            <Button
              tone="danger"
              disabled={busy}
              onClick={async () => {
                setErrorMsg("");
                setNotice("");
                setBusy(true);
                try {
                  const resCancel = usingMocks()
                    ? setAppointmentStatus(apt.id, "cancelled", auth.userId!)
                    : await setAppointmentStatusRemote(apt.id, "cancelled", "Customer cancelled");
                  if (!resCancel.ok) {
                    setErrorMsg(resCancel.error);
                    return;
                  }
                  setNotice("Appointment cancelled.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Cancelling..." : "Cancel booking"}
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
            onSubmit={async (e) => {
              e.preventDefault();
              if (!auth.userId || !selectedSlot) return;
              setErrorMsg("");
              setBusy(true);
              try {
                const resMove = usingMocks()
                  ? rescheduleAppointment(apt.id, newDate, selectedSlot, auth.userId)
                  : await rescheduleAppointmentRemote(apt.id, newDate, selectedSlot);
                if (!resMove.ok) {
                  setErrorMsg(resMove.error);
                  return;
                }
                setNotice(`Rescheduled to ${newDate} at ${selectedSlot}.`);
                setShowReschedule(false);
              } finally {
                setBusy(false);
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
            {errorMsg ? <p className="error">{errorMsg}</p> : null}
            <Button type="submit" disabled={busy || !selectedSlot}>
              {busy ? "Saving..." : "Save new time"}
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
