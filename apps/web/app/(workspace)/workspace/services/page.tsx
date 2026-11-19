"use client";

import {
  displayUser,
  saveService,
  setServiceActive,
  toggleEmployeeToService,
  useBookItState,
} from "@bookit/api-client";
import type { Service } from "@bookit/types";
import { can, formatMoney, initials } from "@bookit/utils";
import { useState } from "react";
import { Badge, Button, Field, Modal } from "@/components/ui";
import { useAuth } from "@/lib/session";

export default function WorkspaceServicesPage() {
  const auth = useAuth();
  const state = useBookItState();
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
  const [error, setError] = useState("");

  if (!auth.workspace) return null;
  const bizId = auth.workspace.businessId;
  const canManage = can(auth.workspace.role, "services.manage");
  const allServices = state.services.filter((s) => s.businessId === bizId);
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

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Services Management</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Manage offerings, pricing, durations, and team assignments.
          </p>
        </div>
        {canManage ? <Button onClick={() => openForm()}>+ Add New Service</Button> : null}
      </div>

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
