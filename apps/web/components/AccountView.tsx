"use client";

import {
  acceptWorkspaceInviteRemote,
  addAddress,
  addAddressRemote,
  declineWorkspaceInviteRemote,
  resetDemoState,
  setPersonalizationConsent,
  setSpendingVisibility,
  setTheme,
  updateNotificationPrefs,
  updateProfile,
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

          {section === "profile" || section === "photo" || section === "contact" || section === "language" ? (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                updateProfile(user.id, {
                  firstName,
                  lastName,
                  phone,
                  location,
                  language,
                  gender: gender || undefined,
                  dateOfBirth: dateOfBirth || undefined,
                });
                setNotice("Profile saved.");
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
                <Button type="submit">Save changes</Button>
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
                    className={`slot ${(profile?.theme ?? "dark") === t ? "on" : ""}`}
                    onClick={() => {
                      setTheme(user.id, t);
                      document.documentElement.dataset.theme = t;
                      localStorage.setItem("bookit.theme", t);
                      setNotice(`Switched to ${t} theme`);
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
                    checked={profile.notificationPreferences[key]}
                    onChange={(e) => {
                      updateNotificationPrefs(user.id, { [key]: e.target.checked });
                      setNotice("Notification preferences updated");
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
                    checked={Boolean(profile?.personalizationConsent)}
                    onChange={(e) => {
                      setPersonalizationConsent(user.id, e.target.checked);
                      setNotice(
                        e.target.checked
                          ? "Personalized recommendations enabled."
                          : "Personalized recommendations disabled.",
                      );
                    }}
                  />
                  <span>Allow personalized recommendations based on my profile and interests</span>
                </label>
              </div>
              <p className="muted">Choose whether spending analytics include estimates or only recorded payments.</p>
              <div className="chips">
                <button
                  type="button"
                  className={`slot ${profile?.spendingVisibility === "recorded_only" ? "on" : ""}`}
                  onClick={() => setSpendingVisibility(user.id, "recorded_only")}
                >
                  Recorded payments only
                </button>
                <button
                  type="button"
                  className={`slot ${profile?.spendingVisibility === "include_estimates" ? "on" : ""}`}
                  onClick={() => setSpendingVisibility(user.id, "include_estimates")}
                >
                  Include estimates
                </button>
              </div>
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
            </div>
          ) : null}

          {section === "security" || section === "connected" || section === "payments" || section === "help" ? (
            <div className="stack">
              <h2 style={{ margin: 0 }}>{customerSettingSections.find((s) => s.id === section)?.label}</h2>
              <p className="muted">
                This frontend stage uses token-based demo sessions and does not store passwords or payment card numbers in the browser.
                OAuth providers (Google, Apple) and FastAPI billing tokens connect in the backend phase.
              </p>
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
