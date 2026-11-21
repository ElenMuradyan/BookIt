import {
  createEventSession,
  displayUser,
  offeringsForBusiness,
  resourcesForBusiness,
  saveEventOffering,
  saveResource,
  saveService,
  setResourceActive,
  setServiceActive,
  toggleEmployeeToService,
  useBookItState,
} from "@bookit/api-client";
import type { EventOffering, PricingUnit, Resource, ResourceType, Service } from "@bookit/types";
import { addDays, bookingModelLabel, can, DEMO_TODAY, formatDateTime, formatMoney } from "@bookit/utils";
import React, { useState } from "react";
import { Modal, ScrollView, Switch, Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, Chip, EmptyState, InputField, Screen, SearchBar } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

const RESOURCE_TYPES: ResourceType[] = ["meeting_room", "restaurant_table", "hotel_room", "sports_court", "coworking_desk", "equipment", "custom"];
const PRICING_UNITS: PricingUnit[] = ["per_slot", "per_hour", "per_day", "per_night"];

export default function WorkspaceServicesScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const { colors } = useThemePalette();
  const [viewTab, setViewTab] = useState<"services" | "resources" | "events">("services");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  const [assignTargetId, setAssignTargetId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", description: "", category: "Styling", price: "75", durationMinutes: "45", cancellationPolicy: "24h notice required" });
  const [editingRes, setEditingRes] = useState<Resource | "new" | null>(null);
  const [resForm, setResForm] = useState({
    name: "",
    resourceType: "meeting_room" as ResourceType,
    description: "",
    capacityPeople: "4",
    unitsTotal: "1",
    pricingUnit: "per_hour" as PricingUnit,
    slotDurationMinutes: "60",
    basePrice: "45",
  });
  const [creatingOff, setCreatingOff] = useState(false);
  const [offForm, setOffForm] = useState({
    bookingModel: "capacity" as "ticket" | "capacity",
    category: "Wellness",
    title: "",
    description: "",
    venueArea: "",
    cancellationPolicy: "Free cancellation up to 12h before start.",
  });
  const [sesTarget, setSesTarget] = useState<EventOffering | null>(null);
  const [sesForm, setSesForm] = useState({
    startAt: `${addDays(DEMO_TODAY, 2)}T18:00:00`,
    endAt: `${addDays(DEMO_TODAY, 2)}T19:00:00`,
    totalCapacity: "20",
    maxPerBooking: "4",
    tierName: "Standard Entry",
    tierPrice: "25",
  });
  const [error, setError] = useState("");

  if (!auth.workspace) return null;
  const bizId = auth.workspace.businessId;
  const canEdit = can(auth.workspace.role, "services.manage");
  const canEditRes = can(auth.workspace.role, "resources.manage");
  const canEditEvents = can(auth.workspace.role, "events.manage");
  const all = state.services.filter((s) => s.businessId === bizId);
  const allResources = resourcesForBusiness(state, bizId, true);
  const allOfferings = offeringsForBusiness(state, bizId, undefined, true);
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

  const openResModal = (res: Resource | "new") => {
    setError("");
    if (res === "new") {
      setResForm({
        name: "",
        resourceType: "meeting_room",
        description: "",
        capacityPeople: "4",
        unitsTotal: "1",
        pricingUnit: "per_hour",
        slotDurationMinutes: "60",
        basePrice: "45",
      });
    } else {
      setResForm({
        name: res.name,
        resourceType: res.resourceType,
        description: res.description,
        capacityPeople: String(res.capacityPeople),
        unitsTotal: String(res.unitsTotal),
        pricingUnit: res.pricingUnit,
        slotDurationMinutes: String(res.slotDurationMinutes ?? 60),
        basePrice: String(res.basePrice),
      });
    }
    setEditingRes(res);
  };

  const headerRight =
    viewTab === "services" && canEdit ? (
      <Button label="+ Service" small onPress={() => openModal("new")} />
    ) : viewTab === "resources" && canEditRes ? (
      <Button label="+ Resource" small onPress={() => openResModal("new")} />
    ) : viewTab === "events" && canEditEvents ? (
      <Button label="+ Event" small onPress={() => { setError(""); setCreatingOff(true); }} />
    ) : undefined;

  return (
    <Screen>
      <BrandHeader mode="workspace" right={headerRight} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label={`Services (${all.length})`} active={viewTab === "services"} onPress={() => setViewTab("services")} />
        <Chip label={`Resources (${allResources.length})`} active={viewTab === "resources"} onPress={() => setViewTab("resources")} />
        <Chip label={`Events & Classes (${allOfferings.length})`} active={viewTab === "events"} onPress={() => setViewTab("events")} />
      </ScrollView>

      {viewTab === "services" ? (
        <>
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
        </>
      ) : null}

      {viewTab === "resources" ? (
        allResources.length === 0 ? (
          <EmptyState title="No resources" body="Add rooms, tables, courts, desks, or equipment." />
        ) : (
          allResources.map((res) => (
            <Card key={res.id} style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Badge label={res.resourceType.replaceAll("_", " ")} tone="brand" />
                <Switch
                  value={res.active}
                  disabled={!canEditRes}
                  onValueChange={(val) => { setResourceActive(bizId, res.id, val); }}
                />
              </View>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>{res.name}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                Up to {res.capacityPeople} guests · {res.unitsTotal} unit(s)
              </Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: colors.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                  {formatMoney(res.basePrice)} ({res.pricingUnit.replace("_", " ")})
                </Text>
                {canEditRes ? <Button label="Edit" tone="soft" small onPress={() => openResModal(res)} /> : null}
              </View>
            </Card>
          ))
        )
      ) : null}

      {viewTab === "events" ? (
        allOfferings.length === 0 ? (
          <EmptyState title="No events or classes" body="Create an offering and add scheduled sessions." />
        ) : (
          allOfferings.map((off) => (
            <Card key={off.id} style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Badge label={bookingModelLabel(off.bookingModel)} tone="brand" />
                <Badge label={off.active ? "Active" : "Hidden"} tone={off.active ? "success" : "neutral"} />
              </View>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>{off.title}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{off.venueArea || off.category}</Text>
              {off.sessions.map((ses) => (
                <Text key={ses.id} style={{ color: colors.lavender, fontSize: 12, fontVariant: ["tabular-nums"] }}>
                  {formatDateTime(ses.startAt)} · {ses.remainingCapacity}/{ses.totalCapacity} left
                </Text>
              ))}
              {canEditEvents ? (
                <Button
                  label="+ Add Session"
                  tone="soft"
                  small
                  onPress={() => {
                    setError("");
                    setSesForm({
                      startAt: `${addDays(DEMO_TODAY, 2)}T18:00:00`,
                      endAt: `${addDays(DEMO_TODAY, 2)}T19:00:00`,
                      totalCapacity: "20",
                      maxPerBooking: "4",
                      tierName: off.bookingModel === "ticket" ? "General Admission" : "Drop-in Spot",
                      tierPrice: "25",
                    });
                    setSesTarget(off);
                  }}
                />
              ) : null}
            </Card>
          ))
        )
      ) : null}

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

      <Modal visible={Boolean(editingRes)} transparent animationType="slide" onRequestClose={() => setEditingRes(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(8,8,14,0.75)", justifyContent: "center", padding: 20 }}>
          <Card style={{ gap: 10 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>
              {editingRes === "new" ? "Add Space / Resource" : "Edit Resource"}
            </Text>
            <InputField label="Name" value={resForm.name} onChangeText={(name) => setResForm({ ...resForm, name })} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {RESOURCE_TYPES.map((rt) => (
                <Chip key={rt} label={rt.replaceAll("_", " ")} active={resForm.resourceType === rt} onPress={() => setResForm({ ...resForm, resourceType: rt })} />
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {PRICING_UNITS.map((pu) => (
                <Chip key={pu} label={pu.replace("_", " ")} active={resForm.pricingUnit === pu} onPress={() => setResForm({ ...resForm, pricingUnit: pu })} />
              ))}
            </ScrollView>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <InputField label="Guests" value={resForm.capacityPeople} onChangeText={(capacityPeople) => setResForm({ ...resForm, capacityPeople })} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <InputField label="Units" value={resForm.unitsTotal} onChangeText={(unitsTotal) => setResForm({ ...resForm, unitsTotal })} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <InputField label="Price ($)" value={resForm.basePrice} onChangeText={(basePrice) => setResForm({ ...resForm, basePrice })} keyboardType="numeric" />
              </View>
            </View>
            {error ? <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text> : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="Cancel" tone="ghost" style={{ flex: 1 }} onPress={() => setEditingRes(null)} />
              <Button
                label="Save"
                style={{ flex: 1 }}
                onPress={() => {
                  const res = saveResource(bizId, resForm, editingRes && editingRes !== "new" ? editingRes.id : undefined);
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  setEditingRes(null);
                }}
              />
            </View>
          </Card>
        </View>
      </Modal>

      <Modal visible={creatingOff} transparent animationType="slide" onRequestClose={() => setCreatingOff(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(8,8,14,0.75)", justifyContent: "center", padding: 20 }}>
          <Card style={{ gap: 10 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>Add Event or Class</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Chip label="Class (Capacity)" active={offForm.bookingModel === "capacity"} onPress={() => setOffForm({ ...offForm, bookingModel: "capacity" })} />
              <Chip label="Event (Ticket)" active={offForm.bookingModel === "ticket"} onPress={() => setOffForm({ ...offForm, bookingModel: "ticket" })} />
            </View>
            <InputField label="Title" value={offForm.title} onChangeText={(title) => setOffForm({ ...offForm, title })} />
            <InputField label="Category" value={offForm.category} onChangeText={(category) => setOffForm({ ...offForm, category })} />
            <InputField label="Venue Area" value={offForm.venueArea} onChangeText={(venueArea) => setOffForm({ ...offForm, venueArea })} />
            {error ? <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text> : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="Cancel" tone="ghost" style={{ flex: 1 }} onPress={() => setCreatingOff(false)} />
              <Button
                label="Create"
                style={{ flex: 1 }}
                onPress={() => {
                  const res = saveEventOffering(bizId, offForm);
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  setCreatingOff(false);
                }}
              />
            </View>
          </Card>
        </View>
      </Modal>

      <Modal visible={Boolean(sesTarget)} transparent animationType="slide" onRequestClose={() => setSesTarget(null)}>
        <View style={{ flex: 1, backgroundColor: "rgba(8,8,14,0.75)", justifyContent: "center", padding: 20 }}>
          {sesTarget ? (
            <Card style={{ gap: 10 }}>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: "800" }}>Add Session — {sesTarget.title}</Text>
              <InputField label="Start ISO" value={sesForm.startAt} onChangeText={(startAt) => setSesForm({ ...sesForm, startAt })} />
              <InputField label="End ISO" value={sesForm.endAt} onChangeText={(endAt) => setSesForm({ ...sesForm, endAt })} />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <InputField label="Capacity" value={sesForm.totalCapacity} onChangeText={(totalCapacity) => setSesForm({ ...sesForm, totalCapacity })} keyboardType="numeric" />
                </View>
                <View style={{ flex: 1 }}>
                  <InputField label="Price ($)" value={sesForm.tierPrice} onChangeText={(tierPrice) => setSesForm({ ...sesForm, tierPrice })} keyboardType="numeric" />
                </View>
              </View>
              {error ? <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text> : null}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Button label="Cancel" tone="ghost" style={{ flex: 1 }} onPress={() => setSesTarget(null)} />
                <Button
                  label="Publish"
                  style={{ flex: 1 }}
                  onPress={() => {
                    const res = createEventSession(bizId, sesTarget.id, sesForm);
                    if (!res.ok) {
                      setError(res.error);
                      return;
                    }
                    setSesTarget(null);
                  }}
                />
              </View>
            </Card>
          ) : null}
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
