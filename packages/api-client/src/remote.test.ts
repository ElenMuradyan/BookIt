import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { configureApiAuth } from "./http";
import {
  acceptWorkspaceInviteRemote,
  addAddressRemote,
  addReviewRemote,
  changePasswordRemote,
  checkInUniversalQrRemote,
  createUniversalBookingRemote,
  deactivateAccountRemote,
  declineWorkspaceInviteRemote,
  fetchAvailabilityRemote,
  moveFavoriteRemote,
  sendBusinessMessageRemote,
  toggleFavoriteRemote,
} from "./remote";

type RecordedRequest = {
  url: string;
  method: string;
  body: Record<string, unknown> | null;
};

const originalFetch = globalThis.fetch;
const originalUseMocks = process.env.NEXT_PUBLIC_BOOKIT_USE_MOCKS;
const originalApiUrl = process.env.NEXT_PUBLIC_BOOKIT_API_URL;

let requests: RecordedRequest[] = [];
let mockHandler: (url: string, init?: RequestInit) => Response;

const EMPTY_BOOTSTRAP = {
  users: [],
  customerProfiles: [],
  businesses: [],
  businessApplications: [],
  memberships: [],
  employees: [],
  services: [],
  appointments: [],
  products: [],
  carts: [],
  orders: [],
  reviews: [],
  favorites: [],
  addresses: [],
  notifications: [],
  payments: [],
  expenses: [],
  invoices: [],
  promoCodes: [],
  campaigns: [],
  advertisements: [],
  messages: [],
  revenueSeries: [],
  bookingSeries: [],
  bookingConfigs: [],
  resources: [],
  resourceBlocks: [],
  eventOfferings: [],
  bookings: [],
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  requests = [];
  process.env.NEXT_PUBLIC_BOOKIT_USE_MOCKS = "false";
  process.env.NEXT_PUBLIC_BOOKIT_API_URL = "http://api.bookit.test";
  configureApiAuth({ clientType: "web" });

  mockHandler = (url: string) => {
    if (url.endsWith("/api/v1/bootstrap")) {
      return jsonResponse(EMPTY_BOOTSTRAP);
    }
    return jsonResponse({});
  };

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const rawBody = typeof init?.body === "string" ? init.body : null;
    requests.push({
      url,
      method: (init?.method ?? "GET").toUpperCase(),
      body: rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : null,
    });
    return mockHandler(url, init);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalUseMocks === undefined) delete process.env.NEXT_PUBLIC_BOOKIT_USE_MOCKS;
  else process.env.NEXT_PUBLIC_BOOKIT_USE_MOCKS = originalUseMocks;
  if (originalApiUrl === undefined) delete process.env.NEXT_PUBLIC_BOOKIT_API_URL;
  else process.env.NEXT_PUBLIC_BOOKIT_API_URL = originalApiUrl;
});

describe("@bookit/api-client remote helpers", () => {
  it("maps ticketItems + attendeeName to canonical tickets/attendeeNames and strips legacy keys", async () => {
    mockHandler = (url) => {
      if (url.endsWith("/api/v1/bootstrap")) return jsonResponse(EMPTY_BOOTSTRAP);
      return jsonResponse({
        id: "ubk_1",
        businessId: "biz_1",
        customerId: "usr_1",
        bookingModel: "ticket",
        status: "confirmed",
        title: "Rooftop Jazz",
        quantity: 2,
        subtotalAmount: 90,
        taxAmount: 7.2,
        totalAmount: 97.2,
        depositDueAmount: 0,
        paymentStatus: "pending",
        resourceAllocations: [],
        ticketPasses: [],
        createdAt: "2026-11-20T12:00:00Z",
      });
    };

    const res = await createUniversalBookingRemote({
      bookingModel: "ticket",
      businessId: "biz_1",
      sessionId: "ses_1",
      ticketItems: [{ tierId: "tier_vip", quantity: 2 }],
      attendeeName: "Maya Lin",
      attendeeEmail: "maya@example.com",
      paymentMethod: "in_person",
    });

    expect(res.ok).toBe(true);
    const post = requests.find((r) => r.url.endsWith("/api/v1/bookings/universal"));
    expect(post?.method).toBe("POST");
    expect(post?.body?.tickets).toEqual([
      {
        tierId: "tier_vip",
        quantity: 2,
        attendeeNames: ["Maya Lin", "Maya Lin"],
      },
    ]);
    expect(post?.body?.attendeeNames).toEqual(["Maya Lin"]);
    expect(post?.body?.ticketItems).toBeUndefined();
    expect(post?.body?.attendeeName).toBeUndefined();
    expect(post?.body?.attendeeEmail).toBeUndefined();
    expect(requests.some((r) => r.url.endsWith("/api/v1/bootstrap"))).toBe(true);
  });

  it("checkInUniversalQrRemote returns canonical UniversalCheckInResult fields", async () => {
    mockHandler = (url) => {
      if (url.endsWith("/api/v1/bootstrap")) return jsonResponse(EMPTY_BOOTSTRAP);
      return jsonResponse({
        kind: "ticket_pass",
        bookingId: "ubk_9",
        businessId: "biz_2",
        code: "TKT-998877",
        status: "checked_in",
        checkedInAt: "2026-11-26T18:00:00Z",
        title: "Ceramics Workshop",
        customerId: "usr_elena",
        ticketPassId: "tpass_1",
      });
    };

    const res = await checkInUniversalQrRemote("biz_2", "TKT-998877");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.kind).toBe("ticket_pass");
      expect(res.data.code).toBe("TKT-998877");
      expect(res.data.title).toBe("Ceramics Workshop");
    }
    const post = requests.find((r) => r.url.endsWith("/api/v1/bookings/universal/businesses/biz_2/check-in"));
    expect(post?.body).toEqual({ checkInCode: "TKT-998877" });
  });

  it("addAddressRemote validates locally and persists remote address", async () => {
    const invalid = await addAddressRemote({ label: "Home", line1: "1", city: "", region: "WA", postalCode: "1", country: "US" });
    expect(invalid.ok).toBe(false);
    expect(requests.length).toBe(0);

    mockHandler = (url) => {
      if (url.endsWith("/api/v1/bootstrap")) return jsonResponse(EMPTY_BOOTSTRAP);
      return jsonResponse({
        id: "addr_99",
        userId: "usr_1",
        label: "Home",
        line1: "123 Pine St",
        city: "Seattle",
        region: "WA",
        postalCode: "98101",
        country: "United States",
        isDefault: true,
      });
    };

    const res = await addAddressRemote({
      label: "Home",
      line1: "123 Pine St",
      city: "Seattle",
      region: "WA",
      postalCode: "98101",
      country: "United States",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.id).toBe("addr_99");
    expect(requests.some((r) => r.url.endsWith("/api/v1/users/me/addresses"))).toBe(true);
  });

  it("sendBusinessMessageRemote and addReviewRemote post expected payloads and propagate errors", async () => {
    const shortMsg = await sendBusinessMessageRemote("biz_1", " ");
    expect(shortMsg.ok).toBe(false);
    expect(requests.length).toBe(0);

    const msgRes = await sendBusinessMessageRemote("biz_1", "Running 5 minutes late");
    expect(msgRes.ok).toBe(true);
    const msgPost = requests.find((r) => r.url.endsWith("/api/v1/businesses/biz_1/messages"));
    expect(msgPost?.body).toEqual({ body: "Running 5 minutes late" });

    mockHandler = () => jsonResponse({ detail: "Completed booking required" }, 403);
    const reviewFail = await addReviewRemote({
      businessId: "biz_1",
      rating: 5,
      title: "Great experience",
      body: "Loved the session and attentive service!",
    });
    expect(reviewFail.ok).toBe(false);
    if (!reviewFail.ok) expect(reviewFail.error).toBe("Completed booking required");
  });

  it("acceptWorkspaceInviteRemote, declineWorkspaceInviteRemote, and fetchAvailabilityRemote hit live endpoints", async () => {
    const acceptRes = await acceptWorkspaceInviteRemote("biz_10");
    expect(acceptRes.ok).toBe(true);
    expect(requests.some((r) => r.url.endsWith("/api/v1/workspaces/biz_10/team/accept") && r.method === "POST")).toBe(true);

    const declineRes = await declineWorkspaceInviteRemote("biz_11");
    expect(declineRes.ok).toBe(true);
    expect(requests.some((r) => r.url.endsWith("/api/v1/workspaces/biz_11/team/decline") && r.method === "POST")).toBe(true);

    mockHandler = () => jsonResponse({ slots: ["09:00", "10:30"] });
    const slotsRes = await fetchAvailabilityRemote("biz_10", "svc_1", "2026-12-01", "emp_1");
    expect(slotsRes.ok).toBe(true);
    if (slotsRes.ok) expect(slotsRes.data).toEqual(["09:00", "10:30"]);
    const availReq = requests.find((r) => r.url.includes("/api/v1/businesses/biz_10/availability?"));
    expect(availReq?.url).toContain("serviceId=svc_1");
    expect(availReq?.url).toContain("date=2026-12-01");
    expect(availReq?.url).toContain("employeeId=emp_1");
  });

  it("toggleFavoriteRemote, moveFavoriteRemote, changePasswordRemote, and deactivateAccountRemote call expected routes", async () => {
    const toggleRes = await toggleFavoriteRemote("product", "prd_1", "Gifts");
    expect(toggleRes.ok).toBe(true);
    const toggleReq = requests.find((r) => r.url.endsWith("/api/v1/users/me/favorites/toggle"));
    expect(toggleReq?.method).toBe("POST");
    expect(toggleReq?.body).toEqual({ targetType: "product", targetId: "prd_1", collection: "Gifts" });

    mockHandler = (url) => {
      if (url.endsWith("/api/v1/bootstrap")) return jsonResponse(EMPTY_BOOTSTRAP);
      return jsonResponse({
        id: "fav_1",
        userId: "usr_1",
        targetType: "product",
        targetId: "prd_1",
        collection: "Weekends",
        createdAt: "2026-11-28T10:00:00Z",
      });
    };
    const moveRes = await moveFavoriteRemote("fav_1", "Weekends");
    expect(moveRes.ok).toBe(true);
    if (moveRes.ok) expect(moveRes.data.collection).toBe("Weekends");
    const moveReq = requests.find((r) => r.url.endsWith("/api/v1/users/me/favorites/fav_1"));
    expect(moveReq?.method).toBe("PATCH");
    expect(moveReq?.body).toEqual({ collection: "Weekends" });

    const mismatchRes = await changePasswordRemote("OldPass123!", "NewPass123!", "Mismatch123!");
    expect(mismatchRes.ok).toBe(false);

    mockHandler = () => jsonResponse({ detail: "Incorrect current password" }, 400);
    const wrongPwRes = await changePasswordRemote("WrongPass123!", "NewPass123!", "NewPass123!");
    expect(wrongPwRes.ok).toBe(false);
    if (!wrongPwRes.ok) expect(wrongPwRes.error).toBe("Incorrect current password");

    mockHandler = () => jsonResponse({ ok: true, message: "Password changed" });
    const pwRes = await changePasswordRemote("OldPass123!", "NewPass123!", "NewPass123!");
    expect(pwRes.ok).toBe(true);
    const pwReq = requests.find((r) => r.url.endsWith("/api/v1/auth/change-password") && r.body?.currentPassword === "OldPass123!");
    expect(pwReq?.method).toBe("POST");
    expect(pwReq?.body).toEqual({
      currentPassword: "OldPass123!",
      newPassword: "NewPass123!",
      confirmPassword: "NewPass123!",
    });

    const deactRes = await deactivateAccountRemote();
    expect(deactRes.ok).toBe(true);
    expect(requests.some((r) => r.url.endsWith("/api/v1/auth/deactivate") && r.method === "POST")).toBe(true);
  });
});
