import { displayUser, sellerOrders, setOrderStatus, setOrderStatusRemote, useBookItState, usingMocks } from "@bookit/api-client";
import type { OrderStatus } from "@bookit/types";
import { orderStatus } from "@bookit/ui";
import { formatDate, formatMoney } from "@bookit/utils";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, EmptyState, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function WorkspaceOrdersScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const { colors } = useThemePalette();
  const [busyId, setBusyId] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  if (!auth.workspace) return null;
  const bizId = auth.workspace.businessId;
  const orders = sellerOrders(state, bizId);

  async function handleStatus(orderId: string, status: OrderStatus) {
    setErrorMsg("");
    if (usingMocks()) {
      const res = setOrderStatus(bizId, orderId, status);
      if (!res.ok) setErrorMsg(res.error);
      return;
    }
    setBusyId(orderId);
    try {
      const res = await setOrderStatusRemote(bizId, orderId, status);
      if (!res.ok) setErrorMsg(res.error);
    } finally {
      setBusyId("");
    }
  }

  return (
    <Screen>
      <BrandHeader mode="workspace" showBack />
      {errorMsg ? <Text style={{ color: colors.danger, fontSize: 12 }}>{errorMsg}</Text> : null}
      {orders.length === 0 ? (
        <EmptyState title="No orders yet" body="Incoming marketplace orders for your business appear here." />
      ) : (
        orders.map((o) => {
          const meta = orderStatus(o.status);
          const isBusy = busyId === o.id;
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
                <Button label={isBusy ? "Saving..." : "Process"} tone="soft" small disabled={isBusy} onPress={() => void handleStatus(o.id, "processing")} />
                <Button label="Ship" tone="soft" small disabled={isBusy} onPress={() => void handleStatus(o.id, "shipped")} />
                <Button label="Complete" tone="soft" small disabled={isBusy} onPress={() => void handleStatus(o.id, "completed")} />
              </View>
            </Card>
          );
        })
      )}
    </Screen>
  );
}
