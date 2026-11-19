"use client";

import { useBookItState } from "@bookit/api-client";
import { adminNav, customerNav, customerSecondary, roleLabels, workspaceNav } from "@bookit/ui";
import { can, fullName, initials } from "@bookit/utils";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRequireUser } from "@/lib/session";
import { Icon, Mark } from "./ui";

function active(pathname: string, href: string) {
  if (href === "/home" || href === "/workspace" || href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function CustomerShell({ children }: { children: React.ReactNode }) {
  const auth = useRequireUser();
  const state = useBookItState();
  const pathname = usePathname();
  const router = useRouter();
  if (!auth.ready || !auth.user) return <div className="app-boot">Opening BookIt…</div>;
  const userId = auth.user.id;
  const unread = state.notifications.filter((item) => item.userId === userId && !item.read).length;
  const cartCount = state.carts.find((c) => c.userId === userId)?.items.reduce((sum, i) => sum + i.quantity, 0) ?? 0;
  const links = [...customerNav, ...customerSecondary];
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/home" className="brand" style={{ padding: "6px 8px 14px" }}>
          <Mark /> BookIt
        </Link>
        {links.map((item) => (
          <Link key={item.href} href={item.href} className={`side-link ${active(pathname, item.href) ? "active" : ""}`}>
            <Icon name={item.icon} />
            {item.label}
            {item.href === "/notifications" && unread ? <span className="badge tone-brand">{unread}</span> : null}
          </Link>
        ))}
        <Link href="/cart" className={`side-link ${active(pathname, "/cart") ? "active" : ""}`}>
          <Icon name="bag" />
          Cart
          {cartCount ? <span className="badge tone-brand">{cartCount}</span> : null}
        </Link>
        <div style={{ marginTop: "auto" }}>
          <WorkspaceMenu />
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <form
            className="inline-search"
            style={{ flex: 1, display: "flex", border: "1px solid var(--line)", borderRadius: 14, background: "var(--card)" }}
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              router.push(`/explore?q=${encodeURIComponent(String(data.get("q") ?? ""))}`);
            }}
          >
            <input name="q" placeholder="Search businesses, services, products" aria-label="Search" />
          </form>
          <Link href="/cart" className="btn ghost small" aria-label="Shopping cart">
            <Icon name="bag" /> {cartCount || ""}
          </Link>
          <Link href="/notifications" className="btn ghost small" aria-label="Notifications">
            <Icon name="bell" /> {unread || ""}
          </Link>
          <Link href="/explore" className="btn small">
            New booking
          </Link>
        </div>
        <div className="main-pad">{children}</div>
      </div>
      <nav className="bottom-nav">
        {customerNav.map((item) => (
          <Link key={item.href} href={item.href} className={active(pathname, item.href) ? "active" : ""}>
            <Icon name={item.icon} />
            {item.label.replace("My ", "")}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const auth = useRequireUser();
  const state = useBookItState();
  const pathname = usePathname();
  const router = useRouter();
  if (!auth.ready || !auth.user) return <div className="app-boot">Opening workspace…</div>;
  if (!auth.workspace) {
    return (
      <div className="page">
        <div className="panel">
          <h2>No business workspace yet</h2>
          <p className="muted">Apply to list a business, or ask an owner to invite this account.</p>
          <Link href="/register/business" className="btn">
            Register a business
          </Link>
        </div>
      </div>
    );
  }
  const role = auth.workspace.role;
  const bizId = auth.workspace.businessId;
  const unreadBiz = state.notifications.filter((n) => n.businessId === bizId && !n.read).length;
  const links = workspaceNav.filter((item) => !item.permission || can(role, item.permission));
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/workspace" className="brand" style={{ padding: "6px 8px 14px" }}>
          <Mark /> BookIt
        </Link>
        <p className="tiny" style={{ padding: "0 10px 8px" }}>
          {auth.workspace.businessName}
          <br />
          {roleLabels[role]}
        </p>
        {links.map((item) => (
          <Link key={item.href} href={item.href} className={`side-link ${active(pathname, item.href) ? "active" : ""}`}>
            <Icon name={item.icon} />
            {item.label}
            {item.href === "/workspace/notifications" && unreadBiz ? <span className="badge tone-brand">{unreadBiz}</span> : null}
          </Link>
        ))}
        <div style={{ marginTop: "auto" }}>
          <WorkspaceMenu />
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <strong style={{ letterSpacing: "-0.03em" }}>{auth.workspace.businessName}</strong>
          <div className="spacer" />
          <Link href="/workspace/notifications" className="btn ghost small" aria-label="Workspace notifications">
            <Icon name="bell" /> {unreadBiz || ""}
          </Link>
          <button className="btn small" onClick={() => router.push("/workspace/calendar?create=1")}>
            New booking
          </button>
        </div>
        <div className="main-pad">
          <div className="tabs" style={{ marginBottom: 14, display: "none" }} />
          <div className="tabs" style={{ marginBottom: 16 }}>
            {links.map((item) => (
              <Link key={item.href} href={item.href} className={`tab ${active(pathname, item.href) ? "on" : ""}`}>
                {item.label}
                {item.href === "/workspace/notifications" && unreadBiz ? ` (${unreadBiz})` : ""}
              </Link>
            ))}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const auth = useRequireUser(true);
  const pathname = usePathname();
  if (!auth.ready || !auth.user?.isPlatformAdmin) return <div className="app-boot">Checking admin access…</div>;
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/admin" className="brand" style={{ padding: "6px 8px 14px" }}>
          <Mark /> Admin
        </Link>
        {adminNav.map((item) => (
          <Link key={item.href} href={item.href} className={`side-link ${active(pathname, item.href) ? "active" : ""}`}>
            <Icon name={item.icon} />
            {item.label}
          </Link>
        ))}
        <div style={{ marginTop: "auto" }}>
          <WorkspaceMenu />
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <strong>Platform administration</strong>
          <div className="spacer" />
          <span className="tiny">Separate from customer and business workspaces</span>
        </div>
        <div className="main-pad">{children}</div>
      </div>
    </div>
  );
}

export function WorkspaceMenu() {
  const auth = useRequireUser();
  const router = useRouter();
  if (!auth.user) return null;
  return (
    <div className="panel" style={{ padding: 10 }}>
      <div className="person">
        {auth.user.avatarUrl ? <img className="avatar-img" src={auth.user.avatarUrl} alt="" /> : <span className="avatar">{initials(fullName(auth.user))}</span>}
        <div>
          <strong style={{ fontSize: 13 }}>{fullName(auth.user)}</strong>
          <div className="tiny">{auth.user.email}</div>
        </div>
      </div>
      <label className="field" style={{ marginTop: 10 }}>
        <span>Switch environment</span>
        <select
          value={auth.workspace && typeof window !== "undefined" && window.location.pathname.startsWith("/workspace") ? auth.workspace.businessId : auth.user.isPlatformAdmin && typeof window !== "undefined" && window.location.pathname.startsWith("/admin") ? "admin" : "personal"}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "personal") router.push("/home");
            else if (value === "admin") router.push("/admin");
            else {
              auth.setWorkspaceId(value);
              router.push("/workspace");
            }
          }}
        >
          <option value="personal">Personal account</option>
          {auth.user.isPlatformAdmin ? <option value="admin">Platform admin</option> : null}
          {auth.workspaces.map((workspace) => (
            <option key={workspace.businessId} value={workspace.businessId}>
              {workspace.businessName} — {roleLabels[workspace.role]}
            </option>
          ))}
        </select>
      </label>
      <button className="btn ghost small" style={{ width: "100%", marginTop: 8 }} onClick={() => { auth.signOut(); router.push("/"); }}>
        Sign out
      </button>
    </div>
  );
}

export function PublicHeader() {
  return (
    <header className="public-nav">
      <Link href="/" className="brand">
        <Mark /> BookIt
      </Link>
      <nav className="nav-links">
        <Link href="/explore">Explore</Link>
        <Link href="/marketplace">Marketplace</Link>
        <Link href="/register/business">For business</Link>
        <Link href="/pricing">Pricing</Link>
      </nav>
      <div className="spacer" />
      <Link href="/login" className="btn ghost small">
        Log in
      </Link>
      <Link href="/register" className="btn small">
        Get started
      </Link>
    </header>
  );
}
