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
import { brand } from "@bookit/design-system";
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
} from "@bookit/utils";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Avatar, Badge, BrandHeader, Button, Card, Chip, EmptyState, InputField, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

const PAYMENT_OPTIONS: Array<{ id: PaymentMethod; label: string }> = [
  { id: "in_person", label: "Pay at venue" },
  { id: "wallet", label: "BookIt demo wallet" },
  { id: "card_token_pending", label: "Card (API pending)" },
];

export default function BookAppointmentScreen() {
  const { businessId, service: initialSvc, employee: initialEmp, model: initialModel, offering: initialOffering, resource: initialResource } =
    useLocalSearchParams<{
      businessId: string;
      service?: string;
      employee?: string;
      model?: BookingModel;
      offering?: string;
      resource?: string;
    }>();
  const auth = useAuth();
  const state = useBookItState();
  const router = useRouter();
  const { colors } = useThemePalette();

  const business = businessId ? publicBusinessById(state, businessId) : undefined;
  const rawBiz = businessId ? state.businesses.find((b) => b.id === businessId) : undefined;
  const services = business ? servicesForBusiness(state, business.id) : [];
  const employees = business ? state.employees.filter((e) => e.businessId === business.id) : [];
  const resources = business ? resourcesForBusiness(state, business.id) : [];
  const models = business ? enabledModelsForBusiness(state, business.id) : [];

  const defaultModel: BookingModel =
    initialModel && models.includes(initialModel)
      ? initialModel
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

  const [step, setStep] = useState<1 | 2 | 3 | 4>(initialSvc ? (initialEmp ? 3 : 2) : 1);
  const [serviceId, setServiceId] = useState(initialSvc || services[0]?.id || "");
  const [employeeId, setEmployeeId] = useState(initialEmp || employees[0]?.id || "");
  const [date, setDate] = useState(addDays(DEMO_TODAY, 1));
  const [selectedTime, setSelectedTime] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("in_person");
  const [notes, setNotes] = useState("");
  const [confirmedId, setConfirmedId] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Resource state
  const [resourceId, setResourceId] = useState(initialResource || resources[0]?.id || "");
  const [quantityUnits, setQuantityUnits] = useState("1");
  const [partySize, setPartySize] = useState("2");
  const [remoteResSlots, setRemoteResSlots] = useState<ResourceAvailabilitySlot[] | null>(null);

  // Ticket / Capacity state
  const [offeringId, setOfferingId] = useState(initialOffering || offerings[0]?.id || "");
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
  const dateDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(DEMO_TODAY, i)), []);

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
    if (!rawBiz || !activeService) return [];
    return availableSlots({
      date,
      service: activeService,
      employees,
      appointments: state.appointments.filter((a) => a.businessId === rawBiz.id),
      hours: rawBiz.hours,
      holidays: rawBiz.holidays,
      blocked: rawBiz.blocked,
      employeeId: activeEmployee?.id,
    });
  }, [rawBiz, activeService, employees, state.appointments, date, activeEmployee]);

  if (!business || !rawBiz) {
    return (
      <Screen>
        <BrandHeader title="Book" showBack />
        <EmptyState title="Booking unavailable" body="Only approved venues accept bookings." />
      </Screen>
    );
  }

  if (confirmedUniversal) {
    return (
      <Screen>
        <BrandHeader title="Booking Confirmed" />
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Badge label={confirmedUniversal.status.toUpperCase()} tone="success" />
            <Text style={{ color: colors.muted, fontSize: 12, fontVariant: ["tabular-nums"] }}>
              Ref #{confirmedUniversal.id}
            </Text>
          </View>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>{confirmedUniversal.title}</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            {business.name} · {confirmedUniversal.startAt ? formatDateTime(confirmedUniversal.startAt) : "Confirmed"}
          </Text>
          {confirmedUniversal.checkInCode ? (
            <Card style={{ gap: 4, backgroundColor: colors.bgElevated }}>
              <Text style={{ color: colors.muted, fontSize: 11 }}>FRONT-DESK CHECK-IN CODE</Text>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                {confirmedUniversal.checkInCode}
              </Text>
            </Card>
          ) : null}
          {confirmedUniversal.ticketPasses.map((pass) => (
            <Card key={pass.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.bgElevated }}>
              <View>
                <Text style={{ color: colors.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{pass.passCode}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{pass.attendeeName || "Guest"}</Text>
              </View>
              <Badge label={pass.status} tone="brand" />
            </Card>
          ))}
          <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 }}>
            <Text style={{ color: colors.text, fontWeight: "700" }}>Total</Text>
            <Text style={{ color: colors.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
              {formatMoney(confirmedUniversal.totalAmount)}
            </Text>
          </View>
          <Button label="Go to My Bookings & Passes" onPress={() => router.replace("/(customer)/bookings")} />
          <Button label={`Back to ${business.name}`} tone="ghost" onPress={() => router.replace(`/(customer)/business/${business.id}`)} />
        </Card>
      </Screen>
    );
  }

  const chosenTime = selectedTime && slots.includes(selectedTime) ? selectedTime : slots[0] ?? "";
  const totals = bookingTotals(activeService?.price ?? 0);
  const confirmedApt = confirmedId ? state.appointments.find((a) => a.id === confirmedId) : undefined;

  if (confirmedId && activeService) {
    return (
      <Screen>
        <BrandHeader title="Booking Confirmed" />
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Badge
              label={confirmedApt?.status === "pending" ? "Approval requested" : "Confirmed"}
              tone={confirmedApt?.status === "pending" ? "warning" : "success"}
            />
            <Text style={{ color: colors.muted, fontSize: 12, fontVariant: ["tabular-nums"] }}>Ref #{confirmedId}</Text>
          </View>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>You&apos;re booked at {business.name}</Text>
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
            {activeService.name} ({activeService.durationMinutes} min) with{" "}
            {activeEmployee ? displayUser(state, activeEmployee.userId) : "Staff"} on{" "}
            {formatDate(`${date}T12:00:00`, { weekday: "long", month: "short", day: "numeric" })} at {chosenTime}.
          </Text>

          <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Service Fee</Text>
              <Text style={{ color: colors.text, fontVariant: ["tabular-nums"] }}>{formatMoney(totals.subtotal)}</Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Est. Tax (8%)</Text>
              <Text style={{ color: colors.text, fontVariant: ["tabular-nums"] }}>{formatMoney(totals.tax)}</Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.text, fontWeight: "700" }}>Total</Text>
              <Text style={{ color: colors.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{formatMoney(totals.total)}</Text>
            </View>
            <Text style={{ color: colors.muted, fontSize: 11 }}>
              Payment: {paymentMethod.replaceAll("_", " ")} · {business.address}, {business.city}
            </Text>
          </View>

          <Button label="View Booking Details" onPress={() => router.replace(`/(customer)/booking/${confirmedId}`)} />
          <Button label="Go to My Bookings" tone="soft" onPress={() => router.replace("/(customer)/bookings")} />
          <Button label={`Back to ${business.name}`} tone="ghost" onPress={() => router.replace(`/(customer)/business/${business.id}`)} />
        </Card>
      </Screen>
    );
  }

  const confirmBooking = async () => {
    if (!auth.userId || !activeService || !activeEmployee || !chosenTime) {
      setError("Please select an available time slot.");
      return;
    }
    setError("");
    if (usingMocks()) {
      const res = createAppointment({
        customerId: auth.userId,
        serviceId: activeService.id,
        employeeId: activeEmployee.id,
        date,
        time: chosenTime,
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
    setSubmitting(true);
    try {
      const res = await createAppointmentRemote({
        customerId: auth.userId,
        serviceId: activeService.id,
        employeeId: activeEmployee.id,
        date,
        time: chosenTime,
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
  };

  const confirmResourceBooking = async () => {
    if (!auth.userId || !activeResource) return;
    const chosenSlot = resourceSlots.find((s) => s.time === selectedTime) ?? resourceSlots[0];
    if (!chosenSlot) {
      setError("Select an open window first.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const payload = {
        bookingModel: "resource" as const,
        businessId: business.id,
        resourceId: activeResource.id,
        startAt: chosenSlot.startAt,
        endAt: chosenSlot.endAt,
        quantityUnits: Math.max(1, Number(quantityUnits) || 1),
        partySize: Math.max(1, Number(partySize) || 1),
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
  };

  const confirmEventBooking = async () => {
    if (!auth.userId || !activeSession) return;
    const items = activeSession.tiers
      .map((t) => ({ tierId: t.id, quantity: tierQty[t.id] ?? 0 }))
      .filter((x) => x.quantity > 0);
    if (items.length === 0) {
      setError("Select at least 1 ticket or class spot.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const payload = {
        bookingModel: selectedModel,
        businessId: business.id,
        sessionId: activeSession.id,
        ticketItems: items,
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
  };

  return (
    <Screen scroll={false} padded={false}>
      <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 8 }}>
        <BrandHeader
          title={selectedModel === "appointment" ? `Book (${step}/4)` : `Book · ${bookingModelLabel(selectedModel)}`}
          showBack
        />
        {models.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
            {models.map((m) => (
              <Chip
                key={m}
                label={bookingModelLabel(m)}
                active={selectedModel === m}
                onPress={() => {
                  setSelectedModel(m);
                  setError("");
                  setSelectedTime("");
                }}
              />
            ))}
          </ScrollView>
        ) : null}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }}>
        {selectedModel === "appointment" ? (
          !activeService ? (
            <EmptyState title="No services available" body="Switch booking type above to reserve a space or event." />
          ) : (
            <>
              <Card onPress={() => setStep(1)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>1. SERVICE</Text>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>
                    {activeService.name} · {activeService.price === 0 ? "Free" : formatMoney(activeService.price)}
                  </Text>
                </View>
                <Badge label={step === 1 ? "Editing" : "Change"} tone="brand" />
              </Card>

              {step === 1 ? (
                <Card style={{ gap: 8 }}>
                  {services.map((svc) => (
                    <Pressable
                      key={svc.id}
                      onPress={() => {
                        setServiceId(svc.id);
                        setEmployeeId("");
                        setSelectedTime("");
                        setStep(2);
                      }}
                      style={{
                        padding: 12,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: svc.id === activeService.id ? brand.primary : colors.line,
                        backgroundColor: colors.bgElevated,
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontWeight: "700" }}>{svc.name}</Text>
                        <Text style={{ color: colors.muted, fontSize: 12 }}>{svc.durationMinutes} min</Text>
                      </View>
                      <Text style={{ color: colors.text, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                        {svc.price === 0 ? "Free" : formatMoney(svc.price)}
                      </Text>
                    </Pressable>
                  ))}
                </Card>
              ) : null}

              <Card onPress={() => setStep(2)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <Avatar name={activeEmployee ? displayUser(state, activeEmployee.userId) : "Staff"} size={34} />
                  <View>
                    <Text style={{ color: colors.muted, fontSize: 11 }}>2. PROFESSIONAL</Text>
                    <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>
                      {activeEmployee ? displayUser(state, activeEmployee.userId) : "Any Specialist"}
                    </Text>
                  </View>
                </View>
                <Badge label={step === 2 ? "Editing" : "Change"} tone="brand" />
              </Card>

              {step === 2 ? (
                <Card style={{ gap: 8 }}>
                  {eligibleEmployees.map((emp) => {
                    const name = displayUser(state, emp.userId);
                    return (
                      <Pressable
                        key={emp.id}
                        onPress={() => {
                          setEmployeeId(emp.id);
                          setSelectedTime("");
                          setStep(3);
                        }}
                        style={{
                          padding: 12,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: emp.id === activeEmployee?.id ? brand.primary : colors.line,
                          backgroundColor: colors.bgElevated,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <Avatar name={name} size={36} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: colors.text, fontWeight: "700" }}>{name}</Text>
                          <Text style={{ color: colors.muted, fontSize: 12 }}>{emp.title} · ★ {emp.rating.toFixed(1)}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </Card>
              ) : null}

              <Card style={{ gap: 12 }}>
                <Pressable onPress={() => setStep(3)}>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>3. Date &amp; Time</Text>
                </Pressable>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {dateDays.map((d) => {
                    const active = d === date;
                    return (
                      <Pressable
                        key={d}
                        onPress={() => {
                          setDate(d);
                          setSelectedTime("");
                          setStep(3);
                        }}
                        style={{
                          width: 58,
                          paddingVertical: 10,
                          borderRadius: 14,
                          alignItems: "center",
                          backgroundColor: active ? brand.primary : colors.bgElevated,
                          borderWidth: 1,
                          borderColor: active ? brand.primary : colors.line,
                        }}
                      >
                        <Text style={{ color: active ? "#FFF" : colors.muted, fontSize: 11 }}>
                          {formatDate(`${d}T12:00:00`, { weekday: "short" })}
                        </Text>
                        <Text style={{ color: active ? "#FFF" : colors.text, fontSize: 16, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                          {d.slice(8, 10)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {slots.length === 0 ? (
                  <Text style={{ color: colors.muted, fontSize: 13 }}>Closed or fully booked on this date. Try another day.</Text>
                ) : (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {slots.map((slot) => {
                      const on = slot === chosenTime;
                      return (
                        <Pressable
                          key={slot}
                          onPress={() => {
                            setSelectedTime(slot);
                            setStep(4);
                          }}
                          style={{
                            width: "48%",
                            minHeight: 44,
                            borderRadius: 12,
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: on ? brand.primary : colors.bgElevated,
                            borderWidth: 1,
                            borderColor: on ? brand.primary : colors.line,
                          }}
                        >
                          <Text style={{ color: on ? "#FFF" : colors.text, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                            {slot}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </Card>

              <Card style={{ gap: 10 }}>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>4. Payment &amp; Review</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {PAYMENT_OPTIONS.map((opt) => (
                    <Chip
                      key={opt.id}
                      label={opt.label}
                      active={paymentMethod === opt.id}
                      onPress={() => {
                        setPaymentMethod(opt.id);
                        setStep(4);
                      }}
                    />
                  ))}
                </View>
                <InputField
                  label="Notes for provider (optional)"
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  placeholder="Allergies, styling goals, or arrival notes..."
                />
                <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8, gap: 4 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>Service Fee</Text>
                    <Text style={{ color: colors.text, fontVariant: ["tabular-nums"] }}>{formatMoney(totals.subtotal)}</Text>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>Estimated Tax (8%)</Text>
                    <Text style={{ color: colors.text, fontVariant: ["tabular-nums"] }}>{formatMoney(totals.tax)}</Text>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: colors.text, fontWeight: "700" }}>Estimated Total</Text>
                    <Text style={{ color: colors.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{formatMoney(totals.total)}</Text>
                  </View>
                </View>
                <Text style={{ color: colors.muted, fontSize: 11 }}>{activeService.cancellationPolicy}</Text>
              </Card>
            </>
          )
        ) : null}

        {selectedModel === "resource" ? (
          !activeResource ? (
            <EmptyState title="No bookable spaces" body="This venue has not published rooms, tables, or courts yet." />
          ) : (
            <>
              <Card style={{ gap: 8 }}>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>1. Select Space or Resource</Text>
                {resources.map((res) => (
                  <Pressable
                    key={res.id}
                    onPress={() => {
                      setResourceId(res.id);
                      setSelectedTime("");
                    }}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: res.id === activeResource.id ? brand.primary : colors.line,
                      backgroundColor: colors.bgElevated,
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: "700" }}>{res.name}</Text>
                      <Text style={{ color: colors.muted, fontSize: 12 }}>
                        Up to {res.capacityPeople} guests · {res.unitsTotal} unit(s)
                      </Text>
                    </View>
                    <Text style={{ color: colors.text, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                      {res.basePrice === 0 ? "Free" : formatMoney(res.basePrice)}
                    </Text>
                  </Pressable>
                ))}
              </Card>

              <Card style={{ gap: 10 }}>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>2. Date &amp; Open Windows</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {dateDays.map((d) => {
                    const active = d === date;
                    return (
                      <Chip
                        key={d}
                        label={formatDate(`${d}T12:00:00`, { weekday: "short", day: "numeric" })}
                        active={active}
                        onPress={() => {
                          setDate(d);
                          setSelectedTime("");
                        }}
                      />
                    );
                  })}
                </ScrollView>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {resourceSlots.map((slot) => {
                    const current = selectedTime && resourceSlots.some((s) => s.time === selectedTime) ? selectedTime : resourceSlots[0]?.time;
                    return (
                      <Chip
                        key={slot.time}
                        label={`${slot.time} (${slot.remainingUnits} left)`}
                        active={current === slot.time}
                        onPress={() => setSelectedTime(slot.time)}
                      />
                    );
                  })}
                </View>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <InputField label="Units" value={quantityUnits} onChangeText={setQuantityUnits} keyboardType="numeric" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <InputField label="Guests" value={partySize} onChangeText={setPartySize} keyboardType="numeric" />
                  </View>
                </View>
              </Card>

              <Card style={{ gap: 10 }}>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>3. Payment &amp; Requests</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {PAYMENT_OPTIONS.map((opt) => (
                    <Chip key={opt.id} label={opt.label} active={paymentMethod === opt.id} onPress={() => setPaymentMethod(opt.id)} />
                  ))}
                </View>
                <InputField label="Special requests" value={notes} onChangeText={setNotes} placeholder="Seating preference or setup..." />
              </Card>
            </>
          )
        ) : null}

        {selectedModel === "ticket" || selectedModel === "capacity" ? (
          !activeOffering || !activeSession ? (
            <EmptyState title="No scheduled sessions" body="This venue has no open sessions for this model." />
          ) : (
            <>
              <Card style={{ gap: 8 }}>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>
                  1. Choose {selectedModel === "ticket" ? "Event" : "Class"} &amp; Session
                </Text>
                {offerings.map((off) => (
                  <Pressable
                    key={off.id}
                    onPress={() => {
                      setOfferingId(off.id);
                      setSessionId(off.sessions[0]?.id ?? "");
                      setTierQty({});
                    }}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: off.id === activeOffering.id ? brand.primary : colors.line,
                      backgroundColor: colors.bgElevated,
                    }}
                  >
                    <Text style={{ color: colors.text, fontWeight: "700" }}>{off.title}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>{off.venueArea || off.category}</Text>
                  </Pressable>
                ))}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {activeOffering.sessions.map((ses) => (
                    <Chip
                      key={ses.id}
                      label={`${formatDateTime(ses.startAt)} (${ses.remainingCapacity} left)`}
                      active={activeSession.id === ses.id}
                      onPress={() => {
                        setSessionId(ses.id);
                        setTierQty({});
                      }}
                    />
                  ))}
                </ScrollView>
              </Card>

              <Card style={{ gap: 8 }}>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>
                  2. Select {selectedModel === "ticket" ? "Ticket Tiers" : "Spots"}
                </Text>
                {activeSession.tiers.map((tier) => {
                  const qty = tierQty[tier.id] ?? 0;
                  return (
                    <View key={tier.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontWeight: "700" }}>{tier.name}</Text>
                        <Text style={{ color: colors.muted, fontSize: 12 }}>
                          {formatMoney(tier.price)} · {tier.remaining ?? activeSession.remainingCapacity} left
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Button
                          label="-"
                          tone="ghost"
                          small
                          onPress={() => setTierQty({ ...tierQty, [tier.id]: Math.max(0, qty - 1) })}
                        />
                        <Text style={{ color: colors.text, fontWeight: "800", minWidth: 18, textAlign: "center" }}>{qty}</Text>
                        <Button
                          label="+"
                          tone="soft"
                          small
                          onPress={() =>
                            setTierQty({ ...tierQty, [tier.id]: Math.min(activeSession.maxPerBooking, qty + 1) })
                          }
                        />
                      </View>
                    </View>
                  );
                })}
              </Card>

              <Card style={{ gap: 10 }}>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>3. Attendee &amp; Payment</Text>
                <InputField label="Attendee name" value={attendeeName} onChangeText={setAttendeeName} placeholder="Name on pass" />
                <InputField label="Attendee email" value={attendeeEmail} onChangeText={setAttendeeEmail} placeholder="Pass email" autoCapitalize="none" />
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {PAYMENT_OPTIONS.map((opt) => (
                    <Chip key={opt.id} label={opt.label} active={paymentMethod === opt.id} onPress={() => setPaymentMethod(opt.id)} />
                  ))}
                </View>
              </Card>
            </>
          )
        ) : null}

        {error ? <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
      </ScrollView>

      {selectedModel === "appointment" && activeService ? (
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderTopWidth: 1,
            borderTopColor: colors.line,
            backgroundColor: colors.sidebar,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View>
            <Text style={{ color: colors.muted, fontSize: 11 }}>
              Total ({activeService.durationMinutes} min)
            </Text>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
              {activeService.price === 0 ? "Free" : formatMoney(totals.total)}
            </Text>
          </View>
          <Button
            label={submitting ? "Confirming..." : "Confirm Booking →"}
            disabled={!chosenTime || submitting}
            onPress={confirmBooking}
            style={{ minWidth: 180 }}
          />
        </View>
      ) : null}

      {selectedModel === "resource" && activeResource ? (
        <View
          style={{
            paddingHorizontal: 16,
            paddingVertical: 14,
            borderTopWidth: 1,
            borderTopColor: colors.line,
            backgroundColor: colors.sidebar,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View>
            <Text style={{ color: colors.muted, fontSize: 11 }}>{quantityUnits} unit(s)</Text>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
              {formatMoney(activeResource.basePrice * Math.max(1, Number(quantityUnits) || 1))}
            </Text>
          </View>
          <Button
            label={submitting ? "Reserving..." : "Reserve Space →"}
            disabled={resourceSlots.length === 0 || submitting}
            onPress={confirmResourceBooking}
            style={{ minWidth: 180 }}
          />
        </View>
      ) : null}

      {(selectedModel === "ticket" || selectedModel === "capacity") && activeSession ? (() => {
        const totalAmt = activeSession.tiers.reduce((sum, t) => sum + t.price * (tierQty[t.id] ?? 0), 0);
        const totalQty = activeSession.tiers.reduce((sum, t) => sum + (tierQty[t.id] ?? 0), 0);
        return (
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderTopWidth: 1,
              borderTopColor: colors.line,
              backgroundColor: colors.sidebar,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <View>
              <Text style={{ color: colors.muted, fontSize: 11 }}>{totalQty} pass(es)</Text>
              <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                {formatMoney(totalAmt)}
              </Text>
            </View>
            <Button
              label={submitting ? "Booking..." : selectedModel === "ticket" ? "Issue Tickets →" : "Reserve Spot →"}
              disabled={totalQty === 0 || submitting}
              onPress={confirmEventBooking}
              style={{ minWidth: 180 }}
            />
          </View>
        );
      })() : null}
    </Screen>
  );
}
