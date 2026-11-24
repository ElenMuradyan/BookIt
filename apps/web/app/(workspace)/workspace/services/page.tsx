"use client";

import {
  addSessionTierRemote,
  bookingConfigsForBusiness,
  createEventSession,
  createOfferingRemote,
  createResourceBlockRemote,
  createResourceRemote,
  createSessionRemote,
  deleteResourceBlockRemote,
  deleteServiceRemote,
  displayUser,
  fetchSessionAttendeesRemote,
  offeringsForBusiness,
  resourceBlocksForBusiness,
  resourcesForBusiness,
  saveEventOffering,
  saveResource,
  saveService,
  saveServiceRemote,
  setResourceActive,
  setResourceActiveRemote,
  setServiceActive,
  setServiceActiveRemote,
  toggleEmployeeToService,
  toggleEmployeeToServiceRemote,
  updateOfferingRemote,
  updateResourceRemote,
  useBookItState,
  usingMocks,
} from "@bookit/api-client";
import type { EventOffering, EventSession, PricingUnit, Resource, ResourceType, Service, SessionAttendee } from "@bookit/types";
import { inventoryNavLabelForBusiness } from "@bookit/ui";
import { addDays, bookingModelLabel, can, DEMO_TODAY, formatDateTime, formatMoney, initials } from "@bookit/utils";
import { useEffect, useState } from "react";
import { Badge, Button, Empty, Field, Modal } from "@/components/ui";
import { useAuth } from "@/lib/session";

const RESOURCE_TYPES: { id: ResourceType; label: string }[] = [
  { id: "restaurant_table", label: "Restaurant Table" },
  { id: "hotel_room", label: "Hotel Room / Suite" },
  { id: "sports_court", label: "Sports Court" },
  { id: "meeting_room", label: "Meeting Room" },
  { id: "coworking_desk", label: "Coworking Desk" },
  { id: "parking_space", label: "Parking Space" },
  { id: "vehicle", label: "Vehicle" },
  { id: "equipment", label: "Equipment" },
  { id: "custom", label: "Custom Resource" },
];

const PRICING_UNITS: { id: PricingUnit; label: string }[] = [
  { id: "per_slot", label: "Per slot" },
  { id: "per_hour", label: "Per hour" },
  { id: "per_day", label: "Per day" },
  { id: "per_night", label: "Per night" },
];

export default function WorkspaceServicesPage() {
  const auth = useAuth();
  const state = useBookItState();

  const bizId = auth.workspace?.businessId ?? "";
  const biz = state.businesses.find((b) => b.id === bizId);
  const configs = bizId ? bookingConfigsForBusiness(state, bizId) : [];

  const defaultTabForCategory = (): "services" | "resources" | "events" => {
    const cat = biz?.category ?? auth.workspace?.category;
    if (cat === "restaurant" || cat === "hotel" || cat === "sports") return "resources";
    if (cat === "events" || cat === "travel") return "events";
    const enabled = configs.filter((c) => c.enabled).map((c) => c.bookingModel);
    if (enabled.includes("resource") && !enabled.includes("appointment")) return "resources";
    if ((enabled.includes("ticket") || enabled.includes("capacity")) && !enabled.includes("appointment")) return "events";
    return "services";
  };

  const [viewTab, setViewTab] = useState<"services" | "resources" | "events">(defaultTabForCategory);
  const [tabInitializedFor, setTabInitializedFor] = useState("");
  useEffect(() => {
    if (bizId && tabInitializedFor !== bizId) {
      setViewTab(defaultTabForCategory());
      setTabInitializedFor(bizId);
    }
  });

  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [durationFilter, setDurationFilter] = useState("all");
  const [actionMessage, setActionMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Service modal state
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  const [assignTarget, setAssignTarget] = useState<Service | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "Hair",
    price: "75",
    durationMinutes: "45",
    depositAmount: "",
    requiresApproval: false,
    cancellationPolicy: "Free cancellation up to 24 hours before the visit.",
    employeeIds: [] as string[],
  });

  // Resource modal & blocks state
  const [editingResource, setEditingResource] = useState<Resource | "new" | null>(null);
  const [resForm, setResForm] = useState({
    name: "",
    resourceType: "meeting_room" as ResourceType,
    description: "",
    capacityPeople: "4",
    unitsTotal: "1",
    pricingUnit: "per_hour" as PricingUnit,
    slotDurationMinutes: "60",
    basePrice: "45",
    depositAmount: "0",
    area: "",
    roomType: "Double",
    amenities: "",
  });
  const [blockTarget, setBlockTarget] = useState<Resource | null>(null);
  const [blockForm, setBlockForm] = useState({
    startAt: `${addDays(DEMO_TODAY, 1)}T18:00:00`,
    endAt: `${addDays(DEMO_TODAY, 1)}T21:00:00`,
    unitsBlocked: "1",
    reason: "Private hold / maintenance",
  });

  // Event offering & session & tier & attendee state
  const [creatingOffering, setCreatingOffering] = useState(false);
  const [editingOffering, setEditingOffering] = useState<EventOffering | null>(null);
  const [offForm, setOffForm] = useState({
    bookingModel: "capacity" as "ticket" | "capacity",
    category: "Workshop",
    title: "",
    description: "",
    venueArea: "",
    cancellationPolicy: "Free cancellation up to 24 hours before start.",
  });
  const [sessionTarget, setSessionTarget] = useState<EventOffering | null>(null);
  const [sesForm, setSesForm] = useState({
    startAt: `${addDays(DEMO_TODAY, 2)}T18:00:00`,
    endAt: `${addDays(DEMO_TODAY, 2)}T19:00:00`,
    totalCapacity: "20",
    maxPerBooking: "4",
    tierName: "Standard Entry",
    tierPrice: "25",
  });
  const [tierTarget, setTierTarget] = useState<EventSession | null>(null);
  const [tierForm, setTierForm] = useState({
    name: "VIP Access",
    description: "",
    price: "60",
    capacityLimit: "10",
  });
  const [attendeesModal, setAttendeesModal] = useState<{
    session: EventSession;
    offeringTitle: string;
    rows: SessionAttendee[];
    loading: boolean;
  } | null>(null);

  const [error, setError] = useState("");
  const [fieldErrs, setFieldErrs] = useState<Record<string, string>>({});

  if (!auth.workspace) return null;
  const canManage = can(auth.workspace.role, "services.manage");
  const canManageResources = can(auth.workspace.role, "resources.manage");
  const canManageEvents = can(auth.workspace.role, "events.manage");
  const allServices = state.services.filter((s) => s.businessId === bizId);
  const allResources = resourcesForBusiness(state, bizId, true);
  const allBlocks = resourceBlocksForBusiness(state, bizId);
  const allOfferings = offeringsForBusiness(state, bizId, undefined, true);
  const employees = state.employees.filter((e) => e.businessId === bizId);
  const categories = ["all", ...new Set(allServices.map((s) => s.category))];
  const isRestaurant = biz?.category === "restaurant";
  const isHotel = biz?.category === "hotel";

  const filtered = allServices.filter((s) => {
    if (category !== "all" && s.category !== category) return false;
    if (durationFilter === "short" && s.durationMinutes > 45) return false;
    if (durationFilter === "long" && s.durationMinutes <= 45) return false;
    if (q.trim() && !`${s.name} ${s.category} ${s.description}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  });

  function openForm(svc?: Service) {
    setError("");
    setFieldErrs({});
    if (svc) {
      setForm({
        name: svc.name,
        description: svc.description,
        category: svc.category,
        price: String(svc.price),
        durationMinutes: String(svc.durationMinutes),
        depositAmount: svc.depositAmount ? String(svc.depositAmount) : "",
        requiresApproval: svc.requiresApproval,
        cancellationPolicy: svc.cancellationPolicy,
        employeeIds: [...svc.employeeIds],
      });
      setEditing(svc);
    } else {
      setForm({
        name: "",
        description: "",
        category: biz?.category === "healthcare" ? "Consultation" : "General",
        price: "75",
        durationMinutes: "45",
        depositAmount: "",
        requiresApproval: false,
        cancellationPolicy: "Free cancellation up to 24 hours before the visit.",
        employeeIds: [],
      });
      setEditing("new");
    }
  }

  function openResourceForm(res?: Resource) {
    setError("");
    setFieldErrs({});
    if (res) {
      const amenitiesVal = Array.isArray(res.attributes?.amenities)
        ? (res.attributes.amenities as string[]).join(", ")
        : "";
      setResForm({
        name: res.name,
        resourceType: res.resourceType,
        description: res.description,
        capacityPeople: String(res.capacityPeople),
        unitsTotal: String(res.unitsTotal),
        pricingUnit: res.pricingUnit,
        slotDurationMinutes: String(res.slotDurationMinutes ?? 60),
        basePrice: String(res.basePrice),
        depositAmount: String(res.depositAmount ?? 0),
        area: typeof res.attributes?.area === "string" ? res.attributes.area : "",
        roomType: typeof res.attributes?.roomType === "string" ? res.attributes.roomType : "Double",
        amenities: amenitiesVal,
      });
      setEditingResource(res);
    } else {
      setResForm({
        name: "",
        resourceType: isRestaurant
          ? "restaurant_table"
          : isHotel
            ? "hotel_room"
            : biz?.category === "sports"
              ? "sports_court"
              : "meeting_room",
        description: "",
        capacityPeople: isRestaurant ? "4" : "2",
        unitsTotal: "1",
        pricingUnit: isRestaurant ? "per_slot" : isHotel ? "per_night" : "per_hour",
        slotDurationMinutes: isRestaurant ? "90" : isHotel ? "1440" : "60",
        basePrice: isRestaurant ? "0" : isHotel ? "190" : "45",
        depositAmount: "0",
        area: isRestaurant ? "Main Dining" : "",
        roomType: "Double",
        amenities: isHotel ? "Wi-Fi, Workspace, Queen Bed" : "",
      });
      setEditingResource("new");
    }
  }

  async function handleSaveService(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !editing) return;
    setError("");
    setFieldErrs({});
    const payload = {
      name: form.name.trim(),
      description: form.description.trim(),
      category: form.category.trim(),
      price: Number(form.price),
      durationMinutes: Number(form.durationMinutes),
      depositAmount: form.depositAmount.trim() ? Number(form.depositAmount) : undefined,
      requiresApproval: form.requiresApproval,
      cancellationPolicy: form.cancellationPolicy.trim(),
      employeeIds: form.employeeIds,
    };
    const targetId = editing === "new" ? undefined : editing.id;
    setBusy(true);
    try {
      const res = usingMocks()
        ? saveService(bizId, payload, targetId)
        : await saveServiceRemote(bizId, payload, targetId);
      if (!res.ok) {
        setError(res.error);
        setFieldErrs(res.fieldErrors ?? {});
        return;
      }
      setEditing(null);
      setActionMessage({
        tone: "success",
        text: targetId ? `Updated service "${payload.name}".` : `Created service "${payload.name}".`,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleServiceActive(svc: Service) {
    if (busy) return;
    setBusy(true);
    setActionMessage(null);
    try {
      const res = usingMocks()
        ? setServiceActive(bizId, svc.id, !svc.active)
        : await setServiceActiveRemote(bizId, svc.id, !svc.active);
      if (!res.ok) {
        setActionMessage({ tone: "error", text: res.error });
        return;
      }
      setActionMessage({
        tone: "success",
        text: `${svc.name} ${svc.active ? "disabled" : "enabled"}.`,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteService(svc: Service) {
    if (busy || usingMocks()) return;
    setBusy(true);
    setActionMessage(null);
    try {
      const res = await deleteServiceRemote(bizId, svc.id);
      if (!res.ok) {
        setActionMessage({ tone: "error", text: res.error });
        return;
      }
      setActionMessage({ tone: "success", text: res.data.message });
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleEmployee(serviceId: string, employeeId: string) {
    if (busy) return;
    setBusy(true);
    setActionMessage(null);
    try {
      const res = usingMocks()
        ? toggleEmployeeToService(bizId, serviceId, employeeId)
        : await toggleEmployeeToServiceRemote(bizId, serviceId, employeeId);
      if (!res.ok) {
        setActionMessage({ tone: "error", text: res.error });
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveResource(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !editingResource) return;
    setError("");
    setFieldErrs({});
    const attributes: Record<string, unknown> = {};
    if (resForm.resourceType === "restaurant_table" && resForm.area.trim()) {
      attributes.area = resForm.area.trim();
    }
    if (resForm.resourceType === "hotel_room") {
      if (resForm.roomType.trim()) attributes.roomType = resForm.roomType.trim();
      const amenitiesList = resForm.amenities
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (amenitiesList.length > 0) attributes.amenities = amenitiesList;
    }
    const payload = {
      name: resForm.name.trim(),
      resourceType: resForm.resourceType,
      description: resForm.description.trim(),
      capacityPeople: Number(resForm.capacityPeople),
      unitsTotal: Number(resForm.unitsTotal),
      pricingUnit: resForm.pricingUnit,
      slotDurationMinutes: Number(resForm.slotDurationMinutes) || 60,
      minDurationMinutes: Number(resForm.slotDurationMinutes) || 60,
      basePrice: Number(resForm.basePrice),
      depositAmount: Number(resForm.depositAmount) > 0 ? Number(resForm.depositAmount) : undefined,
      attributes,
    };
    setBusy(true);
    try {
      const targetId = editingResource === "new" ? undefined : editingResource.id;
      const res = usingMocks()
        ? saveResource(bizId, payload, targetId)
        : targetId
          ? await updateResourceRemote(bizId, targetId, payload)
          : await createResourceRemote(bizId, payload);
      if (!res.ok) {
        setError(res.error);
        setFieldErrs(res.fieldErrors ?? {});
        return;
      }
      setEditingResource(null);
      setActionMessage({
        tone: "success",
        text: targetId ? `Updated "${payload.name}".` : `Created "${payload.name}".`,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleResourceActive(resItem: Resource) {
    if (busy) return;
    setBusy(true);
    setActionMessage(null);
    try {
      const res = usingMocks()
        ? setResourceActive(bizId, resItem.id, !resItem.active)
        : await setResourceActiveRemote(bizId, resItem.id, !resItem.active);
      if (!res.ok) {
        setActionMessage({ tone: "error", text: res.error });
        return;
      }
      setActionMessage({
        tone: "success",
        text: `${resItem.name} ${resItem.active ? "disabled" : "enabled"}.`,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateBlock(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !blockTarget) return;
    setError("");
    setBusy(true);
    try {
      const res = await createResourceBlockRemote(bizId, blockTarget.id, {
        startAt: blockForm.startAt,
        endAt: blockForm.endAt,
        unitsBlocked: Number(blockForm.unitsBlocked) || 1,
        reason: blockForm.reason,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setBlockTarget(null);
      setActionMessage({ tone: "success", text: `Added block on ${blockTarget.name}.` });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteBlock(resourceId: string, blockId: string) {
    if (busy || usingMocks()) return;
    setBusy(true);
    setActionMessage(null);
    try {
      const res = await deleteResourceBlockRemote(bizId, resourceId, blockId);
      if (!res.ok) {
        setActionMessage({ tone: "error", text: res.error });
        return;
      }
      setActionMessage({ tone: "success", text: "Block removed." });
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveOffering(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      if (editingOffering) {
        const res = await updateOfferingRemote(bizId, editingOffering.id, {
          title: offForm.title.trim(),
          category: offForm.category.trim(),
          description: offForm.description.trim(),
          venueArea: offForm.venueArea.trim() || undefined,
          cancellationPolicy: offForm.cancellationPolicy.trim(),
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setEditingOffering(null);
        setActionMessage({ tone: "success", text: `Updated "${offForm.title}".` });
        return;
      }
      const res = usingMocks()
        ? saveEventOffering(bizId, offForm)
        : await createOfferingRemote(bizId, offForm);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCreatingOffering(false);
      setActionMessage({ tone: "success", text: `Created "${offForm.title}".` });
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateSession(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !sessionTarget) return;
    setError("");
    setBusy(true);
    try {
      const res = usingMocks()
        ? createEventSession(bizId, sessionTarget.id, sesForm)
        : await createSessionRemote(bizId, sessionTarget.id, {
            startAt: sesForm.startAt,
            endAt: sesForm.endAt,
            totalCapacity: Number(sesForm.totalCapacity),
            maxPerBooking: Number(sesForm.maxPerBooking),
            tiers: [
              {
                name: sesForm.tierName.trim(),
                price: Number(sesForm.tierPrice),
                capacityLimit: Number(sesForm.totalCapacity),
                currency: "USD",
              },
            ],
          });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSessionTarget(null);
      setActionMessage({ tone: "success", text: `Published session for ${sessionTarget.title}.` });
    } finally {
      setBusy(false);
    }
  }

  async function handleAddTier(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !tierTarget) return;
    setError("");
    setBusy(true);
    try {
      const res = await addSessionTierRemote(bizId, tierTarget.id, {
        name: tierForm.name.trim(),
        description: tierForm.description.trim(),
        price: Number(tierForm.price),
        capacityLimit: tierForm.capacityLimit.trim() ? Number(tierForm.capacityLimit) : undefined,
        active: true,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTierTarget(null);
      setActionMessage({ tone: "success", text: `Added tier "${tierForm.name}".` });
    } finally {
      setBusy(false);
    }
  }

  async function openAttendees(ses: EventSession, offeringTitle: string) {
    setAttendeesModal({ session: ses, offeringTitle, rows: [], loading: true });
    if (usingMocks()) {
      const rows: SessionAttendee[] = [];
      for (const bk of state.bookings ?? []) {
        for (const tp of bk.ticketPasses) {
          if (tp.sessionId === ses.id) {
            rows.push({
              passId: tp.id,
              bookingId: bk.id,
              sessionId: ses.id,
              tierId: tp.tierId,
              tierName: ses.tiers.find((t) => t.id === tp.tierId)?.name,
              customerId: bk.customerId,
              customerName: displayUser(state, bk.customerId),
              attendeeName: tp.attendeeName,
              bookingStatus: bk.status,
              paymentStatus: bk.paymentStatus,
              passCode: tp.passCode,
              passStatus: tp.status,
              checkedInAt: tp.checkedInAt,
              createdAt: bk.createdAt,
            });
          }
        }
      }
      setAttendeesModal({ session: ses, offeringTitle, rows, loading: false });
      return;
    }
    const res = await fetchSessionAttendeesRemote(bizId, ses.id);
    if (!res.ok) {
      setActionMessage({ tone: "error", text: res.error });
      setAttendeesModal(null);
      return;
    }
    setAttendeesModal({ session: ses, offeringTitle, rows: res.data, loading: false });
  }

  const pageHeading = inventoryNavLabelForBusiness(biz?.category, configs);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>{pageHeading}</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            {isRestaurant
              ? "Configure dining tables, seating areas, party capacities, and temporary table blocks."
              : isHotel
                ? "Configure room types, unit pools, nightly rates, amenities, and maintenance blocks."
                : "Manage appointment services, bookable spaces & resources, and ticketed events or group classes."}
          </p>
        </div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          {viewTab === "services" && canManage ? <Button onClick={() => openForm()}>+ Add Service</Button> : null}
          {viewTab === "resources" && canManageResources ? (
            <Button onClick={() => openResourceForm()}>
              {isRestaurant ? "+ Add Table" : isHotel ? "+ Add Room Type" : "+ Add Space / Resource"}
            </Button>
          ) : null}
          {viewTab === "events" && canManageEvents ? (
            <Button
              onClick={() => {
                setError("");
                setEditingOffering(null);
                setOffForm({
                  bookingModel: biz?.category === "events" ? "ticket" : "capacity",
                  category: biz?.category === "travel" ? "Tour" : "Workshop",
                  title: "",
                  description: "",
                  venueArea: "",
                  cancellationPolicy: "Free cancellation up to 24 hours before start.",
                });
                setCreatingOffering(true);
              }}
            >
              + Add Event / Class
            </Button>
          ) : null}
        </div>
      </div>

      {actionMessage ? (
        <div
          className={actionMessage.tone === "error" ? "panel" : "notice"}
          style={actionMessage.tone === "error" ? { borderColor: "var(--danger)", color: "var(--danger)" } : undefined}
        >
          {actionMessage.text}
        </div>
      ) : null}

      <div className="tabs">
        <button type="button" className={`tab ${viewTab === "resources" ? "on" : ""}`} onClick={() => setViewTab("resources")}>
          {isRestaurant ? "Dining Tables" : isHotel ? "Rooms & Rates" : "Spaces & Resources"} ({allResources.length})
        </button>
        <button type="button" className={`tab ${viewTab === "services" ? "on" : ""}`} onClick={() => setViewTab("services")}>
          Appointments &amp; Services ({allServices.length})
        </button>
        <button type="button" className={`tab ${viewTab === "events" ? "on" : ""}`} onClick={() => setViewTab("events")}>
          Events &amp; Classes ({allOfferings.length})
        </button>
      </div>

      {viewTab === "services" ? (
        <>
          <div className="grid-3" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search services..."
              style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 14px" }}
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 14px" }}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c === "all" ? "Category: All" : c}
                </option>
              ))}
            </select>
            <select
              value={durationFilter}
              onChange={(e) => setDurationFilter(e.target.value)}
              style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 14px" }}
            >
              <option value="all">Duration: Any</option>
              <option value="short">45 min or less</option>
              <option value="long">Over 45 min</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <Empty title="No services match" body="Create an appointment service or adjust your filters." />
          ) : (
            <div className="panel" style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Service Name</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Duration</th>
                    <th>Assigned Staff</th>
                    <th>Status</th>
                    {canManage ? <th>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((svc) => {
                    const staffNames = svc.employeeIds
                      .map((id) => employees.find((e) => e.id === id))
                      .filter(Boolean)
                      .map((e) => displayUser(state, e!.userId));
                    return (
                      <tr key={svc.id}>
                        <td>
                          <strong>{svc.name}</strong>
                          {svc.requiresApproval ? <div className="tiny">Manual approval required</div> : null}
                        </td>
                        <td>
                          <Badge tone="brand">{svc.category}</Badge>
                        </td>
                        <td className="tabular">
                          {svc.price === 0 ? "Free" : formatMoney(svc.price)}
                          {svc.depositAmount ? <div className="tiny">Deposit: {formatMoney(svc.depositAmount)}</div> : null}
                        </td>
                        <td className="tabular">{svc.durationMinutes} mins</td>
                        <td>
                          <div className="row">
                            {staffNames.slice(0, 2).map((name) => (
                              <span key={name} className="avatar" style={{ width: 28, height: 28, fontSize: 10 }}>
                                {initials(name)}
                              </span>
                            ))}
                            <span className="tiny">{staffNames.join(", ") || "Unassigned"}</span>
                          </div>
                        </td>
                        <td>
                          <Badge tone={svc.active ? "success" : "neutral"}>{svc.active ? "Active" : "Disabled"}</Badge>
                        </td>
                        {canManage ? (
                          <td>
                            <div className="row">
                              <Button tone="soft" small onClick={() => openForm(svc)}>
                                Edit
                              </Button>
                              <Button tone="ghost" small onClick={() => setAssignTarget(svc)}>
                                Staff
                              </Button>
                              <Button tone="ghost" small disabled={busy} onClick={() => void handleToggleServiceActive(svc)}>
                                {svc.active ? "Disable" : "Enable"}
                              </Button>
                              {!usingMocks() ? (
                                <Button tone="ghost" small disabled={busy} onClick={() => void handleDeleteService(svc)}>
                                  Delete
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      {viewTab === "resources" ? (
        <div className="stack" style={{ gap: 16 }}>
          {allResources.length === 0 ? (
            <Empty
              title={isRestaurant ? "No dining tables yet" : isHotel ? "No room types yet" : "No spaces or resources yet"}
              body={
                isRestaurant
                  ? "Add dining tables, patio seating, or private dining rooms with guest capacity."
                  : isHotel
                    ? "Add hotel room types with nightly rates, unit counts, and guest capacity."
                    : "Add rooms, dining tables, courts, coworking desks, vehicles, or equipment."
              }
            />
          ) : (
            <div className="panel" style={{ overflowX: "auto" }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{isRestaurant ? "Table / Space" : isHotel ? "Room Type" : "Resource"}</th>
                    <th>Details</th>
                    <th>Capacity &amp; Pool</th>
                    <th>Pricing</th>
                    <th>Status</th>
                    {canManageResources ? <th>Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {allResources.map((res) => (
                    <tr key={res.id}>
                      <td>
                        <strong>{res.name}</strong>
                        {res.description ? <div className="tiny">{res.description}</div> : null}
                      </td>
                      <td>
                        <Badge tone="brand">{res.resourceType.replaceAll("_", " ")}</Badge>
                        {typeof res.attributes?.area === "string" ? (
                          <div className="tiny">Area: {res.attributes.area}</div>
                        ) : null}
                        {typeof res.attributes?.roomType === "string" ? (
                          <div className="tiny">Category: {res.attributes.roomType}</div>
                        ) : null}
                      </td>
                      <td className="tiny tabular">
                        Up to {res.capacityPeople} guests · {res.unitsTotal} unit(s)
                      </td>
                      <td className="tabular">
                        {res.basePrice === 0 ? "No charge" : formatMoney(res.basePrice)}{" "}
                        <span className="tiny">({res.pricingUnit.replace("_", " ")})</span>
                        {res.depositAmount ? <div className="tiny">Deposit: {formatMoney(res.depositAmount)}</div> : null}
                      </td>
                      <td>
                        <Badge tone={res.active ? "success" : "neutral"}>{res.active ? "Active" : "Disabled"}</Badge>
                      </td>
                      {canManageResources ? (
                        <td>
                          <div className="row">
                            <Button tone="soft" small onClick={() => openResourceForm(res)}>
                              Edit
                            </Button>
                            {!usingMocks() ? (
                              <Button
                                tone="ghost"
                                small
                                onClick={() => {
                                  setError("");
                                  setBlockForm({
                                    startAt: `${addDays(DEMO_TODAY, 1)}T18:00:00`,
                                    endAt: `${addDays(DEMO_TODAY, 1)}T21:00:00`,
                                    unitsBlocked: "1",
                                    reason: isHotel ? "Room maintenance" : "Private party hold",
                                  });
                                  setBlockTarget(res);
                                }}
                              >
                                Block Dates
                              </Button>
                            ) : null}
                            <Button tone="ghost" small disabled={busy} onClick={() => void handleToggleResourceActive(res)}>
                              {res.active ? "Disable" : "Enable"}
                            </Button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {allBlocks.length > 0 ? (
            <section className="panel stack" style={{ gap: 10 }}>
              <h3 style={{ margin: 0 }}>Active Maintenance &amp; Hold Blocks</h3>
              {allBlocks.map((blk) => {
                const res = allResources.find((r) => r.id === blk.resourceId);
                return (
                  <div
                    key={blk.id}
                    className="row"
                    style={{ justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: 8 }}
                  >
                    <div>
                      <strong>{res?.name ?? blk.resourceId}</strong> ·{" "}
                      <span className="tiny">{blk.unitsBlocked} unit(s) blocked</span>
                      <div className="tiny">
                        {formatDateTime(blk.startAt)} → {formatDateTime(blk.endAt)} · {blk.reason}
                      </div>
                    </div>
                    {canManageResources ? (
                      <Button tone="ghost" small disabled={busy} onClick={() => void handleDeleteBlock(blk.resourceId, blk.id)}>
                        Remove
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </section>
          ) : null}
        </div>
      ) : null}

      {viewTab === "events" ? (
        allOfferings.length === 0 ? (
          <Empty
            title="No events or classes yet"
            body="Create a ticketed event or capacity-based class and publish scheduled sessions."
          />
        ) : (
          <div className="stack">
            {allOfferings.map((off) => (
              <article key={off.id} className="panel stack" style={{ gap: 12 }}>
                <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                  <div className="stack" style={{ gap: 4 }}>
                    <div className="row">
                      <strong>{off.title}</strong>
                      <Badge tone="brand">{bookingModelLabel(off.bookingModel)}</Badge>
                      <Badge tone={off.active ? "success" : "neutral"}>{off.active ? "Active" : "Hidden"}</Badge>
                    </div>
                    <span className="tiny">
                      {off.category} {off.venueArea ? `· ${off.venueArea}` : ""}
                    </span>
                    {off.description ? <p className="muted" style={{ margin: 0 }}>{off.description}</p> : null}
                  </div>
                  {canManageEvents ? (
                    <div className="row">
                      {!usingMocks() ? (
                        <Button
                          tone="ghost"
                          small
                          onClick={() => {
                            setError("");
                            setOffForm({
                              bookingModel: off.bookingModel,
                              category: off.category,
                              title: off.title,
                              description: off.description,
                              venueArea: off.venueArea ?? "",
                              cancellationPolicy: off.cancellationPolicy,
                            });
                            setEditingOffering(off);
                          }}
                        >
                          Edit
                        </Button>
                      ) : null}
                      <Button
                        tone="soft"
                        small
                        onClick={() => {
                          setError("");
                          setSesForm({
                            startAt: `${addDays(DEMO_TODAY, 2)}T18:00:00`,
                            endAt: `${addDays(DEMO_TODAY, 2)}T19:00:00`,
                            totalCapacity: "20",
                            maxPerBooking: "4",
                            tierName: off.bookingModel === "ticket" ? "General Admission" : "Drop-in Spot",
                            tierPrice: "25",
                          });
                          setSessionTarget(off);
                        }}
                      >
                        + Add Session
                      </Button>
                    </div>
                  ) : null}
                </div>
                {off.sessions.length === 0 ? (
                  <p className="tiny" style={{ margin: 0 }}>No sessions scheduled yet.</p>
                ) : (
                  <div className="grid-2">
                    {off.sessions.map((ses) => (
                      <div key={ses.id} className="select-card stack" style={{ gap: 6 }}>
                        <div className="row" style={{ justifyContent: "space-between" }}>
                          <strong className="tabular">{formatDateTime(ses.startAt)}</strong>
                          <Badge tone={ses.remainingCapacity > 0 ? "success" : "warning"}>
                            {ses.status.replace("_", " ")}
                          </Badge>
                        </div>
                        <span className="tiny tabular">
                          {ses.remainingCapacity} / {ses.totalCapacity} remaining (max {ses.maxPerBooking}/booking)
                        </span>
                        <span className="tiny">
                          {ses.tiers.map((t) => `${t.name}: ${formatMoney(t.price)}`).join(" · ")}
                        </span>
                        <div className="row" style={{ flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                          <Button tone="ghost" small onClick={() => void openAttendees(ses, off.title)}>
                            Roster ({ses.reservedCount})
                          </Button>
                          {canManageEvents && !usingMocks() ? (
                            <Button
                              tone="soft"
                              small
                              onClick={() => {
                                setError("");
                                setTierForm({ name: "VIP Pass", description: "", price: "75", capacityLimit: "" });
                                setTierTarget(ses);
                              }}
                            >
                              + Add Tier
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )
      ) : null}

      {editing ? (
        <Modal title={editing === "new" ? "Add New Service" : `Edit ${editing.name}`} onClose={() => setEditing(null)}>
          <form className="stack" onSubmit={(e) => void handleSaveService(e)}>
            <Field label="Service name">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              {fieldErrs.name ? <small>{fieldErrs.name}</small> : null}
            </Field>
            <Field label="Category">
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              {fieldErrs.category ? <small>{fieldErrs.category}</small> : null}
            </Field>
            <div className="grid-3">
              <Field label="Price ($)">
                <input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                {fieldErrs.price ? <small>{fieldErrs.price}</small> : null}
              </Field>
              <Field label="Duration (min)">
                <input type="number" min="5" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} />
                {fieldErrs.durationMinutes ? <small>{fieldErrs.durationMinutes}</small> : null}
              </Field>
              <Field label="Deposit ($ optional)">
                <input type="number" min="0" step="0.01" value={form.depositAmount} onChange={(e) => setForm({ ...form, depositAmount: e.target.value })} placeholder="0" />
              </Field>
            </div>
            <Field label="Description">
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              {fieldErrs.description ? <small>{fieldErrs.description}</small> : null}
            </Field>
            <Field label="Cancellation policy">
              <input value={form.cancellationPolicy} onChange={(e) => setForm({ ...form, cancellationPolicy: e.target.value })} />
              {fieldErrs.cancellationPolicy ? <small>{fieldErrs.cancellationPolicy}</small> : null}
            </Field>
            <label className="row" style={{ gap: 8 }}>
              <input
                type="checkbox"
                checked={form.requiresApproval}
                onChange={(e) => setForm({ ...form, requiresApproval: e.target.checked })}
              />
              <span className="tiny">Require manual staff approval before confirmation</span>
            </label>
            {employees.length > 0 ? (
              <div className="stack" style={{ gap: 6 }}>
                <span className="tiny">Assign staff members</span>
                <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                  {employees.map((emp) => {
                    const checked = form.employeeIds.includes(emp.id);
                    return (
                      <label key={emp.id} className="row" style={{ gap: 6 }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setForm((prev) => ({
                              ...prev,
                              employeeIds: checked
                                ? prev.employeeIds.filter((id) => id !== emp.id)
                                : [...prev.employeeIds, emp.id],
                            }))
                          }
                        />
                        <span className="tiny">{displayUser(state, emp.userId)}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {error ? <p className="error">{error}</p> : null}
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save service"}
            </Button>
          </form>
        </Modal>
      ) : null}

      {editingResource ? (
        <Modal
          title={editingResource === "new" ? "Add Space or Resource" : `Edit ${editingResource.name}`}
          onClose={() => setEditingResource(null)}
        >
          <form className="stack" onSubmit={(e) => void handleSaveResource(e)}>
            <Field label="Name">
              <input value={resForm.name} onChange={(e) => setResForm({ ...resForm, name: e.target.value })} placeholder="Patio Table 4, Deluxe King, Court A..." />
            </Field>
            <div className="grid-2">
              <Field label="Resource Type">
                <select value={resForm.resourceType} onChange={(e) => setResForm({ ...resForm, resourceType: e.target.value as ResourceType })}>
                  {RESOURCE_TYPES.map((rt) => (
                    <option key={rt.id} value={rt.id}>{rt.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Pricing Unit">
                <select value={resForm.pricingUnit} onChange={(e) => setResForm({ ...resForm, pricingUnit: e.target.value as PricingUnit })}>
                  {PRICING_UNITS.map((pu) => (
                    <option key={pu.id} value={pu.id}>{pu.label}</option>
                  ))}
                </select>
              </Field>
            </div>
            {resForm.resourceType === "restaurant_table" ? (
              <Field label="Seating Area">
                <input
                  value={resForm.area}
                  onChange={(e) => setResForm({ ...resForm, area: e.target.value })}
                  placeholder="Main Dining, Patio, Bar..."
                />
              </Field>
            ) : null}
            {resForm.resourceType === "hotel_room" ? (
              <div className="grid-2">
                <Field label="Room Type">
                  <select value={resForm.roomType} onChange={(e) => setResForm({ ...resForm, roomType: e.target.value })}>
                    <option value="Single">Single</option>
                    <option value="Double">Double</option>
                    <option value="Twin">Twin</option>
                    <option value="Suite">Suite</option>
                  </select>
                </Field>
                <Field label="Amenities (comma-separated)">
                  <input
                    value={resForm.amenities}
                    onChange={(e) => setResForm({ ...resForm, amenities: e.target.value })}
                    placeholder="King Bed, Balcony, Wi-Fi"
                  />
                </Field>
              </div>
            ) : null}
            <div className="grid-2">
              <Field label="Max Guests / Capacity">
                <input type="number" min="1" value={resForm.capacityPeople} onChange={(e) => setResForm({ ...resForm, capacityPeople: e.target.value })} />
              </Field>
              <Field label="Units Available (Pool)">
                <input type="number" min="1" value={resForm.unitsTotal} onChange={(e) => setResForm({ ...resForm, unitsTotal: e.target.value })} />
              </Field>
            </div>
            <div className="grid-3">
              <Field label="Slot / Turn Minutes">
                <input type="number" min="15" value={resForm.slotDurationMinutes} onChange={(e) => setResForm({ ...resForm, slotDurationMinutes: e.target.value })} />
              </Field>
              <Field label="Base Price ($)">
                <input type="number" min="0" step="0.01" value={resForm.basePrice} onChange={(e) => setResForm({ ...resForm, basePrice: e.target.value })} />
              </Field>
              <Field label="Deposit ($)">
                <input type="number" min="0" step="0.01" value={resForm.depositAmount} onChange={(e) => setResForm({ ...resForm, depositAmount: e.target.value })} />
              </Field>
            </div>
            <Field label="Description">
              <textarea value={resForm.description} onChange={(e) => setResForm({ ...resForm, description: e.target.value })} />
            </Field>
            {error ? <p className="error">{error}</p> : null}
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save Resource"}
            </Button>
          </form>
        </Modal>
      ) : null}

      {blockTarget ? (
        <Modal title={`Block Availability — ${blockTarget.name}`} onClose={() => setBlockTarget(null)}>
          <form className="stack" onSubmit={(e) => void handleCreateBlock(e)}>
            <div className="grid-2">
              <Field label="Start (YYYY-MM-DDTHH:MM:SS)">
                <input value={blockForm.startAt} onChange={(e) => setBlockForm({ ...blockForm, startAt: e.target.value })} />
              </Field>
              <Field label="End (YYYY-MM-DDTHH:MM:SS)">
                <input value={blockForm.endAt} onChange={(e) => setBlockForm({ ...blockForm, endAt: e.target.value })} />
              </Field>
            </div>
            <div className="grid-2">
              <Field label="Units to block">
                <input
                  type="number"
                  min="1"
                  max={blockTarget.unitsTotal}
                  value={blockForm.unitsBlocked}
                  onChange={(e) => setBlockForm({ ...blockForm, unitsBlocked: e.target.value })}
                />
              </Field>
              <Field label="Reason">
                <input value={blockForm.reason} onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })} />
              </Field>
            </div>
            {error ? <p className="error">{error}</p> : null}
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save Block"}
            </Button>
          </form>
        </Modal>
      ) : null}

      {creatingOffering || editingOffering ? (
        <Modal
          title={editingOffering ? `Edit ${editingOffering.title}` : "Add Event or Capacity Class"}
          onClose={() => {
            setCreatingOffering(false);
            setEditingOffering(null);
          }}
        >
          <form className="stack" onSubmit={(e) => void handleSaveOffering(e)}>
            <div className="grid-2">
              <Field label="Model">
                <select
                  value={offForm.bookingModel}
                  disabled={Boolean(editingOffering)}
                  onChange={(e) => setOffForm({ ...offForm, bookingModel: e.target.value as "ticket" | "capacity" })}
                >
                  <option value="capacity">Classes &amp; Capacity</option>
                  <option value="ticket">Events &amp; Tickets</option>
                </select>
              </Field>
              <Field label="Category">
                <input value={offForm.category} onChange={(e) => setOffForm({ ...offForm, category: e.target.value })} />
              </Field>
            </div>
            <Field label="Title">
              <input value={offForm.title} onChange={(e) => setOffForm({ ...offForm, title: e.target.value })} placeholder="Morning Yoga, Rooftop Jazz..." />
            </Field>
            <Field label="Venue Area / Room">
              <input value={offForm.venueArea} onChange={(e) => setOffForm({ ...offForm, venueArea: e.target.value })} />
            </Field>
            <Field label="Description">
              <textarea value={offForm.description} onChange={(e) => setOffForm({ ...offForm, description: e.target.value })} />
            </Field>
            <Field label="Cancellation Policy">
              <input value={offForm.cancellationPolicy} onChange={(e) => setOffForm({ ...offForm, cancellationPolicy: e.target.value })} />
            </Field>
            {error ? <p className="error">{error}</p> : null}
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : editingOffering ? "Save Changes" : "Create Offering"}
            </Button>
          </form>
        </Modal>
      ) : null}

      {sessionTarget ? (
        <Modal title={`Add Session — ${sessionTarget.title}`} onClose={() => setSessionTarget(null)}>
          <form className="stack" onSubmit={(e) => void handleCreateSession(e)}>
            <div className="grid-2">
              <Field label="Start (ISO YYYY-MM-DDTHH:MM:SS)">
                <input value={sesForm.startAt} onChange={(e) => setSesForm({ ...sesForm, startAt: e.target.value })} />
              </Field>
              <Field label="End (ISO YYYY-MM-DDTHH:MM:SS)">
                <input value={sesForm.endAt} onChange={(e) => setSesForm({ ...sesForm, endAt: e.target.value })} />
              </Field>
            </div>
            <div className="grid-2">
              <Field label="Total Capacity">
                <input type="number" min="1" value={sesForm.totalCapacity} onChange={(e) => setSesForm({ ...sesForm, totalCapacity: e.target.value })} />
              </Field>
              <Field label="Max Per Booking">
                <input type="number" min="1" value={sesForm.maxPerBooking} onChange={(e) => setSesForm({ ...sesForm, maxPerBooking: e.target.value })} />
              </Field>
            </div>
            <div className="grid-2">
              <Field label="Default Tier Name">
                <input value={sesForm.tierName} onChange={(e) => setSesForm({ ...sesForm, tierName: e.target.value })} />
              </Field>
              <Field label="Tier Price ($)">
                <input type="number" min="0" step="0.01" value={sesForm.tierPrice} onChange={(e) => setSesForm({ ...sesForm, tierPrice: e.target.value })} />
              </Field>
            </div>
            {error ? <p className="error">{error}</p> : null}
            <Button type="submit" disabled={busy}>
              {busy ? "Publishing…" : "Publish Session"}
            </Button>
          </form>
        </Modal>
      ) : null}

      {tierTarget ? (
        <Modal title="Add Ticket / Admission Tier" onClose={() => setTierTarget(null)}>
          <form className="stack" onSubmit={(e) => void handleAddTier(e)}>
            <Field label="Tier Name">
              <input value={tierForm.name} onChange={(e) => setTierForm({ ...tierForm, name: e.target.value })} />
            </Field>
            <div className="grid-2">
              <Field label="Price ($)">
                <input type="number" min="0" step="0.01" value={tierForm.price} onChange={(e) => setTierForm({ ...tierForm, price: e.target.value })} />
              </Field>
              <Field label="Cap (optional)">
                <input type="number" min="1" value={tierForm.capacityLimit} onChange={(e) => setTierForm({ ...tierForm, capacityLimit: e.target.value })} />
              </Field>
            </div>
            <Field label="Description">
              <input value={tierForm.description} onChange={(e) => setTierForm({ ...tierForm, description: e.target.value })} />
            </Field>
            {error ? <p className="error">{error}</p> : null}
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Add Tier"}
            </Button>
          </form>
        </Modal>
      ) : null}

      {attendeesModal ? (
        <Modal
          title={`Attendees — ${attendeesModal.offeringTitle}`}
          onClose={() => setAttendeesModal(null)}
        >
          <div className="stack" style={{ gap: 10 }}>
            <span className="tiny">
              Session {formatDateTime(attendeesModal.session.startAt)} · {attendeesModal.session.reservedCount} /{" "}
              {attendeesModal.session.totalCapacity} booked
            </span>
            {attendeesModal.loading ? (
              <p className="muted">Loading attendee passes…</p>
            ) : attendeesModal.rows.length === 0 ? (
              <p className="muted">No passes issued for this session yet.</p>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {attendeesModal.rows.map((row) => (
                  <div
                    key={row.passId}
                    className="row"
                    style={{ justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid var(--line)" }}
                  >
                    <div>
                      <strong>{row.attendeeName || row.customerName}</strong>
                      <div className="tiny">
                        {row.tierName ?? "Standard"} · <span className="tabular">{row.passCode}</span>
                      </div>
                    </div>
                    <Badge tone={row.passStatus === "checked_in" ? "success" : "brand"}>
                      {row.passStatus.replace("_", " ")}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      ) : null}

      {assignTarget ? (() => {
        const liveTarget = state.services.find((s) => s.id === assignTarget.id) ?? assignTarget;
        return (
          <Modal title={`Assign Staff — ${liveTarget.name}`} onClose={() => setAssignTarget(null)}>
            <div className="stack">
              {employees.length === 0 ? (
                <p className="muted">No employees in this workspace yet. Invite team members first.</p>
              ) : (
                employees.map((emp) => {
                  const assigned = liveTarget.employeeIds.includes(emp.id);
                  return (
                    <div key={emp.id} className="row" style={{ justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                      <span>{displayUser(state, emp.userId)} ({emp.title})</span>
                      <Button
                        tone={assigned ? "soft" : "ghost"}
                        small
                        disabled={busy}
                        onClick={() => void handleToggleEmployee(liveTarget.id, emp.id)}
                      >
                        {assigned ? "Assigned (Remove)" : "Assign"}
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </Modal>
        );
      })() : null}
    </div>
  );
}
