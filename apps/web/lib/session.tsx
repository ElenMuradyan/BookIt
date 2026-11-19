"use client";

import { userById, useBookItState, workspacesFor } from "@bookit/api-client";
import type { User, Workspace } from "@bookit/types";
import { readSession } from "@bookit/utils";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

const TOKEN_KEY = "bookit.session.token";
const WORKSPACE_KEY = "bookit.workspace";

type AuthValue = {
  ready: boolean;
  userId: string | null;
  user?: User;
  workspaces: Workspace[];
  workspaceId: string | null;
  workspace?: Workspace;
  setToken: (token: string | null, remember?: boolean) => void;
  setWorkspaceId: (id: string) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

function applyTheme(theme: string | null | undefined) {
  const next = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("bookit.theme", next);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const state = useBookItState();
  const [token, setTokenState] = useState<string | null>(null);
  const [workspaceId, setWorkspaceState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
    setTokenState(readSession(stored) ? stored : null);
    setWorkspaceState(localStorage.getItem(WORKSPACE_KEY));
    const saved = localStorage.getItem("bookit.theme");
    if (saved) document.documentElement.dataset.theme = saved === "light" ? "light" : "dark";
    setReady(true);
  }, []);

  const userId = useMemo(() => readSession(token)?.userId ?? null, [token]);
  const user = userId ? userById(state, userId) : undefined;
  const workspaces = userId ? workspacesFor(state, userId) : [];
  const workspace = workspaces.find((item) => item.businessId === workspaceId) ?? workspaces[0];

  useEffect(() => {
    if (!ready || !user) return;
    const profile = state.customerProfiles.find((item) => item.userId === user.id);
    if (profile?.theme && profile.theme !== "system") applyTheme(profile.theme);
  }, [ready, user, state.customerProfiles]);

  const setToken = (next: string | null, remember = false) => {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    if (next) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, next);
    setTokenState(next);
  };

  const setWorkspaceId = (id: string) => {
    localStorage.setItem(WORKSPACE_KEY, id);
    setWorkspaceState(id);
  };

  const signOut = () => setToken(null);

  return (
    <AuthContext.Provider value={{ ready, userId, user, workspaces, workspaceId: workspace?.businessId ?? null, workspace, setToken, setWorkspaceId, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is missing");
  return value;
}

export function useRequireUser(admin = false) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (!auth.ready) return;
    if (!auth.user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (admin && !auth.user.isPlatformAdmin) router.replace("/home");
  }, [admin, auth.ready, auth.user, pathname, router]);
  return auth;
}
