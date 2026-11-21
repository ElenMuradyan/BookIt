import type {
  Appointment,
  BookingModel,
  BusinessBookingConfig,
  CustomerProfile,
  EventOffering,
  EventSession,
  PaymentMethod,
  Resource,
  ResourceAvailability,
  UniversalBooking,
  UniversalBookingCreateInput,
  UniversalBookingStatus,
  UniversalCheckInResult,
  User,
  Workspace,
} from "@bookit/types";
import {
  businessApplicationSchema,
  fieldErrors,
  loginSchema,
  registerSchema,
  resetConfirmSchema,
  resetRequestSchema,
  type BusinessApplicationInput,
  type LoginInput,
  type RegisterInput,
} from "@bookit/validation";
import { apiJson } from "./http";
import { hydrateFromBackend, type ActionResult } from "./store";

export type RemoteAuthSession = {
  userId: string;
  businessId?: string | null;
  tokenType: string;
  expiresIn: number;
  accessToken?: string | null;
  refreshToken?: string | null;
  csrfToken?: string | null;
  user: User;
  profile?: CustomerProfile | null;
  workspaces: Workspace[];
};

function makeIdempotencyKey(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function fetchMeRemote(): Promise<ActionResult<RemoteAuthSession>> {
  const res = await apiJson<RemoteAuthSession>("/api/v1/auth/me", { method: "GET" });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  return { ok: true, data: res.data };
}

export async function loginRemote(input: LoginInput): Promise<ActionResult<RemoteAuthSession>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the form", fieldErrors: fieldErrors(parsed.error) };
  const res = await apiJson<RemoteAuthSession>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify(parsed.data),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  return { ok: true, data: res.data };
}

export async function loginBusinessRemote(input: LoginInput): Promise<ActionResult<RemoteAuthSession & { businessId: string }>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the form", fieldErrors: fieldErrors(parsed.error) };
  const res = await apiJson<RemoteAuthSession>("/api/v1/auth/login/business", {
    method: "POST",
    body: JSON.stringify(parsed.data),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  const businessId = res.data.businessId || res.data.workspaces[0]?.businessId;
  if (!businessId) {
    return {
      ok: false,
      error: "This account does not have a business workspace yet. Sign in as a customer or register a business.",
    };
  }
  return { ok: true, data: { ...res.data, businessId } };
}

export async function registerCustomerRemote(input: RegisterInput): Promise<ActionResult<RemoteAuthSession>> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the form", fieldErrors: fieldErrors(parsed.error) };
  const res = await apiJson<RemoteAuthSession>("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify(parsed.data),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  return { ok: true, data: res.data };
}

export async function submitBusinessApplicationRemote(
  input: BusinessApplicationInput & { applicantUserId?: string },
): Promise<ActionResult<{ businessId: string; userId: string; session?: RemoteAuthSession }>> {
  const parsed = businessApplicationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the form", fieldErrors: fieldErrors(parsed.error) };

  const res = await apiJson<{ id: string; businessId: string; applicantUserId: string }>("/api/v1/businesses/applications", {
    method: "POST",
    body: JSON.stringify(parsed.data),
    skipAuthRefresh: !input.applicantUserId,
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors, status: res.status };

  let session: RemoteAuthSession | undefined;
  if (!input.applicantUserId && parsed.data.ownerPassword) {
    const logged = await loginBusinessRemote({
      identifier: parsed.data.ownerEmail,
      password: parsed.data.ownerPassword,
      remember: true,
    });
    if (logged.ok) session = logged.data;
  } else {
    await hydrateFromBackend();
  }

  return {
    ok: true,
    data: {
      businessId: res.data.businessId,
      userId: res.data.applicantUserId,
      session,
    },
  };
}

export async function verifyContactRemote(code: string, identifier?: string): Promise<ActionResult> {
  const cleanedIdentifier = identifier?.trim();
  const payload: Record<string, string> = { code: code.trim() };
  if (cleanedIdentifier) {
    payload.identifier = cleanedIdentifier;
  }
  const res = await apiJson("/api/v1/auth/verify", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: undefined };
}

export async function verifyEmailTokenRemote(token: string): Promise<ActionResult> {
  const res = await apiJson("/api/v1/auth/verify-token", {
    method: "POST",
    body: JSON.stringify({ token: token.trim() }),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: undefined };
}

export async function resendVerificationRemote(
  identifier?: string,
): Promise<ActionResult<{ message: string }>> {
  const cleaned = identifier?.trim();
  const res = await apiJson<{ ok: boolean; message?: string }>("/api/v1/auth/verify/request", {
    method: "POST",
    body: cleaned ? JSON.stringify({ identifier: cleaned }) : undefined,
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  return {
    ok: true,
    data: {
      message:
        res.data.message ||
        "If an unverified account matches that email, verification instructions have been sent.",
    },
  };
}

export async function requestPasswordResetRemote(identifier: string): Promise<ActionResult<{ message: string }>> {
  const parsed = resetRequestSchema.safeParse({ identifier });
  if (!parsed.success) return { ok: false, error: "Check the form", fieldErrors: fieldErrors(parsed.error) };
  const res = await apiJson<{ ok: boolean; message?: string }>("/api/v1/auth/password-reset/request", {
    method: "POST",
    body: JSON.stringify(parsed.data),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  return {
    ok: true,
    data: { message: res.data.message || "If an account matches that identifier, reset instructions have been sent." },
  };
}

export async function confirmPasswordResetRemote(
  identifier: string,
  code: string,
  password: string,
  confirmPassword: string,
): Promise<ActionResult> {
  const parsed = resetConfirmSchema.safeParse({ code, password, confirmPassword });
  if (!parsed.success) return { ok: false, error: "Check the form", fieldErrors: fieldErrors(parsed.error) };
  const res = await apiJson("/api/v1/auth/password-reset/confirm", {
    method: "POST",
    body: JSON.stringify({ identifier, code, password, confirmPassword }),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  return { ok: true, data: undefined };
}

export async function logoutRemote(refreshToken?: string | null): Promise<void> {
  await apiJson("/api/v1/auth/logout", {
    method: "POST",
    body: refreshToken ? JSON.stringify({ refreshToken }) : undefined,
    skipAuthRefresh: true,
  });
}

export async function createAppointmentRemote(input: {
  customerId?: string;
  serviceId: string;
  employeeId: string;
  date: string;
  time: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
}): Promise<ActionResult<{ id: string }>> {
  const res = await apiJson<Appointment>("/api/v1/bookings", {
    method: "POST",
    body: JSON.stringify({
      customerId: input.customerId,
      serviceId: input.serviceId,
      employeeId: input.employeeId,
      date: input.date,
      time: input.time,
      paymentMethod: input.paymentMethod ?? "in_person",
      notes: input.notes?.trim() || undefined,
      idempotencyKey: makeIdempotencyKey("bk"),
    }),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: { id: res.data.id } };
}

export async function checkoutRemote(input: {
  addressId: string;
  deliveryMethod: "standard" | "express" | "pickup";
  paymentMethod: PaymentMethod;
  promoCode?: string;
}): Promise<ActionResult<{ orderIds: string[] }>> {
  const res = await apiJson<{ orderIds: string[]; checkoutGroupId: string }>("/api/v1/checkout", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: { orderIds: res.data.orderIds } };
}

export async function fetchAvailabilityRemote(
  businessId: string,
  serviceId: string,
  date: string,
  employeeId?: string,
): Promise<ActionResult<string[]>> {
  const qs = new URLSearchParams({ serviceId, date });
  if (employeeId) qs.set("employeeId", employeeId);
  const res = await apiJson<{ slots: string[] }>(
    `/api/v1/businesses/${encodeURIComponent(businessId)}/availability?${qs.toString()}`,
    { method: "GET" },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  return { ok: true, data: res.data.slots };
}

export async function checkInByQrRemote(
  businessId: string,
  checkInCode: string,
): Promise<ActionResult<Appointment>> {
  const res = await apiJson<Appointment>(
    `/api/v1/bookings/businesses/${encodeURIComponent(businessId)}/check-in`,
    {
      method: "POST",
      body: JSON.stringify({ checkInCode }),
    },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function fetchBookingConfigsRemote(businessId: string): Promise<ActionResult<BusinessBookingConfig[]>> {
  const res = await apiJson<BusinessBookingConfig[]>(
    `/api/v1/businesses/${encodeURIComponent(businessId)}/booking-configs`,
    { method: "GET" },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  return { ok: true, data: res.data };
}

export async function upsertBookingConfigRemote(
  businessId: string,
  bookingModel: BookingModel,
  payload: Omit<BusinessBookingConfig, "id" | "businessId" | "bookingModel">,
): Promise<ActionResult<BusinessBookingConfig>> {
  const res = await apiJson<BusinessBookingConfig>(
    `/api/v1/businesses/${encodeURIComponent(businessId)}/booking-configs/${encodeURIComponent(bookingModel)}`,
    { method: "PUT", body: JSON.stringify(payload) },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function fetchResourceAvailabilityRemote(
  businessId: string,
  resourceId: string,
  date: string,
): Promise<ActionResult<ResourceAvailability>> {
  const qs = new URLSearchParams({ date });
  const res = await apiJson<ResourceAvailability>(
    `/api/v1/businesses/${encodeURIComponent(businessId)}/resources/${encodeURIComponent(resourceId)}/availability?${qs.toString()}`,
    { method: "GET" },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  return { ok: true, data: res.data };
}

export async function createResourceRemote(
  businessId: string,
  payload: Partial<Resource> & Pick<Resource, "name" | "resourceType">,
): Promise<ActionResult<Resource>> {
  const res = await apiJson<Resource>(
    `/api/v1/businesses/${encodeURIComponent(businessId)}/resources`,
    { method: "POST", body: JSON.stringify(payload) },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function createOfferingRemote(
  businessId: string,
  payload: {
    bookingModel: "ticket" | "capacity";
    category: string;
    title: string;
    description: string;
    venueArea?: string;
    cancellationPolicy: string;
  },
): Promise<ActionResult<EventOffering>> {
  const res = await apiJson<EventOffering>(
    `/api/v1/businesses/${encodeURIComponent(businessId)}/offerings`,
    { method: "POST", body: JSON.stringify(payload) },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function createSessionRemote(
  businessId: string,
  offeringId: string,
  payload: {
    startAt: string;
    endAt: string;
    totalCapacity: number;
    maxPerBooking: number;
    tiers: { name: string; price: number; capacityLimit?: number; currency?: string }[];
  },
): Promise<ActionResult<EventSession>> {
  const res = await apiJson<EventSession>(
    `/api/v1/businesses/${encodeURIComponent(businessId)}/offerings/${encodeURIComponent(offeringId)}/sessions`,
    { method: "POST", body: JSON.stringify(payload) },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function createUniversalBookingRemote(
  input: UniversalBookingCreateInput,
): Promise<ActionResult<UniversalBooking>> {
  const res = await apiJson<UniversalBooking>("/api/v1/bookings/universal", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      idempotencyKey: input.idempotencyKey ?? makeIdempotencyKey("ubk"),
    }),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function setUniversalBookingStatusRemote(
  bookingId: string,
  status: UniversalBookingStatus,
  reason?: string,
): Promise<ActionResult<UniversalBooking>> {
  const res = await apiJson<UniversalBooking>(`/api/v1/bookings/universal/${encodeURIComponent(bookingId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, reason }),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function checkInUniversalQrRemote(
  businessId: string,
  checkInCode: string,
): Promise<ActionResult<UniversalCheckInResult>> {
  const res = await apiJson<UniversalCheckInResult>(
    `/api/v1/bookings/universal/businesses/${encodeURIComponent(businessId)}/check-in`,
    { method: "POST", body: JSON.stringify({ checkInCode }) },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}
