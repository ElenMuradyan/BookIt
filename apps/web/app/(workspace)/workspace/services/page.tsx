"use client";

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
import { addDays, bookingModelLabel, can, DEMO_TODAY, formatDateTime, formatMoney, initials } from "@bookit/utils";
import { useState } from "react";
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
  const [viewTab, setViewTab] = useState<"services" | "resources" | "events">("services");
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [durationFilter, setDurationFilter] = useState("all");
  const [editing, setEditing] = useState<Service | "new" | null>(null);
  const [assignTarget, setAssignTarget] = useState<Service | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    category: "Hair",
    price: "75",
    durationMinutes: "45",
    cancellationPolicy: "Free cancellation up to 24 hours before the visit.",
  });
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
  });
  const [creatingOffering, setCreatingOffering] = useState(false);
  const [offForm, setOffForm] = useState({
    bookingModel: "capacity" as "ticket" | "capacity",
    category: "Wellness",
    title: "",
    description: "",
    venueArea: "",
    cancellationPolicy: "Free cancellation up to 12 hours before start.",
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
  const [error, setError] = useState("");

  if (!auth.workspace) return null;
  const bizId = auth.workspace.businessId;
  const canManage = can(auth.workspace.role, "services.manage");
  const canManageResources = can(auth.workspace.role, "resources.manage");
  const canManageEvents = can(auth.workspace.role, "events.manage");
  const allServices = state.services.filter((s) => s.businessId === bizId);
  const allResources = resourcesForBusiness(state, bizId, true);
  const allOfferings = offeringsForBusiness(state, bizId, undefined, true);
  const employees = state.employees.filter((e) => e.businessId === bizId);
  const categories = ["all", ...new Set(allServices.map((s) => s.category))];

  const filtered = allServices.filter((s) => {
    if (category !== "all" && s.category !== category) return false;
    if (durationFilter === "short" && s.durationMinutes > 45) return false;
    if (durationFilter === "long" && s.durationMinutes <= 45) return false;
    if (q.trim() && !`${s.name} ${s.category} ${s.description}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  });

  function openForm(svc?: Service) {
    if (svc) {
      setForm({
        name: svc.name,
        description: svc.description,
        category: svc.category,
        price: String(svc.price),
        durationMinutes: String(svc.durationMinutes),
        cancellationPolicy: svc.cancellationPolicy,
      });
      setEditing(svc);
    } else {
      setForm({
        name: "",
        description: "",
        category: "Hair",
        price: "75",
        durationMinutes: "45",
        cancellationPolicy: "Free cancellation up to 24 hours before the visit.",
      });
      setEditing("new");
    }
    setError("");
  }

  function openResourceForm(res?: Resource) {
    if (res) {
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
      });
      setEditingResource(res);
    } else {
      setResForm({
        name: "",
        resourceType: "meeting_room",
        description: "",
        capacityPeople: "4",
        unitsTotal: "1",
        pricingUnit: "per_hour",
        slotDurationMinutes: "60",
        basePrice: "45",
        depositAmount: "0",
      });
      setEditingResource("new");
    }
    setError("");
  }

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>Offerings &amp; Catalog</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Manage appointment services, bookable spaces &amp; resources, and ticketed events or group classes.
          </p>
        </div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          {viewTab === "services" && canManage ? <Button onClick={() => openForm()}>+ Add New Service</Button> : null}
          {viewTab === "resources" && canManageResources ? <Button onClick={() => openResourceForm()}>+ Add Space / Resource</Button> : null}
          {viewTab === "events" && canManageEvents ? (
            <Button
              onClick={() => {
                setError("");
                setCreatingOffering(true);
              }}
            >
              + Add Event / Class
            </Button>
          ) : null}
        </div>
      </div>

      <div className="tabs">
        <button type="button" className={`tab ${viewTab === "services" ? "on" : ""}`} onClick={() => setViewTab("services")}>
          Appointments &amp; Services ({allServices.length})
        </button>
        <button type="button" className={`tab ${viewTab === "resources" ? "on" : ""}`} onClick={() => setViewTab("resources")}>
          Spaces &amp; Resources ({allResources.length})
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
                  {c === "all" ? "Category: All Categories" : c}
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
                        <div className="progress-mini">
                          <i style={{ width: `${Math.min(100, 40 + svc.employeeIds.length * 25)}%` }} />
                        </div>
                      </td>
                      <td>
                        <Badge tone="brand">{svc.category}</Badge>
                      </td>
                      <td className="tabular">{svc.price === 0 ? "Free" : formatMoney(svc.price)}</td>
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
                            <Button tone="ghost" small onClick={() => setServiceActive(bizId, svc.id, !svc.active)}>
                              {svc.active ? "Disable" : "Enable"}
                            </Button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {viewTab === "resources" ? (
        allResources.length === 0 ? (
          <Empty
            title="No spaces or resources yet"
            body="Add rooms, dining tables, courts, coworking desks, vehicles, or equipment."
          />
        ) : (
          <div className="panel" style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>Type</th>
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
                    </td>
                    <td className="tiny tabular">
                      {res.capacityPeople} guests · {res.unitsTotal} unit(s)
                    </td>
                    <td className="tabular">
                      {res.basePrice === 0 ? "Free" : formatMoney(res.basePrice)}{" "}
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
                          <Button tone="ghost" small onClick={() => setResourceActive(bizId, res.id, !res.active)}>
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
        )
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
                  ) : null}
                </div>
                {off.sessions.length === 0 ? (
                  <p className="tiny" style={{ margin: 0 }}>No sessions scheduled yet.</p>
                ) : (
                  <div className="grid-2">
                    {off.sessions.map((ses) => (
                      <div key={ses.id} className="select-card stack" style={{ gap: 4 }}>
                        <div className="row" style={{ justifyContent: "space-between" }}>
                          <strong className="tabular">{formatDateTime(ses.startAt)}</strong>
                          <Badge tone={ses.remainingCapacity > 0 ? "success" : "warning"}>{ses.status.replace("_", " ")}</Badge>
                        </div>
                        <span className="tiny tabular">
                          {ses.remainingCapacity} / {ses.totalCapacity} remaining (max {ses.maxPerBooking}/booking)
                        </span>
                        <span className="tiny">
                          {ses.tiers.map((t) => `${t.name}: ${formatMoney(t.price)}`).join(" · ")}
                        </span>
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
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const res = saveService(bizId, form, editing === "new" ? undefined : editing.id);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setEditing(null);
            }}
          >
            <Field label="Service name">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Category">
              <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </Field>
            <div className="grid-2">
              <Field label="Price ($)">
                <input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </Field>
              <Field label="Duration (minutes)">
                <input type="number" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} />
              </Field>
            </div>
            <Field label="Description">
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Cancellation policy">
              <input value={form.cancellationPolicy} onChange={(e) => setForm({ ...form, cancellationPolicy: e.target.value })} />
            </Field>
            {error ? <p className="error">{error}</p> : null}
            <Button type="submit">Save service</Button>
          </form>
        </Modal>
      ) : null}

      {editingResource ? (
        <Modal
          title={editingResource === "new" ? "Add Space or Resource" : `Edit ${editingResource.name}`}
          onClose={() => setEditingResource(null)}
        >
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const res = saveResource(
                bizId,
                {
                  ...resForm,
                  depositAmount: Number(resForm.depositAmount) > 0 ? Number(resForm.depositAmount) : undefined,
                },
                editingResource === "new" ? undefined : editingResource.id,
              );
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setEditingResource(null);
            }}
          >
            <Field label="Name">
              <input value={resForm.name} onChange={(e) => setResForm({ ...resForm, name: e.target.value })} placeholder="Court A, Boardroom, Suite 402..." />
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
            <div className="grid-2">
              <Field label="Max Guests / Capacity">
                <input type="number" value={resForm.capacityPeople} onChange={(e) => setResForm({ ...resForm, capacityPeople: e.target.value })} />
              </Field>
              <Field label="Units Available (Pool)">
                <input type="number" value={resForm.unitsTotal} onChange={(e) => setResForm({ ...resForm, unitsTotal: e.target.value })} />
              </Field>
            </div>
            <div className="grid-3">
              <Field label="Slot Minutes">
                <input type="number" value={resForm.slotDurationMinutes} onChange={(e) => setResForm({ ...resForm, slotDurationMinutes: e.target.value })} />
              </Field>
              <Field label="Base Price ($)">
                <input type="number" value={resForm.basePrice} onChange={(e) => setResForm({ ...resForm, basePrice: e.target.value })} />
              </Field>
              <Field label="Deposit ($)">
                <input type="number" value={resForm.depositAmount} onChange={(e) => setResForm({ ...resForm, depositAmount: e.target.value })} />
              </Field>
            </div>
            <Field label="Description">
              <textarea value={resForm.description} onChange={(e) => setResForm({ ...resForm, description: e.target.value })} />
            </Field>
            {error ? <p className="error">{error}</p> : null}
            <Button type="submit">Save Resource</Button>
          </form>
        </Modal>
      ) : null}

      {creatingOffering ? (
        <Modal title="Add Event or Capacity Class" onClose={() => setCreatingOffering(false)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const res = saveEventOffering(bizId, offForm);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setCreatingOffering(false);
              setOffForm({
                bookingModel: "capacity",
                category: "Wellness",
                title: "",
                description: "",
                venueArea: "",
                cancellationPolicy: "Free cancellation up to 12 hours before start.",
              });
            }}
          >
            <div className="grid-2">
              <Field label="Model">
                <select value={offForm.bookingModel} onChange={(e) => setOffForm({ ...offForm, bookingModel: e.target.value as "ticket" | "capacity" })}>
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
            <Button type="submit">Create Offering</Button>
          </form>
        </Modal>
      ) : null}

      {sessionTarget ? (
        <Modal title={`Add Session — ${sessionTarget.title}`} onClose={() => setSessionTarget(null)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const res = createEventSession(bizId, sessionTarget.id, sesForm);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setSessionTarget(null);
            }}
          >
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
                <input type="number" value={sesForm.totalCapacity} onChange={(e) => setSesForm({ ...sesForm, totalCapacity: e.target.value })} />
              </Field>
              <Field label="Max Per Booking">
                <input type="number" value={sesForm.maxPerBooking} onChange={(e) => setSesForm({ ...sesForm, maxPerBooking: e.target.value })} />
              </Field>
            </div>
            <div className="grid-2">
              <Field label="Default Tier Name">
                <input value={sesForm.tierName} onChange={(e) => setSesForm({ ...sesForm, tierName: e.target.value })} />
              </Field>
              <Field label="Tier Price ($)">
                <input type="number" value={sesForm.tierPrice} onChange={(e) => setSesForm({ ...sesForm, tierPrice: e.target.value })} />
              </Field>
            </div>
            {error ? <p className="error">{error}</p> : null}
            <Button type="submit">Publish Session</Button>
          </form>
        </Modal>
      ) : null}

      {assignTarget ? (() => {
        const liveTarget = state.services.find((s) => s.id === assignTarget.id) ?? assignTarget;
        return (
          <Modal title={`Assign Staff — ${liveTarget.name}`} onClose={() => setAssignTarget(null)}>
            <div className="stack">
              {employees.map((emp) => {
                const assigned = liveTarget.employeeIds.includes(emp.id);
                return (
                  <div key={emp.id} className="row" style={{ justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                    <span>{displayUser(state, emp.userId)} ({emp.title})</span>
                    <Button
                      tone={assigned ? "soft" : "ghost"}
                      small
                      onClick={() => toggleEmployeeToService(bizId, liveTarget.id, emp.id)}
                    >
                      {assigned ? "Assigned (Remove)" : "Assign"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </Modal>
        );
      })() : null}
    </div>
  );
}
