import type {
  Address,
  Advertisement,
  Appointment,
  AppointmentStatus,
  BookingModel,
  Business,
  BusinessApplication,
  BusinessBookingConfig,
  BusinessStatus,
  Campaign,
  Cart,
  CustomerNote,
  CustomerProfile,
  Employee,
  EventOffering,
  EventSession,
  Expense,
  Favorite,
  HotelStayAvailability,
  Membership,
  MembershipRole,
  NotificationPreferences,
  Order,
  OrderStatus,
  PaymentMethod,
  PlanId,
  Product,
  PromoCode,
  Report,
  Resource,
  ResourceAvailability,
  ResourceBlock,
  ResourceSearchItem,
  Review,
  Service,
  SessionAttendee,
  Subscription,
  TicketTier,
  UniversalBooking,
  UniversalBookingCreateInput,
  UniversalBookingStatus,
  UniversalCheckInResult,
  User,
  WeeklyHours,
  Workspace,
} from "@bookit/types";
import {
  addressSchema,
  businessApplicationSchema,
  expenseSchema,
  fieldErrors,
  loginSchema,
  productSchema,
  registerSchema,
  resetConfirmSchema,
  resetRequestSchema,
  resourceBlockSchema,
  reviewSchema,
  serviceSchema,
  ticketTierSchema,
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
): Promise<ActionResult<{ businessId: string; userId: string; session?: RemoteAuthSession; autoLoginError?: string }>> {
  const parsed = businessApplicationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the form", fieldErrors: fieldErrors(parsed.error) };

  const res = await apiJson<{ id: string; businessId: string; applicantUserId: string }>("/api/v1/businesses/applications", {
    method: "POST",
    body: JSON.stringify(parsed.data),
    skipAuthRefresh: !input.applicantUserId,
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors, status: res.status };

  let session: RemoteAuthSession | undefined;
  let autoLoginError: string | undefined;
  if (!input.applicantUserId && parsed.data.ownerPassword) {
    const logged = await loginBusinessRemote({
      identifier: parsed.data.ownerEmail,
      password: parsed.data.ownerPassword,
      remember: true,
    });
    if (logged.ok) {
      session = logged.data;
    } else {
      autoLoginError = logged.error;
    }
  } else {
    await hydrateFromBackend();
  }

  return {
    ok: true,
    data: {
      businessId: res.data.businessId,
      userId: res.data.applicantUserId,
      session,
      autoLoginError,
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

export async function setAppointmentStatusRemote(
  appointmentId: string,
  status: AppointmentStatus,
  reason?: string,
): Promise<ActionResult<Appointment>> {
  const res = await apiJson<Appointment>(`/api/v1/bookings/${encodeURIComponent(appointmentId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status, reason }),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function rescheduleAppointmentRemote(
  appointmentId: string,
  date: string,
  time: string,
): Promise<ActionResult<Appointment>> {
  const res = await apiJson<Appointment>(`/api/v1/bookings/${encodeURIComponent(appointmentId)}/reschedule`, {
    method: "POST",
    body: JSON.stringify({ date, time }),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function updateAppointmentNotesRemote(
  appointmentId: string,
  notes: string,
): Promise<ActionResult<Appointment>> {
  const res = await apiJson<Appointment>(`/api/v1/bookings/${encodeURIComponent(appointmentId)}/notes`, {
    method: "PATCH",
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
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

// Services (Appointments)
export async function saveServiceRemote(
  businessId: string,
  input: unknown,
  serviceId?: string,
): Promise<ActionResult<Service>> {
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the service fields", fieldErrors: fieldErrors(parsed.error) };
  }
  const path = serviceId
    ? `/api/v1/workspaces/${encodeURIComponent(businessId)}/services/${encodeURIComponent(serviceId)}`
    : `/api/v1/workspaces/${encodeURIComponent(businessId)}/services`;
  const res = await apiJson<Service>(path, {
    method: serviceId ? "PUT" : "POST",
    body: JSON.stringify(parsed.data),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function setServiceActiveRemote(
  businessId: string,
  serviceId: string,
  active: boolean,
): Promise<ActionResult<Service>> {
  const res = await apiJson<Service>(
    `/api/v1/workspaces/${encodeURIComponent(businessId)}/services/${encodeURIComponent(serviceId)}/active`,
    { method: "PATCH", body: JSON.stringify({ active }) },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function deleteServiceRemote(
  businessId: string,
  serviceId: string,
): Promise<ActionResult<{ message: string }>> {
  const res = await apiJson<{ ok: boolean; message?: string }>(
    `/api/v1/workspaces/${encodeURIComponent(businessId)}/services/${encodeURIComponent(serviceId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: { message: res.data.message || "Service removed" } };
}

export async function toggleEmployeeToServiceRemote(
  businessId: string,
  serviceId: string,
  employeeId: string,
): Promise<ActionResult<Service>> {
  const res = await apiJson<Service>(
    `/api/v1/workspaces/${encodeURIComponent(businessId)}/services/${encodeURIComponent(serviceId)}/employees/${encodeURIComponent(employeeId)}/toggle`,
    { method: "POST" },
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

export async function searchResourcesAvailabilityRemote(
  businessId: string,
  params: { date: string; time?: string; guests?: number; area?: string; resourceType?: string },
): Promise<ActionResult<ResourceSearchItem[]>> {
  const qs = new URLSearchParams({ date: params.date });
  if (params.time) qs.set("time", params.time);
  if (params.guests !== undefined) qs.set("guests", String(params.guests));
  if (params.area) qs.set("area", params.area);
  if (params.resourceType) qs.set("resourceType", params.resourceType);
  const res = await apiJson<ResourceSearchItem[]>(
    `/api/v1/businesses/${encodeURIComponent(businessId)}/resources/search?${qs.toString()}`,
    { method: "GET" },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  return { ok: true, data: res.data };
}

export async function fetchHotelStaysAvailabilityRemote(
  businessId: string,
  params: { checkIn: string; checkOut: string; guests?: number; roomType?: string },
): Promise<ActionResult<HotelStayAvailability>> {
  const qs = new URLSearchParams({ checkIn: params.checkIn, checkOut: params.checkOut });
  if (params.guests !== undefined) qs.set("guests", String(params.guests));
  if (params.roomType) qs.set("roomType", params.roomType);
  const res = await apiJson<HotelStayAvailability>(
    `/api/v1/businesses/${encodeURIComponent(businessId)}/stays/availability?${qs.toString()}`,
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

export async function updateResourceRemote(
  businessId: string,
  resourceId: string,
  payload: Partial<Resource>,
): Promise<ActionResult<Resource>> {
  const res = await apiJson<Resource>(
    `/api/v1/businesses/${encodeURIComponent(businessId)}/resources/${encodeURIComponent(resourceId)}`,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function setResourceActiveRemote(
  businessId: string,
  resourceId: string,
  active: boolean,
): Promise<ActionResult<Resource>> {
  return updateResourceRemote(businessId, resourceId, { active });
}

export async function listResourceBlocksRemote(
  businessId: string,
  resourceId?: string,
): Promise<ActionResult<ResourceBlock[]>> {
  const qs = resourceId ? `?resourceId=${encodeURIComponent(resourceId)}` : "";
  const res = await apiJson<ResourceBlock[]>(
    `/api/v1/businesses/${encodeURIComponent(businessId)}/resource-blocks${qs}`,
    { method: "GET" },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  return { ok: true, data: res.data };
}

export async function createResourceBlockRemote(
  businessId: string,
  resourceId: string,
  input: { startAt: string; endAt: string; unitsBlocked?: number; reason: string },
): Promise<ActionResult<ResourceBlock>> {
  const parsed = resourceBlockSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check block details", fieldErrors: fieldErrors(parsed.error) };
  }
  const res = await apiJson<ResourceBlock>(
    `/api/v1/businesses/${encodeURIComponent(businessId)}/resources/${encodeURIComponent(resourceId)}/blocks`,
    { method: "POST", body: JSON.stringify(parsed.data) },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function deleteResourceBlockRemote(
  businessId: string,
  resourceId: string,
  blockId: string,
): Promise<ActionResult<undefined>> {
  const res = await apiJson(
    `/api/v1/businesses/${encodeURIComponent(businessId)}/resources/${encodeURIComponent(resourceId)}/blocks/${encodeURIComponent(blockId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: undefined };
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

export async function updateOfferingRemote(
  businessId: string,
  offeringId: string,
  payload: Partial<{
    title: string;
    description: string;
    category: string;
    venueArea: string;
    cancellationPolicy: string;
    active: boolean;
  }>,
): Promise<ActionResult<EventOffering>> {
  const res = await apiJson<EventOffering>(
    `/api/v1/businesses/${encodeURIComponent(businessId)}/offerings/${encodeURIComponent(offeringId)}`,
    { method: "PATCH", body: JSON.stringify(payload) },
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

export async function addSessionTierRemote(
  businessId: string,
  sessionId: string,
  input: { name: string; description?: string; price: number; capacityLimit?: number; active?: boolean },
): Promise<ActionResult<TicketTier>> {
  const parsed = ticketTierSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check ticket tier details", fieldErrors: fieldErrors(parsed.error) };
  }
  const res = await apiJson<TicketTier>(
    `/api/v1/businesses/${encodeURIComponent(businessId)}/sessions/${encodeURIComponent(sessionId)}/tiers`,
    { method: "POST", body: JSON.stringify(parsed.data) },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function updateSessionTierRemote(
  businessId: string,
  sessionId: string,
  tierId: string,
  payload: Partial<{ name: string; description: string; price: number; capacityLimit: number; active: boolean }>,
): Promise<ActionResult<TicketTier>> {
  const res = await apiJson<TicketTier>(
    `/api/v1/businesses/${encodeURIComponent(businessId)}/sessions/${encodeURIComponent(sessionId)}/tiers/${encodeURIComponent(tierId)}`,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function fetchSessionAttendeesRemote(
  businessId: string,
  sessionId: string,
): Promise<ActionResult<SessionAttendee[]>> {
  const res = await apiJson<SessionAttendee[]>(
    `/api/v1/businesses/${encodeURIComponent(businessId)}/sessions/${encodeURIComponent(sessionId)}/attendees`,
    { method: "GET" },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  return { ok: true, data: res.data };
}

// Business profile, hours, holidays & blocked slots
export async function updateBusinessRemote(
  businessId: string,
  patch: Partial<
    Pick<
      Business,
      | "name"
      | "category"
      | "description"
      | "phone"
      | "email"
      | "website"
      | "cancellationPolicy"
      | "bookingApproval"
      | "address"
      | "city"
      | "timezone"
      | "minNoticeMinutes"
      | "maxAdvanceDays"
    >
  >,
): Promise<ActionResult<Business>> {
  const res = await apiJson<Business>(`/api/v1/businesses/${encodeURIComponent(businessId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function updateBusinessHoursRemote(
  businessId: string,
  hours: WeeklyHours,
): Promise<ActionResult<Business>> {
  const res = await apiJson<Business>(`/api/v1/businesses/${encodeURIComponent(businessId)}/hours`, {
    method: "PUT",
    body: JSON.stringify(hours),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function addBusinessHolidayRemote(
  businessId: string,
  date: string,
  name: string,
): Promise<ActionResult<Business>> {
  const res = await apiJson<Business>(`/api/v1/businesses/${encodeURIComponent(businessId)}/holidays`, {
    method: "POST",
    body: JSON.stringify({ date, name: name.trim() }),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function removeBusinessHolidayRemote(
  businessId: string,
  date: string,
): Promise<ActionResult<Business>> {
  const res = await apiJson<Business>(
    `/api/v1/businesses/${encodeURIComponent(businessId)}/holidays/${encodeURIComponent(date)}`,
    { method: "DELETE" },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function addBlockedSlotRemote(
  businessId: string,
  date: string,
  start: string,
  end: string,
  reason: string,
): Promise<ActionResult<Business>> {
  const res = await apiJson<Business>(`/api/v1/businesses/${encodeURIComponent(businessId)}/blocked`, {
    method: "POST",
    body: JSON.stringify({ date, start, end, reason: reason.trim() || "Blocked time" }),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function removeBlockedSlotRemote(
  businessId: string,
  blockId: string,
): Promise<ActionResult<Business>> {
  const res = await apiJson<Business>(
    `/api/v1/businesses/${encodeURIComponent(businessId)}/blocked/${encodeURIComponent(blockId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function inviteMemberRemote(
  businessId: string,
  email: string,
  role: MembershipRole,
  title: string,
): Promise<ActionResult<undefined>> {
  const res = await apiJson(`/api/v1/workspaces/${encodeURIComponent(businessId)}/team/invite`, {
    method: "POST",
    body: JSON.stringify({ email, role, title }),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: undefined };
}

export async function setMemberRoleRemote(
  businessId: string,
  membershipId: string,
  role: MembershipRole,
): Promise<ActionResult<undefined>> {
  const res = await apiJson(
    `/api/v1/workspaces/${encodeURIComponent(businessId)}/team/${encodeURIComponent(membershipId)}/role`,
    { method: "PATCH", body: JSON.stringify({ role }) },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: undefined };
}

export async function updateEmployeeAvailabilityRemote(
  businessId: string,
  employeeId: string,
  patch: Partial<Pick<Employee, "status" | "hours" | "title">>,
): Promise<ActionResult<Employee>> {
  const res = await apiJson<Employee>(
    `/api/v1/workspaces/${encodeURIComponent(businessId)}/employees/${encodeURIComponent(employeeId)}`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function createUniversalBookingRemote(
  input: UniversalBookingCreateInput,
): Promise<ActionResult<UniversalBooking>> {
  const { ticketItems, attendeeName, attendeeEmail: _attendeeEmail, ...rest } = input;
  const trimmedAttendee = attendeeName?.trim();
  const payload: Record<string, unknown> = {
    ...rest,
    idempotencyKey: input.idempotencyKey ?? makeIdempotencyKey("ubk"),
  };

  if (input.bookingModel === "ticket" || input.bookingModel === "capacity") {
    if (input.tickets && input.tickets.length > 0) {
      payload.tickets = input.tickets.map((t) => ({
        tierId: t.tierId,
        quantity: t.quantity,
        attendeeNames:
          t.attendeeNames && t.attendeeNames.length > 0
            ? t.attendeeNames
            : trimmedAttendee
              ? Array.from({ length: t.quantity }, () => trimmedAttendee)
              : [],
      }));
    } else if (ticketItems && ticketItems.length > 0) {
      payload.tickets = ticketItems.map((item) => ({
        tierId: item.tierId,
        quantity: item.quantity,
        attendeeNames: trimmedAttendee
          ? Array.from({ length: item.quantity }, () => trimmedAttendee)
          : [],
      }));
    }
    if (trimmedAttendee && (!input.attendeeNames || input.attendeeNames.length === 0)) {
      payload.attendeeNames = [trimmedAttendee];
    }
  }

  const res = await apiJson<UniversalBooking>("/api/v1/bookings/universal", {
    method: "POST",
    body: JSON.stringify(payload),
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

export async function addAddressRemote(input: unknown): Promise<ActionResult<Address>> {
  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the address", fieldErrors: fieldErrors(parsed.error) };
  }
  const res = await apiJson<Address>("/api/v1/users/me/addresses", {
    method: "POST",
    body: JSON.stringify(parsed.data),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function sendBusinessMessageRemote(
  businessId: string,
  body: string,
): Promise<ActionResult<undefined>> {
  const cleaned = body.trim();
  if (cleaned.length < 2) {
    return { ok: false, error: "Write a message" };
  }
  const res = await apiJson(`/api/v1/businesses/${encodeURIComponent(businessId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ body: cleaned }),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: undefined };
}

export async function addReviewRemote(input: {
  businessId: string;
  appointmentId?: string;
  productId?: string;
  rating: number;
  title: string;
  body: string;
}): Promise<ActionResult<Review>> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the review", fieldErrors: fieldErrors(parsed.error) };
  }
  const res = await apiJson<Review>("/api/v1/reviews", {
    method: "POST",
    body: JSON.stringify({
      businessId: input.businessId,
      appointmentId: input.appointmentId,
      productId: input.productId,
      rating: parsed.data.rating,
      title: parsed.data.title,
      body: parsed.data.body,
    }),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function acceptWorkspaceInviteRemote(businessId: string): Promise<ActionResult<Membership>> {
  const res = await apiJson<Membership>(
    `/api/v1/workspaces/${encodeURIComponent(businessId)}/team/accept`,
    { method: "POST" },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function declineWorkspaceInviteRemote(businessId: string): Promise<ActionResult<undefined>> {
  const res = await apiJson(
    `/api/v1/workspaces/${encodeURIComponent(businessId)}/team/decline`,
    { method: "POST" },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: undefined };
}

export async function setMemberStatusRemote(
  businessId: string,
  membershipId: string,
  status: "active" | "suspended",
): Promise<ActionResult<Membership>> {
  const res = await apiJson<Membership>(
    `/api/v1/workspaces/${encodeURIComponent(businessId)}/team/${encodeURIComponent(membershipId)}/status`,
    { method: "PATCH", body: JSON.stringify({ status }) },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function saveProductRemote(
  businessId: string,
  input: unknown,
  productId?: string,
): Promise<ActionResult<Product>> {
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the product fields", fieldErrors: fieldErrors(parsed.error) };
  }
  const path = productId
    ? `/api/v1/workspaces/${encodeURIComponent(businessId)}/products/${encodeURIComponent(productId)}`
    : `/api/v1/workspaces/${encodeURIComponent(businessId)}/products`;
  const res = await apiJson<Product>(path, {
    method: productId ? "PUT" : "POST",
    body: JSON.stringify(parsed.data),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function setProductActiveRemote(
  businessId: string,
  productId: string,
  active: boolean,
): Promise<ActionResult<Product>> {
  const res = await apiJson<Product>(
    `/api/v1/workspaces/${encodeURIComponent(businessId)}/products/${encodeURIComponent(productId)}/active`,
    { method: "PATCH", body: JSON.stringify({ active }) },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function setOrderStatusRemote(
  businessId: string,
  orderId: string,
  status: OrderStatus,
): Promise<ActionResult<Order>> {
  const res = await apiJson<Order>(
    `/api/v1/workspaces/${encodeURIComponent(businessId)}/orders/${encodeURIComponent(orderId)}`,
    { method: "PATCH", body: JSON.stringify({ status }) },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function addCustomerNoteRemote(
  businessId: string,
  customerId: string,
  body: string,
): Promise<ActionResult<CustomerNote>> {
  const cleaned = body.trim();
  if (cleaned.length < 2) {
    return { ok: false, error: "Write a note (at least 2 characters)" };
  }
  const res = await apiJson<CustomerNote>(
    `/api/v1/workspaces/${encodeURIComponent(businessId)}/notes`,
    { method: "POST", body: JSON.stringify({ customerId, body: cleaned }) },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function addExpenseRemote(
  businessId: string,
  input: unknown,
): Promise<ActionResult<Expense>> {
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Check the expense details", fieldErrors: fieldErrors(parsed.error) };
  }
  const res = await apiJson<Expense>(
    `/api/v1/workspaces/${encodeURIComponent(businessId)}/expenses`,
    { method: "POST", body: JSON.stringify(parsed.data) },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function saveCampaignRemote(
  businessId: string,
  campaign: Pick<Campaign, "name" | "channel" | "audience" | "message" | "startsOn">,
): Promise<ActionResult<Campaign>> {
  if (campaign.name.trim().length < 2) {
    return { ok: false, error: "Name the campaign" };
  }
  const res = await apiJson<Campaign>(
    `/api/v1/workspaces/${encodeURIComponent(businessId)}/campaigns`,
    { method: "POST", body: JSON.stringify(campaign) },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function savePromoRemote(
  businessId: string,
  code: string,
  percentOff: number,
  expiresOn: string,
): Promise<ActionResult<PromoCode>> {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(normalized)) {
    return { ok: false, error: "Use 4–12 letters or numbers" };
  }
  const res = await apiJson<PromoCode>(
    `/api/v1/workspaces/${encodeURIComponent(businessId)}/promos`,
    { method: "POST", body: JSON.stringify({ code: normalized, percentOff, expiresOn }) },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function changePlanRemote(
  businessId: string,
  planId: PlanId,
): Promise<ActionResult<Subscription>> {
  const res = await apiJson<Subscription>(
    `/api/v1/workspaces/${encodeURIComponent(businessId)}/subscription`,
    { method: "PATCH", body: JSON.stringify({ planId }) },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function markBusinessNotificationReadRemote(
  businessId: string,
  notificationId: string,
): Promise<ActionResult<undefined>> {
  const res = await apiJson(
    `/api/v1/workspaces/${encodeURIComponent(businessId)}/notifications/${encodeURIComponent(notificationId)}/read`,
    { method: "POST" },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: undefined };
}

export async function markAllBusinessNotificationsReadRemote(
  businessId: string,
): Promise<ActionResult<undefined>> {
  const res = await apiJson(
    `/api/v1/workspaces/${encodeURIComponent(businessId)}/notifications/read-all`,
    { method: "POST" },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: undefined };
}

export async function markNotificationReadRemote(notificationId: string): Promise<ActionResult<undefined>> {
  const res = await apiJson(`/api/v1/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: "POST",
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: undefined };
}

export async function markAllNotificationsReadRemote(): Promise<ActionResult<undefined>> {
  const res = await apiJson("/api/v1/notifications/read-all", { method: "POST" });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: undefined };
}

export async function updateProfileRemote(
  patch: Partial<
    Pick<
      User,
      "firstName" | "lastName" | "phone" | "location" | "language" | "interests" | "avatarUrl" | "dateOfBirth" | "gender"
    >
  >,
): Promise<ActionResult<User>> {
  const res = await apiJson<User>("/api/v1/users/me", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function setPersonalizationConsentRemote(consent: boolean): Promise<ActionResult<CustomerProfile>> {
  const res = await apiJson<CustomerProfile>("/api/v1/users/me/consent", {
    method: "PUT",
    body: JSON.stringify({ consent }),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function setThemeRemote(theme: "dark" | "light" | "system"): Promise<ActionResult<CustomerProfile>> {
  const res = await apiJson<CustomerProfile>("/api/v1/users/me/theme", {
    method: "PUT",
    body: JSON.stringify({ theme }),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function updateNotificationPrefsRemote(
  patch: Partial<NotificationPreferences>,
): Promise<ActionResult<CustomerProfile>> {
  const res = await apiJson<CustomerProfile>("/api/v1/users/me/notification-preferences", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function setSpendingVisibilityRemote(
  visibility: "recorded_only" | "include_estimates",
): Promise<ActionResult<CustomerProfile>> {
  const res = await apiJson<CustomerProfile>("/api/v1/users/me/spending-visibility", {
    method: "PUT",
    body: JSON.stringify({ visibility }),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function addToCartRemote(
  productId: string,
  quantity: number,
  variantId?: string,
): Promise<ActionResult<Cart>> {
  const res = await apiJson<Cart>("/api/v1/cart/items", {
    method: "POST",
    body: JSON.stringify({ productId, quantity, variantId }),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function setCartQuantityRemote(itemId: string, quantity: number): Promise<ActionResult<Cart>> {
  const res = await apiJson<Cart>(`/api/v1/cart/items/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    body: JSON.stringify({ quantity }),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function reviewApplicationRemote(
  applicationId: string,
  action: "approve" | "reject" | "request_info",
  note: string,
): Promise<ActionResult<BusinessApplication>> {
  const res = await apiJson<BusinessApplication>(
    `/api/v1/admin/applications/${encodeURIComponent(applicationId)}/review`,
    { method: "POST", body: JSON.stringify({ action, note }) },
  );
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function setBusinessStatusRemote(
  businessId: string,
  status: BusinessStatus,
): Promise<ActionResult<Business>> {
  const res = await apiJson<Business>(`/api/v1/admin/businesses/${encodeURIComponent(businessId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function setUserStatusRemote(
  userId: string,
  status: User["status"],
): Promise<ActionResult<User>> {
  const res = await apiJson<User>(`/api/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function moderateReviewRemote(
  reviewId: string,
  status: Review["status"],
): Promise<ActionResult<Review>> {
  const res = await apiJson<Review>(`/api/v1/admin/reviews/${encodeURIComponent(reviewId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function setAdvertisementStatusRemote(
  adId: string,
  status: Advertisement["status"],
): Promise<ActionResult<Advertisement>> {
  const res = await apiJson<Advertisement>(`/api/v1/admin/advertisements/${encodeURIComponent(adId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function setReportStatusRemote(
  reportId: string,
  status: Report["status"],
): Promise<ActionResult<Report>> {
  const res = await apiJson<Report>(`/api/v1/admin/reports/${encodeURIComponent(reportId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function toggleFavoriteRemote(
  targetType: Favorite["targetType"],
  targetId: string,
  collection = "Saved",
): Promise<ActionResult<undefined>> {
  const res = await apiJson("/api/v1/users/me/favorites/toggle", {
    method: "POST",
    body: JSON.stringify({ targetType, targetId, collection }),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: undefined };
}

export async function moveFavoriteRemote(
  favoriteId: string,
  collection: string,
): Promise<ActionResult<Favorite>> {
  const res = await apiJson<Favorite>(`/api/v1/users/me/favorites/${encodeURIComponent(favoriteId)}`, {
    method: "PATCH",
    body: JSON.stringify({ collection }),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  await hydrateFromBackend();
  return { ok: true, data: res.data };
}

export async function changePasswordRemote(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): Promise<ActionResult<undefined>> {
  if (!currentPassword || currentPassword.length < 8) {
    return { ok: false, error: "Enter your current password" };
  }
  if (!newPassword || newPassword.length < 8) {
    return { ok: false, error: "New password must be at least 8 characters" };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, error: "Passwords do not match" };
  }
  const res = await apiJson("/api/v1/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
  });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  return { ok: true, data: undefined };
}

export async function deactivateAccountRemote(): Promise<ActionResult<undefined>> {
  const res = await apiJson("/api/v1/auth/deactivate", { method: "POST" });
  if (!res.ok) return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  return { ok: true, data: undefined };
}

