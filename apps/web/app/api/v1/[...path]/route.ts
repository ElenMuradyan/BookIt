import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PROXY_TIMEOUT_MS = 15_000;

function upstreamBaseUrl(): string {
  const raw = process.env.BOOKIT_INTERNAL_API_URL || "http://127.0.0.1:8000";
  return raw.trim().replace(/\/+$/, "");
}

function proxyTimeoutMs(): number {
  const raw = Number(process.env.BOOKIT_PROXY_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 50 && raw <= 120_000) {
    return Math.floor(raw);
  }
  return DEFAULT_PROXY_TIMEOUT_MS;
}

const FORWARDED_REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "authorization",
  "content-type",
  "cookie",
  "origin",
  "referer",
  "user-agent",
  "x-client-type",
  "x-csrf-token",
  "x-request-id",
];

function isValidPathSegment(segment: string): boolean {
  if (!segment || segment === "." || segment === "..") return false;
  if (/[\x00-\x1f\x7f/\\]/.test(segment)) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return false;
  }
  if (!decoded || decoded === "." || decoded === "..") return false;
  if (/[\x00-\x1f\x7f/\\]/.test(decoded)) return false;
  if (decoded.includes("..")) return false;
  return true;
}

function isNullBodyStatus(status: number): boolean {
  return status === 204 || status === 205 || status === 304 || (status >= 100 && status < 200);
}

async function proxyRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await context.params;
  if (!Array.isArray(path) || path.length === 0 || !path.every(isValidPathSegment)) {
    return NextResponse.json({ detail: "Invalid API path" }, { status: 400 });
  }

  const encodedPath = path.map((segment) => encodeURIComponent(segment)).join("/");
  const search = request.nextUrl.search || "";
  const targetUrl = `${upstreamBaseUrl()}/api/v1/${encodedPath}${search}`;

  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  const host = request.headers.get("host");
  if (host) {
    headers.set("x-forwarded-host", host);
  }
  const proto = request.nextUrl.protocol.replace(":", "");
  if (proto === "http" || proto === "https") {
    headers.set("x-forwarded-proto", proto);
  }

  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  const bodyBuffer = hasBody ? await request.arrayBuffer() : undefined;

  let upstreamResponse: Response;
  try {
    upstreamResponse = await fetch(targetUrl, {
      method,
      headers,
      body: hasBody && bodyBuffer && bodyBuffer.byteLength > 0 ? bodyBuffer : undefined,
      redirect: "manual",
      signal: AbortSignal.timeout(proxyTimeoutMs()),
    });
  } catch (err) {
    const errName = err instanceof Error ? err.name : "";
    if (errName === "TimeoutError" || errName === "AbortError") {
      return NextResponse.json(
        { detail: "Backend API request timed out" },
        { status: 504 },
      );
    }
    return NextResponse.json(
      { detail: "Backend API is currently unreachable" },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  for (const headerName of ["content-type", "cache-control", "retry-after", "www-authenticate", "x-request-id"]) {
    const val = upstreamResponse.headers.get(headerName);
    if (val) responseHeaders.set(headerName, val);
  }

  const getSetCookie = (upstreamResponse.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === "function") {
    for (const cookie of getSetCookie.call(upstreamResponse.headers)) {
      responseHeaders.append("set-cookie", cookie);
    }
  } else {
    const single = upstreamResponse.headers.get("set-cookie");
    if (single) responseHeaders.append("set-cookie", single);
  }

  const status = upstreamResponse.status;
  const payload = method === "HEAD" || isNullBodyStatus(status) ? null : await upstreamResponse.arrayBuffer();
  return new NextResponse(payload, {
    status,
    statusText: upstreamResponse.statusText,
    headers: responseHeaders,
  });
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, context);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, context);
}

export async function PUT(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, context);
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, context);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, context);
}

export async function OPTIONS(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, context);
}

export async function HEAD(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, context);
}
