import { Ionicons } from "@expo/vector-icons";
import {
  businessNotifications,
  markAllBusinessNotificationsRead,
  markBusinessNotificationRead,
  useBookItState,
} from "@bookit/api-client";
import { brand } from "@bookit/design-system";
import { formatDateTime } from "@bookit/utils";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, Chip, EmptyState, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

const FILTERS = ["all", "unread", "booking", "order", "message"] as const;

function resolveWorkspaceRoute(href?: string, category?: string) {
  if (href?.includes("customers")) return "/(workspace)/customers" as const;
  if (href?.includes("settings")) return "/(workspace)/settings" as const;
  if (href?.includes("orders") || category === "order") return "/(workspace)/orders" as const;
  return "/(workspace)/bookings" as const;
}

export default function WorkspaceNotificationsScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const router = useRouter();
  const { colors } = useThemePalette();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");

  if (!auth.workspace) return null;
  const bizId = auth.workspace.businessId;
  const all = businessNotifications(state, bizId);
  const unread = all.filter((n) => !n.read).length;
  const rows = all.filter((n) => {
    if (filter === "unread") return !n.read;
    if (filter !== "all") return n.category === filter;
    return true;
  });

  return (
    <Screen>
      <BrandHeader
        mode="workspace"
        showBack
        right={
          unread > 0 ? (
            <Button label="Read all" tone="soft" small onPress={() => markAllBusinessNotificationsRead(bizId)} />
          ) : undefined
        }
      />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        {FILTERS.map((f) => (
          <Chip
            key={f}
            label={f === "all" ? `All (${all.length})` : f === "unread" ? `Unread (${unread})` : f.toUpperCase()}
            active={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </View>

      {rows.length === 0 ? (
        <EmptyState
          title="No workspace notifications"
          body="Booking requests, reschedules, messages, and order alerts appear here."
        />
      ) : (
        rows.map((item) => (
          <Card
            key={item.id}
            onPress={() => {
              if (!item.read) markBusinessNotificationRead(bizId, item.id);
              router.push(resolveWorkspaceRoute(item.href, item.category));
            }}
            style={{
              gap: 6,
              borderColor: item.read ? colors.line : brand.primary,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Badge label={item.category} tone={item.read ? "neutral" : "brand"} />
                {!item.read ? <Ionicons name="ellipse" size={8} color={brand.lavender} /> : null}
              </View>
              <Text style={{ color: colors.muted, fontSize: 11, fontVariant: ["tabular-nums"] }}>
                {formatDateTime(item.createdAt)}
              </Text>
            </View>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>{item.title}</Text>
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>{item.body}</Text>
          </Card>
        ))
      )}
    </Screen>
  );
}
