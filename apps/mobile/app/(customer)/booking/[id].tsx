import {
  addReview,
  displayUser,
  rescheduleAppointment,
  sendBusinessMessage,
  setAppointmentStatus,
  useBookItState,
} from "@bookit/api-client";
import { brand } from "@bookit/design-system";
import { appointmentStatus } from "@bookit/ui";
import { addDays, availableSlots, bookingTotals, DEMO_TODAY, formatDate, formatDateTime, formatMoney } from "@bookit/utils";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
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
  const biz = apt ? state.businesses.find((b) => b.id === apt.businessId) : undefined;
  const svc = apt ? state.services.find((s) => s.id === apt.serviceId) : undefined;
  const emp = apt ? state.employees.find((e) => e.id === apt.employeeId) : undefined;

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

  const dateDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(DEMO_TODAY, i)), []);
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

      <View style={{ gap: 10 }}>
        {(apt.status === "pending" || apt.status === "confirmed") && auth.userId ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button
              label="Reschedule"
              tone="soft"
              style={{ flex: 1 }}
              onPress={() => {
                setNewDate(apt.start.slice(0, 10) || addDays(DEMO_TODAY, 1));
                setShowReschedule(true);
              }}
            />
            <Button
              label="Cancel Booking"
              tone="danger"
              style={{ flex: 1 }}
              onPress={() => {
                setAppointmentStatus(apt.id, "cancelled", auth.userId!);
                setNotice("Appointment cancelled.");
              }}
            />
          </View>
        ) : null}

        {apt.status === "completed" ? (
          <Button label="Leave a Review" tone="soft" onPress={() => setShowReview(true)} />
        ) : null}

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button label="Message Business" tone="ghost" style={{ flex: 1 }} onPress={() => setShowMessage(true)} />
          <Button
            label="Book Again"
            tone="ghost"
            style={{ flex: 1 }}
            onPress={() => biz && router.push(`/(customer)/book/${biz.id}?service=${apt.serviceId}`)}
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
            {openSlots.length === 0 ? (
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
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="Cancel" tone="ghost" style={{ flex: 1 }} onPress={() => setShowReschedule(false)} />
              <Button
                label="Save Time"
                disabled={!chosenSlot}
                style={{ flex: 1 }}
                onPress={() => {
                  if (!auth.userId || !chosenSlot) return;
                  const res = rescheduleAppointment(apt.id, newDate, chosenSlot, auth.userId);
                  if (res.ok) {
                    setNotice(`Rescheduled to ${newDate} at ${chosenSlot}.`);
                    setShowReschedule(false);
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
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="Cancel" tone="ghost" style={{ flex: 1 }} onPress={() => setShowReview(false)} />
              <Button
                label="Submit"
                style={{ flex: 1 }}
                onPress={() => {
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
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="Cancel" tone="ghost" style={{ flex: 1 }} onPress={() => setShowMessage(false)} />
              <Button
                label="Send"
                style={{ flex: 1 }}
                onPress={() => {
                  if (!auth.userId) return;
                  const res = sendBusinessMessage(auth.userId, apt.businessId, messageBody);
                  if (res.ok) {
                    setNotice("Message sent.");
                    setMessageBody("");
                    setShowMessage(false);
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
