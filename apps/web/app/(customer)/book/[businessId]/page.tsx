"use client";

import {
  bookingConfigsForBusiness,
  createAppointment,
  createAppointmentRemote,
  createUniversalBooking,
  createUniversalBookingRemote,
  displayUser,
  enabledModelsForBusiness,
  fetchHotelStaysAvailabilityRemote,
  offeringsForBusiness,
  publicBusinessById,
  resourcesForBusiness,
  searchResourcesAvailabilityRemote,
  servicesForBusiness,
  useBookItState,
  usingMocks,
} from "@bookit/api-client";
import type {
  BookingModel,
  HotelStayOption,
  PaymentMethod,
  ResourceSearchItem,
  UniversalBooking,
} from "@bookit/types";
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

function diffLocalDays(checkIn: string, checkOut: string): number {
  const [y1, m1, d1] = checkIn.split("-").map(Number);
  const [y2, m2, d2] = checkOut.split("-").map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return 0;
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function BookingFlow({ businessId }: { businessId: string }) {
  const auth = useAuth();
  const state = useBookItState();
  const params = useSearchParams();
  const business = publicBusinessById(state, businessId);
  const rawBusiness = state.businesses.find((b) => b.id === businessId);
  const services = business ? servicesForBusiness(state, business.id) : [];
  const employees = business ? state.employees.filter((e) => e.businessId === business.id) : [];
  const resources = business ? resourcesForBusiness(state, business.id) : [];
  const configs = business ? bookingConfigsForBusiness(state, business.id) : [];
  const models = business ? enabledModelsForBusiness(state, business.id) : [];

  const requestedModel = params.get("model") as BookingModel | null;
  const defaultModel: BookingModel =
    requestedModel && models.includes(requestedModel)
      ? requestedModel
      : services.length > 0 && business?.category !== "restaurant" && business?.category !== "hotel"
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

  // Appointment state
  const [serviceId, setServiceId] = useState(params.get("service") || services[0]?.id || "");
  const [employeeId, setEmployeeId] = useState(params.get("employee") || "");
  const [date, setDate] = useState(DATES[1] ?? DEMO_TODAY);
  const [time, setTime] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("in_person");
  const [notes, setNotes] = useState("");
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmedId, setConfirmedId] = useState("");

  // Resource / Restaurant / Hotel state
  const [resourceId, setResourceId] = useState(params.get("resource") || resources[0]?.id || "");
  const [quantityUnits, setQuantityUnits] = useState(1);
  const [partySize, setPartySize] = useState(2);
  const [preferredTime, setPreferredTime] = useState("19:00");
  const [areaFilter, setAreaFilter] = useState("");
  const [checkInDate, setCheckInDate] = useState(DATES[1] ?? DEMO_TODAY);
  const [checkOutDate, setCheckOutDate] = useState(DATES[3] ?? addDays(DEMO_TODAY, 3));
  const [remoteSearchItems, setRemoteSearchItems] = useState<ResourceSearchItem[] | null>(null);
  const [remoteHotelOptions, setRemoteHotelOptions] = useState<HotelStayOption[] | null>(null);

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

  const isHotel = Boolean(
    business?.category === "hotel" || resources.some((r) => r.pricingUnit === "per_night" || r.resourceType === "hotel_room"),
  );
  const isRestaurant = Boolean(
    business?.category === "restaurant" || resources.some((r) => r.resourceType === "restaurant_table"),
  );
  const resourceCfg = configs.find((c) => c.bookingModel === "resource");
  const seatingAreas = Array.isArray(resourceCfg?.settings?.seatingAreas)
    ? (resourceCfg.settings.seatingAreas as string[])
    : Array.from(
        new Set(
          resources
            .map((r) => (typeof r.attributes?.area === "string" ? r.attributes.area : ""))
            .filter(Boolean),
        ),
      );

  // Live remote search for Restaurant / Time-slot resources
  useEffect(() => {
    if (selectedModel !== "resource" || !business || isHotel) return;
    if (usingMocks()) {
      setRemoteSearchItems(null);
      return;
    }
    let active = true;
    void searchResourcesAvailabilityRemote(business.id, {
      date,
      time: preferredTime || undefined,
      guests: partySize,
      area: areaFilter || undefined,
    }).then((res) => {
      if (active && res.ok) setRemoteSearchItems(res.data);
    });
    return () => {
      active = false;
    };
  }, [selectedModel, business, isHotel, date, preferredTime, partySize, areaFilter]);

  // Live remote search for Hotel stays
  useEffect(() => {
    if (selectedModel !== "resource" || !business || !isHotel) return;
    if (usingMocks()) {
      setRemoteHotelOptions(null);
      return;
    }
    if (diffLocalDays(checkInDate, checkOutDate) <= 0) {
      setRemoteHotelOptions([]);
      return;
    }
    let active = true;
    void fetchHotelStaysAvailabilityRemote(business.id, {
      checkIn: checkInDate,
      checkOut: checkOutDate,
      guests: partySize,
    }).then((res) => {
      if (active && res.ok) setRemoteHotelOptions(res.data.options);
    });
    return () => {
      active = false;
    };
  }, [selectedModel, business, isHotel, checkInDate, checkOutDate, partySize]);

  // Local mock fallback for resource/restaurant slot search
  const localSearchItems = useMemo<ResourceSearchItem[]>(() => {
    if (!business || isHotel) return [];
    const interval = Number(resourceCfg?.settings?.slotIntervalMinutes ?? 60);
    const stepMin = interval >= 15 && interval <= 120 ? interval : 60;
    const out: ResourceSearchItem[] = [];
    for (const res of resources) {
      if (res.pricingUnit === "per_night") continue;
      if (res.capacityPeople * quantityUnits < partySize) continue;
      const resArea = typeof res.attributes?.area === "string" ? res.attributes.area : "";
      if (areaFilter && resArea.toLowerCase() !== areaFilter.toLowerCase()) continue;

      const durationMin = res.slotDurationMinutes ?? Number(resourceCfg?.settings?.turnDurationMinutes ?? 90);
      const slots = [];
      for (let mins = 11 * 60; mins <= 21 * 60; mins += stepMin) {
        const hh = String(Math.floor(mins / 60)).padStart(2, "0");
        const mm = String(mins % 60).padStart(2, "0");
        const slotTime = `${hh}:${mm}`;
        const startIso = `${date}T${slotTime}:00`;
        const startMs = new Date(startIso).getTime();
        const endMs = startMs + durationMin * 60 * 1000;
        const endD = new Date(endMs);
        const endIso = `${date}T${String(endD.getHours()).padStart(2, "0")}:${String(endD.getMinutes()).padStart(2, "0")}:00`;
        let used = 0;
        for (const bk of state.bookings ?? []) {
          if (["cancelled", "rejected", "expired", "no_show"].includes(bk.status)) continue;
          for (const alloc of bk.resourceAllocations) {
            if (alloc.resourceId !== res.id) continue;
            if (new Date(alloc.startAt).getTime() < endMs && startMs < new Date(alloc.endAt).getTime()) {
              used += alloc.quantityUnits;
            }
          }
        }
        for (const blk of state.resourceBlocks ?? []) {
          if (blk.resourceId !== res.id) continue;
          if (new Date(blk.startAt).getTime() < endMs && startMs < new Date(blk.endAt).getTime()) {
            used += blk.unitsBlocked;
          }
        }
        const remainingUnits = Math.max(0, res.unitsTotal - used);
        if (remainingUnits > 0) {
          slots.push({ time: slotTime, startAt: startIso, endAt: endIso, remainingUnits });
        }
      }
      out.push({
        resource: res,
        date,
        timezone: res.timezone ?? "America/Los_Angeles",
        availableAtRequestedTime: preferredTime ? slots.some((s) => s.time === preferredTime) : null,
        slots,
      });
    }
    return out;
  }, [business, isHotel, resources, resourceCfg, quantityUnits, partySize, areaFilter, date, state.bookings, state.resourceBlocks, preferredTime]);

  const searchItems = remoteSearchItems ?? localSearchItems;
  const activeSearchItem =
    searchItems.find((item) => item.resource.id === resourceId) ?? searchItems[0];
  const activeResource = activeSearchItem?.resource ?? resources.find((r) => r.id === resourceId) ?? resources[0];
  const resourceSlots = activeSearchItem?.slots ?? [];

  // Local mock fallback for hotel stays
  const localHotelOptions = useMemo<HotelStayOption[]>(() => {
    if (!business || !isHotel) return [];
    const nights = diffLocalDays(checkInDate, checkOutDate);
    if (nights <= 0) return [];
    const checkInTime = String(resourceCfg?.settings?.checkInTime ?? "15:00");
    const checkOutTime = String(resourceCfg?.settings?.checkOutTime ?? "11:00");
    const checkInAt = `${checkInDate}T${checkInTime}:00`;
    const checkOutAt = `${checkOutDate}T${checkOutTime}:00`;
    const reqStart = new Date(checkInAt).getTime();
    const reqEnd = new Date(checkOutAt).getTime();
    const out: HotelStayOption[] = [];

    for (const res of resources) {
      if (res.capacityPeople < partySize) continue;
      let peakUsed = 0;
      const events: [number, number][] = [];
      for (const bk of state.bookings ?? []) {
        if (["cancelled", "rejected", "expired", "no_show"].includes(bk.status)) continue;
        for (const alloc of bk.resourceAllocations) {
          if (alloc.resourceId !== res.id) continue;
          const aStart = new Date(alloc.startAt).getTime();
          const aEnd = new Date(alloc.endAt).getTime();
          if (aStart < reqEnd && reqStart < aEnd) {
            events.push([Math.max(aStart, reqStart), alloc.quantityUnits]);
            events.push([Math.min(aEnd, reqEnd), -alloc.quantityUnits]);
          }
        }
      }
      for (const blk of state.resourceBlocks ?? []) {
        if (blk.resourceId !== res.id) continue;
        const bStart = new Date(blk.startAt).getTime();
        const bEnd = new Date(blk.endAt).getTime();
        if (bStart < reqEnd && reqStart < bEnd) {
          events.push([Math.max(bStart, reqStart), blk.unitsBlocked]);
          events.push([Math.min(bEnd, reqEnd), -blk.unitsBlocked]);
        }
      }
      events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      let running = 0;
      for (const [, delta] of events) {
        running += delta;
        if (running > peakUsed) peakUsed = running;
      }
      const remainingUnits = Math.max(0, res.unitsTotal - peakUsed);
      if (remainingUnits > 0) {
        const totalPrice = res.basePrice * nights;
        const depositDue = res.depositAmount ?? 0;
        out.push({
          resource: res,
          checkInAt,
          checkOutAt,
          nights,
          remainingUnits,
          nightlyRate: res.basePrice,
          totalPrice,
          depositDue,
        });
      }
    }
    return out;
  }, [business, isHotel, checkInDate, checkOutDate, resourceCfg, resources, partySize, state.bookings, state.resourceBlocks]);

  const hotelOptions = remoteHotelOptions ?? localHotelOptions;
  const activeHotelOption =
    hotelOptions.find((o) => o.resource.id === resourceId) ?? hotelOptions[0];

  const activeOffering = offerings.find((o) => o.id === offeringId) ?? offerings[0];
  const activeSession =
    activeOffering?.sessions.find((s) => s.id === sessionId) ??
    activeOffering?.sessions.find((s) => s.status === "on_sale" || s.status === "scheduled") ??
    activeOffering?.sessions[0];

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

  if (confirmedUniversal) {
    return (
      <div className="panel stack" style={{ maxWidth: 680, gap: 14 }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <Badge tone={confirmedUniversal.status === "pending" ? "warning" : "success"}>
            {confirmedUniversal.status.toUpperCase()}
          </Badge>
          <span className="tiny tabular">Reference #{confirmedUniversal.id}</span>
        </div>
        <h1 style={{ margin: 0 }}>{confirmedUniversal.title}</h1>
        <p className="muted" style={{ margin: 0 }}>
          {business.name} ·{" "}
          {confirmedUniversal.startAt ? formatDateTime(confirmedUniversal.startAt) : "Confirmed"}
          {confirmedUniversal.endAt && confirmedUniversal.bookingModel === "resource"
            ? ` → ${formatDateTime(confirmedUniversal.endAt)}`
            : ""}
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
          <span>
            Total ({confirmedUniversal.paymentMethod?.replaceAll("_", " ") ?? "in person"})
            {confirmedUniversal.depositDueAmount > 0 ? ` · Deposit ${formatMoney(confirmedUniversal.depositDueAmount)}` : ""}
          </span>
          <strong className="tabular">{formatMoney(confirmedUniversal.totalAmount)}</strong>
        </div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <Link href={`/bookings/${confirmedUniversal.id}`} className="btn">
            View Booking &amp; QR Details
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
            <span className="tabular">{subtotal === 0 ? "Free" : formatMoney(subtotal)}</span>
          </div>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="tiny">Estimated Tax (8%)</span>
            <span className="tabular">{formatMoney(tax)}</span>
          </div>
          {activeService.depositAmount ? (
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="tiny">Deposit Due</span>
              <span className="tabular">{formatMoney(activeService.depositAmount)}</span>
            </div>
          ) : null}
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
          <h1 style={{ margin: "4px 0 0" }}>
            {isRestaurant
              ? `Reserve a Table at ${business.name}`
              : isHotel
                ? `Book a Stay at ${business.name}`
                : `Book with ${business.name}`}
          </h1>
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
                        style={{ gap: 6, textAlign: "left" }}
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
                        {service.depositAmount ? (
                          <span className="tiny">Deposit: {formatMoney(service.depositAmount)}</span>
                        ) : null}
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
                  <h3>3. Select Date &amp; Time</h3>
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
                      {activeService.requiresApproval ? (
                        <Badge tone="warning">Requires provider approval</Badge>
                      ) : null}
                    </div>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <span className="muted">Duration</span>
                      <span className="tabular">{activeService.durationMinutes} min</span>
                    </div>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <span className="muted">Service Fee</span>
                      <span className="tabular">{subtotal === 0 ? "Free" : formatMoney(subtotal)}</span>
                    </div>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <span className="muted">Estimated Tax (8%)</span>
                      <span className="tabular">{formatMoney(tax)}</span>
                    </div>
                    {activeService.depositAmount ? (
                      <div className="row" style={{ justifyContent: "space-between" }}>
                        <span className="muted">Deposit required</span>
                        <strong className="tabular">{formatMoney(activeService.depositAmount)}</strong>
                      </div>
                    ) : null}
                    <div className="row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                      <strong>Total</strong>
                      <strong className="tabular" style={{ fontSize: 20 }}>
                        {formatMoney(total)}
                      </strong>
                    </div>
                    {error ? <p className="error">{error}</p> : null}
                    <Button
                      disabled={submitting}
                      onClick={async () => {
                        if (!auth.userId || !activeEmployee) return;
                        if (!time) {
                          setError("Choose an available time slot first.");
                          return;
                        }
                        setError("");
                        setSubmitting(true);
                        try {
                          const res = usingMocks()
                            ? createAppointment({
                                customerId: auth.userId,
                                serviceId: activeService.id,
                                employeeId: activeEmployee.id,
                                date,
                                time,
                                paymentMethod,
                                notes,
                              })
                            : await createAppointmentRemote({
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
                        } finally {
                          setSubmitting(false);
                        }
                      }}
                    >
                      {submitting ? "Booking..." : "Confirm Booking"}
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

      {/* HOTEL MULTI-NIGHT STAY FLOW */}
      {selectedModel === "resource" && isHotel ? (
        resources.length === 0 ? (
          <Empty title="No rooms published yet" body="This property has not configured bookable rooms yet." />
        ) : (
          <div className="split-detail">
            <div className="stack" style={{ gap: 18 }}>
              <section className="panel stack">
                <h3>1. Search Stay Dates &amp; Guests</h3>
                <div className="grid-3">
                  <label className="field">
                    <span>Check-in Date</span>
                    <input type="date" value={checkInDate} onChange={(e) => setCheckInDate(e.target.value)} />
                  </label>
                  <label className="field">
                    <span>Check-out Date</span>
                    <input type="date" value={checkOutDate} onChange={(e) => setCheckOutDate(e.target.value)} />
                  </label>
                  <label className="field">
                    <span>Guests</span>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={partySize}
                      onChange={(e) => setPartySize(Math.max(1, Number(e.target.value) || 1))}
                    />
                  </label>
                </div>
              </section>

              <section className="panel stack">
                <h3>2. Select Available Room</h3>
                {hotelOptions.length === 0 ? (
                  <p className="muted">No rooms available for those dates and guest count. Adjust your dates.</p>
                ) : (
                  <div className="grid-2">
                    {hotelOptions.map((opt) => {
                      const amenities = Array.isArray(opt.resource.attributes?.amenities)
                        ? (opt.resource.attributes.amenities as string[])
                        : [];
                      const selected = activeHotelOption?.resource.id === opt.resource.id;
                      return (
                        <button
                          key={opt.resource.id}
                          type="button"
                          className={`select-card stack ${selected ? "on" : ""}`}
                          style={{ gap: 6, textAlign: "left" }}
                          onClick={() => setResourceId(opt.resource.id)}
                        >
                          <div className="row" style={{ justifyContent: "space-between" }}>
                            <strong>{opt.resource.name}</strong>
                            <Badge tone="brand">{opt.remainingUnits} left</Badge>
                          </div>
                          <span className="tiny">
                            Up to {opt.resource.capacityPeople} guests · {opt.nights} night(s)
                          </span>
                          {amenities.length > 0 ? <span className="tiny">{amenities.join(" · ")}</span> : null}
                          <strong className="tabular">
                            {formatMoney(opt.nightlyRate)}/night · {formatMoney(opt.totalPrice)} total
                          </strong>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="panel stack">
                <h3>3. Rooms &amp; Special Requests</h3>
                <div className="grid-2">
                  <label className="field">
                    <span>Number of rooms</span>
                    <input
                      type="number"
                      min={1}
                      max={activeHotelOption?.remainingUnits ?? 1}
                      value={quantityUnits}
                      onChange={(e) => setQuantityUnits(Math.max(1, Number(e.target.value) || 1))}
                    />
                  </label>
                  <label className="field">
                    <span>Payment method</span>
                    <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
                      <option value="in_person">Pay at hotel</option>
                      <option value="wallet">BookIt demo wallet</option>
                      <option value="card_token_pending">Card (API pending)</option>
                    </select>
                  </label>
                </div>
                <label className="field">
                  <span>Special requests (optional)</span>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Late arrival, high floor, extra pillows..." />
                </label>
              </section>
            </div>

            <aside className="panel stack" style={{ position: "sticky", top: 84 }}>
              <h2 style={{ margin: 0 }}>Stay Summary</h2>
              {activeHotelOption ? (
                <>
                  <div className="select-card stack" style={{ gap: 4 }}>
                    <strong>{activeHotelOption.resource.name}</strong>
                    <span className="tiny">
                      {checkInDate} → {checkOutDate} ({activeHotelOption.nights} night(s))
                    </span>
                    <span className="tiny">
                      {quantityUnits} room(s) · {partySize} guest(s)
                    </span>
                  </div>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <span className="muted">Nightly rate</span>
                    <span className="tabular">{formatMoney(activeHotelOption.nightlyRate)}</span>
                  </div>
                  {activeHotelOption.depositDue > 0 ? (
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <span className="muted">Deposit due</span>
                      <strong className="tabular">{formatMoney(activeHotelOption.depositDue * quantityUnits)}</strong>
                    </div>
                  ) : null}
                  <div className="row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                    <strong>Total Stay</strong>
                    <strong className="tabular" style={{ fontSize: 20 }}>
                      {formatMoney(activeHotelOption.totalPrice * quantityUnits)}
                    </strong>
                  </div>
                </>
              ) : (
                <p className="muted">Select valid dates and an available room.</p>
              )}
              {error ? <p className="error">{error}</p> : null}
              <Button
                disabled={submitting || !activeHotelOption}
                onClick={async () => {
                  if (!auth.userId || !activeHotelOption) return;
                  setError("");
                  setSubmitting(true);
                  try {
                    const payload = {
                      bookingModel: "resource" as const,
                      businessId: business.id,
                      resourceId: activeHotelOption.resource.id,
                      startAt: activeHotelOption.checkInAt,
                      endAt: activeHotelOption.checkOutAt,
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
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                {submitting ? "Reserving..." : "Confirm Room Stay"}
              </Button>
            </aside>
          </div>
        )
      ) : null}

      {/* RESTAURANT / HOURLY RESOURCE FLOW */}
      {selectedModel === "resource" && !isHotel ? (
        resources.length === 0 ? (
          <Empty title="No bookable spaces yet" body="This business has not configured rooms, tables, courts, or equipment yet." />
        ) : (
          <div className="split-detail">
            <div className="stack" style={{ gap: 18 }}>
              <section className="panel stack">
                <h3>1. {isRestaurant ? "Party Size, Date & Seating Area" : "Filter Availability"}</h3>
                <div className="grid-4">
                  <label className="field">
                    <span>Date</span>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => {
                        setDate(e.target.value);
                        setTime("");
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>Preferred Time</span>
                    <input type="time" value={preferredTime} onChange={(e) => setPreferredTime(e.target.value)} />
                  </label>
                  <label className="field">
                    <span>{isRestaurant ? "Party Size" : "Guests"}</span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={partySize}
                      onChange={(e) => setPartySize(Math.max(1, Number(e.target.value) || 1))}
                    />
                  </label>
                  {seatingAreas.length > 0 ? (
                    <label className="field">
                      <span>Seating Area</span>
                      <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
                        <option value="">Any area</option>
                        {seatingAreas.map((area) => (
                          <option key={area} value={area}>
                            {area}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label className="field">
                      <span>Units</span>
                      <input
                        type="number"
                        min={1}
                        max={activeResource?.unitsTotal ?? 10}
                        value={quantityUnits}
                        onChange={(e) => setQuantityUnits(Math.max(1, Number(e.target.value) || 1))}
                      />
                    </label>
                  )}
                </div>
              </section>

              <section className="panel stack">
                <h3>2. Select {isRestaurant ? "Table" : "Space or Resource"}</h3>
                {searchItems.length === 0 ? (
                  <p className="muted">No matching tables or spaces for {partySize} guests. Adjust party size or area.</p>
                ) : (
                  <div className="grid-2">
                    {searchItems.map((item) => {
                      const area = typeof item.resource.attributes?.area === "string" ? item.resource.attributes.area : "";
                      const selected = activeResource?.id === item.resource.id;
                      return (
                        <button
                          key={item.resource.id}
                          type="button"
                          className={`select-card stack ${selected ? "on" : ""}`}
                          style={{ gap: 6, textAlign: "left" }}
                          onClick={() => {
                            setResourceId(item.resource.id);
                            setTime(item.slots.some((s) => s.time === preferredTime) ? preferredTime : item.slots[0]?.time ?? "");
                          }}
                        >
                          <div className="row" style={{ justifyContent: "space-between" }}>
                            <strong>{item.resource.name}</strong>
                            {item.availableAtRequestedTime ? <Badge tone="success">Open at {preferredTime}</Badge> : null}
                          </div>
                          <span className="tiny">
                            Seats up to {item.resource.capacityPeople}
                            {area ? ` · ${area}` : ""} · {item.slots.length} slot(s) on {date}
                          </span>
                          <span className="tiny tabular">
                            {item.resource.basePrice === 0
                              ? "Free reservation"
                              : `${formatMoney(item.resource.basePrice)} (${item.resource.pricingUnit.replaceAll("_", " ")})`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>

              {activeResource ? (
                <section className="panel stack">
                  <h3>3. Choose Time Slot for {activeResource.name}</h3>
                  <div className="chips">
                    {resourceSlots.length === 0 ? (
                      <p className="muted">No open windows on {date} for this table/space.</p>
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
                </section>
              ) : null}

              <section className="panel stack">
                <h3>4. Payment &amp; Requests</h3>
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
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Seating preference, celebration, dietary notes..." />
                </label>
              </section>
            </div>

            <aside className="panel stack" style={{ position: "sticky", top: 84 }}>
              <h2 style={{ margin: 0 }}>Reservation Summary</h2>
              {activeResource ? (
                <>
                  <div className="select-card stack" style={{ gap: 4 }}>
                    <strong>{activeResource.name}</strong>
                    <span className="tiny">
                      {quantityUnits} unit(s) · {partySize} guest(s)
                    </span>
                    <span className="tiny">
                      {formatDate(`${date}T12:00:00`, { weekday: "long", month: "short", day: "numeric" })}
                      {time ? ` · ${time}` : " · Choose a time slot"}
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
                      {activeResource.basePrice === 0 ? "Free" : formatMoney(activeResource.basePrice * quantityUnits)}
                    </strong>
                  </div>
                </>
              ) : null}
              {error ? <p className="error">{error}</p> : null}
              <Button
                disabled={submitting || !activeResource}
                onClick={async () => {
                  if (!auth.userId || !activeResource) return;
                  const chosen = resourceSlots.find((s) => s.time === time);
                  if (!chosen) {
                    setError("Pick an open time slot first.");
                    return;
                  }
                  setError("");
                  setSubmitting(true);
                  try {
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
                  } finally {
                    setSubmitting(false);
                  }
                }}
              >
                {submitting ? "Reserving..." : isRestaurant ? "Confirm Table" : "Reserve Space"}
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
                    disabled={submitting || totalQty === 0}
                    onClick={async () => {
                      if (!auth.userId || items.length === 0) return;
                      setError("");
                      setSubmitting(true);
                      try {
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
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                  >
                    {submitting ? "Issuing..." : selectedModel === "ticket" ? "Issue Tickets" : "Reserve Class Spot"}
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
