import { Ionicons } from "@expo/vector-icons";
import {
  addBlockedSlot,
  addBlockedSlotRemote,
  addBusinessHoliday,
  addBusinessHolidayRemote,
  businessAppointments,
  businessUniversalBookings,
  createAppointmentRemote,
  createStaffAppointment,
  displayUser,
  removeBlockedSlot,
  removeBlockedSlotRemote,
  removeBusinessHoliday,
  removeBusinessHolidayRemote,
  resourceBlocksForBusiness,
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
import { brand } from "@bookit/design-system";
import type { Appointment, AppointmentStatus, UniversalBooking, UniversalBookingStatus } from "@bookit/types";
import { appointmentStatus, universalBookingStatus } from "@bookit/ui";
import { addDays, bookingModelLabel, can, DEMO_TODAY, formatDate, formatDateTime, formatMoney, formatTime, todayInput } from "@bookit/utils";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, Chip, EmptyState, InputField, Screen, StatCard } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function WorkspaceScheduleScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const router = useRouter();
  const { colors } = useThemePalette();

  const bizId = auth.workspace?.businessId ?? "";
  const biz = state.businesses.find((b) => b.id === bizId);
  const services = state.services.filter((s) => s.businessId === bizId && s.active);
  const employees = state.employees.filter((e) => e.businessId === bizId);
  const resources = resourcesForBusiness(state, bizId, true);
  const resourceBlocks = resourceBlocksForBusiness(state, bizId);
  const customers = state.users.filter((u) => !u.isPlatformAdmin);

  const mockMode = usingMocks();
  const today = mockMode ? DEMO_TODAY : todayInput();

  const [selectedDate, setSelectedDate] = useState(today);
  const [staffId, setStaffId] = useState("all");
  const [selectedApt, setSelectedApt] = useState<Appointment | null>(null);
  const [selectedUb, setSelectedUb] = useState<UniversalBooking | null>(null);
  const [aptNote, setAptNote] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showBlocks, setShowBlocks] = useState(false);
  const [holidayDate, setHolidayDate] = useState(addDays(today, 5));
  const [holidayName, setHolidayName] = useState("");
  const [blockDate, setBlockDate] = useState(addDays(today, 2));
  const [blockStart, setBlockStart] = useState("12:00");
  const [blockEnd, setBlockEnd] = useState("13:00");
  const [blockReason, setBlockReason] = useState("");
  const [blockNotice, setBlockNotice] = useState("");
  const [newCustomerId, setNewCustomerId] = useState(customers[0]?.id ?? "usr_elena");
  const [newServiceId, setNewServiceId] = useState(services[0]?.id ?? "");
  const [newEmployeeId, setNewEmployeeId] = useState(employees[0]?.id ?? "");
  const [newTime, setNewTime] = useState("11:00");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i)), [today]);

  if (!auth.workspace || !auth.userId || !biz) return null;
  const actorId = auth.userId;
  const isRestricted = biz.status === "suspended" || biz.status === "rejected";
  const isPending = biz.status !== "approved" && !isRestricted;
  const canManage = can(auth.workspace.role, "calendar.manage");
  const canViewCustomers = can(auth.workspace.role, "customers.view");
  const unreadNotifs = state.notifications.filter((n) => n.businessId === bizId && !n.read).length;
  const allAppts = businessAppointments(state, bizId);
  const allUniversal = businessUniversalBookings(state, bizId).filter(
    (ub) => !(ub.bookingModel === "appointment" && ub.legacyAppointmentId),
  );

  const dayAppts = allAppts.filter((a) => {
    if (!a.start.startsWith(selectedDate)) return false;
    if (staffId !== "all" && a.employeeId !== staffId) return false;
    return true;
  });

  const dayUniversal = allUniversal.filter((ub) => {
    if (staffId !== "all") return false;
    const startD = (ub.startAt ?? ub.createdAt).slice(0, 10);
    const endD = ub.endAt ? ub.endAt.slice(0, 10) : startD;
    if (ub.bookingModel === "resource" && endD > startD) {
      return selectedDate >= startD && selectedDate < endD;
    }
    return startD === selectedDate;
  });

  const dayBlocks = resourceBlocks.filter(
    (blk) => selectedDate >= blk.startAt.slice(0, 10) && selectedDate <= blk.endAt.slice(0, 10),
  );

  const pendingCount =
    allAppts.filter((a) => a.status === "pending").length +
    allUniversal.filter((u) => u.status === "pending" || u.status === "held").length;
  const revenueToday =
    dayAppts.reduce((s, a) => s + a.price, 0) + dayUniversal.reduce((s, u) => s + u.totalAmount, 0);
  const aptCustomer = selectedApt ? state.users.find((u) => u.id === selectedApt.customerId) : undefined;
  const ubCustomer = selectedUb ? state.users.find((u) => u.id === selectedUb.customerId) : undefined;

  async function handleAptStatus(status: AppointmentStatus) {
    if (!selectedApt) return;
    setError("");
    setBusy(true);
    try {
      const res = usingMocks()
        ? setAppointmentStatus(selectedApt.id, status, actorId)
        : await setAppointmentStatusRemote(selectedApt.id, status);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSelectedApt(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleUbStatus(status: UniversalBookingStatus) {
    if (!selectedUb) return;
    setError("");
    setBusy(true);
    try {
      const res = usingMocks()
        ? setUniversalBookingStatus(selectedUb.id, status, actorId)
        : await setUniversalBookingStatusRemote(selectedUb.id, status);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSelectedUb(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <BrandHeader
        mode="workspace"
        right={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Pressable
              onPress={() => router.push("/(workspace)/notifications")}
              accessibilityLabel="Workspace notifications"
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: colors.card,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="notifications-outline" size={18} color={colors.text} />
              {unreadNotifs > 0 ? (
                <View
                  style={{
                    position: "absolute",
                    top: 8,
                    right: 8,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: brand.primary,
                  }}
                />
              ) : null}
            </Pressable>
            {canManage && services.length > 0 ? (
              <Button label="+ New" small disabled={isRestricted} onPress={() => { setError(""); setShowCreate(true); }} />
            ) : null}
          </View>
        }
      />

      {isRestricted ? (
        <Card style={{ gap: 4, borderColor: colors.danger }}>
          <Text style={{ color: colors.danger, fontWeight: "700", fontSize: 13 }}>
            {biz.status === "suspended" ? "Business suspended" : "Application rejected"}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            Live bookings and workspace mutations are disabled until platform admin restores approval.
          </Text>
        </Card>
      ) : null}

      {isPending ? (
        <Card style={{ gap: 4, borderColor: brand.primary }}>
          <Text style={{ color: colors.lavender, fontWeight: "700", fontSize: 13 }}>
            Verification pending ({biz.status.replaceAll("_", " ")})
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            You can finish setting up inventory and hours while admin review completes. Live customer bookings unlock on approval.
          </Text>
        </Card>
      ) : null}

      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatCard label="Selected Day" value={String(dayAppts.length + dayUniversal.length)} hint="Bookings" icon="calendar-outline" />
        <StatCard label="Pending Requests" value={String(pendingCount)} hint={formatMoney(revenueToday) + " day"} icon="time-outline" />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {days.map((d) => {
          const on = d === selectedDate;
          return (
            <Pressable
              key={d}
              onPress={() => setSelectedDate(d)}
              style={{
                width: 58,
                minHeight: 52,
                paddingVertical: 10,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: on ? brand.primary : colors.card,
                borderWidth: 1,
                borderColor: on ? brand.primary : colors.line,
              }}
            >
              <Text style={{ color: on ? "#FFF" : colors.muted, fontSize: 11 }}>
                {formatDate(`${d}T12:00:00`, { weekday: "short" })}
              </Text>
              <Text style={{ color: on ? "#FFF" : colors.text, fontSize: 16, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                {d.slice(8, 10)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label="All Schedule" active={staffId === "all"} onPress={() => setStaffId("all")} />
          {employees.map((emp) => (
            <Chip
              key={emp.id}
              label={displayUser(state, emp.userId)}
              active={staffId === emp.id}
              onPress={() => setStaffId(emp.id)}
            />
          ))}
        </ScrollView>
        {canManage ? (
          <Button label="Blocks" tone="soft" small onPress={() => { setBlockNotice(""); setShowBlocks(true); }} />
        ) : null}
      </View>

      {dayAppts.length === 0 && dayUniversal.length === 0 && dayBlocks.length === 0 ? (
        <EmptyState title="Open schedule" body="No bookings or blocks on this day for the selected filter." />
      ) : (
        <>
          {dayAppts.map((apt) => {
            const svc = state.services.find((s) => s.id === apt.serviceId);
            const emp = state.employees.find((e) => e.id === apt.employeeId);
            const st = appointmentStatus(apt.status);
            return (
              <Card
                key={apt.id}
                onPress={() => {
                  setSelectedApt(apt);
                  setAptNote(apt.notes ?? "");
                  setError("");
                }}
                style={{ gap: 6 }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: colors.lavender, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                    {formatTime(apt.start)} – {formatTime(apt.end)}
                  </Text>
                  <Badge label={st.label} tone={st.tone} />
                </View>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>{displayUser(state, apt.customerId)}</Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>
                  {svc?.name} · {emp ? displayUser(state, emp.userId) : "Staff"}
                </Text>
                {apt.notes ? <Text style={{ color: colors.lavender, fontSize: 12 }}>Note: {apt.notes}</Text> : null}
              </Card>
            );
          })}

          {dayUniversal.map((ub) => {
            const st = universalBookingStatus(ub.status);
            const alloc = ub.resourceAllocations[0];
            const res = alloc ? resources.find((r) => r.id === alloc.resourceId) : undefined;
            return (
              <Card
                key={ub.id}
                onPress={() => {
                  setSelectedUb(ub);
                  setError("");
                }}
                style={{ gap: 6 }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: colors.lavender, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                    {ub.startAt ? formatTime(ub.startAt) : bookingModelLabel(ub.bookingModel)}
                  </Text>
                  <Badge label={st.label} tone={st.tone} />
                </View>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>{displayUser(state, ub.customerId)}</Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>
                  {res?.name ?? ub.title} · {ub.quantity}x{alloc?.partySize ? ` · ${alloc.partySize} guests` : ""}
                </Text>
                {ub.checkInCode ? (
                  <Text style={{ color: colors.lavender, fontSize: 12, fontVariant: ["tabular-nums"] }}>Code: {ub.checkInCode}</Text>
                ) : null}
              </Card>
            );
          })}

          {dayBlocks.map((blk) => {
            const res = resources.find((r) => r.id === blk.resourceId);
            return (
              <Card key={blk.id} style={{ gap: 4 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Badge label="Space Blocked" tone="warning" />
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{blk.unitsBlocked} unit(s)</Text>
                </View>
                <Text style={{ color: colors.text, fontWeight: "700" }}>{res?.name ?? blk.resourceId}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {formatDateTime(blk.startAt)} → {formatDateTime(blk.endAt)} · {blk.reason}
                </Text>
              </Card>
            );
          })}
        </>
      )}

      <Modal visible={Boolean(selectedApt)} transparent animationType="fade" onRequestClose={() => setSelectedApt(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(8,8,14,0.75)", justifyContent: "center", padding: 20 }}>
          {selectedApt ? (
            <Card style={{ gap: 12 }}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
                {displayUser(state, selectedApt.customerId)}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                {state.services.find((s) => s.id === selectedApt.serviceId)?.name} · {formatTime(selectedApt.start)}
              </Text>
              {canViewCustomers && aptCustomer ? (
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  Contact: {aptCustomer.phone} · {aptCustomer.email}
                </Text>
              ) : null}
              <InputField
                label="Booking Notes"
                value={aptNote}
                editable={canManage}
                onChangeText={setAptNote}
                multiline
                placeholder="Customer requests or internal staff notes"
              />
              {error ? <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text> : null}
              {canManage ? (
                <View style={{ gap: 8 }}>
                  <Button
                    label="Save Notes"
                    tone="soft"
                    disabled={busy}
                    onPress={async () => {
                      setError("");
                      setBusy(true);
                      try {
                        const res = usingMocks()
                          ? updateAppointmentNotes(bizId, selectedApt.id, aptNote)
                          : await updateAppointmentNotesRemote(selectedApt.id, aptNote);
                        if (!res.ok) {
                          setError(res.error);
                          return;
                        }
                        setSelectedApt({ ...selectedApt, notes: aptNote.trim() || undefined });
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                  <Button label="Confirm" tone="soft" disabled={busy} onPress={() => void handleAptStatus("confirmed")} />
                  <Button label="Mark Completed" tone="soft" disabled={busy} onPress={() => void handleAptStatus("completed")} />
                  <Button label="Mark No-show" tone="ghost" disabled={busy} onPress={() => void handleAptStatus("no_show")} />
                  <Button label="Cancel Appointment" tone="danger" disabled={busy} onPress={() => void handleAptStatus("cancelled")} />
                </View>
              ) : null}
              <Button label="Close" tone="ghost" onPress={() => setSelectedApt(null)} />
            </Card>
          ) : null}
        </View>
      </Modal>

      <Modal visible={Boolean(selectedUb)} transparent animationType="fade" onRequestClose={() => setSelectedUb(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(8,8,14,0.75)", justifyContent: "center", padding: 20 }}>
          {selectedUb ? (
            <Card style={{ gap: 10 }}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>{selectedUb.title}</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                {displayUser(state, selectedUb.customerId)} · {bookingModelLabel(selectedUb.bookingModel)}
              </Text>
              {selectedUb.startAt ? (
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {formatDateTime(selectedUb.startAt)}
                  {selectedUb.endAt ? ` → ${formatDateTime(selectedUb.endAt)}` : ""}
                </Text>
              ) : null}
              {canViewCustomers && ubCustomer ? (
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  Contact: {ubCustomer.phone} · {ubCustomer.email}
                </Text>
              ) : null}
              {error ? <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text> : null}
              {canManage ? (
                <View style={{ gap: 8 }}>
                  {(selectedUb.status === "pending" || selectedUb.status === "held") ? (
                    <>
                      <Button label="Confirm" tone="soft" disabled={busy} onPress={() => void handleUbStatus("confirmed")} />
                      <Button label="Reject" tone="danger" disabled={busy} onPress={() => void handleUbStatus("rejected")} />
                    </>
                  ) : null}
                  {selectedUb.status === "confirmed" ? (
                    <>
                      <Button label="Complete" tone="soft" disabled={busy} onPress={() => void handleUbStatus("completed")} />
                      <Button label="No-show" tone="ghost" disabled={busy} onPress={() => void handleUbStatus("no_show")} />
                      <Button label="Cancel" tone="danger" disabled={busy} onPress={() => void handleUbStatus("cancelled")} />
                    </>
                  ) : null}
                </View>
              ) : null}
              <Button label="Close" tone="ghost" onPress={() => setSelectedUb(null)} />
            </Card>
          ) : null}
        </View>
      </Modal>

      <Modal visible={showBlocks} transparent animationType="slide" onRequestClose={() => setShowBlocks(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(8,8,14,0.75)", justifyContent: "center", padding: 20 }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}>
            <Card style={{ gap: 12 }}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>Holidays &amp; Blocked Time</Text>
              {blockNotice ? <Text style={{ color: colors.lavender, fontSize: 12 }}>{blockNotice}</Text> : null}

              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>Holidays ({biz.holidays.length})</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {biz.holidays.map((h) => (
                  <Chip
                    key={h.date}
                    label={`${h.name} (${h.date}) ×`}
                    active
                    onPress={async () => {
                      const res = usingMocks()
                        ? removeBusinessHoliday(bizId, h.date)
                        : await removeBusinessHolidayRemote(bizId, h.date);
                      setBlockNotice(res.ok ? `Removed holiday ${h.name}.` : res.error);
                    }}
                  />
                ))}
                {biz.holidays.length === 0 ? <Text style={{ color: colors.muted, fontSize: 12 }}>No holidays set.</Text> : null}
              </View>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <InputField label="Holiday Date" value={holidayDate} onChangeText={setHolidayDate} placeholder="YYYY-MM-DD" />
                </View>
                <View style={{ flex: 1 }}>
                  <InputField label="Holiday Name" value={holidayName} onChangeText={setHolidayName} placeholder="Team Day" />
                </View>
              </View>
              <Button
                label="Add Holiday"
                tone="soft"
                small
                disabled={busy}
                onPress={async () => {
                  setBusy(true);
                  try {
                    const res = usingMocks()
                      ? addBusinessHoliday(bizId, holidayDate, holidayName)
                      : await addBusinessHolidayRemote(bizId, holidayDate, holidayName);
                    if (!res.ok) {
                      setBlockNotice(res.error);
                      return;
                    }
                    setHolidayName("");
                    setBlockNotice("Holiday added.");
                  } finally {
                    setBusy(false);
                  }
                }}
              />

              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13, marginTop: 4 }}>
                Blocked Slots ({biz.blocked.length})
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {biz.blocked.map((b) => (
                  <Chip
                    key={b.id}
                    label={`${b.date} ${b.start}-${b.end} ×`}
                    onPress={async () => {
                      const res = usingMocks()
                        ? removeBlockedSlot(bizId, b.id)
                        : await removeBlockedSlotRemote(bizId, b.id);
                      setBlockNotice(res.ok ? "Removed blocked time." : res.error);
                    }}
                  />
                ))}
                {biz.blocked.length === 0 ? <Text style={{ color: colors.muted, fontSize: 12 }}>No blocked slots.</Text> : null}
              </View>
              <InputField label="Block Date (YYYY-MM-DD)" value={blockDate} onChangeText={setBlockDate} />
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <InputField label="Start (HH:MM)" value={blockStart} onChangeText={setBlockStart} />
                </View>
                <View style={{ flex: 1 }}>
                  <InputField label="End (HH:MM)" value={blockEnd} onChangeText={setBlockEnd} />
                </View>
              </View>
              <InputField label="Reason" value={blockReason} onChangeText={setBlockReason} placeholder="Staff training" />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Button label="Close" tone="ghost" style={{ flex: 1 }} onPress={() => setShowBlocks(false)} />
                <Button
                  label="Block Time"
                  style={{ flex: 1 }}
                  disabled={busy}
                  onPress={async () => {
                    setBusy(true);
                    try {
                      const res = usingMocks()
                        ? addBlockedSlot(bizId, blockDate, blockStart, blockEnd, blockReason)
                        : await addBlockedSlotRemote(bizId, blockDate, blockStart, blockEnd, blockReason);
                      if (!res.ok) {
                        setBlockNotice(res.error);
                        return;
                      }
                      setBlockReason("");
                      setBlockNotice("Blocked time added.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              </View>
            </Card>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showCreate} transparent animationType="slide" onRequestClose={() => setShowCreate(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(8,8,14,0.75)", justifyContent: "center", padding: 20 }}>
          <Card style={{ gap: 12 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>Create Appointment</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>Customer</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {customers.map((c) => (
                <Chip key={c.id} label={c.firstName} active={newCustomerId === c.id} onPress={() => setNewCustomerId(c.id)} />
              ))}
            </ScrollView>
            <Text style={{ color: colors.muted, fontSize: 12 }}>Service</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {services.map((s) => (
                <Chip key={s.id} label={s.name} active={(newServiceId || services[0]?.id) === s.id} onPress={() => setNewServiceId(s.id)} />
              ))}
            </ScrollView>
            <Text style={{ color: colors.muted, fontSize: 12 }}>Staff</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {employees.map((e) => (
                <Chip key={e.id} label={displayUser(state, e.userId)} active={(newEmployeeId || employees[0]?.id) === e.id} onPress={() => setNewEmployeeId(e.id)} />
              ))}
            </ScrollView>
            <InputField label="Time (HH:MM)" value={newTime} onChangeText={setNewTime} />
            {error ? <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text> : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="Cancel" tone="ghost" style={{ flex: 1 }} onPress={() => setShowCreate(false)} />
              <Button
                label={busy ? "Creating..." : "Create"}
                style={{ flex: 1 }}
                disabled={busy}
                onPress={async () => {
                  setError("");
                  setBusy(true);
                  try {
                    const payload = {
                      businessId: bizId,
                      customerId: newCustomerId,
                      serviceId: newServiceId || services[0]?.id || "",
                      employeeId: newEmployeeId || employees[0]?.id || "",
                      date: selectedDate,
                      time: newTime,
                    };
                    const res = usingMocks()
                      ? createStaffAppointment(payload)
                      : await createAppointmentRemote(payload);
                    if (!res.ok) {
                      setError(res.error);
                      return;
                    }
                    setShowCreate(false);
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
