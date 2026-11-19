import { customerOrders, useBookItState } from "@bookit/api-client";
import { orderStatus } from "@bookit/ui";
import { formatDate, formatMoney } from "@bookit/utils";
import React from "react";
import { Text, View } from "react-native";
import { Badge, BrandHeader, Card, EmptyState, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function CustomerOrdersScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const { colors } = useThemePalette();

  if (!auth.userId) return null;
  const orders = customerOrders(state, auth.userId);

  return (
    <Screen>
      <BrandHeader title="My Orders" showBack />
      {orders.length === 0 ? (
        <EmptyState title="No orders yet" body="Items purchased in the marketplace will appear here." />
      ) : (
        orders.map((order) => {
          const seller = state.businesses.find((b) => b.id === order.sellerId);
          const meta = orderStatus(order.status);
          return (
            <Card key={order.id} style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Badge label={meta.label} tone={meta.tone} />
                <Text style={{ color: colors.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                  {formatMoney(order.total)}
                </Text>
              </View>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>
                {seller?.name ?? "Seller"} · #{order.id.toUpperCase()}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {order.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 11 }}>
                {formatDate(order.createdAt)} · {order.trackingPlaceholder ?? order.deliveryMethod}
              </Text>
            </Card>
          );
        })
      )}
    </Screen>
  );
}
