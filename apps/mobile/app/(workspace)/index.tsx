import {
  businessAppointments,
  createStaffAppointment,
  displayUser,
  setAppointmentStatus,
  useBookItState,
} from "@bookit/api-client";
import { brand } from "@bookit/design-system";
import type { Appointment } from "@bookit/types";
import { appointmentStatus } from "@bookit/ui";
import { addDays, can, DEMO_TODAY, formatDate, formatMoney, formatTime } from "@bookit/utils";
import React, { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, Chip, EmptyState, InputField, Screen, StatCard } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function WorkspaceScheduleScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const { colors } = useThemePalette();

  const bizId = auth.workspace?.businessId ?? "";
  const services = state.services.filter((s) => s.businessId === bizId && s.active);
  const employees = state.employees.filter((e) => e.businessId === bizId);
  const customers = state.users.filter((u) => !u.isPlatformAdmin);

  const [selectedDate, setSelectedDate] = useState(DEMO_TODAY);
  const [staffId, setStaffId] = useState("all");
  const [selectedApt, setSelectedApt] = useState<Appointment | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newCustomerId, setNewCustomerId] = useState(customers[0]?.id ?? "usr_elena");
  const [newServiceId, setNewServiceId] = useState(services[0]?.id ?? "");
  const [newEmployeeId, setNewEmployeeId] = useState(employees[0]?.id ?? "");
  const [newTime, setNewTime] = useState("11:00");
  const [error, setError] = useState("");

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(DEMO_TODAY, i)), []);

  if (!auth.workspace || !auth.userId) return null;
  const canManage = can(auth.workspace.role, "calendar.manage");
  const allAppts = businessAppointments(state, bizId);
  const dayAppts = allAppts.filter((a) => {
    if (!a.start.startsWith(selectedDate)) return false;
    if (staffId !== "all" && a.employeeId !== staffId) return false;
    return true;
  });
  const pendingCount = allAppts.filter((a) => a.status === "pending").length;
  const revenueToday = dayAppts.reduce((s, a) => s + a.price, 0);

  return (
    <Screen>
      <BrandHeader
        mode="workspace"
        right={canManage ? <Button label="+ New" small onPress={() => setShowCreate(true)} /> : undefined}
      />

      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatCard label="Selected Day" value={String(dayAppts.length)} hint="Appointments" icon="calendar-outline" />
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
                paddingVertical: 10,
                borderRadius: 14,
                alignItems: "center",
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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label="All Staff" active={staffId === "all"} onPress={() => setStaffId("all")} />
        {employees.map((emp) => (
          <Chip
            key={emp.id}
            label={displayUser(state, emp.userId)}
            active={staffId === emp.id}
            onPress={() => setStaffId(emp.id)}
          />
        ))}
      </ScrollView>

      {dayAppts.length === 0 ? (
        <EmptyState title="Open schedule" body="No appointments on this day for the selected filter." />
      ) : (
        dayAppts.map((apt) => {
          const svc = state.services.find((s) => s.id === apt.serviceId);
          const emp = state.employees.find((e) => e.id === apt.employeeId);
          const st = appointmentStatus(apt.status);
          return (
            <Card key={apt.id} onPress={() => setSelectedApt(apt)} style={{ gap: 6 }}>
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
            </Card>
          );
        })
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
              {canManage ? (
                <View style={{ gap: 8 }}>
                  <Button
                    label="Confirm"
                    tone="soft"
                    onPress={() => {
                      setAppointmentStatus(selectedApt.id, "confirmed", auth.userId!);
                      setSelectedApt(null);
                    }}
                  />
                  <Button
                    label="Mark Completed"
                    tone="soft"
                    onPress={() => {
                      setAppointmentStatus(selectedApt.id, "completed", auth.userId!);
                      setSelectedApt(null);
                    }}
                  />
                  <Button
                    label="Cancel Appointment"
                    tone="danger"
                    onPress={() => {
                      setAppointmentStatus(selectedApt.id, "cancelled", auth.userId!);
                      setSelectedApt(null);
                    }}
                  />
                </View>
              ) : null}
              <Button label="Close" tone="ghost" onPress={() => setSelectedApt(null)} />
            </Card>
          ) : null}
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
                label="Create"
                style={{ flex: 1 }}
                onPress={() => {
                  const res = createStaffAppointment({
                    businessId: bizId,
                    customerId: newCustomerId,
                    serviceId: newServiceId || services[0]?.id || "",
                    employeeId: newEmployeeId || employees[0]?.id || "",
                    date: selectedDate,
                    time: newTime,
                  });
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  setShowCreate(false);
                  setError("");
                }}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}
