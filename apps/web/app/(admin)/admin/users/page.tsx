"use client";

import { setUserStatus, useBookItState } from "@bookit/api-client";
import { fullName } from "@bookit/utils";
import { useState } from "react";
import { Badge, Button } from "@/components/ui";

export default function AdminUsersPage() {
  const state = useBookItState();
  const [q, setQ] = useState("");
  const [notice, setNotice] = useState("");

  const users = state.users.filter(
    (u) => !q.trim() || `${fullName(u)} ${u.email} ${u.username}`.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div>
        <h1 style={{ margin: 0 }}>Users</h1>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Manage central BookIt accounts, verification status, and account access.
        </p>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search users by name or email..."
        style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 14px" }}
      />

      {notice ? <div className="notice">{notice}</div> : null}

      <div className="panel" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role / Admin</th>
              <th>Verified</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td>
                  <strong>{fullName(user)}</strong>
                  <div className="tiny">
                    @{user.username} · {user.email}
                  </div>
                </td>
                <td>
                  <Badge tone={user.isPlatformAdmin ? "brand" : "neutral"}>
                    {user.isPlatformAdmin ? "Platform Admin" : "Member"}
                  </Badge>
                </td>
                <td className="tiny">{user.emailVerified ? "Verified" : "Unverified"}</td>
                <td>
                  <Badge tone={user.status === "active" ? "success" : "danger"}>{user.status}</Badge>
                </td>
                <td>
                  <Button
                    tone={user.status === "active" ? "danger" : "soft"}
                    small
                    onClick={() => {
                      const res = setUserStatus(user.id, user.status === "active" ? "suspended" : "active");
                      setNotice(res.ok ? `Updated ${fullName(user)}` : res.error);
                    }}
                  >
                    {user.status === "active" ? "Suspend" : "Activate"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
