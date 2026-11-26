import { addCustomerNote, addCustomerNoteRemote, businessAppointments, displayUser, useBookItState, usingMocks } from "@bookit/api-client";
import { can, formatDate } from "@bookit/utils";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { Avatar, Badge, BrandHeader, Button, Card, Chip, InputField, Screen, SearchBar } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function WorkspaceCustomersScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const { colors } = useThemePalette();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "frequent">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState("");
  const [noteError, setNoteError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!auth.workspace || !auth.userId) return null;
  const bizId = auth.workspace.businessId;
  const canNotes = can(auth.workspace.role, "customers.notes");

  const appts = businessAppointments(state, bizId);
  const customerIds = [...new Set(appts.map((a) => a.customerId))];
  const rows = customerIds
    .map((cid) => {
      const user = state.users.find((u) => u.id === cid);
      const visits = appts.filter((a) => a.customerId === cid);
      return { cid, user, name: displayUser(state, cid), visitCount: visits.length, lastVisit: visits[0]?.start };
    })
    .filter((r) => {
      if (filter === "frequent" && r.visitCount < 2) return false;
      if (q.trim() && !r.name.toLowerCase().includes(q.trim().toLowerCase())) return false;
      return true;
    });

  return (
    <Screen>
      <BrandHeader mode="workspace" showBack />
      <SearchBar value={q} onChangeText={setQ} placeholder="Search customers…" />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip label="All Customers" active={filter === "all"} onPress={() => setFilter("all")} />
        <Chip label="Frequent (2+)" active={filter === "frequent"} onPress={() => setFilter("frequent")} />
      </View>

      {rows.map((r) => {
        const notes = state.notes.filter((n) => n.businessId === bizId && n.customerId === r.cid);
        const open = expandedId === r.cid;
        return (
          <Card
            key={r.cid}
            onPress={() => {
              setExpandedId(open ? null : r.cid);
              setNoteBody("");
              setNoteError("");
            }}
            style={{ gap: 8 }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Avatar name={r.name} uri={r.user?.avatarUrl} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>{r.name}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {r.user?.email} · {r.visitCount} visits
                </Text>
              </View>
              <Badge label={r.lastVisit ? formatDate(r.lastVisit, { month: "short", day: "numeric" }) : "Client"} tone="brand" />
            </View>
            {open ? (
              <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, gap: 8 }}>
                <Text style={{ color: colors.muted, fontSize: 12 }}>Notes ({notes.length})</Text>
                {notes.map((n) => (
                  <Text key={n.id} style={{ color: colors.text, fontSize: 12 }}>• {n.body}</Text>
                ))}
                {canNotes ? (
                  <View style={{ gap: 6 }}>
                    <InputField label="Add internal note" value={noteBody} onChangeText={setNoteBody} />
                    {noteError ? <Text style={{ color: colors.danger, fontSize: 12 }}>{noteError}</Text> : null}
                    <Button
                      label={busy ? "Saving..." : "Save Note"}
                      tone="soft"
                      small
                      disabled={busy}
                      onPress={async () => {
                        setNoteError("");
                        if (usingMocks()) {
                          const res = addCustomerNote(bizId, r.cid, auth.userId!, noteBody);
                          if (!res.ok) {
                            setNoteError(res.error);
                            return;
                          }
                          setNoteBody("");
                          return;
                        }
                        setBusy(true);
                        try {
                          const res = await addCustomerNoteRemote(bizId, r.cid, noteBody);
                          if (!res.ok) {
                            setNoteError(res.error);
                            return;
                          }
                          setNoteBody("");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                  </View>
                ) : null}
              </View>
            ) : null}
          </Card>
        );
      })}
    </Screen>
  );
}
