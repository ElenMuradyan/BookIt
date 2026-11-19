import {
  businessAppointments,
  displayUser,
  rescheduleAppointment,
  setAppointmentStatus,
  updateAppointmentNotes,
  useBookItState,
} from "@bookit/api-client";
import type { Appointment } from "@bookit/types";
import { appointmentStatus } from "@bookit/ui";
import { addDays, availableSlots, can, DEMO_TODAY, formatDateTime, formatMoney } from "@bookit/utils";
import React, { useState } from "react";
import { Modal, ScrollView, Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, Chip, EmptyState, InputField, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

const FILTERS = ["all", "pending", "confirmed", "completed", "cancelled", "rejected", "no_show"] as const;

export default function WorkspaceBookingsScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const { colors } = useThemePalette();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [notesTarget, setNotesTarget] = useState<Appointment | null>(null);
  const [noteText, setNoteText] = useState("");
  const [rescheduleTarget, setRescheduleTarget] = useState<Appointment | null>(null);
  const [date, setDate] = useState(addDays(DEMO_TODAY, 1));
  const [time, setTime] = useState("10:00");

  if (!auth.workspace || !auth.userId) return null;
  const bizId = auth.workspace.businessId;
  const biz = state.businesses.find((b) => b.id === bizId);
  const canManage = can(auth.workspace.role, "bookings.manage");
  const canViewCustomers = can(auth.workspace.role, "customers.view");
  const rows = businessAppointments(state, bizId).filter((a) => filter === "all" || a.status === filter);

  const rescheduleSvc = rescheduleTarget ? state.services.find((s) => s.id === rescheduleTarget.serviceId) : undefined;
  const openSlots =
    rescheduleTarget && rescheduleSvc && biz
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

  return (
    <Screen>
      <BrandHeader mode="workspace" showBack />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {FILTERS.map((f) => (
          <Chip key={f} label={f.replaceAll("_", " ").toUpperCase()} active={filter === f} onPress={() => setFilter(f)} />
        ))}
      </ScrollView>

      {rows.length === 0 ? (
        <EmptyState title="No bookings" body="No appointments match this status filter." />
      ) : (
        rows.map((apt) => {
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
                      <Button label="Approve" tone="soft" small onPress={() => setAppointmentStatus(apt.id, "confirmed", auth.userId!)} />
                      <Button label="Reject" tone="danger" small onPress={() => setAppointmentStatus(apt.id, "rejected", auth.userId!)} />
                    </>
                  ) : null}
                  {apt.status === "confirmed" ? (
                    <>
                      <Button label="Complete" tone="soft" small onPress={() => setAppointmentStatus(apt.id, "completed", auth.userId!)} />
                      <Button label="No-show" tone="ghost" small onPress={() => setAppointmentStatus(apt.id, "no_show", auth.userId!)} />
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
                        }}
                      />
                      <Button label="Cancel" tone="danger" small onPress={() => setAppointmentStatus(apt.id, "cancelled", auth.userId!)} />
                    </>
                  ) : null}
                  <Button
                    label="Notes"
                    tone="ghost"
                    small
                    onPress={() => {
                      setNotesTarget(apt);
                      setNoteText(apt.notes ?? "");
                    }}
                  />
                </View>
              ) : null}
            </Card>
          );
        })
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
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Button label="Cancel" tone="ghost" style={{ flex: 1 }} onPress={() => setNotesTarget(null)} />
                <Button
                  label="Save"
                  style={{ flex: 1 }}
                  onPress={() => {
                    updateAppointmentNotes(bizId, notesTarget.id, noteText);
                    setNotesTarget(null);
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
              {openSlots.length > 0 ? (
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
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Button label="Cancel" tone="ghost" style={{ flex: 1 }} onPress={() => setRescheduleTarget(null)} />
                <Button
                  label="Update"
                  style={{ flex: 1 }}
                  onPress={() => {
                    rescheduleAppointment(rescheduleTarget.id, date, time, auth.userId!);
                    setRescheduleTarget(null);
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
