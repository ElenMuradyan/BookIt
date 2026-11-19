import { Ionicons } from "@expo/vector-icons";
import { brand } from "@bookit/design-system";
import { useBookItState } from "@bookit/api-client";
import { formatCompact, formatMoney, formatNumber } from "@bookit/utils";
import { useRouter } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, GradientCard, MiniBarChart, Screen, StatCard } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";

export default function AdminOverviewScreen() {
  const state = useBookItState();
  const router = useRouter();
  const { colors } = useThemePalette();

  const stats = state.platformStats;
  const pendingApps = state.applications.filter((a) => a.status === "submitted" || a.status === "under_review");

  return (
    <Screen>
      <BrandHeader mode="admin" />

      <GradientCard style={{ gap: 6 }}>
        <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "600" }}>Total Revenue (Demo Aggregate)</Text>
        <Text style={{ color: "#FFFFFF", fontSize: 32, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
          {formatMoney(stats.platformRevenue)}
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.88)", fontSize: 12 }}>↗ {stats.revenueDelta}</Text>
      </GradientCard>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatCard label="Users" value={formatCompact(stats.totalUsers).replace("$", "")} hint={stats.userDelta} icon="people-outline" />
        <StatCard label="Venues" value={formatNumber(stats.totalBusinesses)} hint={stats.businessDelta} icon="storefront-outline" />
      </View>

      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Ionicons name="shield-checkmark" size={20} color={brand.lavender} />
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>
              Verifications ({pendingApps.length} Pending)
            </Text>
          </View>
          <Badge label="Queue" tone={pendingApps.length > 0 ? "warning" : "success"} />
        </View>
        <Button label="Review Queue" icon="checkmark-done-outline" onPress={() => router.push("/(admin)/businesses")} />
      </Card>

      <Card style={{ gap: 6 }}>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>Platform Revenue Trend</Text>
        <MiniBarChart points={state.revenueSeries.slice(0, 6)} />
      </Card>

      <Card style={{ gap: 10 }}>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>Recent Activity</Text>
        {state.applications.slice(0, 3).map((app) => {
          const biz = state.businesses.find((b) => b.id === app.businessId);
          return (
            <View key={app.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 }}>
              <View>
                <Text style={{ color: colors.text, fontWeight: "600" }}>{biz?.name ?? app.businessId}</Text>
                <Text style={{ color: colors.muted, fontSize: 11 }}>{biz?.city} · Application {app.status}</Text>
              </View>
              <Badge label={app.status} tone={app.status === "approved" ? "success" : "warning"} />
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}
