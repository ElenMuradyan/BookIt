import { Ionicons } from "@expo/vector-icons";
import {
  businessNotifications,
  markAllBusinessNotificationsRead,
  markAllBusinessNotificationsReadRemote,
  markBusinessNotificationRead,
  markBusinessNotificationReadRemote,
  useBookItState,
  usingMocks,
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
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!auth.workspace) return null;
  const bizId = auth.workspace.businessId;
  const all = businessNotifications(state, bizId);
  const unread = all.filter((n) => !n.read).length;
  const rows = all.filter((n) => {
    if (filter === "unread") return !n.read;
    if (filter !== "all") return n.category === filter;
    return true;
  });

  async function handleMarkAll() {
    setErrorMsg("");
    if (usingMocks()) {
      markAllBusinessNotificationsRead(bizId);
      return;
    }
    setBusy(true);
    try {
      const res = await markAllBusinessNotificationsReadRemote(bizId);
      if (!res.ok) setErrorMsg(res.error);
    } finally {
      setBusy(false);
    }
  }

  async function handleOpen(item: (typeof rows)[number]) {
    setErrorMsg("");
    if (!item.read) {
      if (usingMocks()) {
        markBusinessNotificationRead(bizId, item.id);
      } else {
        setBusy(true);
        try {
          const res = await markBusinessNotificationReadRemote(bizId, item.id);
          if (!res.ok) setErrorMsg(res.error);
        } finally {
          setBusy(false);
        }
      }
    }
    router.push(resolveWorkspaceRoute(item.href, item.category));
  }

  return (
    <Screen>
      <BrandHeader
        mode="workspace"
        showBack
        right={
          unread > 0 ? (
            <Button label={busy ? "Updating..." : "Read all"} tone="soft" small disabled={busy} onPress={() => void handleMarkAll()} />
          ) : undefined
        }
      />

      {errorMsg ? <Text style={{ color: colors.danger, fontSize: 12 }}>{errorMsg}</Text> : null}

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
            onPress={() => void handleOpen(item)}
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
