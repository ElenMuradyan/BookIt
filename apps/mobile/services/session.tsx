import AsyncStorage from "@react-native-async-storage/async-storage";
import { setTheme as setStoreTheme, useBookItState, userById, workspacesFor } from "@bookit/api-client";
import type { User, Workspace } from "@bookit/types";
import { readSession } from "@bookit/utils";
import React, { createContext, useContext, useEffect, useState } from "react";

const TOKEN_KEY = "bookit.mobile.token";
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
  signOut: () => Promise<void>;
  setWorkspaceId: (id: string | null) => Promise<void>;
  switchTheme: (next: "dark" | "light") => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const state = useBookItState();
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [workspaceId, setWorkspaceIdState] = useState<string | null>(null);
  const [localTheme, setLocalTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    let mounted = true;
    Promise.all([
      AsyncStorage.getItem(TOKEN_KEY),
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
  }, []);

  const claims = readSession(token);
  const userId = claims?.userId ?? null;
  const user = userId ? userById(state, userId) : undefined;
  const workspaces = user ? workspacesFor(state, user.id) : [];
  const workspace = workspaces.find((ws) => ws.businessId === workspaceId) ?? workspaces[0];

  const signInWithToken = async (nextToken: string) => {
    await AsyncStorage.setItem(TOKEN_KEY, nextToken);
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

  const signOut = async () => {
    await AsyncStorage.multiRemove([TOKEN_KEY, WORKSPACE_KEY]);
    setToken(null);
    setWorkspaceIdState(null);
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
