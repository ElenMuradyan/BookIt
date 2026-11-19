import {
  customerAppointments,
  displayUser,
  setAppointmentStatus,
  useBookItState,
} from "@bookit/api-client";
import { appointmentStatus } from "@bookit/ui";
import { demoNow, formatDateTime, formatMoney } from "@bookit/utils";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, Chip, EmptyState, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function CustomerBookingsScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const router = useRouter();
  const { colors } = useThemePalette();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  if (!auth.userId) return null;
  const now = demoNow().getTime();
  const rows = customerAppointments(state, auth.userId).filter((a) => {
    const isPast = a.status === "completed" || a.status === "cancelled" || a.status === "rejected" || new Date(a.start).getTime() < now;
    return tab === "upcoming" ? !isPast : isPast;
  });

  return (
    <Screen>
      <BrandHeader title="My Bookings" />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip label="Upcoming" active={tab === "upcoming"} onPress={() => setTab("upcoming")} />
        <Chip label="Past & Cancelled" active={tab === "past"} onPress={() => setTab("past")} />
      </View>

      {rows.length === 0 ? (
        <EmptyState title="No bookings here" body="Schedule an appointment from Explore to see it here." />
      ) : (
        rows.map((apt) => {
          const biz = state.businesses.find((b) => b.id === apt.businessId);
          const svc = state.services.find((s) => s.id === apt.serviceId);
          const emp = state.employees.find((e) => e.id === apt.employeeId);
          const meta = appointmentStatus(apt.status);
          return (
            <Card key={apt.id} onPress={() => router.push(`/(customer)/booking/${apt.id}`)} style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Badge label={meta.label} tone={meta.tone} />
                <Text style={{ color: colors.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                  {formatMoney(apt.price)}
                </Text>
              </View>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>{svc?.name}</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                {biz?.name} · with {emp ? displayUser(state, emp.userId) : "Staff"}
              </Text>
              <Text style={{ color: colors.lavender, fontSize: 12, fontVariant: ["tabular-nums"] }}>
                {formatDateTime(apt.start)}
              </Text>
              {tab === "upcoming" && (apt.status === "pending" || apt.status === "confirmed") ? (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                  <Button
                    label="Details & Reschedule"
                    tone="soft"
                    small
                    style={{ flex: 1 }}
                    onPress={() => router.push(`/(customer)/booking/${apt.id}`)}
                  />
                  <Button
                    label="Cancel"
                    tone="danger"
                    small
                    onPress={() => setAppointmentStatus(apt.id, "cancelled", auth.userId!)}
                  />
                </View>
              ) : (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                  <Button
                    label="Details"
                    tone="ghost"
                    small
                    style={{ flex: 1 }}
                    onPress={() => router.push(`/(customer)/booking/${apt.id}`)}
                  />
                  <Button
                    label="Book Again"
                    tone="soft"
                    small
                    style={{ flex: 1 }}
                    onPress={() => biz && router.push(`/(customer)/book/${biz.id}?service=${apt.serviceId}`)}
                  />
                </View>
              )}
            </Card>
          );
        })
      )}
    </Screen>
  );
}
