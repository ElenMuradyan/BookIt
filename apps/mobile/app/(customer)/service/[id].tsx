import {
  displayUser,
  publicBusinessById,
  serviceById,
  toggleFavorite,
  useBookItState,
} from "@bookit/api-client";
import { brand } from "@bookit/design-system";
import { categoryLabels } from "@bookit/ui";
import { bookingTotals, formatMoney } from "@bookit/utils";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Avatar, Badge, BrandHeader, Button, Card, EmptyState, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function ServiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const auth = useAuth();
  const state = useBookItState();
  const router = useRouter();
  const { colors } = useThemePalette();
  const [notice, setNotice] = useState("");

  const service = id ? serviceById(state, id) : undefined;
  const business = service ? publicBusinessById(state, service.businessId) : undefined;

  if (!service || !business) {
    return (
      <Screen>
        <BrandHeader title="Service" showBack />
        <EmptyState title="Service unavailable" body="This service may be inactive or pending business approval." />
      </Screen>
    );
  }

  const eligibleEmployees = state.employees.filter(
    (emp) =>
      emp.businessId === business.id &&
      (service.employeeIds.includes(emp.id) || service.employeeIds.length === 0),
  );
  const totals = bookingTotals(service.price);
  const isFav = auth.userId
    ? state.favorites.some((f) => f.userId === auth.userId && f.targetType === "service" && f.targetId === service.id)
    : false;

  return (
    <Screen>
      <BrandHeader title={service.name} showBack />

      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Badge label={service.category} tone="brand" />
          <Badge
            label={service.requiresApproval ? "Approval required" : "Instant confirmation"}
            tone={service.requiresApproval ? "warning" : "success"}
          />
        </View>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>{service.name}</Text>
        <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>{service.description}</Text>

        <Pressable onPress={() => router.push(`/(customer)/business/${business.id}`)}>
          <Text style={{ color: brand.lavender, fontSize: 13, fontWeight: "600" }}>
            {business.name} · {categoryLabels[business.category]} · {business.city} →
          </Text>
        </Pressable>

        <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, gap: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>Duration</Text>
            <Text style={{ color: colors.text, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
              {service.durationMinutes} min
            </Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>Service Fee</Text>
            <Text style={{ color: colors.text, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
              {service.price === 0 ? "Free" : formatMoney(totals.subtotal)}
            </Text>
          </View>
          {service.depositAmount ? (
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>Deposit</Text>
              <Text style={{ color: colors.text, fontVariant: ["tabular-nums"] }}>{formatMoney(service.depositAmount)}</Text>
            </View>
          ) : null}
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>Est. Tax (8%)</Text>
            <Text style={{ color: colors.text, fontVariant: ["tabular-nums"] }}>{formatMoney(totals.tax)}</Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>Est. Total</Text>
            <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16, fontVariant: ["tabular-nums"] }}>
              {formatMoney(totals.total)}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
          <Button
            label="Book Service"
            style={{ flex: 1 }}
            onPress={() => router.push(`/(customer)/book/${business.id}?service=${service.id}`)}
          />
          <Button
            label={isFav ? "Saved" : "Save"}
            tone={isFav ? "soft" : "ghost"}
            icon={isFav ? "heart" : "heart-outline"}
            onPress={() => {
              if (!auth.userId) return;
              toggleFavorite(auth.userId, "service", service.id, "Services");
              setNotice(isFav ? "Removed from saved services" : "Saved service to favorites");
            }}
          />
        </View>
        {notice ? <Text style={{ color: brand.lavender, fontSize: 12 }}>{notice}</Text> : null}
      </Card>

      <Card style={{ gap: 10 }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>
          Available Specialists ({eligibleEmployees.length})
        </Text>
        {eligibleEmployees.length === 0 ? (
          <Text style={{ color: colors.muted, fontSize: 13 }}>Any qualified specialist can take this appointment.</Text>
        ) : (
          eligibleEmployees.map((emp) => {
            const person = state.users.find((u) => u.id === emp.userId);
            const name = displayUser(state, emp.userId);
            return (
              <Pressable
                key={emp.id}
                onPress={() => router.push(`/(customer)/book/${business.id}?service=${service.id}&employee=${emp.id}`)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingTop: 10,
                  borderTopWidth: 1,
                  borderTopColor: colors.line,
                }}
              >
                <Avatar name={name} uri={person?.avatarUrl} size={42} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>{name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    {emp.title} · ★ {emp.rating.toFixed(1)}
                  </Text>
                </View>
                <Badge label="Book" tone="brand" />
              </Pressable>
            );
          })
        )}
      </Card>

      <Card style={{ gap: 6 }}>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>Cancellation Policy</Text>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
          {service.cancellationPolicy || business.cancellationPolicy}
        </Text>
      </Card>
    </Screen>
  );
}
