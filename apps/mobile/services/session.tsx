import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  configureApiAuth,
  fetchMeRemote,
  hydrateFromBackend,
  logoutRemote,
  type RemoteAuthSession,
  setTheme as setStoreTheme,
  useBookItState,
  userById,
  usingMocks,
  workspacesFor,
} from "@bookit/api-client";
import type { User, Workspace } from "@bookit/types";
import { readSession } from "@bookit/utils";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { clearSecureTokens, deleteSecureToken, getSecureToken, setSecureToken } from "./tokenStorage";

const TOKEN_KEY = "bookit.mobile.token";
const ACCESS_TOKEN_KEY = "bookit.mobile.access";
const REFRESH_TOKEN_KEY = "bookit.mobile.refresh";
const WORKSPACE_KEY = "bookit.mobile.workspace";
const THEME_KEY = "bookit.mobile.theme";

interface AuthContextValue {
  ready: boolean;
  token: string | null;
  userId: string | null;
  user: User | undefined;
  workspaces: Workspace[];
  workspaceId: string | null;
  workspace: Workspace | undefined;
  localTheme: "dark" | "light";
  signInWithToken: (token: string) => Promise<void>;
  signInRemote: (session: RemoteAuthSession) => Promise<void>;
  refreshSession: () => Promise<void>;
  signOut: () => Promise<void>;
  setWorkspaceId: (id: string | null) => Promise<void>;
  switchTheme: (next: "dark" | "light") => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const state = useBookItState();
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [remoteSession, setRemoteSession] = useState<RemoteAuthSession | null>(null);
  const [workspaceId, setWorkspaceIdState] = useState<string | null>(null);
  const [localTheme, setLocalTheme] = useState<"dark" | "light">("dark");

  const accessRef = useRef<string | null>(null);
  const refreshRef = useRef<string | null>(null);
  const mockMode = usingMocks();

  const persistRemoteTokens = useCallback(
    async (accessToken: string | null, refreshToken: string | null) => {
      accessRef.current = accessToken;
      refreshRef.current = refreshToken;
      setToken(accessToken);
      if (accessToken) {
        await setSecureToken(ACCESS_TOKEN_KEY, accessToken);
      } else {
        await deleteSecureToken(ACCESS_TOKEN_KEY);
      }
      if (refreshToken) {
        await setSecureToken(REFRESH_TOKEN_KEY, refreshToken);
      } else {
        await deleteSecureToken(REFRESH_TOKEN_KEY);
      }
    },
    [],
  );

  useEffect(() => {
    let mounted = true;
    if (mockMode) {
      Promise.all([
        getSecureToken(TOKEN_KEY),
        AsyncStorage.getItem(WORKSPACE_KEY),
        AsyncStorage.getItem(THEME_KEY),
      ])
        .then(([savedToken, savedWorkspace, savedTheme]) => {
          if (!mounted) return;
          const claims = readSession(savedToken);
          setToken(claims ? savedToken : null);
          setWorkspaceIdState(savedWorkspace);
          if (savedTheme === "light" || savedTheme === "dark") {
            setLocalTheme(savedTheme);
          }
          setReady(true);
        })
        .catch(() => {
          if (mounted) setReady(true);
        });
      return () => {
        mounted = false;
      };
    }

    configureApiAuth({
      clientType: "mobile",
      getAccessToken: () => accessRef.current,
      getRefreshToken: () => refreshRef.current,
      onTokensUpdated: async ({ accessToken, refreshToken }) => {
        await persistRemoteTokens(accessToken, refreshToken);
      },
      onAuthFailure: async () => {
        await persistRemoteTokens(null, null);
        if (mounted) setRemoteSession(null);
      },
    });

    Promise.all([
      getSecureToken(ACCESS_TOKEN_KEY),
      getSecureToken(REFRESH_TOKEN_KEY),
      AsyncStorage.getItem(WORKSPACE_KEY),
      AsyncStorage.getItem(THEME_KEY),
    ])
      .then(async ([savedAccess, savedRefresh, savedWorkspace, savedTheme]) => {
        if (!mounted) return;
        accessRef.current = savedAccess;
        refreshRef.current = savedRefresh;
        setToken(savedAccess);
        setWorkspaceIdState(savedWorkspace);
        if (savedTheme === "light" || savedTheme === "dark") {
          setLocalTheme(savedTheme);
        }
        if (savedAccess || savedRefresh) {
          const me = await fetchMeRemote();
          if (mounted && me.ok) {
            setRemoteSession(me.data);
          } else if (mounted) {
            await persistRemoteTokens(null, null);
            setRemoteSession(null);
          }
        }
        await hydrateFromBackend();
        if (mounted) setReady(true);
      })
      .catch(() => {
        if (mounted) setReady(true);
      });

    return () => {
      mounted = false;
    };
  }, [mockMode, persistRemoteTokens]);

  const claims = mockMode ? readSession(token) : null;
  const userId = mockMode ? (claims?.userId ?? null) : (remoteSession?.userId ?? null);
  const user = userId ? (userById(state, userId) ?? remoteSession?.user) : undefined;
  const workspaces = user
    ? (() => {
        const fromStore = workspacesFor(state, user.id);
        return fromStore.length > 0 ? fromStore : (remoteSession?.workspaces ?? []);
      })()
    : [];
  const workspace = workspaces.find((ws) => ws.businessId === workspaceId) ?? workspaces[0];

  const signInWithToken = async (nextToken: string) => {
    await setSecureToken(TOKEN_KEY, nextToken);
    setToken(nextToken);
    const parsed = readSession(nextToken);
    if (parsed) {
      const list = workspacesFor(state, parsed.userId);
      if (list[0]) {
        await AsyncStorage.setItem(WORKSPACE_KEY, list[0].businessId);
        setWorkspaceIdState(list[0].businessId);
      }
    }
  };

  const signInRemote = async (session: RemoteAuthSession) => {
    await persistRemoteTokens(session.accessToken ?? null, session.refreshToken ?? null);
    setRemoteSession(session);
    const defaultBiz = session.businessId || session.workspaces[0]?.businessId;
    if (defaultBiz) {
      await AsyncStorage.setItem(WORKSPACE_KEY, defaultBiz);
      setWorkspaceIdState(defaultBiz);
    }
    await hydrateFromBackend();
  };

  const refreshSession = async () => {
    if (mockMode) return;
    const me = await fetchMeRemote();
    if (me.ok) {
      setRemoteSession(me.data);
    }
    await hydrateFromBackend();
  };

  const signOut = async () => {
    if (!mockMode) {
      await logoutRemote(refreshRef.current);
      await persistRemoteTokens(null, null);
      setRemoteSession(null);
    }
    await clearSecureTokens([TOKEN_KEY, ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY]);
    await AsyncStorage.removeItem(WORKSPACE_KEY);
    setToken(null);
    setWorkspaceIdState(null);
    if (!mockMode) {
      await hydrateFromBackend();
    }
  };

  const setWorkspaceId = async (id: string | null) => {
    if (id) {
      await AsyncStorage.setItem(WORKSPACE_KEY, id);
    } else {
      await AsyncStorage.removeItem(WORKSPACE_KEY);
    }
    setWorkspaceIdState(id);
  };

  const switchTheme = async (next: "dark" | "light") => {
    setLocalTheme(next);
    await AsyncStorage.setItem(THEME_KEY, next);
    if (userId) {
      setStoreTheme(userId, next);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        ready,
        token,
        userId,
        user,
        workspaces,
        workspaceId: workspace?.businessId ?? null,
        workspace,
        localTheme,
        signInWithToken,
        signInRemote,
        refreshSession,
        signOut,
        setWorkspaceId,
        switchTheme,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
