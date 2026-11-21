export type ApiClientType = "web" | "mobile";

export type ApiAuthConfig = {
  clientType: ApiClientType;
  getAccessToken?: () => string | null;
  getRefreshToken?: () => string | null;
  onTokensUpdated?: (tokens: {
    accessToken: string | null;
    refreshToken: string | null;
    userId?: string | null;
  }) => void | Promise<void>;
  onAuthFailure?: () => void | Promise<void>;
};

export type ApiResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; status?: number };

let authConfig: ApiAuthConfig = {
  clientType:
    typeof navigator !== "undefined" && navigator.product === "ReactNative" ? "mobile" : "web",
};

let refreshPromise: Promise<boolean> | null = null;

export function configureApiAuth(next: Partial<ApiAuthConfig>): void {
  authConfig = { ...authConfig, ...next };
}

export function getApiClientType(): ApiClientType {
  return authConfig.clientType;
}

export function usingMocks(): boolean {
  const flag =
    process.env.NEXT_PUBLIC_BOOKIT_USE_MOCKS ?? process.env.EXPO_PUBLIC_BOOKIT_USE_MOCKS ?? "true";
  return flag !== "false";
}

export function apiBaseUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_BOOKIT_API_URL ?? process.env.EXPO_PUBLIC_BOOKIT_API_URL ?? "";
  if (configured.trim()) {
    return configured.trim().replace(/\/+$/, "");
  }
  const isReactNative =
    authConfig.clientType === "mobile" ||
    (typeof navigator !== "undefined" && navigator.product === "ReactNative");
  if (isReactNative && !usingMocks()) {
    throw new Error(
      "EXPO_PUBLIC_BOOKIT_API_URL is required when EXPO_PUBLIC_BOOKIT_USE_MOCKS=false (set your LAN IP or HTTPS backend URL; localhost on a phone points to the device itself).",
    );
  }
  if (!isReactNative && typeof window !== "undefined") {
    return "";
  }
  return process.env.BOOKIT_INTERNAL_API_URL?.trim().replace(/\/+$/, "") || "http://127.0.0.1:8000";
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined" || !document.cookie) return null;
  const parts = document.cookie.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      return decodeURIComponent(trimmed.slice(name.length + 1));
    }
  }
  return null;
}

async function performSingleFlightRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const headers = new Headers();
      headers.set("X-Client-Type", authConfig.clientType);

      const fetchInit: RequestInit = {
        method: "POST",
        headers,
      };

      if (authConfig.clientType === "web") {
        fetchInit.credentials = "include";
        const csrf = readCookie("bookit_csrf");
        if (csrf) headers.set("X-CSRF-Token", csrf);
      } else {
        const refreshToken = authConfig.getRefreshToken?.();
        if (!refreshToken) return false;
        headers.set("Content-Type", "application/json");
        fetchInit.body = JSON.stringify({ refreshToken });
      }

      const res = await fetch(`${apiBaseUrl()}/api/v1/auth/refresh`, fetchInit);
      if (!res.ok) {
        await authConfig.onAuthFailure?.();
        return false;
      }

      const body = (await res.json().catch(() => null)) as
        | { accessToken?: string | null; refreshToken?: string | null; userId?: string | null }
        | null;

      if (authConfig.clientType === "mobile" && body) {
        await authConfig.onTokensUpdated?.({
          accessToken: body.accessToken ?? null,
          refreshToken: body.refreshToken ?? null,
          userId: body.userId ?? null,
        });
      }
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function buildHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);
  headers.set("X-Client-Type", authConfig.clientType);
  if (!headers.has("Content-Type") && init?.body && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  if (authConfig.clientType === "web") {
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
      const csrf = readCookie("bookit_csrf");
      if (csrf && !headers.has("X-CSRF-Token")) {
        headers.set("X-CSRF-Token", csrf);
      }
    }
  } else {
    const token = authConfig.getAccessToken?.();
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }
  return headers;
}

export async function apiFetch(
  path: string,
  init?: RequestInit & { skipAuthRefresh?: boolean },
): Promise<Response> {
  if (usingMocks()) {
    throw new Error(
      `Mock mode is on. ${path} is not called. Set NEXT_PUBLIC_BOOKIT_USE_MOCKS=false when FastAPI is ready.`,
    );
  }

  const requestInit: RequestInit = {
    ...init,
    headers: buildHeaders(init),
    ...(authConfig.clientType === "web" ? { credentials: "include" as const } : {}),
  };

  const url = `${apiBaseUrl()}${path}`;
  let response = await fetch(url, requestInit);

  const isAuthPath = path.startsWith("/api/v1/auth/login") || path.startsWith("/api/v1/auth/register") || path.startsWith("/api/v1/auth/refresh");
  if (response.status === 401 && !init?.skipAuthRefresh && !isAuthPath) {
    const refreshed = await performSingleFlightRefresh();
    if (refreshed) {
      const retryInit: RequestInit = {
        ...init,
        headers: buildHeaders(init),
        ...(authConfig.clientType === "web" ? { credentials: "include" as const } : {}),
      };
      response = await fetch(url, retryInit);
    }
  }

  return response;
}

export async function apiJson<T = unknown>(
  path: string,
  init?: RequestInit & { skipAuthRefresh?: boolean },
): Promise<ApiResult<T>> {
  try {
    const res = await apiFetch(path, init);
    const text = await res.text();
    const parsed = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    if (!res.ok) {
      const msg =
        (typeof parsed?.message === "string" && parsed.message) ||
        (typeof parsed?.detail === "string" && parsed.detail) ||
        `Request failed (${res.status})`;
      const fe =
        parsed?.fieldErrors && typeof parsed.fieldErrors === "object"
          ? (parsed.fieldErrors as Record<string, string>)
          : undefined;
      return { ok: false, error: msg, fieldErrors: fe, status: res.status };
    }
    return { ok: true, data: parsed as T };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network request failed",
    };
  }
}
