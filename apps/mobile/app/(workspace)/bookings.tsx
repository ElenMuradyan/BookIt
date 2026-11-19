import { businessAppointments, displayUser, setAppointmentStatus, useBookItState } from "@bookit/api-client";
import { appointmentStatus } from "@bookit/ui";
import { can, formatDateTime, formatMoney } from "@bookit/utils";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, Chip, EmptyState, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function WorkspaceBookingsScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const { colors } = useThemePalette();
  const [filter, setFilter] = useState<"all" | "pending" | "confirmed" | "completed">("all");

  if (!auth.workspace || !auth.userId) return null;
  const canManage = can(auth.workspace.role, "bookings.manage");
  const rows = businessAppointments(state, auth.workspace.businessId).filter((a) => filter === "all" || a.status === filter);

  return (
    <Screen>
      <BrandHeader mode="workspace" showBack />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {(["all", "pending", "confirmed", "completed"] as const).map((f) => (
          <Chip key={f} label={f.toUpperCase()} active={filter === f} onPress={() => setFilter(f)} />
        ))}
      </View>

      {rows.length === 0 ? (
        <EmptyState title="No bookings" body="No appointments match this status filter." />
      ) : (
        rows.map((apt) => {
          const svc = state.services.find((s) => s.id === apt.serviceId);
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
              <Text style={{ color: colors.muted, fontSize: 12 }}>{svc?.name} · {formatDateTime(apt.start)}</Text>
              {canManage ? (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                  {apt.status === "pending" ? (
                    <Button label="Approve" tone="soft" small style={{ flex: 1 }} onPress={() => setAppointmentStatus(apt.id, "confirmed", auth.userId!)} />
                  ) : null}
                  {apt.status === "confirmed" ? (
                    <Button label="Complete" tone="soft" small style={{ flex: 1 }} onPress={() => setAppointmentStatus(apt.id, "completed", auth.userId!)} />
                  ) : null}
                  {apt.status !== "cancelled" && apt.status !== "completed" ? (
                    <Button label="Cancel" tone="danger" small style={{ flex: 1 }} onPress={() => setAppointmentStatus(apt.id, "cancelled", auth.userId!)} />
                  ) : null}
                </View>
              ) : null}
            </Card>
          );
        })
      )}
    </Screen>
  );
}
