import { displayUser, sellerOrders, setOrderStatus, useBookItState } from "@bookit/api-client";
import { orderStatus } from "@bookit/ui";
import { formatDate, formatMoney } from "@bookit/utils";
import React from "react";
import { Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, EmptyState, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function WorkspaceOrdersScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const { colors } = useThemePalette();

  if (!auth.workspace) return null;
  const bizId = auth.workspace.businessId;
  const orders = sellerOrders(state, bizId);

  return (
    <Screen>
      <BrandHeader mode="workspace" showBack />
      {orders.length === 0 ? (
        <EmptyState title="No orders yet" body="Incoming marketplace orders for your business appear here." />
      ) : (
        orders.map((o) => {
          const meta = orderStatus(o.status);
          return (
            <Card key={o.id} style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Badge label={meta.label} tone={meta.tone} />
                <Text style={{ color: colors.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                  {formatMoney(o.total)}
                </Text>
              </View>
              <Text style={{ color: colors.text, fontWeight: "700" }}>
                #{o.id.toUpperCase()} · {displayUser(state, o.userId)}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")} · {formatDate(o.createdAt)}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                <Button label="Process" tone="soft" small onPress={() => setOrderStatus(bizId, o.id, "processing")} />
                <Button label="Ship" tone="soft" small onPress={() => setOrderStatus(bizId, o.id, "shipped")} />
                <Button label="Complete" tone="soft" small onPress={() => setOrderStatus(bizId, o.id, "completed")} />
              </View>
            </Card>
          );
        })
      )}
    </Screen>
  );
}
