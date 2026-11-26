"use client";

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
import { can, fullName, initials } from "@bookit/utils";
import { useState } from "react";
import { Badge, Button, Field, Modal } from "@/components/ui";
import { useAuth } from "@/lib/session";

const ROLES: MembershipRole[] = ["owner", "admin", "manager", "employee", "receptionist", "accountant"];
const SHIFT_STATUSES: Employee["status"][] = ["available", "in_appointment", "off_shift", "on_leave"];

export default function WorkspaceTeamPage() {
  const auth = useAuth();
  const state = useBookItState();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MembershipRole>("employee");
  const [inviteTitle, setInviteTitle] = useState("Specialist");
  const [notice, setNotice] = useState("");
  const [pageError, setPageError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!auth.workspace) return null;
  const bizId = auth.workspace.businessId;
  const canManage = can(auth.workspace.role, "team.manage");

  const employees = state.employees.filter((e) => e.businessId === bizId);
  const memberships = state.memberships.filter((m) => m.businessId === bizId);

  const visibleEmployees = employees.filter((emp) => {
    const name = displayUser(state, emp.userId);
    if (statusFilter !== "all" && emp.status !== statusFilter) return false;
    if (q.trim() && !`${name} ${emp.title}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
    return true;
  });

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>Team &amp; Staff Management</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Manage team members, work schedules, roles, and assigned service tiers.
          </p>
        </div>
        {canManage ? (
          <Button
            onClick={() => {
              setError("");
              setShowInvite(true);
            }}
          >
            + Add Employee
          </Button>
        ) : null}
      </div>

      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or role..."
          style={{ flex: 1, minWidth: 220, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 14px" }}
        />
        <div className="tabs">
          {(
            [
              ["all", `All Staff (${employees.length})`],
              ["available", "Available"],
              ["in_appointment", "In Appointment"],
              ["off_shift", "Off Shift"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" className={`tab ${statusFilter === id ? "on" : ""}`} onClick={() => setStatusFilter(id)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {notice ? <div className="notice">{notice}</div> : null}
      {pageError ? <p className="error">{pageError}</p> : null}

      <div className="grid-3">
        {visibleEmployees.map((emp) => {
          const user = state.users.find((u) => u.id === emp.userId);
          const name = user ? fullName(user) : emp.id;
          const empServices = state.services.filter((s) => emp.serviceIds.includes(s.id));
          const tone = emp.status === "available" ? "success" : emp.status === "in_appointment" ? "warning" : "neutral";
          return (
            <article key={emp.id} className="panel stack" style={{ gap: 12 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div className="person">
                  {user?.avatarUrl ? (
                    <img className="avatar-img" src={user.avatarUrl} alt={name} referrerPolicy="no-referrer" style={{ width: 46, height: 46 }} />
                  ) : (
                    <span className="avatar" style={{ width: 46, height: 46 }}>{initials(name)}</span>
                  )}
                  <div>
                    <strong>{name}</strong>
                    <div className="tiny">{emp.title}</div>
                  </div>
                </div>
                <Badge tone={tone}>{emp.status.replaceAll("_", " ")}</Badge>
              </div>
              <div>
                <div className="tiny" style={{ marginBottom: 6 }}>Assigned Services</div>
                <div className="chips">
                  {empServices.length === 0 ? (
                    <span className="tiny">No specific services assigned</span>
                  ) : (
                    empServices.map((s) => (
                      <span key={s.id} className="badge tone-brand">
                        {s.name}
                      </span>
                    ))
                  )}
                </div>
              </div>
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <span className="tiny">
                  Mon – Fri: {emp.hours.mon.open} – {emp.hours.mon.close} · ★ {emp.rating.toFixed(1)}
                </span>
                {canManage ? (
                  <select
                    aria-label={`${name} shift status`}
                    value={emp.status}
                    disabled={busy}
                    onChange={async (e) => {
                      const nextStatus = e.target.value as Employee["status"];
                      setPageError("");
                      setNotice("");
                      setBusy(true);
                      try {
                        const res = usingMocks()
                          ? updateEmployeeAvailability(bizId, emp.id, { status: nextStatus })
                          : await updateEmployeeAvailabilityRemote(bizId, emp.id, { status: nextStatus });
                        if (!res.ok) {
                          setPageError(res.error);
                          return;
                        }
                        setNotice(`Updated shift status for ${name}.`);
                      } finally {
                        setBusy(false);
                      }
                    }}
                    style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, padding: "4px 8px", fontSize: 12 }}
                  >
                    {SHIFT_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {st.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      <section className="panel stack">
        <h3 style={{ margin: 0 }}>Workspace Members &amp; Roles</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Member</th>
              <th>Title</th>
              <th>Status</th>
              <th>Role</th>
              {canManage ? <th>Access</th> : null}
            </tr>
          </thead>
          <tbody>
            {memberships.map((m) => (
              <tr key={m.id}>
                <td>{displayUser(state, m.userId)}</td>
                <td className="tiny">{m.title ?? "Team member"}</td>
                <td>
                  <Badge tone={m.status === "active" ? "success" : m.status === "suspended" ? "danger" : "warning"}>{m.status}</Badge>
                </td>
                <td>
                  {canManage && m.role !== "owner" ? (
                    <select
                      value={m.role}
                      disabled={busy}
                      onChange={async (e) => {
                        const nextRole = e.target.value as MembershipRole;
                        setPageError("");
                        setNotice("");
                        setBusy(true);
                        try {
                          const res = usingMocks()
                            ? setMemberRole(bizId, m.id, nextRole)
                            : await setMemberRoleRemote(bizId, m.id, nextRole);
                          if (!res.ok) {
                            setPageError(res.error);
                            return;
                          }
                          setNotice(`Updated member role to ${roleLabels[nextRole]}.`);
                        } finally {
                          setBusy(false);
                        }
                      }}
                      style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 8, padding: "4px 8px" }}
                    >
                      {ROLES.filter((r) => r !== "owner").map((r) => (
                        <option key={r} value={r}>
                          {roleLabels[r]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Badge tone="brand">{roleLabels[m.role]}</Badge>
                  )}
                </td>
                {canManage ? (
                  <td>
                    {m.role !== "owner" && m.userId !== auth.userId && (m.status === "active" || m.status === "suspended") ? (
                      <Button
                        tone={m.status === "active" ? "danger" : "soft"}
                        small
                        disabled={busy}
                        onClick={async () => {
                          const nextStatus = m.status === "active" ? "suspended" : "active";
                          setPageError("");
                          setNotice("");
                          setBusy(true);
                          try {
                            const res = usingMocks()
                              ? setMemberStatus(bizId, m.id, nextStatus)
                              : await setMemberStatusRemote(bizId, m.id, nextStatus);
                            if (!res.ok) {
                              setPageError(res.error);
                              return;
                            }
                            setNotice(
                              `${displayUser(state, m.userId)} ${nextStatus === "suspended" ? "suspended" : "reactivated"}.`,
                            );
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        {m.status === "active" ? "Suspend" : "Reactivate"}
                      </Button>
                    ) : (
                      <span className="tiny">—</span>
                    )}
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {showInvite ? (
        <Modal title="Invite Employee" onClose={() => setShowInvite(false)}>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setBusy(true);
              try {
                const res = usingMocks()
                  ? inviteMember(bizId, inviteEmail, inviteRole, inviteTitle)
                  : await inviteMemberRemote(bizId, inviteEmail, inviteRole, inviteTitle);
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                setNotice(`Invitation sent to ${inviteEmail}`);
                setInviteEmail("");
                setError("");
                setShowInvite(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label="Existing BookIt account email">
              <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="member@bookit.demo" />
            </Field>
            <Field label="Role">
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as MembershipRole)}>
                {ROLES.filter((r) => r !== "owner").map((r) => (
                  <option key={r} value={r}>
                    {roleLabels[r]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Job title">
              <input value={inviteTitle} onChange={(e) => setInviteTitle(e.target.value)} />
            </Field>
            {error ? <p className="error">{error}</p> : null}
            <Button type="submit" disabled={busy}>
              {busy ? "Sending..." : "Send invite"}
            </Button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
