/**
 * FastAPI client stub.
 * The UI calls the mock store while NEXT_PUBLIC_BOOKIT_USE_MOCKS is not "false".
 * Swap `usingMocks()` when the Python API is ready. Do not fake network success.
 */

export function usingMocks(): boolean {
  const flag = process.env.NEXT_PUBLIC_BOOKIT_USE_MOCKS ?? process.env.EXPO_PUBLIC_BOOKIT_USE_MOCKS ?? "true";
  return flag !== "false";
}

export function apiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BOOKIT_API_URL ?? process.env.EXPO_PUBLIC_BOOKIT_API_URL ?? "http://localhost:8000";
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  if (usingMocks()) {
    throw new Error(`Mock mode is on. ${path} is not called. Set NEXT_PUBLIC_BOOKIT_USE_MOCKS=false when FastAPI is ready.`);
  }
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) headers.set("Content-Type", "application/json");
  return fetch(`${apiBaseUrl()}${path}`, { ...init, headers });
}
