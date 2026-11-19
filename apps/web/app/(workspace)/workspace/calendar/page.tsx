"use client";

import {
  businessAppointments,
  createStaffAppointment,
  displayUser,
  moveAppointment,
  setAppointmentStatus,
  useBookItState,
} from "@bookit/api-client";
import type { Appointment } from "@bookit/types";
import { appointmentStatus } from "@bookit/ui";
import { addDays, can, DEMO_TODAY, formatDate, formatTime } from "@bookit/utils";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Badge, Button, Field, Modal } from "@/components/ui";
import { useAuth } from "@/lib/session";

function CalendarContent() {
  const auth = useAuth();
  const state = useBookItState();
  const params = useSearchParams();
  const [view, setView] = useState<"day" | "week" | "month">("week");
  const [anchorDate, setAnchorDate] = useState(DEMO_TODAY);
  const [staffFilter, setStaffFilter] = useState("all");
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(params.get("create") === "1");
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);

  const bizId = auth.workspace?.businessId ?? "";
  const biz = state.businesses.find((b) => b.id === bizId);
  const employees = state.employees.filter((e) => e.businessId === bizId);
  const services = state.services.filter((s) => s.businessId === bizId && s.active);
  const customers = state.users.filter((u) => !u.isPlatformAdmin);

  const [form, setForm] = useState({
    customerId: customers[0]?.id ?? "usr_elena",
    serviceId: services[0]?.id ?? "",
    employeeId: employees[0]?.id ?? "",
    date: DEMO_TODAY,
    time: "11:00",
  });
  const [moveDate, setMoveDate] = useState(DEMO_TODAY);
  const [moveTime, setMoveTime] = useState("14:00");
  const [error, setError] = useState("");

  if (!auth.workspace || !auth.userId || !biz) return null;
  const canManage = can(auth.workspace.role, "calendar.manage");

  const appts = businessAppointments(state, bizId).filter((a) => {
    if (staffFilter !== "all" && a.employeeId !== staffFilter) return false;
    if (q.trim()) {
      const cust = displayUser(state, a.customerId);
      const svc = state.services.find((s) => s.id === a.serviceId)?.name ?? "";
      if (!`${cust} ${svc}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
    }
    return true;
  });

  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(anchorDate, i));
  const monthDays = Array.from({ length: 14 }, (_, i) => addDays(anchorDate, i));

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <h1 style={{ margin: 0 }}>Calendar</h1>
          <Button tone="ghost" small onClick={() => setAnchorDate(addDays(anchorDate, -1))}>
            ←
          </Button>
          <Button tone="soft" small onClick={() => setAnchorDate(DEMO_TODAY)}>
            Today ({formatDate(`${DEMO_TODAY}T12:00:00`, { month: "short", day: "numeric" })})
          </Button>
          <Button tone="ghost" small onClick={() => setAnchorDate(addDays(anchorDate, 1))}>
            →
          </Button>
        </div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search appointments..."
            style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "8px 12px" }}
          />
          <div className="tabs">
            {(["day", "week", "month"] as const).map((mode) => (
              <button key={mode} type="button" className={`tab ${view === mode ? "on" : ""}`} onClick={() => setView(mode)}>
                {mode[0].toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          {canManage ? (
            <Button onClick={() => setShowCreate(true)}>+ Create Appointment</Button>
          ) : null}
        </div>
      </div>

      <div className="chips">
        <button type="button" className={`slot ${staffFilter === "all" ? "on" : ""}`} onClick={() => setStaffFilter("all")}>
          All Staff ({employees.length})
        </button>
        {employees.map((emp) => (
          <button
            key={emp.id}
            type="button"
            className={`slot ${staffFilter === emp.id ? "on" : ""}`}
            onClick={() => setStaffFilter(emp.id)}
          >
            {displayUser(state, emp.userId)}
          </button>
        ))}
      </div>

      {view === "week" ? (
        <div className="week-grid">
          <div className="week-head">Schedule</div>
          {weekDays.map((day) => (
            <div key={day} className={`week-head ${day === DEMO_TODAY ? "today" : ""}`}>
              {formatDate(`${day}T12:00:00`, { weekday: "short", day: "numeric" })}
            </div>
          ))}
          <div className="week-col" style={{ color: "var(--muted)", fontSize: 12 }}>
            <span>09:00 AM</span>
            <span>11:00 AM</span>
            <span>01:00 PM</span>
            <span>03:00 PM</span>
            <span>05:00 PM</span>
          </div>
          {weekDays.map((day) => {
            const dayAppts = appts.filter((a) => a.start.startsWith(day));
            return (
              <div key={day} className={`week-col ${day === DEMO_TODAY ? "today" : ""}`}>
                {dayAppts.length === 0 ? (
                  <span className="tiny">Open slots</span>
                ) : (
                  dayAppts.map((apt) => {
                    const svc = state.services.find((s) => s.id === apt.serviceId);
                    const emp = state.employees.find((e) => e.id === apt.employeeId);
                    const st = appointmentStatus(apt.status);
                    return (
                      <button
                        key={apt.id}
                        type="button"
                        className={`appt-block ${apt.status === "pending" ? "pending" : ""}`}
                        onClick={() => {
                          setSelectedAppt(apt);
                          setMoveDate(apt.start.slice(0, 10));
                          setMoveTime(apt.start.slice(11, 16));
                        }}
                      >
                        <Badge tone={st.tone}>{st.label}</Badge>
                        <strong style={{ fontSize: 13 }}>{displayUser(state, apt.customerId)}</strong>
                        <span className="tiny">{svc?.name}</span>
                        <span className="tiny tabular">
                          {formatTime(apt.start)} – {formatTime(apt.end)}
                        </span>
                        <span className="tiny">{emp ? displayUser(state, emp.userId) : ""}</span>
                      </button>
                    );
                  })
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {view === "day" ? (
        <div className="panel stack">
          <h3 style={{ margin: 0 }}>{formatDate(`${anchorDate}T12:00:00`, { weekday: "long", month: "long", day: "numeric" })}</h3>
          {appts.filter((a) => a.start.startsWith(anchorDate)).length === 0 ? (
            <p className="muted">No appointments scheduled on this day.</p>
          ) : (
            appts
              .filter((a) => a.start.startsWith(anchorDate))
              .map((apt) => {
                const svc = state.services.find((s) => s.id === apt.serviceId);
                const emp = state.employees.find((e) => e.id === apt.employeeId);
                const st = appointmentStatus(apt.status);
                return (
                  <div key={apt.id} className="select-card row" style={{ justifyContent: "space-between" }} onClick={() => setSelectedAppt(apt)}>
                    <div>
                      <strong className="tabular">{formatTime(apt.start)} – {formatTime(apt.end)}</strong>
                      <div>{displayUser(state, apt.customerId)} · {svc?.name}</div>
                      <div className="tiny">Assigned: {emp ? displayUser(state, emp.userId) : "Staff"}</div>
                    </div>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                );
              })
          )}
        </div>
      ) : null}

      {view === "month" ? (
        <div className="cal">
          {monthDays.map((day) => {
            const count = appts.filter((a) => a.start.startsWith(day)).length;
            const holiday = biz.holidays.find((h) => h.date === day);
            return (
              <div key={day} className="panel cal-day stack" style={{ gap: 6 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong className="tiny tabular">{formatDate(`${day}T12:00:00`, { month: "short", day: "numeric" })}</strong>
                  {count ? <Badge tone="brand">{count}</Badge> : null}
                </div>
                {holiday ? <Badge tone="warning">{holiday.name}</Badge> : null}
                {appts
                  .filter((a) => a.start.startsWith(day))
                  .slice(0, 2)
                  .map((a) => (
                    <div key={a.id} className="tiny" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {formatTime(a.start)} {displayUser(state, a.customerId)}
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="panel row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <strong>Holidays & Blocked Hours</strong>
          <div className="tiny">
            Holidays: {biz.holidays.map((h) => `${h.name} (${h.date})`).join(", ") || "None"} · Blocked:{" "}
            {biz.blocked.map((b) => `${b.date} ${b.start}-${b.end} (${b.reason})`).join(", ") || "None"}
          </div>
        </div>
      </div>

      {showCreate ? (
        <Modal title="Create Appointment" onClose={() => setShowCreate(false)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const res = createStaffAppointment({
                businessId: bizId,
                customerId: form.customerId,
                serviceId: form.serviceId || services[0]?.id || "",
                employeeId: form.employeeId || employees[0]?.id || "",
                date: form.date,
                time: form.time,
              });
              if (!res.ok) {
                setError(res.error);
                return;
              }
              setShowCreate(false);
              setError("");
            }}
          >
            <Field label="Customer">
              <select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
                {customers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Service">
              <select value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })}>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.durationMinutes}m)
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Employee">
              <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {displayUser(state, emp.userId)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid-2">
              <Field label="Date">
                <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </Field>
              <Field label="Time">
                <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} />
              </Field>
            </div>
            {error ? <p className="error">{error}</p> : null}
            <Button type="submit">Create appointment</Button>
          </form>
        </Modal>
      ) : null}

      {selectedAppt ? (
        <Modal title="Appointment Details" onClose={() => setSelectedAppt(null)}>
          <div className="stack">
            <div>
              <strong>{displayUser(state, selectedAppt.customerId)}</strong>
              <div className="tiny">
                {state.services.find((s) => s.id === selectedAppt.serviceId)?.name} · {formatDate(selectedAppt.start)} {formatTime(selectedAppt.start)}
              </div>
            </div>
            {canManage ? (
              <>
                <div className="grid-2">
                  <Field label="Move date">
                    <input type="date" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} />
                  </Field>
                  <Field label="Move time">
                    <input type="time" value={moveTime} onChange={(e) => setMoveTime(e.target.value)} />
                  </Field>
                </div>
                <div className="row" style={{ flexWrap: "wrap" }}>
                  <Button
                    small
                    onClick={() => {
                      moveAppointment(selectedAppt.id, moveDate, moveTime, auth.userId!);
                      setSelectedAppt(null);
                    }}
                  >
                    Move appointment
                  </Button>
                  <Button
                    tone="soft"
                    small
                    onClick={() => {
                      setAppointmentStatus(selectedAppt.id, "confirmed", auth.userId!);
                      setSelectedAppt(null);
                    }}
                  >
                    Confirm
                  </Button>
                  <Button
                    tone="soft"
                    small
                    onClick={() => {
                      setAppointmentStatus(selectedAppt.id, "completed", auth.userId!);
                      setSelectedAppt(null);
                    }}
                  >
                    Complete
                  </Button>
                  <Button
                    tone="danger"
                    small
                    onClick={() => {
                      setAppointmentStatus(selectedAppt.id, "cancelled", auth.userId!);
                      setSelectedAppt(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

export default function WorkspaceCalendarPage() {
  return (
    <Suspense fallback={<div className="app-boot">Loading calendar…</div>}>
      <CalendarContent />
    </Suspense>
  );
}
