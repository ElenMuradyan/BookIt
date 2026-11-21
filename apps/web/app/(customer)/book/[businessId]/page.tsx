"use client";

import {
  createAppointment,
  createAppointmentRemote,
  createUniversalBooking,
  createUniversalBookingRemote,
  displayUser,
  enabledModelsForBusiness,
  fetchResourceAvailabilityRemote,
  offeringsForBusiness,
  publicBusinessById,
  resourcesForBusiness,
  servicesForBusiness,
  useBookItState,
  usingMocks,
} from "@bookit/api-client";
import type { BookingModel, PaymentMethod, ResourceAvailabilitySlot, UniversalBooking } from "@bookit/types";
import {
  addDays,
  availableSlots,
  bookingModelLabel,
  bookingTotals,
  DEMO_TODAY,
  formatDate,
  formatDateTime,
  formatMoney,
  initials,
} from "@bookit/utils";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, use, useEffect, useMemo, useState } from "react";
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
  const resources = business ? resourcesForBusiness(state, business.id) : [];
  const models = business ? enabledModelsForBusiness(state, business.id) : [];

  const requestedModel = params.get("model") as BookingModel | null;
  const defaultModel: BookingModel =
    requestedModel && models.includes(requestedModel)
      ? requestedModel
      : services.length > 0
        ? "appointment"
        : models[0] ?? "appointment";

  const [selectedModel, setSelectedModel] = useState<BookingModel>(defaultModel);
  const offerings = business
    ? offeringsForBusiness(
        state,
        business.id,
        selectedModel === "ticket" || selectedModel === "capacity" ? selectedModel : undefined,
      )
    : [];

  // Appointment state (preserved)
  const [serviceId, setServiceId] = useState(params.get("service") || services[0]?.id || "");
  const [employeeId, setEmployeeId] = useState(params.get("employee") || "");
  const [date, setDate] = useState(DATES[1] ?? DEMO_TODAY);
  const [time, setTime] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("in_person");
  const [notes, setNotes] = useState("");
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [error, setError] = useState("");
  const [confirmedId, setConfirmedId] = useState("");

  // Resource state
  const [resourceId, setResourceId] = useState(params.get("resource") || resources[0]?.id || "");
  const [quantityUnits, setQuantityUnits] = useState(1);
  const [partySize, setPartySize] = useState(2);
  const [remoteResSlots, setRemoteResSlots] = useState<ResourceAvailabilitySlot[] | null>(null);

  // Ticket / Capacity state
  const [offeringId, setOfferingId] = useState(params.get("offering") || offerings[0]?.id || "");
  const [sessionId, setSessionId] = useState("");
  const [tierQty, setTierQty] = useState<Record<string, number>>({});
  const [attendeeName, setAttendeeName] = useState("");
  const [attendeeEmail, setAttendeeEmail] = useState("");
  const [confirmedUniversal, setConfirmedUniversal] = useState<UniversalBooking | null>(null);

  const activeService = services.find((s) => s.id === serviceId) ?? services[0];
  const eligibleEmployees = activeService
    ? employees.filter((e) => activeService.employeeIds.includes(e.id) || activeService.employeeIds.length === 0)
    : employees;
  const activeEmployee = eligibleEmployees.find((e) => e.id === employeeId) ?? eligibleEmployees[0];

  const activeResource = resources.find((r) => r.id === resourceId) ?? resources[0];
  const activeOffering = offerings.find((o) => o.id === offeringId) ?? offerings[0];
  const activeSession =
    activeOffering?.sessions.find((s) => s.id === sessionId) ??
    activeOffering?.sessions.find((s) => s.status === "on_sale" || s.status === "scheduled") ??
    activeOffering?.sessions[0];

  useEffect(() => {
    if (selectedModel !== "resource" || !business || !activeResource) return;
    if (usingMocks()) {
      setRemoteResSlots(null);
      return;
    }
    let active = true;
    void fetchResourceAvailabilityRemote(business.id, activeResource.id, date).then((res) => {
      if (active && res.ok) setRemoteResSlots(res.data.slots);
    });
    return () => {
      active = false;
    };
  }, [selectedModel, business, activeResource, date]);

  const resourceSlots = useMemo<ResourceAvailabilitySlot[]>(() => {
    if (remoteResSlots) return remoteResSlots;
    if (!activeResource) return [];
    const durationMin = activeResource.slotDurationMinutes ?? 60;
    const out: ResourceAvailabilitySlot[] = [];
    for (const startHour of [10, 12, 14, 16, 18, 20]) {
      const hh = String(startHour).padStart(2, "0");
      const startIso = `${date}T${hh}:00:00`;
      const endDate = new Date(new Date(startIso).getTime() + durationMin * 60 * 1000);
      const endIso = `${date}T${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}:00`;
      let used = 0;
      for (const bk of state.bookings ?? []) {
        if (["cancelled", "rejected", "expired", "no_show"].includes(bk.status)) continue;
        for (const alloc of bk.resourceAllocations) {
          if (alloc.resourceId !== activeResource.id) continue;
          if (new Date(alloc.startAt).getTime() < endDate.getTime() && new Date(startIso).getTime() < new Date(alloc.endAt).getTime()) {
            used += alloc.quantityUnits;
          }
        }
      }
      const remainingUnits = Math.max(0, activeResource.unitsTotal - used);
      if (remainingUnits > 0) {
        out.push({ time: `${hh}:00`, startAt: startIso, endAt: endIso, remainingUnits });
      }
    }
    return out;
  }, [remoteResSlots, activeResource, date, state.bookings]);

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

  // Confirmation screen for universal booking (resource / ticket / capacity)
  if (confirmedUniversal) {
    return (
      <div className="panel stack" style={{ maxWidth: 680, gap: 14 }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <Badge tone="success">{confirmedUniversal.status.toUpperCase()}</Badge>
          <span className="tiny tabular">Reference #{confirmedUniversal.id}</span>
        </div>
        <h1 style={{ margin: 0 }}>{confirmedUniversal.title}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {business.name} · {confirmedUniversal.startAt ? formatDateTime(confirmedUniversal.startAt) : "Confirmed"}
        </p>
        {confirmedUniversal.checkInCode ? (
          <div className="select-card stack" style={{ gap: 4 }}>
            <span className="tiny">Front-Desk Check-In Code</span>
            <strong className="tabular" style={{ fontSize: 18 }}>{confirmedUniversal.checkInCode}</strong>
          </div>
        ) : null}
        {confirmedUniversal.ticketPasses.length > 0 ? (
          <div className="stack" style={{ gap: 8 }}>
            <strong style={{ fontSize: 14 }}>Issued Passes ({confirmedUniversal.ticketPasses.length})</strong>
            {confirmedUniversal.ticketPasses.map((pass) => (
              <div key={pass.id} className="select-card row" style={{ justifyContent: "space-between" }}>
                <div>
                  <strong className="tabular">{pass.passCode}</strong>
                  <div className="tiny">{pass.attendeeName || "Guest"} · {formatMoney(pass.unitPrice)}</div>
                </div>
                <Badge tone="brand">{pass.status}</Badge>
              </div>
            ))}
          </div>
        ) : null}
        <div className="select-card row" style={{ justifyContent: "space-between" }}>
          <span>Total ({confirmedUniversal.paymentMethod?.replaceAll("_", " ") ?? "in person"})</span>
          <strong className="tabular">{formatMoney(confirmedUniversal.totalAmount)}</strong>
        </div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <Link href="/bookings" className="btn">
            View My Bookings & Passes
          </Link>
          <Link href={`/business/${business.id}`} className="btn ghost">
            Back to {business.name}
          </Link>
        </div>
      </div>
    );
  }

  // Confirmation screen for legacy appointment
  const confirmedApt = confirmedId ? state.appointments.find((a) => a.id === confirmedId) : undefined;
  if (confirmedId && activeService) {
    const { subtotal, tax, total } = bookingTotals(activeService.price);
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
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <Link href={`/business/${business.id}`} className="tiny">
            ← {business.name}
          </Link>
          <h1 style={{ margin: "4px 0 0" }}>Book with {business.name}</h1>
        </div>
        {models.length > 1 ? (
          <div className="tabs">
            {models.map((m) => (
              <button
                key={m}
                type="button"
                className={`tab ${selectedModel === m ? "on" : ""}`}
                onClick={() => {
                  setSelectedModel(m);
                  setError("");
                  setTime("");
                }}
              >
                {bookingModelLabel(m)}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* APPOINTMENT FLOW */}
      {selectedModel === "appointment" ? (
        !activeService ? (
          <Empty title="No services available" body="This business has not published services yet." />
        ) : (
          <>
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
                </section>
              </div>

              {(() => {
                const { subtotal, tax, total } = bookingTotals(activeService.price);
                return (
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
                      onClick={async () => {
                        if (!auth.userId || !activeEmployee) return;
                        if (!time) {
                          setError("Choose an available time slot first.");
                          return;
                        }
                        setError("");
                        if (usingMocks()) {
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
                          return;
                        }
                        const res = await createAppointmentRemote({
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
                );
              })()}
            </div>
          </>
        )
      ) : null}

      {/* RESOURCE BOOKING FLOW */}
      {selectedModel === "resource" ? (
        !activeResource ? (
          <Empty title="No bookable spaces yet" body="This business has not configured rooms, tables, courts, or equipment yet." />
        ) : (
          <div className="split-detail">
            <div className="stack" style={{ gap: 18 }}>
              <section className="panel stack">
                <h3>1. Select Space or Resource</h3>
                <div className="grid-2">
                  {resources.map((res) => (
                    <button
                      key={res.id}
                      type="button"
                      className={`select-card stack ${activeResource.id === res.id ? "on" : ""}`}
                      style={{ gap: 6, textAlign: "left" }}
                      onClick={() => {
                        setResourceId(res.id);
                        setTime("");
                      }}
                    >
                      <strong>{res.name}</strong>
                      <span className="tiny">
                        Up to {res.capacityPeople} guests · {res.unitsTotal} total unit(s)
                      </span>
                      <span className="tiny tabular">
                        {res.basePrice === 0 ? "Free reservation" : `${formatMoney(res.basePrice)} (${res.pricingUnit.replace("_", " ")})`}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section className="panel stack">
                <h3>2. Choose Date &amp; Time Window</h3>
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
                  {resourceSlots.length === 0 ? (
                    <p className="muted">No open windows on this date.</p>
                  ) : (
                    resourceSlots.map((slot) => (
                      <button
                        key={slot.time}
                        type="button"
                        className={`slot tabular ${time === slot.time ? "on" : ""}`}
                        onClick={() => setTime(slot.time)}
                      >
                        {slot.time} ({slot.remainingUnits} left)
                      </button>
                    ))
                  )}
                </div>
                <div className="grid-2" style={{ marginTop: 8 }}>
                  <label className="field">
                    <span>Units</span>
                    <input
                      type="number"
                      min={1}
                      max={activeResource.unitsTotal}
                      value={quantityUnits}
                      onChange={(e) => setQuantityUnits(Math.max(1, Number(e.target.value)))}
                    />
                  </label>
                  <label className="field">
                    <span>Party / Guests</span>
                    <input
                      type="number"
                      min={1}
                      max={activeResource.capacityPeople * quantityUnits}
                      value={partySize}
                      onChange={(e) => setPartySize(Math.max(1, Number(e.target.value)))}
                    />
                  </label>
                </div>
              </section>

              <section className="panel stack">
                <h3>3. Payment &amp; Requests</h3>
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
                  <span>Special requests (optional)</span>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Seating preference, setup notes..." />
                </label>
              </section>
            </div>

            <aside className="panel stack" style={{ position: "sticky", top: 84 }}>
              <h2 style={{ margin: 0 }}>Reservation Summary</h2>
              <div className="select-card stack" style={{ gap: 4 }}>
                <strong>{activeResource.name}</strong>
                <span className="tiny">
                  {quantityUnits} unit(s) · {partySize} guest(s)
                </span>
                <span className="tiny">
                  {formatDate(`${date}T12:00:00`, { weekday: "long", month: "short", day: "numeric" })}
                  {time ? ` · ${time}` : " · Choose a window"}
                </span>
              </div>
              {activeResource.depositAmount ? (
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="muted">Deposit required</span>
                  <strong className="tabular">{formatMoney(activeResource.depositAmount)}</strong>
                </div>
              ) : null}
              <div className="row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                <strong>Total</strong>
                <strong className="tabular" style={{ fontSize: 20 }}>
                  {formatMoney(activeResource.basePrice * quantityUnits)}
                </strong>
              </div>
              {error ? <p className="error">{error}</p> : null}
              <Button
                onClick={async () => {
                  if (!auth.userId) return;
                  const chosen = resourceSlots.find((s) => s.time === time);
                  if (!chosen) {
                    setError("Pick an open window first.");
                    return;
                  }
                  setError("");
                  const payload = {
                    bookingModel: "resource" as const,
                    businessId: business.id,
                    resourceId: activeResource.id,
                    startAt: chosen.startAt,
                    endAt: chosen.endAt,
                    quantityUnits,
                    partySize,
                    paymentMethod,
                    notes,
                  };
                  const res = usingMocks()
                    ? createUniversalBooking(auth.userId, payload)
                    : await createUniversalBookingRemote(payload);
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  setConfirmedUniversal(res.data);
                }}
              >
                Reserve Space
              </Button>
            </aside>
          </div>
        )
      ) : null}

      {/* TICKET OR CAPACITY CLASS FLOW */}
      {selectedModel === "ticket" || selectedModel === "capacity" ? (
        !activeOffering || !activeSession ? (
          <Empty title="No scheduled sessions" body="This business does not have open sessions for this model right now." />
        ) : (
          <div className="split-detail">
            <div className="stack" style={{ gap: 18 }}>
              <section className="panel stack">
                <h3>1. Choose {selectedModel === "ticket" ? "Event" : "Class"} &amp; Session</h3>
                <div className="grid-2">
                  {offerings.map((off) => (
                    <button
                      key={off.id}
                      type="button"
                      className={`select-card stack ${activeOffering.id === off.id ? "on" : ""}`}
                      style={{ gap: 6, textAlign: "left" }}
                      onClick={() => {
                        setOfferingId(off.id);
                        setSessionId(off.sessions[0]?.id ?? "");
                        setTierQty({});
                      }}
                    >
                      <strong>{off.title}</strong>
                      <span className="tiny">{off.venueArea || off.category}</span>
                    </button>
                  ))}
                </div>
                <div className="chips" style={{ marginTop: 8 }}>
                  {activeOffering.sessions.map((ses) => (
                    <button
                      key={ses.id}
                      type="button"
                      className={`slot ${activeSession.id === ses.id ? "on" : ""}`}
                      onClick={() => {
                        setSessionId(ses.id);
                        setTierQty({});
                      }}
                    >
                      {formatDateTime(ses.startAt)} ({ses.remainingCapacity} left)
                    </button>
                  ))}
                </div>
              </section>

              <section className="panel stack">
                <h3>2. Select {selectedModel === "ticket" ? "Ticket Tiers" : "Spots"}</h3>
                {activeSession.tiers.map((tier) => {
                  const qty = tierQty[tier.id] ?? 0;
                  return (
                    <div
                      key={tier.id}
                      className="select-card row"
                      style={{ justifyContent: "space-between", alignItems: "center" }}
                    >
                      <div>
                        <strong>{tier.name}</strong>
                        <div className="tiny">
                          {formatMoney(tier.price)} · {tier.remaining ?? activeSession.remainingCapacity} remaining
                        </div>
                        {tier.description ? <div className="tiny">{tier.description}</div> : null}
                      </div>
                      <div className="row" style={{ gap: 8 }}>
                        <Button
                          tone="ghost"
                          small
                          onClick={() => setTierQty({ ...tierQty, [tier.id]: Math.max(0, qty - 1) })}
                        >
                          −
                        </Button>
                        <strong className="tabular" style={{ minWidth: 20, textAlign: "center" }}>{qty}</strong>
                        <Button
                          tone="soft"
                          small
                          onClick={() =>
                            setTierQty({
                              ...tierQty,
                              [tier.id]: Math.min(activeSession.maxPerBooking, qty + 1),
                            })
                          }
                        >
                          +
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </section>

              <section className="panel stack">
                <h3>3. Attendee &amp; Payment</h3>
                <div className="grid-2">
                  <label className="field">
                    <span>Attendee name</span>
                    <input value={attendeeName} onChange={(e) => setAttendeeName(e.target.value)} placeholder="Name on pass" />
                  </label>
                  <label className="field">
                    <span>Attendee email</span>
                    <input value={attendeeEmail} onChange={(e) => setAttendeeEmail(e.target.value)} placeholder="Pass delivery email" />
                  </label>
                </div>
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
              </section>
            </div>

            {(() => {
              const items = activeSession.tiers
                .map((t) => ({ tier: t, quantity: tierQty[t.id] ?? 0 }))
                .filter((x) => x.quantity > 0);
              const totalQty = items.reduce((s, x) => s + x.quantity, 0);
              const totalAmt = items.reduce((s, x) => s + x.tier.price * x.quantity, 0);
              return (
                <aside className="panel stack" style={{ position: "sticky", top: 84 }}>
                  <h2 style={{ margin: 0 }}>Order Summary</h2>
                  <div className="select-card stack" style={{ gap: 4 }}>
                    <strong>{activeOffering.title}</strong>
                    <span className="tiny">{formatDateTime(activeSession.startAt)}</span>
                    <span className="tiny">{totalQty} pass(es) selected</span>
                  </div>
                  <div className="row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                    <strong>Total</strong>
                    <strong className="tabular" style={{ fontSize: 20 }}>
                      {formatMoney(totalAmt)}
                    </strong>
                  </div>
                  {error ? <p className="error">{error}</p> : null}
                  <Button
                    disabled={totalQty === 0}
                    onClick={async () => {
                      if (!auth.userId || items.length === 0) return;
                      setError("");
                      const payload = {
                        bookingModel: selectedModel,
                        businessId: business.id,
                        sessionId: activeSession.id,
                        ticketItems: items.map((i) => ({ tierId: i.tier.id, quantity: i.quantity })),
                        attendeeName: attendeeName || undefined,
                        attendeeEmail: attendeeEmail || undefined,
                        paymentMethod,
                      };
                      const res = usingMocks()
                        ? createUniversalBooking(auth.userId, payload)
                        : await createUniversalBookingRemote(payload);
                      if (!res.ok) {
                        setError(res.error);
                        return;
                      }
                      setConfirmedUniversal(res.data);
                    }}
                  >
                    {selectedModel === "ticket" ? "Issue Tickets" : "Reserve Class Spot"}
                  </Button>
                  <p className="tiny" style={{ margin: 0 }}>
                    {activeOffering.cancellationPolicy}
                  </p>
                </aside>
              );
            })()}
          </div>
        )
      ) : null}
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
