import { setSpendingVisibility, useBookItState } from "@bookit/api-client";
import { formatDate, formatMoney, spendingBuckets } from "@bookit/utils";
import React from "react";
import { Text, View } from "react-native";
import { Badge, BrandHeader, Card, Chip, MiniBarChart, Screen, StatCard } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function SpendingScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const { colors } = useThemePalette();

  if (!auth.userId) return null;
  const profile = state.customerProfiles.find((p) => p.userId === auth.userId);
  const payments = state.payments.filter((p) => p.payerId === auth.userId);
  const buckets = spendingBuckets(payments);
  const includeEst = profile?.spendingVisibility === "include_estimates";

  return (
    <Screen>
      <BrandHeader title="My Spending" showBack />

      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatCard label="Recorded Ledger" value={formatMoney(buckets.recorded)} hint="Verified transactions" icon="card-outline" />
        <StatCard
          label="Estimated"
          value={includeEst ? formatMoney(buckets.estimated) : "Hidden"}
          hint={includeEst ? "Included by setting" : "Ledger-only mode"}
          icon="analytics-outline"
        />
      </View>

      <Card style={{ gap: 8 }}>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>Visibility Setting</Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>Recorded ledger rows are always kept separate from estimates.</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip
            label="Recorded Only"
            active={!includeEst}
            onPress={() => setSpendingVisibility(auth.userId!, "recorded_only")}
          />
          <Chip
            label="Include Estimates"
            active={includeEst}
            onPress={() => setSpendingVisibility(auth.userId!, "include_estimates")}
          />
        </View>
      </Card>

      {buckets.byCategory.length > 0 ? (
        <Card style={{ gap: 6 }}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>Recorded by Type</Text>
          <MiniBarChart points={buckets.byCategory} />
        </Card>
      ) : null}

      <Card style={{ gap: 10 }}>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>Payment History</Text>
        {payments.map((pay) => (
          <View
            key={pay.id}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              borderTopWidth: 1,
              borderTopColor: colors.line,
              paddingTop: 8,
            }}
          >
            <View>
              <Text style={{ color: colors.text, fontWeight: "600", textTransform: "capitalize" }}>{pay.referenceType}</Text>
              <Text style={{ color: colors.muted, fontSize: 11 }}>{formatDate(pay.createdAt)}</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 2 }}>
              <Text style={{ color: colors.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                {formatMoney(pay.amount)}
              </Text>
              <Badge label={pay.status} tone={pay.status === "recorded" ? "success" : "warning"} />
            </View>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
