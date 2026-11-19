"use client";

import {
  createAppointment,
  displayUser,
  publicBusinessById,
  servicesForBusiness,
  useBookItState,
} from "@bookit/api-client";
import type { PaymentMethod } from "@bookit/types";
import { addDays, availableSlots, bookingTotals, DEMO_TODAY, formatDate, formatMoney, initials } from "@bookit/utils";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, use, useMemo, useState } from "react";
import { Badge, Button, Empty } from "@/components/ui";
import { useAuth } from "@/lib/session";

const DATES = Array.from({ length: 7 }, (_, i) => addDays(DEMO_TODAY, i));

function BookingFlow({ businessId }: { businessId: string }) {
  const auth = useAuth();
  const state = useBookItState();
  const params = useSearchParams();
  const business = publicBusinessById(state, businessId);
  const rawBusiness = state.businesses.find((b) => b.id === businessId);
  const services = business ? servicesForBusiness(state, business.id) : [];
  const employees = business ? state.employees.filter((e) => e.businessId === business.id) : [];

  const [serviceId, setServiceId] = useState(params.get("service") || services[0]?.id || "");
  const [employeeId, setEmployeeId] = useState(params.get("employee") || "");
  const [date, setDate] = useState(DATES[1] ?? DEMO_TODAY);
  const [time, setTime] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("in_person");
  const [notes, setNotes] = useState("");
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [error, setError] = useState("");
  const [confirmedId, setConfirmedId] = useState("");

  const activeService = services.find((s) => s.id === serviceId) ?? services[0];
  const eligibleEmployees = activeService
    ? employees.filter((e) => activeService.employeeIds.includes(e.id) || activeService.employeeIds.length === 0)
    : employees;
  const activeEmployee = eligibleEmployees.find((e) => e.id === employeeId) ?? eligibleEmployees[0];

  const slots = useMemo(() => {
    if (!business || !activeService) return [];
    return availableSlots({
      date,
      service: activeService,
      employees,
      appointments: state.appointments,
      hours: business.hours,
      holidays: rawBusiness?.holidays ?? [],
      blocked: rawBusiness?.blocked ?? [],
      employeeId: employeeId || undefined,
    });
  }, [activeService, business, rawBusiness, date, employeeId, employees, state.appointments]);

  if (!business) return <Empty title="Business unavailable" body="Only approved businesses accept bookings." />;
  if (!activeService) return <Empty title="No services available" body="This business has not published services yet." />;

  const { subtotal, tax, total } = bookingTotals(activeService.price);
  const confirmedApt = confirmedId ? state.appointments.find((a) => a.id === confirmedId) : undefined;

  if (confirmedId) {
    return (
      <div className="panel stack" style={{ maxWidth: 640, gap: 14 }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <Badge tone={confirmedApt?.status === "pending" ? "warning" : "success"}>
            {confirmedApt?.status === "pending" ? "Approval requested" : "Booking confirmed"}
          </Badge>
          <span className="tiny tabular">Reference #{confirmedId}</span>
        </div>
        <h1 style={{ margin: 0 }}>You&apos;re booked at {business.name}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {activeService.name} ({activeService.durationMinutes} min) with{" "}
          {activeEmployee ? displayUser(state, activeEmployee.userId) : "Team member"} on{" "}
          {formatDate(`${date}T12:00:00`, { weekday: "long", month: "short", day: "numeric" })} at {time}.
        </p>
        <div className="select-card stack" style={{ gap: 6 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="tiny">Service Fee</span>
            <span className="tabular">{formatMoney(subtotal)}</span>
          </div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="tiny">Estimated Tax (8%)</span>
            <span className="tabular">{formatMoney(tax)}</span>
          </div>
          <div className="row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: 6 }}>
            <strong>Total</strong>
            <strong className="tabular">{formatMoney(total)}</strong>
          </div>
          <div className="tiny">
            Payment method: {paymentMethod.replaceAll("_", " ")} · {business.address}, {business.city}
          </div>
        </div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <Link href={`/bookings/${confirmedId}`} className="btn">
            View booking details
          </Link>
          <Link href="/bookings" className="btn ghost">
            My Bookings
          </Link>
          <Link href={`/business/${business.id}`} className="btn ghost">
            Back to {business.name}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <Link href={`/business/${business.id}`} className="tiny">
            ← {business.name}
          </Link>
          <h1 style={{ margin: "4px 0 0" }}>Book an appointment</h1>
        </div>
      </div>

      <div className="stepper">
        {[
          [1, "Service"],
          [2, "Professional"],
          [3, "Date & Time"],
          [4, "Confirm"],
        ].map(([num, label], idx) => (
          <div key={num} className="row" style={{ flex: idx < 3 ? 1 : undefined }}>
            <button
              type="button"
              className={`step-item ${step === num ? "active" : step > Number(num) ? "done" : ""}`}
              style={{ background: "transparent", border: 0, cursor: "pointer", padding: 0 }}
              onClick={() => setStep(num as 1 | 2 | 3 | 4)}
            >
              <span className="step-dot">{num}</span>
              <span>{label}</span>
            </button>
            {idx < 3 ? <span className="step-line" /> : null}
          </div>
        ))}
      </div>

      <div className="split-detail">
        <div className="stack" style={{ gap: 18 }}>
          <section className="panel stack">
            <h3>1. Select Service</h3>
            <div className="grid-3">
              {services.map((service) => (
                <button
                  key={service.id}
                  type="button"
                  className={`select-card stack ${activeService.id === service.id ? "on" : ""}`}
                  style={{ gap: 6 }}
                  onClick={() => {
                    setServiceId(service.id);
                    setEmployeeId("");
                    setTime("");
                    setStep(2);
                  }}
                >
                  <strong>{service.name}</strong>
                  <span className="tiny">
                    {service.durationMinutes} min · {service.price === 0 ? "Free" : formatMoney(service.price)}
                  </span>
                </button>
              ))}
            </div>
          </section>

          <section className="panel stack">
            <h3>2. Select Staff</h3>
            <div className="grid-3">
              {eligibleEmployees.map((emp) => {
                const user = state.users.find((u) => u.id === emp.userId);
                const name = displayUser(state, emp.userId);
                const selected = (employeeId || activeEmployee?.id) === emp.id;
                return (
                  <button
                    key={emp.id}
                    type="button"
                    className={`select-card person ${selected ? "on" : ""}`}
                    onClick={() => {
                      setEmployeeId(emp.id);
                      setTime("");
                      setStep(3);
                    }}
                  >
                    {user?.avatarUrl ? (
                      <img className="avatar-img" src={user.avatarUrl} alt={name} referrerPolicy="no-referrer" />
                    ) : (
                      <span className="avatar">{initials(name)}</span>
                    )}
                    <div>
                      <strong style={{ fontSize: 14 }}>{name}</strong>
                      <div className="tiny">{emp.title}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="panel stack">
            <h3>3. Select Date & Time</h3>
            <div className="chips">
              {DATES.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`slot ${date === d ? "on" : ""}`}
                  onClick={() => {
                    setDate(d);
                    setTime("");
                  }}
                >
                  {formatDate(`${d}T12:00:00`, { weekday: "short", month: "short", day: "numeric" })}
                </button>
              ))}
            </div>
            <div className="chips" style={{ marginTop: 6 }}>
              {slots.length === 0 ? (
                <p className="muted">No open times on this day. Pick another date.</p>
              ) : (
                slots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    className={`slot tabular ${time === slot ? "on" : ""}`}
                    onClick={() => {
                      setTime(slot);
                      setStep(4);
                    }}
                  >
                    {slot}
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="panel stack">
            <h3>4. Payment &amp; Notes</h3>
            <div className="chips">
              {(
                [
                  ["in_person", "Pay at venue"],
                  ["wallet", "BookIt demo wallet"],
                  ["card_token_pending", "Card (API pending)"],
                ] as const
              ).map(([method, label]) => (
                <button
                  key={method}
                  type="button"
                  className={`slot ${paymentMethod === method ? "on" : ""}`}
                  onClick={() => setPaymentMethod(method)}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="field">
              <span>Notes for your provider (optional)</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Allergies, accessibility preferences, or styling notes..."
              />
            </label>
            <p className="tiny" style={{ margin: 0 }}>
              Payment card numbers are never collected in the frontend preview.
            </p>
          </section>
        </div>

        <aside className="panel stack" style={{ position: "sticky", top: 84 }}>
          <h2 style={{ margin: 0 }}>Booking Summary</h2>
          <div className="select-card stack" style={{ gap: 4 }}>
            <strong>{activeService.name}</strong>
            <span className="tiny">with {activeEmployee ? displayUser(state, activeEmployee.userId) : "Staff"}</span>
            <span className="tiny">
              {formatDate(`${date}T12:00:00`, { weekday: "long", month: "short", day: "numeric" })}
              {time ? ` · ${time}` : " · Select a time"}
            </span>
          </div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="muted">Duration</span>
            <span className="tabular">{activeService.durationMinutes} min</span>
          </div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="muted">Service Fee</span>
            <span className="tabular">{formatMoney(subtotal)}</span>
          </div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="muted">Estimated Tax (8%)</span>
            <span className="tabular">{formatMoney(tax)}</span>
          </div>
          <div className="row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <strong>Total</strong>
            <strong className="tabular" style={{ fontSize: 20 }}>
              {formatMoney(total)}
            </strong>
          </div>
          {error ? <p className="error">{error}</p> : null}
          <Button
            onClick={() => {
              if (!auth.userId || !activeEmployee) return;
              if (!time) {
                setError("Choose an available time slot first.");
                return;
              }
              const res = createAppointment({
                customerId: auth.userId,
                serviceId: activeService.id,
                employeeId: activeEmployee.id,
                date,
                time,
                paymentMethod,
                notes,
              });
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setConfirmedId(res.data.id);
            }}
          >
            Confirm Booking
          </Button>
          <p className="tiny" style={{ margin: 0 }}>
            {activeService.cancellationPolicy}
          </p>
        </aside>
      </div>
    </div>
  );
}

export default function BookAppointmentPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = use(params);
  return (
    <Suspense fallback={<div className="app-boot">Loading booking flow…</div>}>
      <BookingFlow businessId={businessId} />
    </Suspense>
  );
}
