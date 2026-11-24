"use client";

import {
  addBlockedSlot,
  addBlockedSlotRemote,
  addBusinessHoliday,
  addBusinessHolidayRemote,
  businessAppointments,
  businessUniversalBookings,
  createAppointmentRemote,
  createStaffAppointment,
  displayUser,
  moveAppointment,
  removeBlockedSlot,
  removeBlockedSlotRemote,
  removeBusinessHoliday,
  removeBusinessHolidayRemote,
  rescheduleAppointmentRemote,
  resourceBlocksForBusiness,
  resourcesForBusiness,
  setAppointmentStatus,
  setAppointmentStatusRemote,
  setUniversalBookingStatus,
  setUniversalBookingStatusRemote,
  updateAppointmentNotes,
  updateAppointmentNotesRemote,
  useBookItState,
  usingMocks,
} from "@bookit/api-client";
import type { Appointment, UniversalBooking, UniversalBookingStatus } from "@bookit/types";
import { appointmentStatus, universalBookingStatus } from "@bookit/ui";
import { addDays, bookingModelLabel, can, DEMO_TODAY, formatDate, formatDateTime, formatTime } from "@bookit/utils";
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
  const [selectedUniversal, setSelectedUniversal] = useState<UniversalBooking | null>(null);
  const [apptNote, setApptNote] = useState("");

  const bizId = auth.workspace?.businessId ?? "";
  const biz = state.businesses.find((b) => b.id === bizId);
  const employees = state.employees.filter((e) => e.businessId === bizId);
  const services = state.services.filter((s) => s.businessId === bizId && s.active);
  const resources = resourcesForBusiness(state, bizId, true);
  const resourceBlocks = resourceBlocksForBusiness(state, bizId);
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
  const [holidayDate, setHolidayDate] = useState(addDays(DEMO_TODAY, 5));
  const [holidayName, setHolidayName] = useState("");
  const [blockDate, setBlockDate] = useState(addDays(DEMO_TODAY, 2));
  const [blockStart, setBlockStart] = useState("12:00");
  const [blockEnd, setBlockEnd] = useState("13:00");
  const [blockReason, setBlockReason] = useState("");
  const [scheduleNotice, setScheduleNotice] = useState("");
  const [scheduleError, setScheduleError] = useState("");
  const [modalError, setModalError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!auth.workspace || !auth.userId || !biz) return null;
  const actorId = auth.userId;
  const canManage = can(auth.workspace.role, "calendar.manage");
  const canViewCustomers = can(auth.workspace.role, "customers.view");

  const appts = businessAppointments(state, bizId).filter((a) => {
    if (staffFilter !== "all" && a.employeeId !== staffFilter) return false;
    if (q.trim()) {
      const cust = displayUser(state, a.customerId);
      const svc = state.services.find((s) => s.id === a.serviceId)?.name ?? "";
      if (!`${cust} ${svc}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
    }
    return true;
  });

  const universalItems = businessUniversalBookings(state, bizId).filter((ub) => {
    if (ub.bookingModel === "appointment" && ub.legacyAppointmentId) return false;
    if (staffFilter !== "all") return false;
    if (q.trim()) {
      const cust = displayUser(state, ub.customerId);
      if (!`${cust} ${ub.title} ${ub.checkInCode ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
    }
    return true;
  });

  const weekDays = Array.from({ length: 5 }, (_, i) => addDays(anchorDate, i));
  const monthDays = Array.from({ length: 14 }, (_, i) => addDays(anchorDate, i));

  function universalOccursOnDay(ub: UniversalBooking, day: string): boolean {
    const startDate = (ub.startAt ?? ub.createdAt).slice(0, 10);
    const endDate = ub.endAt ? ub.endAt.slice(0, 10) : startDate;
    if (ub.bookingModel === "resource" && endDate > startDate) {
      return day >= startDate && day < endDate;
    }
    return startDate === day;
  }

  function blockOccursOnDay(startAt: string, endAt: string, day: string): boolean {
    const startDate = startAt.slice(0, 10);
    const endDate = endAt.slice(0, 10);
    return day >= startDate && day <= endDate;
  }

  function openAppt(apt: Appointment) {
    setSelectedAppt(apt);
    setSelectedUniversal(null);
    setMoveDate(apt.start.slice(0, 10));
    setMoveTime(apt.start.slice(11, 16));
    setApptNote(apt.notes ?? "");
    setModalError("");
  }

  function openUniversal(ub: UniversalBooking) {
    setSelectedUniversal(ub);
    setSelectedAppt(null);
    setModalError("");
  }

  const selectedCustomer = selectedAppt ? state.users.find((u) => u.id === selectedAppt.customerId) : undefined;
  const selectedUniversalCustomer = selectedUniversal ? state.users.find((u) => u.id === selectedUniversal.customerId) : undefined;

  async function handleUniversalStatus(bookingId: string, status: UniversalBookingStatus) {
    setModalError("");
    setBusy(true);
    try {
      const res = usingMocks()
        ? setUniversalBookingStatus(bookingId, status, actorId)
        : await setUniversalBookingStatusRemote(bookingId, status);
      if (!res.ok) {
        setModalError(res.error);
        return;
      }
      setSelectedUniversal(null);
      setScheduleNotice(`Booking marked ${status.replaceAll("_", " ")}.`);
    } finally {
      setBusy(false);
    }
  }

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
            placeholder="Search bookings, guests..."
            style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "8px 12px" }}
          />
          <div className="tabs">
            {(["day", "week", "month"] as const).map((mode) => (
              <button key={mode} type="button" className={`tab ${view === mode ? "on" : ""}`} onClick={() => setView(mode)}>
                {mode[0].toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          {canManage && services.length > 0 ? (
            <Button
              onClick={() => {
                setModalError("");
                setShowCreate(true);
              }}
            >
              + Create Appointment
            </Button>
          ) : null}
        </div>
      </div>

      {employees.length > 0 ? (
        <div className="chips">
          <button type="button" className={`slot ${staffFilter === "all" ? "on" : ""}`} onClick={() => setStaffFilter("all")}>
            All Schedule ({appts.length + universalItems.length})
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
      ) : null}

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
            const dayUniversal = universalItems.filter((ub) => universalOccursOnDay(ub, day));
            const dayBlocks = resourceBlocks.filter((blk) => blockOccursOnDay(blk.startAt, blk.endAt, day));
            const hasAnything = dayAppts.length > 0 || dayUniversal.length > 0 || dayBlocks.length > 0;
            return (
              <div key={day} className={`week-col ${day === DEMO_TODAY ? "today" : ""}`}>
                {!hasAnything ? (
                  <span className="tiny">Open slots</span>
                ) : (
                  <>
                    {dayAppts.map((apt) => {
                      const svc = state.services.find((s) => s.id === apt.serviceId);
                      const emp = state.employees.find((e) => e.id === apt.employeeId);
                      const st = appointmentStatus(apt.status);
                      return (
                        <button
                          key={apt.id}
                          type="button"
                          className={`appt-block ${apt.status === "pending" ? "pending" : ""}`}
                          onClick={() => openAppt(apt)}
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
                    })}
                    {dayUniversal.map((ub) => {
                      const st = universalBookingStatus(ub.status);
                      const alloc = ub.resourceAllocations[0];
                      const res = alloc ? resources.find((r) => r.id === alloc.resourceId) : undefined;
                      return (
                        <button
                          key={`${day}_${ub.id}`}
                          type="button"
                          className={`appt-block ${ub.status === "pending" || ub.status === "held" ? "pending" : ""}`}
                          onClick={() => openUniversal(ub)}
                        >
                          <Badge tone={st.tone}>{st.label}</Badge>
                          <strong style={{ fontSize: 13 }}>{displayUser(state, ub.customerId)}</strong>
                          <span className="tiny">{res?.name ?? ub.title}</span>
                          <span className="tiny tabular">
                            {ub.startAt ? formatTime(ub.startAt) : bookingModelLabel(ub.bookingModel)}
                            {alloc?.partySize ? ` · ${alloc.partySize} guests` : ub.quantity > 1 ? ` · ${ub.quantity}x` : ""}
                          </span>
                        </button>
                      );
                    })}
                    {dayBlocks.map((blk) => {
                      const res = resources.find((r) => r.id === blk.resourceId);
                      return (
                        <div key={blk.id} className="select-card stack" style={{ gap: 2, padding: 8 }}>
                          <Badge tone="warning">Blocked</Badge>
                          <strong style={{ fontSize: 12 }}>{res?.name ?? blk.resourceId}</strong>
                          <span className="tiny">{blk.reason}</span>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {view === "day" ? (
        <div className="panel stack">
          <h3 style={{ margin: 0 }}>{formatDate(`${anchorDate}T12:00:00`, { weekday: "long", month: "long", day: "numeric" })}</h3>
          {appts.filter((a) => a.start.startsWith(anchorDate)).length === 0 &&
          universalItems.filter((ub) => universalOccursOnDay(ub, anchorDate)).length === 0 &&
          resourceBlocks.filter((blk) => blockOccursOnDay(blk.startAt, blk.endAt, anchorDate)).length === 0 ? (
            <p className="muted">No bookings or resource holds scheduled on this day.</p>
          ) : (
            <>
              {appts
                .filter((a) => a.start.startsWith(anchorDate))
                .map((apt) => {
                  const svc = state.services.find((s) => s.id === apt.serviceId);
                  const emp = state.employees.find((e) => e.id === apt.employeeId);
                  const st = appointmentStatus(apt.status);
                  return (
                    <div
                      key={apt.id}
                      className="select-card row"
                      style={{ justifyContent: "space-between", cursor: "pointer" }}
                      onClick={() => openAppt(apt)}
                    >
                      <div>
                        <strong className="tabular">
                          {formatTime(apt.start)} – {formatTime(apt.end)}
                        </strong>
                        <div>
                          {displayUser(state, apt.customerId)} · {svc?.name}
                        </div>
                        <div className="tiny">Assigned: {emp ? displayUser(state, emp.userId) : "Staff"}</div>
                      </div>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                  );
                })}
              {universalItems
                .filter((ub) => universalOccursOnDay(ub, anchorDate))
                .map((ub) => {
                  const st = universalBookingStatus(ub.status);
                  const alloc = ub.resourceAllocations[0];
                  const res = alloc ? resources.find((r) => r.id === alloc.resourceId) : undefined;
                  return (
                    <div
                      key={ub.id}
                      className="select-card row"
                      style={{ justifyContent: "space-between", cursor: "pointer" }}
                      onClick={() => openUniversal(ub)}
                    >
                      <div>
                        <strong className="tabular">
                          {ub.startAt ? formatTime(ub.startAt) : "Scheduled"}
                          {ub.endAt ? ` – ${formatTime(ub.endAt)}` : ""}
                        </strong>
                        <div>
                          {displayUser(state, ub.customerId)} · {res?.name ?? ub.title}
                        </div>
                        <div className="tiny">
                          {bookingModelLabel(ub.bookingModel)} · Qty {ub.quantity}
                          {alloc?.partySize ? ` · ${alloc.partySize} guests` : ""}
                        </div>
                      </div>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                  );
                })}
              {resourceBlocks
                .filter((blk) => blockOccursOnDay(blk.startAt, blk.endAt, anchorDate))
                .map((blk) => {
                  const res = resources.find((r) => r.id === blk.resourceId);
                  return (
                    <div key={blk.id} className="select-card row" style={{ justifyContent: "space-between" }}>
                      <div>
                        <strong>Blocked: {res?.name ?? blk.resourceId}</strong>
                        <div className="tiny">
                          {formatDateTime(blk.startAt)} → {formatDateTime(blk.endAt)} · {blk.reason}
                        </div>
                      </div>
                      <Badge tone="warning">{blk.unitsBlocked} unit(s)</Badge>
                    </div>
                  );
                })}
            </>
          )}
        </div>
      ) : null}

      {view === "month" ? (
        <div className="cal">
          {monthDays.map((day) => {
            const dayAppts = appts.filter((a) => a.start.startsWith(day));
            const dayUniv = universalItems.filter((ub) => universalOccursOnDay(ub, day));
            const count = dayAppts.length + dayUniv.length;
            const holiday = biz.holidays.find((h) => h.date === day);
            return (
              <div key={day} className="panel cal-day stack" style={{ gap: 6 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong className="tiny tabular">{formatDate(`${day}T12:00:00`, { month: "short", day: "numeric" })}</strong>
                  {count ? <Badge tone="brand">{count}</Badge> : null}
                </div>
                {holiday ? <Badge tone="warning">{holiday.name}</Badge> : null}
                {dayAppts.slice(0, 2).map((a) => (
                  <div key={a.id} className="tiny" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {formatTime(a.start)} {displayUser(state, a.customerId)}
                  </div>
                ))}
                {dayUniv.slice(0, 2).map((ub) => (
                  <div key={ub.id} className="tiny" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ub.startAt ? formatTime(ub.startAt) : ""} {ub.title}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="panel stack" style={{ gap: 14 }}>
        <div>
          <strong>Holidays & Blocked Hours</strong>
          <p className="tiny" style={{ margin: "2px 0 0" }}>
            Holidays and blocked ranges automatically remove overlapping booking slots for customers.
          </p>
        </div>
        {scheduleNotice ? <div className="notice">{scheduleNotice}</div> : null}
        {scheduleError ? <p className="error">{scheduleError}</p> : null}

        <div className="grid-2" style={{ gap: 14 }}>
          <div className="select-card stack" style={{ gap: 8 }}>
            <strong style={{ fontSize: 13 }}>Business Holidays ({biz.holidays.length})</strong>
            <div className="chips">
              {biz.holidays.length === 0 ? (
                <span className="tiny">No holidays set</span>
              ) : (
                biz.holidays.map((h) => (
                  <span key={h.date} className="badge tone-warning row" style={{ gap: 6 }}>
                    {h.name} ({h.date})
                    {canManage ? (
                      <button
                        type="button"
                        onClick={async () => {
                          setScheduleError("");
                          setScheduleNotice("");
                          const res = usingMocks()
                            ? removeBusinessHoliday(bizId, h.date)
                            : await removeBusinessHolidayRemote(bizId, h.date);
                          if (!res.ok) setScheduleError(res.error);
                          else setScheduleNotice("Holiday removed.");
                        }}
                        aria-label={`Remove ${h.name}`}
                        style={{ background: "none", border: 0, color: "inherit", cursor: "pointer", padding: 0, fontWeight: 700 }}
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                ))
              )}
            </div>
            {canManage ? (
              <form
                className="row"
                style={{ flexWrap: "wrap", gap: 8 }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  setScheduleError("");
                  setScheduleNotice("");
                  if (!holidayName.trim()) {
                    setScheduleError("Holiday name is required.");
                    return;
                  }
                  const res = usingMocks()
                    ? addBusinessHoliday(bizId, holidayDate, holidayName)
                    : await addBusinessHolidayRemote(bizId, holidayDate, holidayName);
                  if (!res.ok) {
                    setScheduleError(res.error);
                    return;
                  }
                  setHolidayName("");
                  setScheduleNotice("Holiday added to schedule.");
                }}
              >
                <input
                  type="date"
                  value={holidayDate}
                  onChange={(e) => setHolidayDate(e.target.value)}
                  style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px" }}
                />
                <input
                  value={holidayName}
                  onChange={(e) => setHolidayName(e.target.value)}
                  placeholder="Holiday name"
                  style={{ flex: 1, minWidth: 120, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 10px" }}
                />
                <Button type="submit" tone="soft" small>
                  Add holiday
                </Button>
              </form>
            ) : null}
          </div>

          <div className="select-card stack" style={{ gap: 8 }}>
            <strong style={{ fontSize: 13 }}>Blocked Time Slots ({biz.blocked.length})</strong>
            <div className="chips">
              {biz.blocked.length === 0 ? (
                <span className="tiny">No blocked hours</span>
              ) : (
                biz.blocked.map((b) => (
                  <span key={b.id} className="badge tone-neutral row" style={{ gap: 6 }}>
                    {b.date} {b.start}–{b.end} ({b.reason})
                    {canManage ? (
                      <button
                        type="button"
                        onClick={async () => {
                          setScheduleError("");
                          setScheduleNotice("");
                          const res = usingMocks()
                            ? removeBlockedSlot(bizId, b.id)
                            : await removeBlockedSlotRemote(bizId, b.id);
                          if (!res.ok) setScheduleError(res.error);
                          else setScheduleNotice("Blocked slot removed.");
                        }}
                        aria-label={`Remove ${b.reason}`}
                        style={{ background: "none", border: 0, color: "inherit", cursor: "pointer", padding: 0, fontWeight: 700 }}
                      >
                        ×
                      </button>
                    ) : null}
                  </span>
                ))
              )}
            </div>
            {canManage ? (
              <form
                className="row"
                style={{ flexWrap: "wrap", gap: 6 }}
                onSubmit={async (e) => {
                  e.preventDefault();
                  setScheduleError("");
                  setScheduleNotice("");
                  const res = usingMocks()
                    ? addBlockedSlot(bizId, blockDate, blockStart, blockEnd, blockReason)
                    : await addBlockedSlotRemote(bizId, blockDate, blockStart, blockEnd, blockReason);
                  if (!res.ok) {
                    setScheduleError(res.error);
                    return;
                  }
                  setBlockReason("");
                  setScheduleNotice("Blocked time slot added.");
                }}
              >
                <input
                  type="date"
                  value={blockDate}
                  onChange={(e) => setBlockDate(e.target.value)}
                  style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px" }}
                />
                <input
                  type="time"
                  value={blockStart}
                  onChange={(e) => setBlockStart(e.target.value)}
                  style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px" }}
                />
                <input
                  type="time"
                  value={blockEnd}
                  onChange={(e) => setBlockEnd(e.target.value)}
                  style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 8px" }}
                />
                <input
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="Reason (e.g. Staff training)"
                  style={{ flex: 1, minWidth: 120, background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 10px" }}
                />
                <Button type="submit" tone="soft" small>
                  Block time
                </Button>
              </form>
            ) : null}
          </div>
        </div>
      </div>

      {showCreate ? (
        <Modal title="Create Appointment" onClose={() => setShowCreate(false)}>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setModalError("");
              setBusy(true);
              try {
                const payload = {
                  businessId: bizId,
                  customerId: form.customerId,
                  serviceId: form.serviceId || services[0]?.id || "",
                  employeeId: form.employeeId || employees[0]?.id || "",
                  date: form.date,
                  time: form.time,
                };
                const res = usingMocks()
                  ? createStaffAppointment(payload)
                  : await createAppointmentRemote(payload);
                if (!res.ok) {
                  setModalError(res.error);
                  return;
                }
                setShowCreate(false);
                setScheduleNotice("Appointment created.");
              } finally {
                setBusy(false);
              }
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
            {modalError ? <p className="error">{modalError}</p> : null}
            <Button type="submit" disabled={busy}>
              {busy ? "Creating..." : "Create appointment"}
            </Button>
          </form>
        </Modal>
      ) : null}

      {selectedAppt ? (
        <Modal title="Appointment Details" onClose={() => setSelectedAppt(null)}>
          <div className="stack">
            <div>
              <strong>{displayUser(state, selectedAppt.customerId)}</strong>
              <div className="tiny">
                {state.services.find((s) => s.id === selectedAppt.serviceId)?.name} · {formatDate(selectedAppt.start)}{" "}
                {formatTime(selectedAppt.start)}
              </div>
              {canViewCustomers && selectedCustomer ? (
                <div className="tiny" style={{ marginTop: 4 }}>
                  Contact: {selectedCustomer.phone} · {selectedCustomer.email}
                </div>
              ) : null}
            </div>
            <Field label="Booking notes">
              <textarea
                rows={2}
                value={apptNote}
                readOnly={!canManage}
                onChange={(e) => setApptNote(e.target.value)}
                placeholder="Customer preferences, arrival info, or internal booking notes"
              />
            </Field>
            {modalError ? <p className="error">{modalError}</p> : null}
            {canManage ? (
              <>
                <div className="row">
                  <Button
                    tone="soft"
                    small
                    disabled={busy}
                    onClick={async () => {
                      setModalError("");
                      setBusy(true);
                      try {
                        const res = usingMocks()
                          ? updateAppointmentNotes(bizId, selectedAppt.id, apptNote)
                          : await updateAppointmentNotesRemote(selectedAppt.id, apptNote);
                        if (!res.ok) {
                          setModalError(res.error);
                          return;
                        }
                        setSelectedAppt({ ...selectedAppt, notes: apptNote.trim() || undefined });
                        setScheduleNotice("Booking notes saved.");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Save notes
                  </Button>
                </div>
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
                    disabled={busy}
                    onClick={async () => {
                      setModalError("");
                      setBusy(true);
                      try {
                        const res = usingMocks()
                          ? moveAppointment(selectedAppt.id, moveDate, moveTime, actorId)
                          : await rescheduleAppointmentRemote(selectedAppt.id, moveDate, moveTime);
                        if (!res.ok) {
                          setModalError(res.error);
                          return;
                        }
                        setSelectedAppt(null);
                        setScheduleNotice("Appointment moved.");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Move appointment
                  </Button>
                  {(["confirmed", "completed", "no_show", "cancelled"] as const).map((status) => (
                    <Button
                      key={status}
                      tone={status === "cancelled" ? "danger" : status === "no_show" ? "ghost" : "soft"}
                      small
                      disabled={busy}
                      onClick={async () => {
                        setModalError("");
                        setBusy(true);
                        try {
                          const res = usingMocks()
                            ? setAppointmentStatus(selectedAppt.id, status, actorId)
                            : await setAppointmentStatusRemote(selectedAppt.id, status);
                          if (!res.ok) {
                            setModalError(res.error);
                            return;
                          }
                          setSelectedAppt(null);
                          setScheduleNotice(`Appointment marked ${status.replaceAll("_", " ")}.`);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {status === "no_show" ? "No-show" : status[0].toUpperCase() + status.slice(1)}
                    </Button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </Modal>
      ) : null}

      {selectedUniversal ? (
        <Modal title={selectedUniversal.title} onClose={() => setSelectedUniversal(null)}>
          <div className="stack">
            <div>
              <strong>{displayUser(state, selectedUniversal.customerId)}</strong>
              <div className="tiny">
                {bookingModelLabel(selectedUniversal.bookingModel)} ·{" "}
                {selectedUniversal.startAt ? formatDateTime(selectedUniversal.startAt) : formatDateTime(selectedUniversal.createdAt)}
                {selectedUniversal.endAt ? ` → ${formatDateTime(selectedUniversal.endAt)}` : ""}
              </div>
              {selectedUniversal.resourceAllocations[0] ? (
                <div className="tiny">
                  {resources.find((r) => r.id === selectedUniversal.resourceAllocations[0].resourceId)?.name ?? "Space"} ·{" "}
                  {selectedUniversal.resourceAllocations[0].partySize} guest(s) ·{" "}
                  {selectedUniversal.resourceAllocations[0].quantityUnits} unit(s)
                </div>
              ) : null}
              {selectedUniversal.checkInCode ? (
                <div className="tiny tabular">Check-in Code: <strong>{selectedUniversal.checkInCode}</strong></div>
              ) : null}
              {canViewCustomers && selectedUniversalCustomer ? (
                <div className="tiny" style={{ marginTop: 4 }}>
                  Contact: {selectedUniversalCustomer.phone} · {selectedUniversalCustomer.email}
                </div>
              ) : null}
              {selectedUniversal.notes ? <p className="tiny">Notes: {selectedUniversal.notes}</p> : null}
            </div>
            {modalError ? <p className="error">{modalError}</p> : null}
            {canManage ? (
              <div className="row" style={{ flexWrap: "wrap" }}>
                {(selectedUniversal.status === "pending" || selectedUniversal.status === "held") ? (
                  <>
                    <Button tone="soft" small disabled={busy} onClick={() => void handleUniversalStatus(selectedUniversal.id, "confirmed")}>
                      Confirm
                    </Button>
                    <Button tone="danger" small disabled={busy} onClick={() => void handleUniversalStatus(selectedUniversal.id, "rejected")}>
                      Reject
                    </Button>
                  </>
                ) : null}
                {selectedUniversal.status === "confirmed" ? (
                  <>
                    <Button tone="soft" small disabled={busy} onClick={() => void handleUniversalStatus(selectedUniversal.id, "completed")}>
                      Complete
                    </Button>
                    <Button tone="ghost" small disabled={busy} onClick={() => void handleUniversalStatus(selectedUniversal.id, "no_show")}>
                      No-show
                    </Button>
                    <Button tone="danger" small disabled={busy} onClick={() => void handleUniversalStatus(selectedUniversal.id, "cancelled")}>
                      Cancel
                    </Button>
                  </>
                ) : null}
              </div>
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
