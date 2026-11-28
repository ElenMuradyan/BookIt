import { setUserStatus, setUserStatusRemote, useBookItState, usingMocks } from "@bookit/api-client";
import { fullName } from "@bookit/utils";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { Avatar, Badge, BrandHeader, Button, Card, Screen, SearchBar } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";

export default function AdminUsersScreen() {
  const state = useBookItState();
  const { colors } = useThemePalette();
  const [q, setQ] = useState("");
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");

  const users = state.users.filter((u) => {
    if (!q.trim()) return true;
    return `${fullName(u)} ${u.email} ${u.username}`.toLowerCase().includes(q.trim().toLowerCase());
  });

  return (
    <Screen>
      <BrandHeader mode="admin" />
      <SearchBar value={q} onChangeText={setQ} placeholder="Search platform users…" />
      {notice ? <Text style={{ color: colors.danger, fontSize: 12 }}>{notice}</Text> : null}

      {users.map((u) => {
        const nextStatus = u.status === "active" ? "suspended" : "active";
        const isBusy = busyId === u.id;
        return (
          <Card key={u.id} style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Avatar name={fullName(u)} uri={u.avatarUrl} size={42} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>{fullName(u)}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{u.email}</Text>
              </View>
              <Badge label={u.isPlatformAdmin ? "Admin" : u.status} tone={u.status === "active" ? "success" : "danger"} />
            </View>
            {!u.isPlatformAdmin ? (
              <Button
                label={isBusy ? "Updating…" : u.status === "active" ? "Suspend User" : "Reactivate User"}
                tone={u.status === "active" ? "danger" : "soft"}
                small
                disabled={isBusy}
                onPress={async () => {
                  setNotice("");
                  if (usingMocks()) {
                    const res = setUserStatus(u.id, nextStatus);
                    setNotice(res.ok ? "" : res.error);
                    return;
                  }
                  setBusyId(u.id);
                  try {
                    const res = await setUserStatusRemote(u.id, nextStatus);
                    setNotice(res.ok ? "" : res.error);
                  } finally {
                    setBusyId("");
                  }
                }}
              />
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}
