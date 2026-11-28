import {
  markAllNotificationsRead,
  markAllNotificationsReadRemote,
  markNotificationRead,
  markNotificationReadRemote,
  useBookItState,
  usingMocks,
} from "@bookit/api-client";
import { formatDateTime } from "@bookit/utils";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, EmptyState, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function NotificationsScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const { colors } = useThemePalette();
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!auth.userId) return null;
  const rows = state.notifications.filter((n) => n.userId === auth.userId);

  return (
    <Screen>
      <BrandHeader
        title="Notifications"
        showBack
        right={
          <Button
            label={busy ? "Updating…" : "Mark all read"}
            tone="soft"
            small
            disabled={busy}
            onPress={async () => {
              setErrorMsg("");
              if (usingMocks()) {
                markAllNotificationsRead(auth.userId!);
                return;
              }
              setBusy(true);
              try {
                const res = await markAllNotificationsReadRemote();
                if (!res.ok) setErrorMsg(res.error);
              } finally {
                setBusy(false);
              }
            }}
          />
        }
      />

      {errorMsg ? <Text style={{ color: colors.danger, fontSize: 12 }}>{errorMsg}</Text> : null}

      {rows.length === 0 ? (
        <EmptyState title="All caught up" body="Booking updates, order status, and messages appear here." />
      ) : (
        rows.map((n) => (
          <Card
            key={n.id}
            onPress={async () => {
              if (busy) return;
              setErrorMsg("");
              if (usingMocks()) {
                markNotificationRead(n.id, auth.userId!);
                return;
              }
              setBusy(true);
              try {
                const res = await markNotificationReadRemote(n.id);
                if (!res.ok) setErrorMsg(res.error);
              } finally {
                setBusy(false);
              }
            }}
            style={{ gap: 6, opacity: n.read ? 0.72 : 1 }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Badge label={n.category} tone={n.read ? "neutral" : "brand"} />
              <Text style={{ color: colors.muted, fontSize: 11 }}>{formatDateTime(n.createdAt)}</Text>
            </View>
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>{n.title}</Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>{n.body}</Text>
          </Card>
        ))
      )}
    </Screen>
  );
}
