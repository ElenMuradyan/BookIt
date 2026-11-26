import {
  displayUser,
  inviteMember,
  inviteMemberRemote,
  setMemberRole,
  setMemberRoleRemote,
  setMemberStatus,
  setMemberStatusRemote,
  updateEmployeeAvailability,
  updateEmployeeAvailabilityRemote,
  useBookItState,
  usingMocks,
} from "@bookit/api-client";
import type { Employee, MembershipRole } from "@bookit/types";
import { roleLabels } from "@bookit/ui";
import { can } from "@bookit/utils";
import React, { useState } from "react";
import { Modal, Text, View } from "react-native";
import { Avatar, Badge, BrandHeader, Button, Card, Chip, InputField, Screen, SearchBar } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

const ROLES: MembershipRole[] = ["admin", "manager", "employee", "receptionist", "accountant"];
const SHIFT_STATUSES: Employee["status"][] = ["available", "in_appointment", "off_shift", "on_leave"];

export default function WorkspaceTeamScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const { colors } = useThemePalette();
  const [q, setQ] = useState("");
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("Specialist");
  const [role, setRole] = useState<MembershipRole>("employee");
  const [error, setError] = useState("");
  const [pageError, setPageError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!auth.workspace) return null;
  const bizId = auth.workspace.businessId;
  const canManage = can(auth.workspace.role, "team.manage");

  const memberships = state.memberships.filter((m) => m.businessId === bizId);
  const filtered = memberships.filter((m) => {
    const name = displayUser(state, m.userId);
    return !q.trim() || `${name} ${m.role} ${m.title ?? ""}`.toLowerCase().includes(q.trim().toLowerCase());
  });

  return (
    <Screen>
      <BrandHeader
        mode="workspace"
        right={canManage ? <Button label="+ Invite" small onPress={() => { setError(""); setShowInvite(true); }} /> : undefined}
      />

      <SearchBar value={q} onChangeText={setQ} placeholder="Search staff & roles…" />
      {pageError ? <Text style={{ color: colors.danger, fontSize: 12 }}>{pageError}</Text> : null}

      {filtered.map((mem) => {
        const user = state.users.find((u) => u.id === mem.userId);
        const emp = state.employees.find((e) => e.userId === mem.userId && e.businessId === bizId);
        const name = displayUser(state, mem.userId);
        const svcs = emp ? state.services.filter((s) => emp.serviceIds.includes(s.id)) : [];
        return (
          <Card key={mem.id} style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Avatar name={name} uri={user?.avatarUrl} size={46} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{name}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {mem.title ?? roleLabels[mem.role]} · {roleLabels[mem.role]}
                </Text>
              </View>
              <Badge
                label={emp ? emp.status.replaceAll("_", " ") : mem.status}
                tone={emp?.status === "available" ? "success" : "brand"}
              />
            </View>
            {svcs.length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {svcs.slice(0, 3).map((s) => (
                  <Badge key={s.id} label={s.name} tone="neutral" />
                ))}
              </View>
            ) : null}
            {canManage && emp ? (
              <View style={{ gap: 4 }}>
                <Text style={{ color: colors.muted, fontSize: 11 }}>Shift Status</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {SHIFT_STATUSES.map((st) => (
                    <Chip
                      key={st}
                      label={st.replaceAll("_", " ")}
                      active={emp.status === st}
                      disabled={busy}
                      onPress={async () => {
                        if (busy) return;
                        setPageError("");
                        setBusy(true);
                        try {
                          const res = usingMocks()
                            ? updateEmployeeAvailability(bizId, emp.id, { status: st })
                            : await updateEmployeeAvailabilityRemote(bizId, emp.id, { status: st });
                          if (!res.ok) setPageError(res.error);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                  ))}
                </View>
              </View>
            ) : null}
            {canManage && mem.role !== "owner" ? (
              <View style={{ gap: 6 }}>
                <Text style={{ color: colors.muted, fontSize: 11 }}>Workspace Role</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {(["manager", "employee", "receptionist"] as const).map((r) => (
                    <Chip
                      key={r}
                      label={roleLabels[r]}
                      active={mem.role === r}
                      disabled={busy}
                      onPress={async () => {
                        if (busy) return;
                        setPageError("");
                        setBusy(true);
                        try {
                          const res = usingMocks()
                            ? setMemberRole(bizId, mem.id, r)
                            : await setMemberRoleRemote(bizId, mem.id, r);
                          if (!res.ok) setPageError(res.error);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                  ))}
                </View>
                {mem.userId !== auth.userId && (mem.status === "active" || mem.status === "suspended") ? (
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
                    <Badge
                      label={mem.status === "suspended" ? "Suspended" : "Active access"}
                      tone={mem.status === "suspended" ? "danger" : "success"}
                    />
                    <Button
                      label={mem.status === "suspended" ? "Reactivate" : "Suspend"}
                      tone={mem.status === "suspended" ? "soft" : "danger"}
                      small
                      disabled={busy}
                      onPress={async () => {
                        if (busy) return;
                        setPageError("");
                        setBusy(true);
                        const nextStatus = mem.status === "suspended" ? "active" : "suspended";
                        try {
                          const res = usingMocks()
                            ? setMemberStatus(bizId, mem.id, nextStatus)
                            : await setMemberStatusRemote(bizId, mem.id, nextStatus);
                          if (!res.ok) setPageError(res.error);
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

      <Modal visible={showInvite} transparent animationType="slide" onRequestClose={() => setShowInvite(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(8,8,14,0.75)", justifyContent: "center", padding: 20 }}>
          <Card style={{ gap: 12 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>Invite Team Member</Text>
            <InputField label="BookIt Account Email" value={email} onChangeText={setEmail} autoCapitalize="none" />
            <InputField label="Job Title" value={title} onChangeText={setTitle} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {ROLES.map((r) => (
                <Chip key={r} label={roleLabels[r]} active={role === r} onPress={() => setRole(r)} />
              ))}
            </View>
            {error ? <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text> : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="Cancel" tone="ghost" style={{ flex: 1 }} onPress={() => setShowInvite(false)} />
              <Button
                label={busy ? "Sending..." : "Send Invite"}
                style={{ flex: 1 }}
                disabled={busy}
                onPress={async () => {
                  setError("");
                  setBusy(true);
                  try {
                    const res = usingMocks()
                      ? inviteMember(bizId, email, role, title)
                      : await inviteMemberRemote(bizId, email, role, title);
                    if (!res.ok) {
                      setError(res.error);
                      return;
                    }
                    setShowInvite(false);
                    setEmail("");
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}
