import { setUserStatus, useBookItState } from "@bookit/api-client";
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

  const users = state.users.filter((u) => {
    if (!q.trim()) return true;
    return `${fullName(u)} ${u.email} ${u.username}`.toLowerCase().includes(q.trim().toLowerCase());
  });

  return (
    <Screen>
      <BrandHeader mode="admin" />
      <SearchBar value={q} onChangeText={setQ} placeholder="Search platform users…" />
      {notice ? <Text style={{ color: colors.danger, fontSize: 12 }}>{notice}</Text> : null}

      {users.map((u) => (
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
              label={u.status === "active" ? "Suspend User" : "Reactivate User"}
              tone={u.status === "active" ? "danger" : "soft"}
              small
              onPress={() => {
                const res = setUserStatus(u.id, u.status === "active" ? "suspended" : "active");
                setNotice(res.ok ? "" : res.error);
              }}
            />
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
