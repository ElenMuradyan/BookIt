"use client";

import {
  acceptWorkspaceInviteRemote,
  addAddress,
  addAddressRemote,
  changePasswordRemote,
  deactivateAccountRemote,
  declineWorkspaceInviteRemote,
  resetDemoState,
  setPersonalizationConsent,
  setPersonalizationConsentRemote,
  setSpendingVisibility,
  setSpendingVisibilityRemote,
  setTheme,
  setThemeRemote,
  updateNotificationPrefs,
  updateNotificationPrefsRemote,
  updateProfile,
  updateProfileRemote,
  useBookItState,
  usingMocks,
} from "@bookit/api-client";
import { customerSettingSections, roleLabels } from "@bookit/ui";
import { fullName, initials } from "@bookit/utils";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Field } from "@/components/ui";
import { useAuth } from "@/lib/session";

export function AccountView({ initialSection = "profile" }: { initialSection?: string }) {
  const auth = useAuth();
  if (!auth.user) return null;
  return <AccountInner user={auth.user} initialSection={initialSection} />;
}

function AccountInner({ user, initialSection }: { user: NonNullable<ReturnType<typeof useAuth>["user"]>; initialSection: string }) {
  const auth = useAuth();
  const state = useBookItState();
  const router = useRouter();
  const [section, setSection] = useState(initialSection);
  const [notice, setNotice] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const profile = state.customerProfiles.find((p) => p.userId === user.id);
  const addresses = state.addresses.filter((a) => a.userId === user.id);

  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [phone, setPhone] = useState(user.phone);
  const [location, setLocation] = useState(user.location ?? "");
  const [language, setLanguage] = useState(user.language);
  const [gender, setGender] = useState(user.gender ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(user.dateOfBirth ?? "");
  const [addr, setAddr] = useState({ label: "Home", line1: "", city: "Seattle", region: "WA", postalCode: "98101", country: "United States" });
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className="panel row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 14 }}>
        <div className="person">
          {user.avatarUrl ? (
            <img className="avatar-img" src={user.avatarUrl} alt="" referrerPolicy="no-referrer" style={{ width: 52, height: 52 }} />
          ) : (
            <span className="avatar" style={{ width: 52, height: 52 }}>{initials(fullName(user))}</span>
          )}
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>{fullName(user)}</h1>
            <div className="tiny">
              @{user.username} · {user.email}
            </div>
          </div>
        </div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <Link href="/register/business" className="btn soft small">
            Register a business
          </Link>
          <Button
            tone="ghost"
            small
            onClick={() => {
              auth.signOut();
              router.push("/");
            }}
          >
            Sign out
          </Button>
        </div>
      </div>

      {auth.workspaces.length > 0 || user.isPlatformAdmin ? (
        <section className="panel stack">
          <h3 style={{ margin: 0 }}>My Workspaces</h3>
          <div className="grid-3">
            {user.isPlatformAdmin ? (
              <Link href="/admin" className="select-card stack" style={{ gap: 4 }}>
                <strong>Platform Admin</strong>
                <span className="tiny">Super Admin Console</span>
              </Link>
            ) : null}
            {auth.workspaces.map((ws) =>
              ws.status === "invited" ? (
                <div key={ws.businessId} className="select-card stack" style={{ gap: 8 }}>
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <strong>{ws.businessName}</strong>
                    <Badge tone="warning">Invited</Badge>
                  </div>
                  <span className="tiny">
                    {roleLabels[ws.role]} · {ws.city}
                  </span>
                  <div className="row" style={{ gap: 8 }}>
                    <Button
                      small
                      disabled={busy}
                      onClick={async () => {
                        setErrorMsg("");
                        setNotice("");
                        if (usingMocks()) {
                          setNotice("Workspace invites are managed via the live backend.");
                          return;
                        }
                        setBusy(true);
                        try {
                          const res = await acceptWorkspaceInviteRemote(ws.businessId);
                          if (!res.ok) {
                            setErrorMsg(res.error);
                            return;
                          }
                          await auth.refreshSession();
                          setNotice(`Joined ${ws.businessName}.`);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Accept
                    </Button>
                    <Button
                      tone="ghost"
                      small
                      disabled={busy}
                      onClick={async () => {
                        setErrorMsg("");
                        setNotice("");
                        if (usingMocks()) {
                          setNotice("Workspace invites are managed via the live backend.");
                          return;
                        }
                        setBusy(true);
                        try {
                          const res = await declineWorkspaceInviteRemote(ws.businessId);
                          if (!res.ok) {
                            setErrorMsg(res.error);
                            return;
                          }
                          await auth.refreshSession();
                          setNotice(`Declined invitation from ${ws.businessName}.`);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  key={ws.businessId}
                  type="button"
                  className="select-card stack"
                  style={{ gap: 4 }}
                  onClick={() => {
                    auth.setWorkspaceId(ws.businessId);
                    router.push("/workspace");
                  }}
                >
                  <strong>{ws.businessName}</strong>
                  <span className="tiny">
                    {roleLabels[ws.role]} · {ws.city}
                  </span>
                </button>
              ),
            )}
          </div>
          {errorMsg ? <p className="error" style={{ margin: 0 }}>{errorMsg}</p> : null}
        </section>
      ) : null}

      <div className="split-detail" style={{ gridTemplateColumns: "240px 1fr" }}>
        <aside className="panel stack" style={{ gap: 4, padding: 10 }}>
          {customerSettingSections.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`side-link ${section === item.id ? "active" : ""}`}
              style={{ background: section === item.id ? undefined : "transparent", border: 0, textAlign: "left", cursor: "pointer" }}
              onClick={() => setSection(item.id)}
            >
              {item.label}
            </button>
          ))}
        </aside>

        <section className="panel stack">
          {notice ? <div className="notice">{notice}</div> : null}
          {errorMsg ? <p className="error" style={{ margin: 0 }}>{errorMsg}</p> : null}

          {section === "profile" || section === "photo" || section === "contact" || section === "language" ? (
            <form
              className="stack"
              onSubmit={async (e) => {
                e.preventDefault();
                setErrorMsg("");
                setNotice("");
                const patch = {
                  firstName,
                  lastName,
                  phone,
                  location,
                  language,
                  gender: gender || undefined,
                  dateOfBirth: dateOfBirth || undefined,
                };
                if (usingMocks()) {
                  const res = updateProfile(user.id, patch);
                  if (!res.ok) setErrorMsg(res.error);
                  else setNotice("Profile saved.");
                  return;
                }
                setBusy(true);
                try {
                  const res = await updateProfileRemote(patch);
                  if (!res.ok) setErrorMsg(res.error);
                  else setNotice("Profile saved.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <h2 style={{ margin: 0 }}>{customerSettingSections.find((s) => s.id === section)?.label}</h2>
              <div className="grid-2">
                <Field label="First name">
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                </Field>
                <Field label="Last name">
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </Field>
                <Field label="Phone">
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} />
                </Field>
                <Field label="Location (optional)">
                  <input value={location} onChange={(e) => setLocation(e.target.value)} />
                </Field>
                <Field label="Date of birth (optional)">
                  <input type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
                </Field>
                <Field label="Gender (optional)">
                  <select value={gender} onChange={(e) => setGender(e.target.value)}>
                    <option value="">Prefer not to say</option>
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Non-binary">Non-binary</option>
                    <option value="Self-describe">Other / Self-describe</option>
                  </select>
                </Field>
                <Field label="Language">
                  <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                    <option value="English">English</option>
                    <option value="Spanish">Spanish</option>
                    <option value="French">French</option>
                  </select>
                </Field>
              </div>
              <p className="tiny" style={{ margin: 0 }}>
                Date of birth is only used where age verification is required; gender is optional and shared only with your chosen provider when relevant.
              </p>
              <div>
                <Button type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </form>
          ) : null}

          {section === "theme" ? (
            <div className="stack">
              <h2 style={{ margin: 0 }}>Appearance</h2>
              <p className="muted">Switch between BookIt dark mode and light mode.</p>
              <div className="chips">
                {(["dark", "light"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={busy}
                    className={`slot ${(profile?.theme ?? "dark") === t ? "on" : ""}`}
                    onClick={async () => {
                      setErrorMsg("");
                      setNotice("");
                      if (usingMocks()) {
                        const res = setTheme(user.id, t);
                        if (!res.ok) {
                          setErrorMsg(res.error);
                          return;
                        }
                        document.documentElement.dataset.theme = t;
                        localStorage.setItem("bookit.theme", t);
                        setNotice(`Switched to ${t} theme`);
                        return;
                      }
                      setBusy(true);
                      try {
                        const res = await setThemeRemote(t);
                        if (!res.ok) {
                          setErrorMsg(res.error);
                          return;
                        }
                        document.documentElement.dataset.theme = t;
                        localStorage.setItem("bookit.theme", t);
                        setNotice(`Switched to ${t} theme`);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {t[0].toUpperCase() + t.slice(1)} theme
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {section === "addresses" ? (
            <div className="stack">
              <h2 style={{ margin: 0 }}>Saved Addresses</h2>
              {addresses.map((a) => (
                <div key={a.id} className="select-card row" style={{ justifyContent: "space-between" }}>
                  <div>
                    <strong>{a.label}</strong>
                    <div className="tiny">
                      {a.line1}, {a.city}, {a.region} {a.postalCode}
                    </div>
                  </div>
                  {a.isDefault ? <Badge tone="brand">Default</Badge> : null}
                </div>
              ))}
              <form
                className="stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setErrorMsg("");
                  setNotice("");
                  if (usingMocks()) {
                    const res = addAddress(user.id, addr);
                    if (!res.ok) setErrorMsg(res.error);
                    else {
                      setNotice("Address added");
                      setAddr((prev) => ({ ...prev, line1: "" }));
                    }
                    return;
                  }
                  setBusy(true);
                  try {
                    const res = await addAddressRemote(addr);
                    if (!res.ok) setErrorMsg(res.error);
                    else {
                      setNotice("Address added");
                      setAddr((prev) => ({ ...prev, line1: "" }));
                    }
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <div className="grid-2">
                  <Field label="Label">
                    <input value={addr.label} onChange={(e) => setAddr({ ...addr, label: e.target.value })} />
                  </Field>
                  <Field label="Street">
                    <input value={addr.line1} onChange={(e) => setAddr({ ...addr, line1: e.target.value })} />
                  </Field>
                  <Field label="City">
                    <input value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} />
                  </Field>
                  <Field label="Postal Code">
                    <input value={addr.postalCode} onChange={(e) => setAddr({ ...addr, postalCode: e.target.value })} />
                  </Field>
                </div>
                {errorMsg ? <p className="error">{errorMsg}</p> : null}
                <div>
                  <Button type="submit" disabled={busy}>
                    {busy ? "Saving…" : "Add address"}
                  </Button>
                </div>
              </form>
            </div>
          ) : null}

          {section === "notifications" && profile ? (
            <div className="stack">
              <h2 style={{ margin: 0 }}>Notification Preferences</h2>
              {(
                [
                  ["booking", "Booking updates"],
                  ["order", "Order updates"],
                  ["promotion", "Promotions"],
                  ["message", "Business messages"],
                  ["security", "Account security alerts"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="check">
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={profile.notificationPreferences[key]}
                    onChange={async (e) => {
                      const nextVal = e.target.checked;
                      setErrorMsg("");
                      setNotice("");
                      if (usingMocks()) {
                        const res = updateNotificationPrefs(user.id, { [key]: nextVal });
                        if (!res.ok) setErrorMsg(res.error);
                        else setNotice("Notification preferences updated");
                        return;
                      }
                      setBusy(true);
                      try {
                        const res = await updateNotificationPrefsRemote({ [key]: nextVal });
                        if (!res.ok) setErrorMsg(res.error);
                        else setNotice("Notification preferences updated");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          ) : null}

          {section === "privacy" || section === "data" ? (
            <div className="stack">
              <h2 style={{ margin: 0 }}>Privacy & Data Controls</h2>
              <div className="select-card stack" style={{ gap: 8 }}>
                <strong>Personalized recommendations consent</strong>
                <p className="tiny" style={{ margin: 0 }}>
                  When enabled, BookIt uses your saved interests and location to prioritize matching venues and services on Home and Explore. When disabled, recommendations use general top-rated listings only.
                </p>
                <label className="check">
                  <input
                    type="checkbox"
                    disabled={busy}
                    checked={Boolean(profile?.personalizationConsent)}
                    onChange={async (e) => {
                      const nextVal = e.target.checked;
                      setErrorMsg("");
                      setNotice("");
                      if (usingMocks()) {
                        const res = setPersonalizationConsent(user.id, nextVal);
                        if (!res.ok) setErrorMsg(res.error);
                        else
                          setNotice(
                            nextVal
                              ? "Personalized recommendations enabled."
                              : "Personalized recommendations disabled.",
                          );
                        return;
                      }
                      setBusy(true);
                      try {
                        const res = await setPersonalizationConsentRemote(nextVal);
                        if (!res.ok) setErrorMsg(res.error);
                        else
                          setNotice(
                            nextVal
                              ? "Personalized recommendations enabled."
                              : "Personalized recommendations disabled.",
                          );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                  <span>Allow personalized recommendations based on my profile and interests</span>
                </label>
              </div>
              <p className="muted">Choose whether spending analytics include estimates or only recorded payments.</p>
              <div className="chips">
                <button
                  type="button"
                  disabled={busy}
                  className={`slot ${profile?.spendingVisibility === "recorded_only" ? "on" : ""}`}
                  onClick={async () => {
                    setErrorMsg("");
                    setNotice("");
                    if (usingMocks()) {
                      const res = setSpendingVisibility(user.id, "recorded_only");
                      if (!res.ok) setErrorMsg(res.error);
                      else setNotice("Spending visibility updated.");
                      return;
                    }
                    setBusy(true);
                    try {
                      const res = await setSpendingVisibilityRemote("recorded_only");
                      if (!res.ok) setErrorMsg(res.error);
                      else setNotice("Spending visibility updated.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Recorded payments only
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className={`slot ${profile?.spendingVisibility === "include_estimates" ? "on" : ""}`}
                  onClick={async () => {
                    setErrorMsg("");
                    setNotice("");
                    if (usingMocks()) {
                      const res = setSpendingVisibility(user.id, "include_estimates");
                      if (!res.ok) setErrorMsg(res.error);
                      else setNotice("Spending visibility updated.");
                      return;
                    }
                    setBusy(true);
                    try {
                      const res = await setSpendingVisibilityRemote("include_estimates");
                      if (!res.ok) setErrorMsg(res.error);
                      else setNotice("Spending visibility updated.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Include estimates
                </button>
              </div>
              {usingMocks() ? (
                <div>
                  <Button
                    tone="danger"
                    small
                    onClick={() => {
                      resetDemoState();
                      setNotice("Demo state reset to initial seed data.");
                    }}
                  >
                    Reset demo data
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {section === "security" || section === "connected" || section === "payments" || section === "help" ? (
            <div className="stack" style={{ gap: 16 }}>
              <h2 style={{ margin: 0 }}>{customerSettingSections.find((s) => s.id === section)?.label}</h2>
              {usingMocks() ? (
                <p className="muted">
                  This preview session runs against local demo data and does not store passwords or payment card numbers in the browser.
                </p>
              ) : (
                <p className="muted">
                  Sessions use HttpOnly authentication cookies and Argon2id password verification on the BookIt API. Payment cards and deposits are handled through authorized settlement workflows.
                </p>
              )}

              {section === "security" && !usingMocks() ? (
                <div className="stack" style={{ gap: 16 }}>
                  <form
                    className="select-card stack"
                    style={{ gap: 10 }}
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setErrorMsg("");
                      setNotice("");
                      setBusy(true);
                      try {
                        const res = await changePasswordRemote(currentPassword, newPassword, confirmPassword);
                        if (!res.ok) {
                          setErrorMsg(res.error);
                          return;
                        }
                        setCurrentPassword("");
                        setNewPassword("");
                        setConfirmPassword("");
                        await auth.signOut();
                        router.push("/login");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <strong>Change password</strong>
                    <span className="tiny">
                      Requires your current password and at least 8 characters with uppercase, lowercase, number, and symbol. Updating your password signs you out.
                    </span>
                    <div className="grid-3">
                      <Field label="Current password">
                        <input
                          type="password"
                          autoComplete="current-password"
                          value={currentPassword}
                          onChange={(e) => setCurrentPassword(e.target.value)}
                        />
                      </Field>
                      <Field label="New password">
                        <input
                          type="password"
                          autoComplete="new-password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                        />
                      </Field>
                      <Field label="Confirm new password">
                        <input
                          type="password"
                          autoComplete="new-password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                        />
                      </Field>
                    </div>
                    <div>
                      <Button type="submit" disabled={busy}>
                        {busy ? "Updating…" : "Update password"}
                      </Button>
                    </div>
                  </form>

                  <div className="select-card stack" style={{ gap: 8 }}>
                    <strong>Deactivate account</strong>
                    <span className="tiny">
                      Deactivating disables login access and revokes active sessions for this account.
                    </span>
                    {!confirmDeactivate ? (
                      <div>
                        <Button
                          tone="danger"
                          small
                          disabled={busy}
                          onClick={() => {
                            setErrorMsg("");
                            setConfirmDeactivate(true);
                          }}
                        >
                          Deactivate my account
                        </Button>
                      </div>
                    ) : (
                      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                        <Button
                          tone="danger"
                          small
                          disabled={busy}
                          onClick={async () => {
                            setErrorMsg("");
                            setNotice("");
                            setBusy(true);
                            try {
                              const res = await deactivateAccountRemote();
                              if (!res.ok) {
                                setErrorMsg(res.error);
                                return;
                              }
                              await auth.signOut();
                              router.push("/");
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          {busy ? "Deactivating…" : "Confirm account deactivation"}
                        </Button>
                        <Button
                          tone="ghost"
                          small
                          disabled={busy}
                          onClick={() => setConfirmDeactivate(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              <div className="row">
                <Link href="/forgot" className="btn ghost small">
                  Reset password
                </Link>
                <Link href="/legal/privacy" className="btn ghost small">
                  Privacy notice
                </Link>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
