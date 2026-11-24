import {
  customerAppointments,
  customerUniversalBookings,
  displayUser,
  setAppointmentStatus,
  setAppointmentStatusRemote,
  setUniversalBookingStatus,
  setUniversalBookingStatusRemote,
  useBookItState,
  usingMocks,
} from "@bookit/api-client";
import { appointmentStatus, universalBookingStatus } from "@bookit/ui";
import { bookingModelLabel, demoNow, formatDateTime, formatMoney } from "@bookit/utils";
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
  const [errorMsg, setErrorMsg] = useState("");
  const [busy, setBusy] = useState(false);

  if (!auth.userId) return null;
  const userId = auth.userId;
  const now = demoNow().getTime();
  const rows = customerAppointments(state, userId).filter((a) => {
    const isPast = a.status === "completed" || a.status === "cancelled" || a.status === "rejected" || new Date(a.start).getTime() < now;
    return tab === "upcoming" ? !isPast : isPast;
  });
  const universalRows = customerUniversalBookings(state, userId).filter((ub) => {
    if (ub.bookingModel === "appointment" && ub.legacyAppointmentId) return false;
    const refTime = ub.startAt ? new Date(ub.startAt).getTime() : new Date(ub.createdAt).getTime();
    const isPast = ["completed", "cancelled", "rejected", "expired", "no_show"].includes(ub.status) || refTime < now;
    return tab === "upcoming" ? !isPast : isPast;
  });

  return (
    <Screen>
      <BrandHeader title="My Bookings" />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip label="Upcoming" active={tab === "upcoming"} onPress={() => setTab("upcoming")} />
        <Chip label="Past & Cancelled" active={tab === "past"} onPress={() => setTab("past")} />
      </View>
      {errorMsg ? <Text style={{ color: colors.danger, fontSize: 12 }}>{errorMsg}</Text> : null}

      {rows.length === 0 && universalRows.length === 0 ? (
        <EmptyState title="No bookings here" body="Schedule a visit, stay, table, or event from Explore to see it here." />
      ) : (
        <>
          {universalRows.map((ub) => {
            const biz = state.businesses.find((b) => b.id === ub.businessId);
            const meta = universalBookingStatus(ub.status);
            const alloc = ub.resourceAllocations[0];
            return (
              <Card key={ub.id} onPress={() => router.push(`/(customer)/booking/${ub.id}`)} style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                  <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", flex: 1 }}>
                    <Badge label={bookingModelLabel(ub.bookingModel)} tone="brand" />
                    <Badge label={meta.label} tone={meta.tone} />
                  </View>
                  <Text style={{ color: colors.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                    {formatMoney(ub.totalAmount)}
                  </Text>
                </View>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>{ub.title}</Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>
                  {biz?.name} · {ub.quantity}x{alloc?.partySize ? ` · ${alloc.partySize} guests` : ""}
                </Text>
                <Text style={{ color: colors.lavender, fontSize: 12, fontVariant: ["tabular-nums"] }}>
                  {ub.startAt ? formatDateTime(ub.startAt) : formatDateTime(ub.createdAt)}
                  {ub.endAt && ub.bookingModel === "resource" ? ` → ${formatDateTime(ub.endAt)}` : ""}
                </Text>
                {ub.checkInCode ? (
                  <Text style={{ color: colors.text, fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                    Check-in Code: {ub.checkInCode}
                  </Text>
                ) : null}
                {ub.ticketPasses.length > 0 ? (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {ub.ticketPasses.map((p) => (
                      <Badge key={p.id} label={`${p.passCode} · ${p.status}`} tone={p.status === "checked_in" ? "success" : "info"} />
                    ))}
                  </View>
                ) : null}
                <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                  <Button
                    label="Details"
                    tone="soft"
                    small
                    style={{ flex: 1 }}
                    onPress={() => router.push(`/(customer)/booking/${ub.id}`)}
                  />
                  {tab === "upcoming" && ["held", "pending", "confirmed"].includes(ub.status) ? (
                    <Button
                      label="Cancel"
                      tone="danger"
                      small
                      disabled={busy}
                      onPress={async () => {
                        setErrorMsg("");
                        setBusy(true);
                        try {
                          const res = usingMocks()
                            ? setUniversalBookingStatus(ub.id, "cancelled", userId)
                            : await setUniversalBookingStatusRemote(ub.id, "cancelled", "Customer cancelled");
                          if (!res.ok) setErrorMsg(res.error);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                  ) : null}
                </View>
              </Card>
            );
          })}

          {rows.map((apt) => {
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
                      disabled={busy}
                      onPress={async () => {
                        setErrorMsg("");
                        setBusy(true);
                        try {
                          const res = usingMocks()
                            ? setAppointmentStatus(apt.id, "cancelled", userId)
                            : await setAppointmentStatusRemote(apt.id, "cancelled", "Customer cancelled");
                          if (!res.ok) setErrorMsg(res.error);
                        } finally {
                          setBusy(false);
                        }
                      }}
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
                      onPress={() => biz && router.push(`/(customer)/book/${biz.id}?model=appointment&service=${apt.serviceId}`)}
                    />
                  </View>
                )}
              </Card>
            );
          })}
        </>
      )}
    </Screen>
  );
}
