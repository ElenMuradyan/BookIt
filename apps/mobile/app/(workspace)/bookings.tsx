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
import { addDays, availableSlots, bookingModelLabel, can, DEMO_TODAY, formatDateTime, formatMoney, todayInput } from "@bookit/utils";
import React, { useEffect, useState } from "react";
import { Modal, ScrollView, Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, Chip, EmptyState, InputField, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

const FILTERS = ["all", "pending", "confirmed", "completed", "cancelled", "rejected", "no_show"] as const;

export default function WorkspaceBookingsScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const { colors } = useThemePalette();
  const mockMode = usingMocks();
  const today = mockMode ? DEMO_TODAY : todayInput();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [notesTarget, setNotesTarget] = useState<Appointment | null>(null);
  const [noteText, setNoteText] = useState("");
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [date, setDate] = useState(addDays(today, 1));
  const [time, setTime] = useState("10:00");
  const [remoteSlots, setRemoteSlots] = useState<string[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState("");
  const [checkInCode, setCheckInCode] = useState("");
  const [checkInMsg, setCheckInMsg] = useState<{ err?: boolean; text: string } | null>(null);
  const [modalError, setModalError] = useState("");
  const [busy, setBusy] = useState(false);

  const activeBizId = auth.workspace?.businessId ?? "";
  useEffect(() => {
    if (!rescheduleTarget || !activeBizId) {
      setRemoteSlots(null);
      setSlotsError("");
      setSlotsLoading(false);
      return;
    }
    if (mockMode) {
      setRemoteSlots(null);
      return;
    }
    let active = true;
    setSlotsLoading(true);
    setSlotsError("");
    void fetchAvailabilityRemote(activeBizId, rescheduleTarget.serviceId, date, rescheduleTarget.employeeId).then((res) => {
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
  }, [rescheduleTarget, activeBizId, date, mockMode]);

  if (!auth.workspace || !auth.userId) return null;
  const bizId = auth.workspace.businessId;
  const actorId = auth.userId;
  const biz = state.businesses.find((b) => b.id === bizId);
  const resources = resourcesForBusiness(state, bizId, true);
  const canManage = can(auth.workspace.role, "bookings.manage");
  const canViewCustomers = can(auth.workspace.role, "customers.view");
  const rows = businessAppointments(state, bizId).filter((a) => filter === "all" || a.status === filter);
  const universalRows = businessUniversalBookings(state, bizId).filter((ub) => {
    if (ub.bookingModel === "appointment" && ub.legacyAppointmentId) return false;
    return filter === "all" || ub.status === filter;
  });

  const rescheduleSvc = rescheduleTarget ? state.services.find((s) => s.id === rescheduleTarget.serviceId) : undefined;
  const openSlots = !mockMode
    ? remoteSlots ?? []
    : rescheduleTarget && rescheduleSvc && biz
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
      : [];

  const handleAppointmentStatus = async (appointmentId: string, status: AppointmentStatus) => {
    setCheckInMsg(null);
    setBusy(true);
    try {
      const res = usingMocks()
        ? setAppointmentStatus(appointmentId, status, actorId)
        : await setAppointmentStatusRemote(appointmentId, status);
      if (!res.ok) setCheckInMsg({ err: true, text: res.error });
    } finally {
      setBusy(false);
    }
  };

  const handleUniversalStatus = async (bookingId: string, status: UniversalBookingStatus) => {
    setCheckInMsg(null);
    setBusy(true);
    try {
      const res = usingMocks()
        ? setUniversalBookingStatus(bookingId, status, actorId)
        : await setUniversalBookingStatusRemote(bookingId, status);
      if (!res.ok) setCheckInMsg({ err: true, text: res.error });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <BrandHeader mode="workspace" showBack />

      {canManage ? (
        <Card style={{ gap: 8 }}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>Front-Desk QR / Pass Check-In</Text>
          <InputField
            label="Booking or Ticket Code"
            value={checkInCode}
            onChangeText={setCheckInCode}
            placeholder="BK-xxxxxx or TKT-xxxxxx"
            autoCapitalize="characters"
          />
          <Button
            label={busy ? "Working..." : "Check In Guest"}
            disabled={busy || !checkInCode.trim()}
            small
            onPress={async () => {
              setBusy(true);
              setCheckInMsg(null);
              try {
                const res = usingMocks()
                  ? checkInUniversalQr(bizId, checkInCode, actorId)
                  : await checkInUniversalQrRemote(bizId, checkInCode);
                if (!res.ok) {
                  setCheckInMsg({ err: true, text: res.error });
                  return;
                }
                setCheckInMsg({
                  text: `Checked in ${res.data.kind === "ticket_pass" ? "pass" : "booking"} ${res.data.code} (${res.data.title}).`,
                });
                setCheckInCode("");
              } finally {
                setBusy(false);
              }
            }}
          />
          {checkInMsg ? (
            <Text style={{ color: checkInMsg.err ? colors.danger : colors.lavender, fontSize: 12 }}>
              {checkInMsg.text}
            </Text>
          ) : null}
        </Card>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {FILTERS.map((f) => (
          <Chip key={f} label={f.replaceAll("_", " ").toUpperCase()} active={filter === f} onPress={() => setFilter(f)} />
        ))}
      </ScrollView>

      {rows.length === 0 && universalRows.length === 0 ? (
        <EmptyState title="No bookings" body="No appointments, spaces, or event passes match this status filter." />
      ) : (
        <>
          {universalRows.map((ub) => {
            const customer = state.users.find((u) => u.id === ub.customerId);
            const meta = universalBookingStatus(ub.status);
            const alloc = ub.resourceAllocations[0];
            const res = alloc ? resources.find((r) => r.id === alloc.resourceId) : undefined;
            return (
              <Card key={ub.id} style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                  <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", flex: 1 }}>
                    <Badge label={bookingModelLabel(ub.bookingModel)} tone="brand" />
                    <Badge label={meta.label} tone={meta.tone} />
                  </View>
                  <Text style={{ color: colors.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                    {formatMoney(ub.totalAmount)}
                  </Text>
                </View>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>
                  {displayUser(state, ub.customerId)} · {res?.name ?? ub.title}
                </Text>
                {canViewCustomers && customer ? (
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    {customer.phone} · {customer.email}
                  </Text>
                ) : null}
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {ub.startAt ? formatDateTime(ub.startAt) : formatDateTime(ub.createdAt)}
                  {ub.endAt && ub.bookingModel === "resource" ? ` → ${formatDateTime(ub.endAt)}` : ""} · {ub.quantity}x
                  {alloc?.partySize ? ` · ${alloc.partySize} guests` : ""}
                </Text>
                {ub.checkInCode ? (
                  <Text style={{ color: colors.lavender, fontSize: 12, fontVariant: ["tabular-nums"] }}>
                    Code: {ub.checkInCode}
                    {ub.ticketPasses.length > 0 ? ` · ${ub.ticketPasses.length} pass(es)` : ""}
                  </Text>
                ) : null}
                {canManage ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                    {ub.status === "pending" || ub.status === "held" ? (
                      <>
                        <Button label="Approve" tone="soft" small disabled={busy} onPress={() => void handleUniversalStatus(ub.id, "confirmed")} />
                        <Button label="Reject" tone="danger" small disabled={busy} onPress={() => void handleUniversalStatus(ub.id, "rejected")} />
                      </>
                    ) : null}
                    {ub.status === "confirmed" ? (
                      <>
                        <Button label="Complete" tone="soft" small disabled={busy} onPress={() => void handleUniversalStatus(ub.id, "completed")} />
                        <Button label="No-show" tone="ghost" small disabled={busy} onPress={() => void handleUniversalStatus(ub.id, "no_show")} />
                        <Button label="Cancel" tone="danger" small disabled={busy} onPress={() => void handleUniversalStatus(ub.id, "cancelled")} />
                      </>
                    ) : null}
                  </View>
                ) : null}
              </Card>
            );
          })}

          {rows.map((apt) => {
            const customer = state.users.find((u) => u.id === apt.customerId);
            const svc = state.services.find((s) => s.id === apt.serviceId);
            const emp = state.employees.find((e) => e.id === apt.employeeId);
            const meta = appointmentStatus(apt.status);
            return (
              <Card key={apt.id} style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Badge label={meta.label} tone={meta.tone} />
                  <Text style={{ color: colors.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                    {formatMoney(apt.price)}
                  </Text>
                </View>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>{displayUser(state, apt.customerId)}</Text>
                {canViewCustomers && customer ? (
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    {customer.phone} · {customer.email}
                  </Text>
                ) : null}
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {svc?.name} · {emp ? displayUser(state, emp.userId) : "Staff"} · {formatDateTime(apt.start)}
                </Text>
                {apt.notes ? <Text style={{ color: colors.lavender, fontSize: 12 }}>Note: {apt.notes}</Text> : null}
                {canManage ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                    {apt.status === "pending" ? (
                      <>
                        <Button label="Approve" tone="soft" small disabled={busy} onPress={() => void handleAppointmentStatus(apt.id, "confirmed")} />
                        <Button label="Reject" tone="danger" small disabled={busy} onPress={() => void handleAppointmentStatus(apt.id, "rejected")} />
                      </>
                    ) : null}
                    {apt.status === "confirmed" ? (
                      <>
                        <Button label="Complete" tone="soft" small disabled={busy} onPress={() => void handleAppointmentStatus(apt.id, "completed")} />
                        <Button label="No-show" tone="ghost" small disabled={busy} onPress={() => void handleAppointmentStatus(apt.id, "no_show")} />
                      </>
                    ) : null}
                    {apt.status === "pending" || apt.status === "confirmed" ? (
                      <>
                        <Button
                          label="Reschedule"
                          tone="ghost"
                          small
                          onPress={() => {
                            setRescheduleTarget(apt);
                            setDate(apt.start.slice(0, 10));
                            setTime(apt.start.slice(11, 16));
                            setModalError("");
                          }}
                        />
                        <Button label="Cancel" tone="danger" small disabled={busy} onPress={() => void handleAppointmentStatus(apt.id, "cancelled")} />
                      </>
                    ) : null}
                    <Button
                      label="Notes"
                      tone="ghost"
                      small
                      onPress={() => {
                        setNotesTarget(apt);
                        setNoteText(apt.notes ?? "");
                        setModalError("");
                      }}
                    />
                  </View>
                ) : null}
              </Card>
            );
          })}
        </>
      )}

      <Modal visible={Boolean(notesTarget)} transparent animationType="slide" onRequestClose={() => setNotesTarget(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(8,8,14,0.75)", justifyContent: "center", padding: 20 }}>
          {notesTarget ? (
            <Card style={{ gap: 12 }}>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: "800" }}>
                Notes — {displayUser(state, notesTarget.customerId)}
              </Text>
              <InputField
                label="Appointment Notes"
                value={noteText}
                onChangeText={setNoteText}
                multiline
                placeholder="Preparation details, customer requests, or staff notes"
              />
              {modalError ? <Text style={{ color: colors.danger, fontSize: 12 }}>{modalError}</Text> : null}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Button label="Cancel" tone="ghost" style={{ flex: 1 }} onPress={() => setNotesTarget(null)} />
                <Button
                  label={busy ? "Saving..." : "Save"}
                  style={{ flex: 1 }}
                  disabled={busy}
                  onPress={async () => {
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
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </View>
            </Card>
          ) : null}
        </View>
      </Modal>

      <Modal visible={Boolean(rescheduleTarget)} transparent animationType="slide" onRequestClose={() => setRescheduleTarget(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(8,8,14,0.75)", justifyContent: "center", padding: 20 }}>
          {rescheduleTarget ? (
            <Card style={{ gap: 12 }}>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: "800" }}>Reschedule Booking</Text>
              <InputField label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
              {slotsLoading ? (
                <Text style={{ color: colors.muted, fontSize: 12 }}>Loading open slots...</Text>
              ) : slotsError ? (
                <Text style={{ color: colors.danger, fontSize: 12 }}>{slotsError}</Text>
              ) : openSlots.length > 0 ? (
                <View style={{ gap: 6 }}>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>Open slots on {date}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                    {openSlots.map((slot) => (
                      <Chip key={slot} label={slot} active={time === slot} onPress={() => setTime(slot)} />
                    ))}
                  </ScrollView>
                </View>
              ) : (
                <Text style={{ color: colors.muted, fontSize: 12 }}>No standard open slots on {date}; enter override time below.</Text>
              )}
              <InputField label="Time (HH:MM)" value={time} onChangeText={setTime} />
              {modalError ? <Text style={{ color: colors.danger, fontSize: 12 }}>{modalError}</Text> : null}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Button label="Cancel" tone="ghost" style={{ flex: 1 }} onPress={() => setRescheduleTarget(null)} />
                <Button
                  label={busy ? "Updating..." : "Update"}
                  style={{ flex: 1 }}
                  disabled={busy}
                  onPress={async () => {
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
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </View>
            </Card>
          ) : null}
        </View>
      </Modal>
    </Screen>
  );
}
