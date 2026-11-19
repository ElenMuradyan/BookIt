import { displayUser, saveService, setServiceActive, toggleEmployeeToService, useBookItState } from "@bookit/api-client";
import type { Service } from "@bookit/types";
import { can, formatMoney } from "@bookit/utils";
import React, { useState } from "react";
import { Modal, ScrollView, Switch, Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, Chip, InputField, Screen, SearchBar } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function WorkspaceServicesScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const { colors } = useThemePalette();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  const [assignTargetId, setAssignTargetId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", category: "Styling", price: "75", durationMinutes: "45", cancellationPolicy: "24h notice required" });
  const [error, setError] = useState("");

  if (!auth.workspace) return null;
  const bizId = auth.workspace.businessId;
  const canEdit = can(auth.workspace.role, "services.manage");
  const all = state.services.filter((s) => s.businessId === bizId);
  const employees = state.employees.filter((e) => e.businessId === bizId);
  const cats = ["All", ...new Set(all.map((s) => s.category))];
  const filtered = all.filter((s) => {
    if (cat !== "All" && s.category !== cat) return false;
    if (q.trim() && !`${s.name} ${s.description}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  });
  const assignTarget = assignTargetId ? all.find((s) => s.id === assignTargetId) ?? null : null;

  const openModal = (svc: Service | "new") => {
    setError("");
    if (svc === "new") {
      setForm({ name: "", description: "", category: "Styling", price: "75", durationMinutes: "45", cancellationPolicy: "24h notice required" });
    } else {
      setForm({
        name: svc.name,
        description: svc.description,
        category: svc.category,
        price: String(svc.price),
        durationMinutes: String(svc.durationMinutes),
        cancellationPolicy: svc.cancellationPolicy,
      });
    }
    setEditing(svc);
  };

  return (
    <Screen>
      <BrandHeader
        mode="workspace"
        right={canEdit ? <Button label="+ Service" small onPress={() => openModal("new")} /> : undefined}
      />

      <SearchBar value={q} onChangeText={setQ} placeholder="Search services…" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {cats.map((c) => (
          <Chip key={c} label={c} active={cat === c} onPress={() => setCat(c)} />
        ))}
      </ScrollView>

      {filtered.map((svc) => {
        const staffNames = svc.employeeIds
          .map((id) => employees.find((e) => e.id === id))
          .filter(Boolean)
          .map((e) => displayUser(state, e!.userId));
        return (
          <Card key={svc.id} style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Badge label={svc.category} tone="brand" />
              <Switch
                value={svc.active}
                disabled={!canEdit}
                onValueChange={(val) => { setServiceActive(bizId, svc.id, val); }}
              />
            </View>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>{svc.name}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{svc.description}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              Staff: {staffNames.length > 0 ? staffNames.join(", ") : "Unassigned"}
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <Text style={{ color: colors.text, fontWeight: "800", fontVariant: ["tabular-nums"], flex: 1 }}>
                {formatMoney(svc.price)} · {svc.durationMinutes} min
              </Text>
              {canEdit ? (
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <Button label="Staff" tone="ghost" small onPress={() => setAssignTargetId(svc.id)} />
                  <Button label="Edit" tone="soft" small onPress={() => openModal(svc)} />
                </View>
              ) : null}
            </View>
          </Card>
        );
      })}

      <Modal visible={Boolean(editing)} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(8,8,14,0.75)", justifyContent: "center", padding: 20 }}>
          <Card style={{ gap: 10 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
              {editing === "new" ? "Add Service" : "Edit Service"}
            </Text>
            <InputField label="Name" value={form.name} onChangeText={(name) => setForm({ ...form, name })} />
            <InputField label="Category" value={form.category} onChangeText={(category) => setForm({ ...form, category })} />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <InputField label="Price ($)" value={form.price} onChangeText={(price) => setForm({ ...form, price })} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <InputField label="Minutes" value={form.durationMinutes} onChangeText={(durationMinutes) => setForm({ ...form, durationMinutes })} keyboardType="numeric" />
              </View>
            </View>
            <InputField label="Description" value={form.description} onChangeText={(description) => setForm({ ...form, description })} multiline />
            {error ? <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text> : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="Cancel" tone="ghost" style={{ flex: 1 }} onPress={() => setEditing(null)} />
              <Button
                label="Save"
                style={{ flex: 1 }}
                onPress={() => {
                  const res = saveService(bizId, form, editing && editing !== "new" ? editing.id : undefined);
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  setEditing(null);
                }}
              />
            </View>
          </Card>
        </View>
      </Modal>

      <Modal visible={Boolean(assignTarget)} transparent animationType="fade" onRequestClose={() => setAssignTargetId(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(8,8,14,0.75)", justifyContent: "center", padding: 20 }}>
          {assignTarget ? (
            <Card style={{ gap: 12 }}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
                Assign Staff — {assignTarget.name}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                Tap team members to assign or remove them from this service.
              </Text>
              {employees.map((emp) => {
                const assigned = assignTarget.employeeIds.includes(emp.id);
                return (
                  <View
                    key={emp.id}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingVertical: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: colors.line,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.text, fontWeight: "700" }}>{displayUser(state, emp.userId)}</Text>
                      <Text style={{ color: colors.muted, fontSize: 12 }}>{emp.title}</Text>
                    </View>
                    <Button
                      label={assigned ? "Assigned" : "Assign"}
                      tone={assigned ? "soft" : "ghost"}
                      small
                      onPress={() => toggleEmployeeToService(bizId, assignTarget.id, emp.id)}
                    />
                  </View>
                );
              })}
              <Button label="Done" onPress={() => setAssignTargetId(null)} />
            </Card>
          ) : null}
        </View>
      </Modal>
    </Screen>
  );
}
