import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import http from "node:http";
import { NextRequest } from "next/server";
import { DELETE, GET, HEAD, PATCH, POST } from "./route";

let server: http.Server;
let baseUrl = "";
let nextMode: "ok" | "cookies" | "no_content" | "slow" = "ok";
let lastSeen: {
  method?: string;
  url?: string;
  headers?: http.IncomingHttpHeaders;
  body?: string;
} = {};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      lastSeen = {
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      if (nextMode === "slow") {
        setTimeout(() => {
          if (!res.writableEnded) {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
          }
        }, 300);
        return;
      }
      if (nextMode === "no_content") {
        res.writeHead(204);
        res.end();
        return;
      }
      if (nextMode === "cookies") {
        res.setHeader("set-cookie", [
          "bookit_access=tok123; HttpOnly; Path=/",
          "bookit_csrf=csrf123; Path=/",
        ]);
      }
      res.writeHead(200, {
        "content-type": "application/json",
        "x-request-id": "req_upstream_1",
      });
      res.end(JSON.stringify({ ok: true, method: req.method, url: req.url }));
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      }
      resolve();
    });
  });
});

afterEach(() => {
  nextMode = "ok";
  lastSeen = {};
  delete process.env.BOOKIT_PROXY_TIMEOUT_MS;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("Next.js /api/v1 proxy route", () => {
  it("forwards GET requests with query params, headers, and multiple Set-Cookie headers", async () => {
    process.env.BOOKIT_INTERNAL_API_URL = baseUrl;
    nextMode = "cookies";

    const req = new NextRequest("http://localhost:3000/api/v1/auth/me?include=profile", {
      method: "GET",
      headers: {
        host: "app.bookit.local",
        cookie: "bookit_access=abc; bookit_csrf=xyz",
        "x-csrf-token": "xyz",
        "x-forwarded-for": "203.0.113.99",
        "x-forwarded-host": "evil.attacker.example",
      },
    });

    const res = await GET(req, { params: Promise.resolve({ path: ["auth", "me"] }) });
    expect(res.status).toBe(200);
    expect(lastSeen.method).toBe("GET");
    expect(lastSeen.url).toBe("/api/v1/auth/me?include=profile");
    expect(lastSeen.headers?.cookie).toBe("bookit_access=abc; bookit_csrf=xyz");
    expect(lastSeen.headers?.["x-csrf-token"]).toBe("xyz");
    expect(lastSeen.headers?.["x-forwarded-for"]).toBeUndefined();
    expect(lastSeen.headers?.["x-forwarded-host"]).toBe("app.bookit.local");

    const cookies = res.headers.getSetCookie();
    expect(cookies.length).toBe(2);
    expect(cookies[0]).toContain("bookit_access=tok123");
    expect(cookies[1]).toContain("bookit_csrf=csrf123");
    expect(res.headers.get("x-request-id")).toBe("req_upstream_1");
  });

  it("forwards POST, PATCH, and DELETE bodies and handles 204/HEAD cleanly", async () => {
    process.env.BOOKIT_INTERNAL_API_URL = baseUrl;

    const postReq = new NextRequest("http://localhost:3000/api/v1/bookings", {
      method: "POST",
      headers: { "content-type": "application/json", "x-csrf-token": "tok" },
      body: JSON.stringify({ serviceId: "svc_1" }),
    });
    const postRes = await POST(postReq, { params: Promise.resolve({ path: ["bookings"] }) });
    expect(postRes.status).toBe(200);
    expect(lastSeen.method).toBe("POST");
    expect(lastSeen.body).toBe('{"serviceId":"svc_1"}');

    const patchReq = new NextRequest("http://localhost:3000/api/v1/bookings/bk_1/status", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    const patchRes = await PATCH(patchReq, { params: Promise.resolve({ path: ["bookings", "bk_1", "status"] }) });
    expect(patchRes.status).toBe(200);
    expect(lastSeen.method).toBe("PATCH");

    nextMode = "no_content";
    const delReq = new NextRequest("http://localhost:3000/api/v1/businesses/b1/blocked/blk1", {
      method: "DELETE",
    });
    const delRes = await DELETE(delReq, {
      params: Promise.resolve({ path: ["businesses", "b1", "blocked", "blk1"] }),
    });
    expect(delRes.status).toBe(204);
    expect(await delRes.text()).toBe("");

    nextMode = "ok";
    const headReq = new NextRequest("http://localhost:3000/api/v1/health", { method: "HEAD" });
    const headRes = await HEAD(headReq, { params: Promise.resolve({ path: ["health"] }) });
    expect(headRes.status).toBe(200);
    expect(await headRes.text()).toBe("");
  });

  it("rejects dot, traversal, encoded traversal, and control characters with 400", async () => {
    process.env.BOOKIT_INTERNAL_API_URL = baseUrl;

    for (const badPath of [[], [".."], ["auth", "..", "admin"], ["%2e%2e"], ["foo/bar"], ["bad\u0000id"]]) {
      const req = new NextRequest("http://localhost:3000/api/v1/invalid", { method: "GET" });
      const res = await GET(req, { params: Promise.resolve({ path: badPath }) });
      expect(res.status).toBe(400);
    }
  });

  it("returns 502 when backend upstream is unreachable", async () => {
    process.env.BOOKIT_INTERNAL_API_URL = "http://127.0.0.1:1";
    const req = new NextRequest("http://localhost:3000/api/v1/bootstrap", { method: "GET" });
    const res = await GET(req, { params: Promise.resolve({ path: ["bootstrap"] }) });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ detail: "Backend API is currently unreachable" });
  });

  it("returns 504 when backend upstream exceeds timeout", async () => {
    process.env.BOOKIT_INTERNAL_API_URL = baseUrl;
    process.env.BOOKIT_PROXY_TIMEOUT_MS = "50";
    nextMode = "slow";

    const req = new NextRequest("http://localhost:3000/api/v1/bootstrap", { method: "GET" });
    const res = await GET(req, { params: Promise.resolve({ path: ["bootstrap"] }) });
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ detail: "Backend API request timed out" });
  });
});
