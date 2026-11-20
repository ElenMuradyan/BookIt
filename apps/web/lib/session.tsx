"use client";

import {
  configureApiAuth,
  fetchMeRemote,
  hydrateFromBackend,
  logoutRemote,
  type RemoteAuthSession,
  useBookItState,
  userById,
  usingMocks,
  workspacesFor,
} from "@bookit/api-client";
import type { User, Workspace } from "@bookit/types";
import { readSession } from "@bookit/utils";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

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
  signInRemote: (session: RemoteAuthSession) => Promise<void>;
  refreshSession: () => Promise<void>;
  setWorkspaceId: (id: string) => void;
  signOut: () => Promise<void>;
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
  const [remoteSession, setRemoteSession] = useState<RemoteAuthSession | null>(null);
  const [workspaceId, setWorkspaceState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const mockMode = usingMocks();

  const refreshSession = useCallback(async () => {
    if (mockMode) return;
    const me = await fetchMeRemote();
    if (me.ok) {
      setRemoteSession(me.data);
    } else {
      setRemoteSession(null);
    }
    await hydrateFromBackend();
  }, [mockMode]);

  useEffect(() => {
    setWorkspaceState(localStorage.getItem(WORKSPACE_KEY));
    const savedTheme = localStorage.getItem("bookit.theme");
    if (savedTheme) document.documentElement.dataset.theme = savedTheme === "light" ? "light" : "dark";

    if (mockMode) {
      const stored = localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
      setTokenState(readSession(stored) ? stored : null);
      setReady(true);
      return;
    }

    // Real backend mode: clear legacy mock tokens and use HttpOnly cookie + CSRF authentication
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    configureApiAuth({
      clientType: "web",
      onAuthFailure: () => {
        setRemoteSession(null);
      },
    });
    void refreshSession().finally(() => {
      setReady(true);
    });
  }, [mockMode, refreshSession]);

  const userId = useMemo(
    () => (mockMode ? (readSession(token)?.userId ?? null) : (remoteSession?.userId ?? null)),
    [mockMode, token, remoteSession],
  );
  const user = userId ? (userById(state, userId) ?? remoteSession?.user) : undefined;
  const workspaces = useMemo(() => {
    if (!userId) return [];
    const fromStore = workspacesFor(state, userId);
    return fromStore.length > 0 ? fromStore : (remoteSession?.workspaces ?? []);
  }, [userId, state, remoteSession]);
  const workspace = workspaces.find((item) => item.businessId === workspaceId) ?? workspaces[0];

  useEffect(() => {
    if (!ready || !user) return;
    const profile = state.customerProfiles.find((item) => item.userId === user.id) ?? remoteSession?.profile;
    if (profile?.theme && profile.theme !== "system") applyTheme(profile.theme);
  }, [ready, user, state.customerProfiles, remoteSession]);

  const setToken = (next: string | null, remember = false) => {
    if (!mockMode) {
      if (!next) void signOut();
      return;
    }
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
    if (next) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, next);
    setTokenState(next);
  };

  const signInRemote = async (session: RemoteAuthSession) => {
    setRemoteSession(session);
    if (session.workspaces[0]?.businessId) {
      localStorage.setItem(WORKSPACE_KEY, session.workspaces[0].businessId);
      setWorkspaceState(session.workspaces[0].businessId);
    }
    await hydrateFromBackend();
  };

  const setWorkspaceId = (id: string) => {
    localStorage.setItem(WORKSPACE_KEY, id);
    setWorkspaceState(id);
  };

  const signOut = async () => {
    if (mockMode) {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_KEY);
      setTokenState(null);
      return;
    }
    await logoutRemote();
    setRemoteSession(null);
    localStorage.removeItem(WORKSPACE_KEY);
    setWorkspaceState(null);
    await hydrateFromBackend();
  };

  return (
    <AuthContext.Provider
      value={{
        ready,
        userId,
        user,
        workspaces,
        workspaceId: workspace?.businessId ?? null,
        workspace,
        setToken,
        signInRemote,
        refreshSession,
        setWorkspaceId,
        signOut,
      }}
    >
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
