import {
  addReview,
  addReviewRemote,
  displayUser,
  fetchAvailabilityRemote,
  rescheduleAppointment,
  rescheduleAppointmentRemote,
  resourcesForBusiness,
  sendBusinessMessage,
  sendBusinessMessageRemote,
  setAppointmentStatus,
  setAppointmentStatusRemote,
  setUniversalBookingStatus,
  setUniversalBookingStatusRemote,
  universalBookingById,
  useBookItState,
  usingMocks,
} from "@bookit/api-client";
import { brand } from "@bookit/design-system";
import { appointmentStatus, universalBookingStatus } from "@bookit/ui";
import {
  addDays,
  availableSlots,
  bookingModelLabel,
  bookingTotals,
  DEMO_TODAY,
  formatDate,
  formatDateTime,
  formatMoney,
  todayInput,
} from "@bookit/utils";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, EmptyState, InputField, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function CustomerBookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const auth = useAuth();
  const state = useBookItState();
  const router = useRouter();
  const { colors } = useThemePalette();

  const apt = state.appointments.find((a) => a.id === id);
  const ub = id ? universalBookingById(state, id) : undefined;
  const bizId = apt?.businessId ?? ub?.businessId ?? "";
  const biz = bizId ? state.businesses.find((b) => b.id === bizId) : undefined;
  const svc = apt ? state.services.find((s) => s.id === apt.serviceId) : undefined;
  const emp = apt ? state.employees.find((e) => e.id === apt.employeeId) : undefined;
  const resources = bizId ? resourcesForBusiness(state, bizId, true) : [];

  const mockMode = usingMocks();
  const today = useMemo(() => (mockMode ? DEMO_TODAY : todayInput()), [mockMode]);

  const [showReschedule, setShowReschedule] = useState(false);
  const [newDate, setNewDate] = useState(() => (apt ? apt.start.slice(0, 10) : addDays(today, 1)));
  const [newTime, setNewTime] = useState("");
  const [remoteSlots, setRemoteSlots] = useState<string[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [slotsRetry, setSlotsRetry] = useState(0);
  const [showReview, setShowReview] = useState(false);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [showMessage, setShowMessage] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const [notice, setNotice] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [modalError, setModalError] = useState("");
  const [busy, setBusy] = useState(false);

  const dateDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i)), [today]);

  useEffect(() => {
    if (!showReschedule || !apt || !biz) return;
    if (mockMode) {
      setRemoteSlots(null);
      setSlotsError("");
      setSlotsLoading(false);
      return;
    }
    let active = true;
    setSlotsLoading(true);
    setSlotsError("");
    void fetchAvailabilityRemote(biz.id, apt.serviceId, newDate, apt.employeeId).then((res) => {
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
  }, [showReschedule, apt, biz, newDate, mockMode, slotsRetry]);

  const openSlots = useMemo(() => {
    if (!mockMode) return remoteSlots ?? [];
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
  }, [mockMode, remoteSlots, apt, biz, svc, newDate, state.employees, state.appointments]);

  // Universal booking detail view
  if (!apt && ub) {
    if (auth.userId && ub.customerId !== auth.userId && !auth.user?.isPlatformAdmin) {
      return (
        <Screen>
          <BrandHeader title="Booking Details" showBack />
          <EmptyState title="Booking not found" body="Check your bookings list for active reservations." />
        </Screen>
      );
    }
    const meta = universalBookingStatus(ub.status);
    const alloc = ub.resourceAllocations[0];
    const res = alloc ? resources.find((r) => r.id === alloc.resourceId) : undefined;
    return (
      <Screen>
        <BrandHeader title="Booking Details" showBack />
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Badge label={bookingModelLabel(ub.bookingModel)} tone="brand" />
            <Badge label={meta.label} tone={meta.tone} />
          </View>
          <Text style={{ color: colors.text, fontSize: 21, fontWeight: "800" }}>{ub.title}</Text>
          <Pressable onPress={() => biz && router.push(`/(customer)/business/${biz.id}`)}>
            <Text style={{ color: brand.lavender, fontSize: 14, fontWeight: "700" }}>{biz?.name} →</Text>
          </Pressable>
          {res ? (
            <Text style={{ color: colors.muted, fontSize: 13 }}>Space: {res.name}</Text>
          ) : null}
          {ub.startAt ? (
            <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
              {formatDateTime(ub.startAt)}
              {ub.endAt ? ` → ${formatDateTime(ub.endAt)}` : ""}
            </Text>
          ) : null}
          {alloc ? (
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {alloc.partySize} guest(s) · {alloc.quantityUnits} unit(s)
            </Text>
          ) : null}
          {ub.checkInCode ? (
            <Card style={{ gap: 4, backgroundColor: colors.bgElevated }}>
              <Text style={{ color: colors.muted, fontSize: 11 }}>FRONT-DESK CHECK-IN CODE</Text>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                {ub.checkInCode}
              </Text>
            </Card>
          ) : null}
          {ub.ticketPasses.map((pass) => (
            <Card key={pass.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.bgElevated }}>
              <View>
                <Text style={{ color: colors.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{pass.passCode}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {pass.attendeeName || "Guest"} · {formatMoney(pass.unitPrice)}
                </Text>
              </View>
              <Badge label={pass.status} tone={pass.status === "checked_in" ? "info" : "success"} />
            </Card>
          ))}
          <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Subtotal</Text>
              <Text style={{ color: colors.text, fontVariant: ["tabular-nums"] }}>{formatMoney(ub.subtotalAmount)}</Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Tax</Text>
              <Text style={{ color: colors.text, fontVariant: ["tabular-nums"] }}>{formatMoney(ub.taxAmount)}</Text>
            </View>
            {ub.depositDueAmount > 0 ? (
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: colors.muted, fontSize: 12 }}>Deposit Due</Text>
                <Text style={{ color: colors.lavender, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                  {formatMoney(ub.depositDueAmount)}
                </Text>
              </View>
            ) : null}
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.text, fontWeight: "700" }}>Total ({ub.paymentStatus})</Text>
              <Text style={{ color: colors.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{formatMoney(ub.totalAmount)}</Text>
            </View>
          </View>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{ub.cancellationPolicySnapshot ?? biz?.cancellationPolicy}</Text>
        </Card>

        {notice ? <Text style={{ color: brand.lavender, fontSize: 13 }}>{notice}</Text> : null}
        {errorMsg ? <Text style={{ color: colors.danger, fontSize: 13 }}>{errorMsg}</Text> : null}

        <View style={{ gap: 10 }}>
          {["held", "pending", "confirmed"].includes(ub.status) && auth.userId ? (
            <Button
              label={busy ? "Cancelling..." : "Cancel Booking"}
              tone="danger"
              disabled={busy}
              onPress={async () => {
                setErrorMsg("");
                setBusy(true);
                try {
                  const res = usingMocks()
                    ? setUniversalBookingStatus(ub.id, "cancelled", auth.userId!)
                    : await setUniversalBookingStatusRemote(ub.id, "cancelled", "Customer cancelled");
                  if (!res.ok) {
                    setErrorMsg(res.error);
                    return;
                  }
                  setNotice("Booking cancelled.");
                } finally {
                  setBusy(false);
                }
              }}
            />
          ) : null}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button label="Message Business" tone="ghost" style={{ flex: 1 }} onPress={() => { setModalError(""); setShowMessage(true); }} />
            <Button
              label="Book Again"
              tone="ghost"
              style={{ flex: 1 }}
              onPress={() => biz && router.push(`/(customer)/book/${biz.id}?model=${ub.bookingModel}`)}
            />
          </View>
        </View>

        <Modal visible={showMessage} transparent animationType="slide" onRequestClose={() => setShowMessage(false)}>
          <View style={{ flex: 1, backgroundColor: "rgba(8,8,14,0.75)", justifyContent: "center", padding: 20 }}>
            <Card style={{ gap: 12 }}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>Message {biz?.name}</Text>
              <InputField label="Message" value={messageBody} onChangeText={setMessageBody} multiline placeholder="Question or update..." />
              {modalError ? <Text style={{ color: colors.danger, fontSize: 12 }}>{modalError}</Text> : null}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Button label="Cancel" tone="ghost" style={{ flex: 1 }} onPress={() => setShowMessage(false)} />
                <Button
                  label={busy ? "Sending..." : "Send"}
                  disabled={busy}
                  style={{ flex: 1 }}
                  onPress={async () => {
                    if (!auth.userId) {
                      setModalError("Please sign in to send a message.");
                      return;
                    }
                    setModalError("");
                    setBusy(true);
                    try {
                      const res = mockMode
                        ? sendBusinessMessage(auth.userId, ub.businessId, messageBody)
                        : await sendBusinessMessageRemote(ub.businessId, messageBody);
                      if (!res.ok) {
                        setModalError(res.error);
                        return;
                      }
                      setNotice("Message sent.");
                      setMessageBody("");
                      setShowMessage(false);
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </View>
            </Card>
          </View>
        </Modal>
      </Screen>
    );
  }

  if (!apt || (auth.userId && apt.customerId !== auth.userId && !auth.user?.isPlatformAdmin)) {
    return (
      <Screen>
        <BrandHeader title="Booking Details" showBack />
        <EmptyState title="Booking not found" body="Check your bookings list for active appointments." />
      </Screen>
    );
  }

  const meta = appointmentStatus(apt.status);
  const totals = bookingTotals(apt.price);
  const chosenSlot = newTime && openSlots.includes(newTime) ? newTime : openSlots[0] ?? "";

  return (
    <Screen>
      <BrandHeader title="Booking Details" showBack />

      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Badge label={meta.label} tone={meta.tone} />
          <Text style={{ color: colors.muted, fontSize: 12, fontVariant: ["tabular-nums"] }}>#{apt.id}</Text>
        </View>
        <Text style={{ color: colors.text, fontSize: 21, fontWeight: "800" }}>{svc?.name ?? "Appointment"}</Text>
        <Pressable onPress={() => biz && router.push(`/(customer)/business/${biz.id}`)}>
          <Text style={{ color: brand.lavender, fontSize: 14, fontWeight: "700" }}>{biz?.name} →</Text>
        </Pressable>
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          Specialist: {emp ? displayUser(state, emp.userId) : "Staff member"}
        </Text>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
          {formatDateTime(apt.start)}
        </Text>
        {apt.notes ? (
          <View style={{ padding: 10, borderRadius: 10, backgroundColor: colors.bgElevated }}>
            <Text style={{ color: colors.muted, fontSize: 11 }}>Your notes</Text>
            <Text style={{ color: colors.text, fontSize: 13 }}>{apt.notes}</Text>
          </View>
        ) : null}
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
            <Text style={{ color: colors.text, fontWeight: "700" }}>Total ({apt.paymentStatus})</Text>
            <Text style={{ color: colors.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
              {formatMoney(totals.total)}
            </Text>
          </View>
          {apt.paymentMethod ? (
            <Text style={{ color: colors.muted, fontSize: 11 }}>Method: {apt.paymentMethod.replaceAll("_", " ")}</Text>
          ) : null}
        </View>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{biz?.cancellationPolicy}</Text>
      </Card>

      {notice ? <Text style={{ color: brand.lavender, fontSize: 13 }}>{notice}</Text> : null}
      {errorMsg ? <Text style={{ color: colors.danger, fontSize: 13 }}>{errorMsg}</Text> : null}

      <View style={{ gap: 10 }}>
        {(apt.status === "pending" || apt.status === "confirmed") && auth.userId ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button
              label="Reschedule"
              tone="soft"
              style={{ flex: 1 }}
              onPress={() => {
                setErrorMsg("");
                setModalError("");
                setNewDate(apt.start.slice(0, 10) || addDays(today, 1));
                setShowReschedule(true);
              }}
            />
            <Button
              label={busy ? "Cancelling..." : "Cancel Booking"}
              tone="danger"
              disabled={busy}
              style={{ flex: 1 }}
              onPress={async () => {
                setErrorMsg("");
                setBusy(true);
                try {
                  const res = mockMode
                    ? setAppointmentStatus(apt.id, "cancelled", auth.userId!)
                    : await setAppointmentStatusRemote(apt.id, "cancelled", "Customer cancelled");
                  if (!res.ok) {
                    setErrorMsg(res.error);
                    return;
                  }
                  setNotice("Appointment cancelled.");
                } finally {
                  setBusy(false);
                }
              }}
            />
          </View>
        ) : null}

        {apt.status === "completed" ? (
          <Button label="Leave a Review" tone="soft" onPress={() => { setModalError(""); setShowReview(true); }} />
        ) : null}

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button label="Message Business" tone="ghost" style={{ flex: 1 }} onPress={() => { setModalError(""); setShowMessage(true); }} />
          <Button
            label="Book Again"
            tone="ghost"
            style={{ flex: 1 }}
            onPress={() => biz && router.push(`/(customer)/book/${biz.id}?model=appointment&service=${apt.serviceId}`)}
          />
        </View>
      </View>

      <Modal visible={showReschedule} transparent animationType="slide" onRequestClose={() => setShowReschedule(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(8,8,14,0.75)", justifyContent: "center", padding: 20 }}>
          <Card style={{ gap: 12 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>Reschedule Appointment</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {dateDays.map((d) => {
                const active = d === newDate;
                return (
                  <Pressable
                    key={d}
                    onPress={() => {
                      setNewDate(d);
                      setNewTime("");
                    }}
                    style={{
                      width: 56,
                      paddingVertical: 8,
                      borderRadius: 12,
                      alignItems: "center",
                      backgroundColor: active ? brand.primary : colors.bgElevated,
                      borderWidth: 1,
                      borderColor: active ? brand.primary : colors.line,
                    }}
                  >
                    <Text style={{ color: active ? "#FFF" : colors.muted, fontSize: 11 }}>
                      {formatDate(`${d}T12:00:00`, { weekday: "short" })}
                    </Text>
                    <Text style={{ color: active ? "#FFF" : colors.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                      {d.slice(8, 10)}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {slotsLoading ? (
              <Text style={{ color: colors.muted, fontSize: 13 }}>Loading available times...</Text>
            ) : slotsError ? (
              <View style={{ gap: 8 }}>
                <Text style={{ color: colors.danger, fontSize: 13 }}>{slotsError}</Text>
                <Button label="Retry" tone="soft" small onPress={() => setSlotsRetry((n) => n + 1)} />
              </View>
            ) : openSlots.length === 0 ? (
              <Text style={{ color: colors.muted, fontSize: 13 }}>No open times on this date. Pick another day.</Text>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {openSlots.map((slot) => {
                  const on = slot === chosenSlot;
                  return (
                    <Pressable
                      key={slot}
                      onPress={() => setNewTime(slot)}
                      style={{
                        width: "31%",
                        minHeight: 40,
                        borderRadius: 10,
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
            {errorMsg ? <Text style={{ color: colors.danger, fontSize: 12 }}>{errorMsg}</Text> : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="Cancel" tone="ghost" style={{ flex: 1 }} onPress={() => setShowReschedule(false)} />
              <Button
                label={busy ? "Saving..." : "Save Time"}
                disabled={busy || !chosenSlot}
                style={{ flex: 1 }}
                onPress={async () => {
                  if (!auth.userId || !chosenSlot) return;
                  setErrorMsg("");
                  setBusy(true);
                  try {
                    const res = mockMode
                      ? rescheduleAppointment(apt.id, newDate, chosenSlot, auth.userId)
                      : await rescheduleAppointmentRemote(apt.id, newDate, chosenSlot);
                    if (!res.ok) {
                      setErrorMsg(res.error);
                      return;
                    }
                    setNotice(`Rescheduled to ${newDate} at ${chosenSlot}.`);
                    setShowReschedule(false);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </View>
          </Card>
        </View>
      </Modal>

      <Modal visible={showReview} transparent animationType="slide" onRequestClose={() => setShowReview(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(8,8,14,0.75)", justifyContent: "center", padding: 20 }}>
          <Card style={{ gap: 12 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>Review {biz?.name}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[5, 4, 3, 2, 1].map((n) => (
                <Button key={n} label={`${n}★`} tone={rating === n ? "primary" : "ghost"} small onPress={() => setRating(n)} />
              ))}
            </View>
            <InputField label="Headline" value={title} onChangeText={setTitle} />
            <InputField label="Experience" value={body} onChangeText={setBody} multiline />
            {modalError ? <Text style={{ color: colors.danger, fontSize: 12 }}>{modalError}</Text> : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="Cancel" tone="ghost" style={{ flex: 1 }} onPress={() => setShowReview(false)} />
              <Button
                label={busy ? "Submitting..." : "Submit"}
                disabled={busy}
                style={{ flex: 1 }}
                onPress={async () => {
                  if (!auth.userId) {
                    setModalError("Please sign in to publish a review.");
                    return;
                  }
                  setModalError("");
                  setBusy(true);
                  try {
                    const res = mockMode
                      ? addReview({
                          authorId: auth.userId,
                          businessId: apt.businessId,
                          appointmentId: apt.id,
                          rating,
                          title,
                          body,
                        })
                      : await addReviewRemote({
                          businessId: apt.businessId,
                          appointmentId: apt.id,
                          rating,
                          title,
                          body,
                        });
                    if (!res.ok) {
                      setModalError(res.error);
                      return;
                    }
                    setNotice("Review published.");
                    setTitle("");
                    setBody("");
                    setShowReview(false);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </View>
          </Card>
        </View>
      </Modal>

      <Modal visible={showMessage} transparent animationType="slide" onRequestClose={() => setShowMessage(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(8,8,14,0.75)", justifyContent: "center", padding: 20 }}>
          <Card style={{ gap: 12 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>Message {biz?.name}</Text>
            <InputField label="Message" value={messageBody} onChangeText={setMessageBody} multiline placeholder="Question or arrival update..." />
            {modalError ? <Text style={{ color: colors.danger, fontSize: 12 }}>{modalError}</Text> : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="Cancel" tone="ghost" style={{ flex: 1 }} onPress={() => setShowMessage(false)} />
              <Button
                label={busy ? "Sending..." : "Send"}
                disabled={busy}
                style={{ flex: 1 }}
                onPress={async () => {
                  if (!auth.userId) {
                    setModalError("Please sign in to send a message.");
                    return;
                  }
                  setModalError("");
                  setBusy(true);
                  try {
                    const res = mockMode
                      ? sendBusinessMessage(auth.userId, apt.businessId, messageBody)
                      : await sendBusinessMessageRemote(apt.businessId, messageBody);
                    if (!res.ok) {
                      setModalError(res.error);
                      return;
                    }
                    setNotice("Message sent.");
                    setMessageBody("");
                    setShowMessage(false);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}
