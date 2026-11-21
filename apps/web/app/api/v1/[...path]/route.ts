import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function upstreamBaseUrl(): string {
  const raw = process.env.BOOKIT_INTERNAL_API_URL || "http://127.0.0.1:8000";
  return raw.trim().replace(/\/+$/, "");
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
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-request-id",
];

async function proxyRequest(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path } = await context.params;
  if (!Array.isArray(path) || path.length === 0 || path.some((segment) => segment === ".." || segment === ".")) {
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
  if (!headers.has("x-forwarded-host")) {
    const host = request.headers.get("host");
    if (host) headers.set("x-forwarded-host", host);
  }
  if (!headers.has("x-forwarded-proto")) {
    headers.set("x-forwarded-proto", request.nextUrl.protocol.replace(":", ""));
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
    });
  } catch {
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

  const payload = method === "HEAD" ? null : await upstreamResponse.arrayBuffer();
  return new NextResponse(payload, {
    status: upstreamResponse.status,
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
