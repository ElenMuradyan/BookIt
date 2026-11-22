import type {
  Appointment,
  AppointmentStatus,
  AppState,
  BookingModel,
  BusinessBookingConfig,
  BusinessCategory,
  BusinessStatus,
  Campaign,
  Employee,
  EventOffering,
  MembershipRole,
  OrderStatus,
  PaymentMethod,
  Product,
  Resource,
  Review,
  Service,
  UniversalBooking,
  UniversalBookingCreateInput,
  UniversalBookingStatus,
  UniversalCheckInResult,
  User,
  WeeklyHours,
} from "@bookit/types";
import { addDays, createSessionToken, sessionFlags } from "@bookit/utils";
import {
  addressSchema,
  bookingConfigSchema,
  businessApplicationSchema,
  eventOfferingSchema,
  eventSessionSchema,
  expenseSchema,
  fieldErrors,
  loginSchema,
  productSchema,
  registerSchema,
  resetConfirmSchema,
  resetRequestSchema,
  resourceSchema,
  reviewSchema,
  serviceSchema,
  type BusinessApplicationInput,
  type LoginInput,
  type RegisterInput,
} from "@bookit/validation";
import { createSeed } from "./seed";
import { apiJson, usingMocks } from "./http";
import { cartFor, workspacesFor } from "./queries";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; status?: number };

const DEMO_PASSWORD = "Demo1234!";

/** Passwords stay outside AppState so they are never rendered, logged, or stored in the browser. */
const passwords = new Map<string, string>([
  ["customer@bookit.demo", DEMO_PASSWORD],
  ["business@bookit.demo", DEMO_PASSWORD],
  ["employee@bookit.demo", DEMO_PASSWORD],
  ["admin@bookit.demo", DEMO_PASSWORD],
]);

const resetCodes = new Map<string, string>();

let state: AppState = createSeed();
const listeners = new Set<() => void>();
let seq = 500;
let lastSyncError: string | null = null;

export function getLastSyncError(): string | null {
  return lastSyncError;
}

export function clearLastSyncError(): void {
  lastSyncError = null;
  listeners.forEach((listener) => listener());
}

export function getState(): AppState {
  return state;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetDemoState(): void {
  state = createSeed();
  resetCodes.clear();
  lastSyncError = null;
  listeners.forEach((listener) => listener());
}

function commit(next: AppState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

export async function hydrateFromBackend(): Promise<ActionResult<{ hydrated: boolean }>> {
  if (usingMocks()) {
    return { ok: true, data: { hydrated: false } };
  }
  const res = await apiJson<AppState>("/api/v1/bootstrap", { method: "GET" });
  if (!res.ok) {
    lastSyncError = res.error;
    listeners.forEach((listener) => listener());
    return { ok: false, error: res.error, fieldErrors: res.fieldErrors };
  }
  lastSyncError = null;
  commit({
    ...res.data,
    bookingConfigs: res.data.bookingConfigs ?? [],
    resources: res.data.resources ?? [],
    eventOfferings: res.data.eventOfferings ?? [],
    bookings: res.data.bookings ?? [],
  });
  return { ok: true, data: { hydrated: true } };
}

function syncRemote(path: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body?: unknown): void {
  if (usingMocks()) return;
  void apiJson(path, {
    method,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }).then(async (res) => {
    if (!res.ok) {
      lastSyncError = res.error;
      await hydrateFromBackend();
      return;
    }
    lastSyncError = null;
    await hydrateFromBackend();
  });
}

function draft(mutate: (next: AppState) => void): void {
  const next = structuredClone(state);
  mutate(next);
  commit(next);
}

function nid(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq}`;
}

function fail(error: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

export function demoPasswordHint(): string {
  return DEMO_PASSWORD;
}

function identifierUser(identifier: string): User | undefined {
  const key = identifier.trim().toLowerCase();
  return state.users.find(
    (user) => user.email.toLowerCase() === key || user.username.toLowerCase() === key || user.phone === identifier.trim(),
  );
}

export function login(input: LoginInput): ActionResult<{ token: string; userId: string }> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return fail("Check the form", fieldErrors(parsed.error));
  const user = identifierUser(parsed.data.identifier);
  const password = user ? passwords.get(user.email.toLowerCase()) : undefined;
  if (!user || !password || password !== parsed.data.password) return fail("Email or password is incorrect");
  if (user.status === "suspended") return fail("This account is suspended");
  const flags = sessionFlags(user.isPlatformAdmin, workspacesFor(state, user.id).length > 0);
  return { ok: true, data: { token: createSessionToken(user.id, flags, Boolean(parsed.data.remember)), userId: user.id } };
}

export function loginBusiness(input: LoginInput): ActionResult<{ token: string; userId: string; businessId: string }> {
  const res = login(input);
  if (!res.ok) return res;
  const spaces = workspacesFor(state, res.data.userId);
  if (spaces.length === 0) {
    return fail("This account does not have a business workspace yet. Sign in as a customer or register a business.");
  }
  return { ok: true, data: { ...res.data, businessId: spaces[0]!.businessId } };
}

export function registerCustomer(input: RegisterInput): ActionResult<{ token: string; userId: string; code: string }> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return fail("Check the form", fieldErrors(parsed.error));
  const email = parsed.data.email.toLowerCase();
  if (state.users.some((user) => user.email.toLowerCase() === email || user.username.toLowerCase() === parsed.data.username.toLowerCase())) {
    return fail("An account already uses that email or username");
  }
  const id = nid("usr");
  const now = new Date().toISOString();
  const code = "482913";
  draft((next) => {
    next.users.push({
      id,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      username: parsed.data.username,
      email,
      phone: parsed.data.phone,
      dateOfBirth: parsed.data.dateOfBirth || undefined,
      gender: parsed.data.gender || undefined,
      location: parsed.data.location || undefined,
      language: parsed.data.language || "English",
      interests: parsed.data.interests ?? [],
      emailVerified: false,
      phoneVerified: false,
      status: "active",
      isPlatformAdmin: false,
      createdAt: now,
      updatedAt: now,
    });
    next.customerProfiles.push({
      userId: id,
      interests: parsed.data.interests ?? [],
      language: parsed.data.language || "English",
      marketingOptIn: false,
      personalizationConsent: Boolean(parsed.data.personalizationConsent),
      consentUpdatedAt: parsed.data.personalizationConsent ? now : undefined,
      spendingVisibility: "recorded_only",
      theme: "dark",
      notificationPreferences: { booking: true, order: true, promotion: false, message: true, security: true },
    });
    next.carts.push({ id: nid("cart"), userId: id, items: [], updatedAt: now });
  });
  passwords.set(email, parsed.data.password);
  resetCodes.set(email, code);
  return { ok: true, data: { token: createSessionToken(id, "", true), userId: id, code } };
}

export function verifyContact(userId: string, code: string): ActionResult {
  const user = state.users.find((item) => item.id === userId);
  if (!user) return fail("Account not found");
  const expected = resetCodes.get(user.email.toLowerCase()) ?? "482913";
  if (code !== expected) return fail("That code does not match");
  draft((next) => {
    const row = next.users.find((item) => item.id === userId);
    if (row) row.emailVerified = true;
  });
  return { ok: true, data: undefined };
}

export function requestPasswordReset(identifier: string): ActionResult<{ demoCode?: string }> {
  const parsed = resetRequestSchema.safeParse({ identifier });
  if (!parsed.success) return fail("Check the form", fieldErrors(parsed.error));
  const user = identifierUser(parsed.data.identifier);
  if (!user) return { ok: true, data: {} };
  const code = "482913";
  resetCodes.set(user.email.toLowerCase(), code);
  return { ok: true, data: { demoCode: code } };
}

export function confirmPasswordReset(identifier: string, code: string, password: string, confirmPassword: string): ActionResult {
  const parsed = resetConfirmSchema.safeParse({ code, password, confirmPassword });
  if (!parsed.success) return fail("Check the form", fieldErrors(parsed.error));
  const user = identifierUser(identifier);
  if (!user) return fail("Reset session expired");
  if (resetCodes.get(user.email.toLowerCase()) !== parsed.data.code) return fail("That code does not match");
  passwords.set(user.email.toLowerCase(), parsed.data.password);
  resetCodes.delete(user.email.toLowerCase());
  return { ok: true, data: undefined };
}

export function submitBusinessApplication(
  input: BusinessApplicationInput & { applicantUserId?: string },
): ActionResult<{ businessId: string; userId: string; token?: string }> {
  const parsed = businessApplicationSchema.safeParse(input);
  if (!parsed.success) return fail("Check the form", fieldErrors(parsed.error));
  const businessId = nid("biz");
  const now = new Date().toISOString();
  let ownerId = input.applicantUserId;
  const ownerEmail = parsed.data.ownerEmail.trim().toLowerCase();
  let createdNewAccount = false;

  if (!ownerId) {
    const existing = state.users.find((user) => user.email.toLowerCase() === ownerEmail);
    if (existing) {
      return {
        ok: false,
        error: "An account already exists for that owner email. Please sign in first.",
        status: 401,
      };
    }
    if (!parsed.data.ownerPassword) {
      return fail("Create an owner password to sign in to your business workspace", {
        ownerPassword: "Create an owner password (8+ characters with upper, lower, number, symbol)",
      });
    }
    ownerId = nid("usr");
    createdNewAccount = true;
    const [firstName, ...rest] = parsed.data.ownerName.trim().split(" ");
    draft((next) => {
      next.users.push({
        id: ownerId!,
        firstName: firstName || "Owner",
        lastName: rest.join(" ") || "Account",
        username: `owner_${seq}`,
        email: ownerEmail,
        phone: parsed.data.ownerPhone,
        language: "English",
        interests: [],
        emailVerified: false,
        phoneVerified: false,
        status: "active",
        isPlatformAdmin: false,
        createdAt: now,
        updatedAt: now,
      });
      next.customerProfiles.push({
        userId: ownerId!,
        interests: [],
        language: "English",
        marketingOptIn: false,
        personalizationConsent: false,
        spendingVisibility: "recorded_only",
        theme: "dark",
        notificationPreferences: { booking: true, order: true, promotion: false, message: true, security: true },
      });
      next.carts.push({ id: nid("cart"), userId: ownerId!, items: [], updatedAt: now });
    });
    passwords.set(ownerEmail, parsed.data.ownerPassword!);
  }
  draft((next) => {
    next.businesses.push({
      id: businessId,
      ownerUserId: ownerId!,
      name: parsed.data.businessName,
      legalName: parsed.data.legalName,
      category: (parsed.data.category as BusinessCategory) || "other",
      description: parsed.data.description,
      country: parsed.data.country,
      city: parsed.data.city,
      address: parsed.data.address,
      location: {
        id: nid("loc"),
        label: "Primary",
        line1: parsed.data.address,
        city: parsed.data.city,
        region: "",
        postalCode: "",
        country: parsed.data.country,
        geo: { lat: 47.6, lng: -122.33 },
      },
      phone: parsed.data.phone,
      email: parsed.data.email,
      website: parsed.data.website || undefined,
      socials: [],
      gallery: [],
      hours: {
        mon: { closed: false, open: "09:00", close: "17:00" },
        tue: { closed: false, open: "09:00", close: "17:00" },
        wed: { closed: false, open: "09:00", close: "17:00" },
        thu: { closed: false, open: "09:00", close: "17:00" },
        fri: { closed: false, open: "09:00", close: "17:00" },
        sat: { closed: true, open: "00:00", close: "00:00" },
        sun: { closed: true, open: "00:00", close: "00:00" },
      },
      rating: 0,
      reviewCount: 0,
      priceLevel: 2,
      status: "submitted",
      isPublic: false,
      distanceMiles: 0,
      tags: [],
      holidays: [],
      blocked: [],
      cancellationPolicy: "Free cancellation up to 24 hours before the appointment.",
      bookingApproval: "automatic",
      createdAt: now,
      updatedAt: now,
    });
    next.applications.push({
      id: nid("app"),
      businessId,
      applicantUserId: ownerId!,
      status: "submitted",
      submittedAt: now,
      documents: [{ id: nid("doc"), name: "Verification packet.pdf", kind: "license", state: "placeholder" }],
    });
    next.memberships.push({
      id: nid("mem"),
      userId: ownerId!,
      businessId,
      role: "owner",
      status: "active",
      title: "Owner",
      createdAt: now,
    });
    next.notifications.unshift({
      id: nid("ntf"),
      userId: ownerId!,
      businessId,
      category: "message",
      title: "Business application submitted",
      body: `${parsed.data.businessName} is queued for platform review. You can configure services and hours now.`,
      read: false,
      createdAt: now,
      href: "/workspace/settings",
    });
  });
  const owner = state.users.find((u) => u.id === ownerId);
  const token =
    createdNewAccount || input.applicantUserId
      ? createSessionToken(ownerId!, sessionFlags(Boolean(owner?.isPlatformAdmin), true), true)
      : undefined;
  return { ok: true, data: { businessId, userId: ownerId!, token } };
}

export function updateProfile(
  userId: string,
  patch: Partial<Pick<User, "firstName" | "lastName" | "phone" | "location" | "language" | "interests" | "avatarUrl" | "dateOfBirth" | "gender">>,
): ActionResult {
  draft((next) => {
    const user = next.users.find((item) => item.id === userId);
    if (!user) return;
    Object.assign(user, patch, { updatedAt: new Date().toISOString() });
    const profile = next.customerProfiles.find((item) => item.userId === userId);
    if (profile) {
      if (patch.language) profile.language = patch.language;
      if (patch.interests) profile.interests = patch.interests;
    }
  });
  syncRemote("/api/v1/users/me", "PATCH", patch);
  return { ok: true, data: undefined };
}

export function setPersonalizationConsent(userId: string, consent: boolean): ActionResult {
  draft((next) => {
    const profile = next.customerProfiles.find((item) => item.userId === userId);
    if (profile) {
      profile.personalizationConsent = consent;
      profile.consentUpdatedAt = new Date().toISOString();
    }
  });
  syncRemote("/api/v1/users/me/consent", "PUT", { consent });
  return { ok: true, data: undefined };
}

export function setTheme(userId: string, theme: "dark" | "light" | "system"): ActionResult {
  draft((next) => {
    const profile = next.customerProfiles.find((item) => item.userId === userId);
    if (profile) profile.theme = theme;
  });
  syncRemote("/api/v1/users/me/theme", "PUT", { theme });
  return { ok: true, data: undefined };
}

export function updateNotificationPrefs(userId: string, patch: Partial<AppState["customerProfiles"][number]["notificationPreferences"]>): ActionResult {
  draft((next) => {
    const profile = next.customerProfiles.find((item) => item.userId === userId);
    if (profile) profile.notificationPreferences = { ...profile.notificationPreferences, ...patch };
  });
  syncRemote("/api/v1/users/me/notification-preferences", "PATCH", patch);
  return { ok: true, data: undefined };
}

export function setSpendingVisibility(userId: string, value: "recorded_only" | "include_estimates"): ActionResult {
  draft((next) => {
    const profile = next.customerProfiles.find((item) => item.userId === userId);
    if (profile) profile.spendingVisibility = value;
  });
  syncRemote("/api/v1/users/me/spending-visibility", "PUT", { visibility: value });
  return { ok: true, data: undefined };
}

export function addAddress(userId: string, input: unknown): ActionResult {
  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) return fail("Check the address", fieldErrors(parsed.error));
  draft((next) => {
    const isFirst = !next.addresses.some((address) => address.userId === userId);
    next.addresses.push({ id: nid("addr"), userId, ...parsed.data, isDefault: isFirst });
  });
  syncRemote("/api/v1/users/me/addresses", "POST", parsed.data);
  return { ok: true, data: undefined };
}

export function toggleFavorite(userId: string, targetType: AppState["favorites"][number]["targetType"], targetId: string, collection = "Saved"): ActionResult {
  draft((next) => {
    const index = next.favorites.findIndex((favorite) => favorite.userId === userId && favorite.targetId === targetId && favorite.targetType === targetType);
    if (index >= 0) next.favorites.splice(index, 1);
    else next.favorites.push({ id: nid("fav"), userId, targetType, targetId, collection, createdAt: new Date().toISOString() });
  });
  syncRemote("/api/v1/users/me/favorites/toggle", "POST", { targetType, targetId, collection });
  return { ok: true, data: undefined };
}

export function moveFavorite(userId: string, favoriteId: string, collection: string): ActionResult {
  draft((next) => {
    const favorite = next.favorites.find((item) => item.id === favoriteId && item.userId === userId);
    if (favorite) favorite.collection = collection;
  });
  syncRemote(`/api/v1/users/me/favorites/${encodeURIComponent(favoriteId)}`, "PATCH", { collection });
  return { ok: true, data: undefined };
}

export function addToCart(userId: string, productId: string, quantity: number, variantId?: string): ActionResult {
  const product = state.products.find((item) => item.id === productId && item.active);
  if (!product) return fail("That product is not available");
  const variant = variantId ? product.variants.find((item) => item.id === variantId) : undefined;
  if (variantId && !variant) return fail("Choose an available option");
  const stock = variant ? variant.stock : product.stock;
  const existingQty = cartFor(state, userId)?.items.find((item) => item.productId === productId && item.variantId === variantId)?.quantity ?? 0;
  if (quantity < 1 || existingQty + quantity > stock) return fail("Not enough stock");
  draft((next) => {
    let cart = next.carts.find((item) => item.userId === userId);
    if (!cart) {
      cart = { id: nid("cart"), userId, items: [], updatedAt: new Date().toISOString() };
      next.carts.push(cart);
    }
    const existing = cart.items.find((item) => item.productId === productId && item.variantId === variantId);
    if (existing) existing.quantity += quantity;
    else cart.items.push({ id: nid("ci"), productId, variantId, quantity, sellerId: product.businessId });
    cart.updatedAt = new Date().toISOString();
  });
  syncRemote("/api/v1/cart/items", "POST", { productId, quantity, variantId });
  return { ok: true, data: undefined };
}

export function setCartQuantity(userId: string, itemId: string, quantity: number): ActionResult {
  draft((next) => {
    const cart = next.carts.find((item) => item.userId === userId);
    if (!cart) return;
    const line = cart.items.find((item) => item.id === itemId);
    if (!line) return;
    if (quantity <= 0) cart.items = cart.items.filter((item) => item.id !== itemId);
    else line.quantity = quantity;
    cart.updatedAt = new Date().toISOString();
  });
  syncRemote(`/api/v1/cart/items/${encodeURIComponent(itemId)}`, "PATCH", { quantity });
  return { ok: true, data: undefined };
}

export function checkout(input: {
  userId: string;
  addressId: string;
  deliveryMethod: "standard" | "express" | "pickup";
  paymentMethod: PaymentMethod;
}): ActionResult<{ orderIds: string[] }> {
  const cart = cartFor(state, input.userId);
  if (!cart || cart.items.length === 0) return fail("Your cart is empty");
  const address = state.addresses.find((item) => item.id === input.addressId && item.userId === input.userId);
  if (!address) return fail("Choose a delivery address");
  const orderIds: string[] = [];
  const group = nid("chk");
  const fee = input.deliveryMethod === "express" ? 12 : input.deliveryMethod === "standard" ? 6 : 0;
  draft((next) => {
    const liveCart = next.carts.find((item) => item.userId === input.userId);
    if (!liveCart) return;
    const sellers = [...new Set(liveCart.items.map((item) => item.sellerId))];
    for (const sellerId of sellers) {
      const lines = liveCart.items.filter((item) => item.sellerId === sellerId);
      const items = lines.map((line) => {
        const product = next.products.find((item) => item.id === line.productId) as Product;
        const variant = product.variants.find((item) => item.id === line.variantId);
        const unitPrice = product.price + (variant?.priceDelta ?? 0);
        if (variant) variant.stock = Math.max(0, variant.stock - line.quantity);
        product.stock = Math.max(0, product.stock - line.quantity);
        return {
          id: nid("oi"),
          productId: product.id,
          variantId: line.variantId,
          name: variant ? `${product.name} · ${variant.label}` : product.name,
          quantity: line.quantity,
          unitPrice,
          sellerId,
        };
      });
      const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      const id = nid("ord");
      orderIds.push(id);
      const now = new Date().toISOString();
      next.orders.unshift({
        id,
        checkoutGroupId: group,
        userId: input.userId,
        sellerId,
        items,
        status: "pending",
        paymentStatus: "authorized_demo",
        paymentMethod: input.paymentMethod,
        subtotal,
        deliveryFee: fee,
        total: subtotal + fee,
        currency: "USD",
        addressId: input.addressId,
        deliveryMethod: input.deliveryMethod,
        trackingPlaceholder: "Tracking appears when the seller ships",
        createdAt: now,
        updatedAt: now,
      });
      next.payments.push({
        id: nid("pay"),
        payerId: input.userId,
        businessId: sellerId,
        amount: subtotal + fee,
        currency: "USD",
        status: "recorded",
        method: input.paymentMethod,
        referenceType: "order",
        referenceId: id,
        createdAt: now,
        note: "Authorized in the demo. Card numbers are never collected.",
      });
      const seller = next.businesses.find((item) => item.id === sellerId);
      next.notifications.unshift({
        id: nid("ntf"),
        userId: input.userId,
        businessId: sellerId,
        category: "order",
        title: "Order placed",
        body: `${seller?.name ?? "Seller"} received your order.`,
        read: false,
        createdAt: now,
        href: `/orders/${id}`,
      });
    }
    liveCart.items = [];
  });
  return { ok: true, data: { orderIds } };
}

export function createAppointment(input: {
  customerId: string;
  serviceId: string;
  employeeId: string;
  date: string;
  time: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
}): ActionResult<{ id: string }> {
  const service = state.services.find((item) => item.id === input.serviceId && item.active);
  if (!service) return fail("Service unavailable");
  const employee = state.employees.find((item) => item.id === input.employeeId && item.businessId === service.businessId);
  if (!employee) return fail("Choose a team member");
  const business = state.businesses.find((item) => item.id === service.businessId);
  if (!business?.isPublic && business?.ownerUserId !== input.customerId) {
    const staff = state.memberships.some((item) => item.userId === input.customerId && item.businessId === service.businessId);
    if (!business?.isPublic && !staff) return fail("This business is not open for booking");
  }
  const start = new Date(`${input.date}T${input.time}:00`);
  const end = new Date(start.getTime() + service.durationMinutes * 60 * 1000);
  const status: AppointmentStatus = service.requiresApproval || business?.bookingApproval === "manual" ? "pending" : "confirmed";
  const id = nid("apt");
  const paymentMethod: PaymentMethod = input.paymentMethod ?? "in_person";
  draft((next) => {
    const now = new Date().toISOString();
    const customer = next.users.find((u) => u.id === input.customerId);
    const customerName = customer ? `${customer.firstName} ${customer.lastName}` : "Customer";
    const startIso = `${input.date}T${input.time}:00`;
    const endIso = `${input.date}T${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}:00`;
    const bookingId = nid("bk");
    const checkInCode = `BK-${id.toUpperCase().slice(-6)}`;
    next.appointments.push({
      id,
      bookingId,
      businessId: service.businessId,
      serviceId: service.id,
      employeeId: employee.id,
      customerId: input.customerId,
      start: startIso,
      end: endIso,
      status,
      price: service.price,
      currency: "USD",
      paymentStatus: paymentMethod === "wallet" ? "paid" : "unpaid",
      paymentMethod,
      confirmationMode: status === "pending" ? "manual" : "automatic",
      notes: input.notes?.trim() || undefined,
      checkInCode,
      createdAt: now,
    });
    next.bookings = next.bookings ?? [];
    next.bookings.unshift({
      id: bookingId,
      businessId: service.businessId,
      customerId: input.customerId,
      bookingModel: "appointment",
      title: service.name,
      startAt: startIso,
      endAt: endIso,
      timezone: "America/Los_Angeles",
      quantity: 1,
      status,
      confirmationMode: status === "pending" ? "manual" : "automatic",
      subtotalAmount: service.price,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: service.price,
      depositDueAmount: service.depositAmount ?? 0,
      amountPaid: paymentMethod === "wallet" ? service.price : 0,
      refundedAmount: 0,
      currency: "USD",
      paymentStatus: paymentMethod === "wallet" ? "paid" : "unpaid",
      paymentMethod,
      cancellationPolicySnapshot: service.cancellationPolicy,
      notes: input.notes?.trim() || undefined,
      checkInCode,
      createdAt: now,
      updatedAt: now,
      legacyAppointmentId: id,
      resourceAllocations: [],
      ticketPasses: [],
    });
    next.notifications.unshift({
      id: nid("ntf"),
      userId: input.customerId,
      businessId: service.businessId,
      category: "booking",
      title: status === "pending" ? "Request sent" : "Booking confirmed",
      body: `${service.name} · ${input.date} ${input.time}`,
      read: false,
      createdAt: now,
      href: `/bookings/${id}`,
    });
    if (business && business.ownerUserId !== input.customerId) {
      next.notifications.unshift({
        id: nid("ntf"),
        userId: business.ownerUserId,
        businessId: service.businessId,
        category: "booking",
        title: status === "pending" ? "New booking request" : "New booking confirmed",
        body: `${customerName} booked ${service.name} for ${input.date} at ${input.time}.`,
        read: false,
        createdAt: now,
        href: "/workspace/bookings",
      });
    }
  });
  return { ok: true, data: { id } };
}

export function setAppointmentStatus(id: string, status: AppointmentStatus, actorUserId: string): ActionResult {
  const appointment = state.appointments.find((item) => item.id === id);
  if (!appointment) return fail("Booking not found");
  const isCustomer = appointment.customerId === actorUserId;
  const member = state.memberships.find((item) => item.userId === actorUserId && item.businessId === appointment.businessId && item.status === "active");
  if (!isCustomer && !member) return fail("You cannot change this booking");
  if (isCustomer && !["cancelled"].includes(status)) return fail("Customers can cancel from this screen");
  draft((next) => {
    const row = next.appointments.find((item) => item.id === id);
    if (!row) return;
    row.status = status;
    if (row.bookingId && next.bookings) {
      const linked = next.bookings.find((b) => b.id === row.bookingId || b.legacyAppointmentId === row.id);
      if (linked) {
        linked.status = status;
        linked.updatedAt = new Date().toISOString();
      }
    }
    const now = new Date().toISOString();
    const business = next.businesses.find((b) => b.id === row.businessId);
    const service = next.services.find((s) => s.id === row.serviceId);
    if (isCustomer && business) {
      next.notifications.unshift({
        id: nid("ntf"),
        userId: business.ownerUserId,
        businessId: row.businessId,
        category: "booking",
        title: "Booking cancelled by customer",
        body: `${service?.name ?? "Appointment"} (${row.start.slice(0, 16).replace("T", " ")}) was cancelled.`,
        read: false,
        createdAt: now,
        href: "/workspace/bookings",
      });
    } else if (!isCustomer) {
      next.notifications.unshift({
        id: nid("ntf"),
        userId: row.customerId,
        businessId: row.businessId,
        category: "booking",
        title: `Booking ${status.replaceAll("_", " ")}`,
        body: `${service?.name ?? "Your appointment"} at ${business?.name ?? "Business"} is now ${status.replaceAll("_", " ")}.`,
        read: false,
        createdAt: now,
        href: `/bookings/${row.id}`,
      });
    }
  });
  syncRemote(`/api/v1/bookings/${encodeURIComponent(id)}/status`, "PATCH", { status });
  return { ok: true, data: undefined };
}

export function rescheduleAppointment(id: string, date: string, time: string, actorUserId: string): ActionResult {
  const appointment = state.appointments.find((item) => item.id === id);
  if (!appointment) return fail("Booking not found");
  const service = state.services.find((item) => item.id === appointment.serviceId);
  if (!service) return fail("Service missing");
  const allowed =
    appointment.customerId === actorUserId ||
    state.memberships.some((item) => item.userId === actorUserId && item.businessId === appointment.businessId);
  if (!allowed) return fail("You cannot reschedule this booking");
  const end = new Date(new Date(`${date}T${time}:00`).getTime() + service.durationMinutes * 60 * 1000);
  draft((next) => {
    const row = next.appointments.find((item) => item.id === id);
    if (!row) return;
    row.start = `${date}T${time}:00`;
    row.end = `${date}T${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}:00`;
    row.status = row.confirmationMode === "manual" ? "pending" : "confirmed";
    const now = new Date().toISOString();
    const business = next.businesses.find((b) => b.id === row.businessId);
    const isCustomer = row.customerId === actorUserId;
    next.notifications.unshift({
      id: nid("ntf"),
      userId: isCustomer && business ? business.ownerUserId : row.customerId,
      businessId: row.businessId,
      category: "booking",
      title: "Booking rescheduled",
      body: `${service.name} moved to ${date} at ${time}.`,
      read: false,
      createdAt: now,
      href: isCustomer ? "/workspace/bookings" : `/bookings/${row.id}`,
    });
  });
  syncRemote(`/api/v1/bookings/${encodeURIComponent(id)}/reschedule`, "POST", { date, time });
  return { ok: true, data: undefined };
}

export function updateAppointmentNotes(businessId: string, appointmentId: string, notes: string): ActionResult {
  draft((next) => {
    const row = next.appointments.find((item) => item.id === appointmentId && item.businessId === businessId);
    if (row) row.notes = notes.trim() || undefined;
  });
  syncRemote(`/api/v1/bookings/${encodeURIComponent(appointmentId)}/notes`, "PATCH", { notes });
  return { ok: true, data: undefined };
}

export function addReview(input: { authorId: string; businessId: string; appointmentId?: string; rating: number; title: string; body: string }): ActionResult {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return fail("Check the review", fieldErrors(parsed.error));
  draft((next) => {
    next.reviews.unshift({
      id: nid("rev"),
      businessId: input.businessId,
      authorId: input.authorId,
      appointmentId: input.appointmentId,
      rating: parsed.data.rating,
      title: parsed.data.title,
      body: parsed.data.body,
      createdAt: new Date().toISOString(),
      status: "published",
    });
    const business = next.businesses.find((item) => item.id === input.businessId);
    if (business) {
      const rows = next.reviews.filter((review) => review.businessId === business.id && review.status === "published");
      business.reviewCount = rows.length;
      business.rating = Math.round((rows.reduce((sum, review) => sum + review.rating, 0) / rows.length) * 10) / 10;
    }
  });
  syncRemote("/api/v1/reviews", "POST", {
    businessId: input.businessId,
    appointmentId: input.appointmentId,
    rating: parsed.data.rating,
    title: parsed.data.title,
    body: parsed.data.body,
  });
  return { ok: true, data: undefined };
}

export function markNotificationRead(id: string, userId: string): ActionResult {
  draft((next) => {
    const row = next.notifications.find((item) => item.id === id && item.userId === userId);
    if (row) row.read = true;
  });
  syncRemote(`/api/v1/notifications/${encodeURIComponent(id)}/read`, "POST");
  return { ok: true, data: undefined };
}

export function markAllNotificationsRead(userId: string): ActionResult {
  draft((next) => {
    next.notifications.forEach((item) => {
      if (item.userId === userId) item.read = true;
    });
  });
  syncRemote("/api/v1/notifications/read-all", "POST");
  return { ok: true, data: undefined };
}

export function saveService(businessId: string, input: unknown, serviceId?: string): ActionResult {
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) return fail("Check the service", fieldErrors(parsed.error));
  draft((next) => {
    if (serviceId) {
      const row = next.services.find((item) => item.id === serviceId && item.businessId === businessId);
      if (row) Object.assign(row, parsed.data);
      return;
    }
    const service: Service = {
      id: nid("svc"),
      businessId,
      ...parsed.data,
      currency: "USD",
      employeeIds: [],
      active: true,
      requiresApproval: false,
    };
    next.services.push(service);
  });
  if (serviceId) {
    syncRemote(`/api/v1/workspaces/${encodeURIComponent(businessId)}/services/${encodeURIComponent(serviceId)}`, "PUT", parsed.data);
  } else {
    syncRemote(`/api/v1/workspaces/${encodeURIComponent(businessId)}/services`, "POST", parsed.data);
  }
  return { ok: true, data: undefined };
}

export function setServiceActive(businessId: string, serviceId: string, active: boolean): ActionResult {
  draft((next) => {
    const row = next.services.find((item) => item.id === serviceId && item.businessId === businessId);
    if (row) row.active = active;
  });
  syncRemote(`/api/v1/workspaces/${encodeURIComponent(businessId)}/services/${encodeURIComponent(serviceId)}/active`, "PATCH", { active });
  return { ok: true, data: undefined };
}

export function assignEmployeeToService(businessId: string, serviceId: string, employeeId: string): ActionResult {
  draft((next) => {
    const service = next.services.find((item) => item.id === serviceId && item.businessId === businessId);
    const employee = next.employees.find((item) => item.id === employeeId && item.businessId === businessId);
    if (!service || !employee) return;
    if (!service.employeeIds.includes(employeeId)) service.employeeIds.push(employeeId);
    if (!employee.serviceIds.includes(serviceId)) employee.serviceIds.push(serviceId);
  });
  syncRemote(`/api/v1/workspaces/${encodeURIComponent(businessId)}/services/${encodeURIComponent(serviceId)}/employees/${encodeURIComponent(employeeId)}/toggle`, "POST");
  return { ok: true, data: undefined };
}

export function toggleEmployeeToService(businessId: string, serviceId: string, employeeId: string): ActionResult {
  draft((next) => {
    const service = next.services.find((item) => item.id === serviceId && item.businessId === businessId);
    const employee = next.employees.find((item) => item.id === employeeId && item.businessId === businessId);
    if (!service || !employee) return;
    const assigned = service.employeeIds.includes(employeeId);
    if (assigned) {
      service.employeeIds = service.employeeIds.filter((id) => id !== employeeId);
      employee.serviceIds = employee.serviceIds.filter((id) => id !== serviceId);
    } else {
      service.employeeIds.push(employeeId);
      if (!employee.serviceIds.includes(serviceId)) employee.serviceIds.push(serviceId);
    }
  });
  syncRemote(`/api/v1/workspaces/${encodeURIComponent(businessId)}/services/${encodeURIComponent(serviceId)}/employees/${encodeURIComponent(employeeId)}/toggle`, "POST");
  return { ok: true, data: undefined };
}

export function inviteMember(businessId: string, email: string, role: MembershipRole, title: string): ActionResult {
  const user = state.users.find((item) => item.email.toLowerCase() === email.toLowerCase());
  if (usingMocks()) {
    if (!user) return fail("No BookIt account uses that email yet");
    if (state.memberships.some((item) => item.userId === user.id && item.businessId === businessId && item.status !== "suspended")) {
      return fail("That person is already in this workspace");
    }
  }
  if (user) {
    draft((next) => {
      next.memberships.push({
        id: nid("mem"),
        userId: user.id,
        businessId,
        role,
        status: "invited",
        title,
        createdAt: new Date().toISOString(),
      });
      next.notifications.unshift({
        id: nid("ntf"),
        userId: user.id,
        businessId,
        category: "message",
        title: "Workspace invite",
        body: `You were invited as ${role}.`,
        read: false,
        createdAt: new Date().toISOString(),
        href: "/account",
      });
    });
  }
  syncRemote(`/api/v1/workspaces/${encodeURIComponent(businessId)}/team/invite`, "POST", { email, role, title });
  return { ok: true, data: undefined };
}

export function setMemberRole(businessId: string, membershipId: string, role: MembershipRole): ActionResult {
  draft((next) => {
    const row = next.memberships.find((item) => item.id === membershipId && item.businessId === businessId);
    if (row && row.role !== "owner") row.role = role;
  });
  syncRemote(`/api/v1/workspaces/${encodeURIComponent(businessId)}/team/${encodeURIComponent(membershipId)}/role`, "PATCH", { role });
  return { ok: true, data: undefined };
}

export function addCustomerNote(businessId: string, customerId: string, authorId: string, body: string): ActionResult {
  if (body.trim().length < 2) return fail("Write a note");
  draft((next) => {
    next.notes.unshift({ id: nid("note"), businessId, customerId, authorId, body: body.trim(), createdAt: new Date().toISOString() });
  });
  syncRemote(`/api/v1/workspaces/${encodeURIComponent(businessId)}/notes`, "POST", { customerId, body: body.trim() });
  return { ok: true, data: undefined };
}

export function addExpense(businessId: string, input: unknown): ActionResult {
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) return fail("Check the expense", fieldErrors(parsed.error));
  draft((next) => {
    next.expenses.unshift({ id: nid("exp"), businessId, ...parsed.data, source: "manual" });
  });
  syncRemote(`/api/v1/workspaces/${encodeURIComponent(businessId)}/expenses`, "POST", parsed.data);
  return { ok: true, data: undefined };
}

export function saveProduct(businessId: string, input: unknown, productId?: string): ActionResult {
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return fail("Check the product", fieldErrors(parsed.error));
  draft((next) => {
    if (productId) {
      const row = next.products.find((item) => item.id === productId && item.businessId === businessId);
      if (row) Object.assign(row, parsed.data, { active: parsed.data.stock > 0 });
      return;
    }
    next.products.unshift({
      id: nid("prd"),
      businessId,
      name: parsed.data.name,
      description: parsed.data.description,
      categoryId: parsed.data.categoryId,
      price: parsed.data.price,
      currency: "USD",
      imageUrl: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80",
      images: [],
      stock: parsed.data.stock,
      active: parsed.data.stock > 0,
      variants: [],
      rating: 0,
      reviewCount: 0,
      createdAt: new Date().toISOString(),
      featured: false,
      popular: false,
    });
  });
  if (productId) {
    syncRemote(`/api/v1/workspaces/${encodeURIComponent(businessId)}/products/${encodeURIComponent(productId)}`, "PUT", parsed.data);
  } else {
    syncRemote(`/api/v1/workspaces/${encodeURIComponent(businessId)}/products`, "POST", parsed.data);
  }
  return { ok: true, data: undefined };
}

export function setProductActive(businessId: string, productId: string, active: boolean): ActionResult {
  draft((next) => {
    const row = next.products.find((item) => item.id === productId && item.businessId === businessId);
    if (row) row.active = active;
  });
  syncRemote(`/api/v1/workspaces/${encodeURIComponent(businessId)}/products/${encodeURIComponent(productId)}/active`, "PATCH", { active });
  return { ok: true, data: undefined };
}

export function setOrderStatus(businessId: string, orderId: string, status: OrderStatus): ActionResult {
  draft((next) => {
    const order = next.orders.find((item) => item.id === orderId && item.sellerId === businessId);
    if (!order) return;
    order.status = status;
    order.updatedAt = new Date().toISOString();
    if (status === "shipped") order.trackingPlaceholder = `Demo tracking ${order.id.toUpperCase()}`;
    if (status === "refunded") order.paymentStatus = "refunded";
    next.notifications.unshift({
      id: nid("ntf"),
      userId: order.userId,
      businessId,
      category: "order",
      title: `Order ${status.replaceAll("_", " ")}`,
      body: `${order.id} was updated.`,
      read: false,
      createdAt: new Date().toISOString(),
      href: `/orders/${order.id}`,
    });
  });
  syncRemote(`/api/v1/workspaces/${encodeURIComponent(businessId)}/orders/${encodeURIComponent(orderId)}`, "PATCH", { status });
  return { ok: true, data: undefined };
}

export function saveCampaign(businessId: string, campaign: Pick<Campaign, "name" | "channel" | "audience" | "message" | "startsOn">): ActionResult {
  if (campaign.name.trim().length < 2) return fail("Name the campaign");
  draft((next) => {
    next.campaigns.unshift({ id: nid("cmp"), businessId, status: "scheduled", ...campaign });
  });
  syncRemote(`/api/v1/workspaces/${encodeURIComponent(businessId)}/campaigns`, "POST", campaign);
  return { ok: true, data: undefined };
}

export function savePromo(businessId: string, code: string, percentOff: number, expiresOn: string): ActionResult {
  if (!/^[A-Z0-9]{4,12}$/.test(code)) return fail("Use 4–12 letters or numbers");
  draft((next) => {
    next.promoCodes.unshift({ id: nid("promo"), businessId, code, percentOff, active: true, expiresOn, redemptions: 0 });
  });
  syncRemote(`/api/v1/workspaces/${encodeURIComponent(businessId)}/promos`, "POST", { code, percentOff, expiresOn });
  return { ok: true, data: undefined };
}

export function updateBusiness(businessId: string, patch: Partial<Pick<AppState["businesses"][number], "name" | "description" | "phone" | "email" | "website" | "cancellationPolicy" | "bookingApproval" | "hours" | "address" | "city">>): ActionResult {
  draft((next) => {
    const business = next.businesses.find((item) => item.id === businessId);
    if (!business) return;
    Object.assign(business, patch, { updatedAt: new Date().toISOString() });
  });
  syncRemote(`/api/v1/businesses/${encodeURIComponent(businessId)}`, "PATCH", patch);
  return { ok: true, data: undefined };
}

export function updateBusinessHours(businessId: string, hours: WeeklyHours): ActionResult {
  draft((next) => {
    const business = next.businesses.find((item) => item.id === businessId);
    if (business) {
      business.hours = hours;
      business.updatedAt = new Date().toISOString();
    }
  });
  syncRemote(`/api/v1/businesses/${encodeURIComponent(businessId)}/hours`, "PUT", hours);
  return { ok: true, data: undefined };
}

export function addBusinessHoliday(businessId: string, date: string, name: string): ActionResult {
  if (!date || name.trim().length < 2) return fail("Enter a date and holiday name");
  draft((next) => {
    const business = next.businesses.find((item) => item.id === businessId);
    if (!business) return;
    if (business.holidays.some((h) => h.date === date)) return;
    business.holidays.push({ date, name: name.trim() });
    business.updatedAt = new Date().toISOString();
  });
  syncRemote(`/api/v1/businesses/${encodeURIComponent(businessId)}/holidays`, "POST", { date, name: name.trim() });
  return { ok: true, data: undefined };
}

export function removeBusinessHoliday(businessId: string, date: string): ActionResult {
  draft((next) => {
    const business = next.businesses.find((item) => item.id === businessId);
    if (!business) return;
    business.holidays = business.holidays.filter((h) => h.date !== date);
    business.updatedAt = new Date().toISOString();
  });
  syncRemote(`/api/v1/businesses/${encodeURIComponent(businessId)}/holidays/${encodeURIComponent(date)}`, "DELETE");
  return { ok: true, data: undefined };
}

export function addBlockedSlot(businessId: string, date: string, start: string, end: string, reason: string): ActionResult {
  if (!date || !start || !end || start >= end) return fail("Enter a valid date and time range");
  draft((next) => {
    const business = next.businesses.find((item) => item.id === businessId);
    if (!business) return;
    business.blocked.push({ id: nid("blk"), date, start, end, reason: reason.trim() || "Blocked time" });
    business.updatedAt = new Date().toISOString();
  });
  syncRemote(`/api/v1/businesses/${encodeURIComponent(businessId)}/blocked`, "POST", {
    date,
    start,
    end,
    reason: reason.trim() || "Blocked time",
  });
  return { ok: true, data: undefined };
}

export function removeBlockedSlot(businessId: string, blockId: string): ActionResult {
  draft((next) => {
    const business = next.businesses.find((item) => item.id === businessId);
    if (!business) return;
    business.blocked = business.blocked.filter((b) => b.id !== blockId);
    business.updatedAt = new Date().toISOString();
  });
  syncRemote(`/api/v1/businesses/${encodeURIComponent(businessId)}/blocked/${encodeURIComponent(blockId)}`, "DELETE");
  return { ok: true, data: undefined };
}

export function updateEmployeeAvailability(
  businessId: string,
  employeeId: string,
  patch: Partial<Pick<Employee, "status" | "hours" | "title">>,
): ActionResult {
  draft((next) => {
    const employee = next.employees.find((item) => item.id === employeeId && item.businessId === businessId);
    if (employee) Object.assign(employee, patch);
  });
  syncRemote(`/api/v1/workspaces/${encodeURIComponent(businessId)}/employees/${encodeURIComponent(employeeId)}`, "PATCH", patch);
  return { ok: true, data: undefined };
}

export function markBusinessNotificationRead(businessId: string, notificationId: string): ActionResult {
  draft((next) => {
    const row = next.notifications.find((item) => item.id === notificationId && item.businessId === businessId);
    if (row) row.read = true;
  });
  syncRemote(`/api/v1/workspaces/${encodeURIComponent(businessId)}/notifications/${encodeURIComponent(notificationId)}/read`, "POST");
  return { ok: true, data: undefined };
}

export function markAllBusinessNotificationsRead(businessId: string): ActionResult {
  draft((next) => {
    next.notifications.forEach((item) => {
      if (item.businessId === businessId) item.read = true;
    });
  });
  syncRemote(`/api/v1/workspaces/${encodeURIComponent(businessId)}/notifications/read-all`, "POST");
  return { ok: true, data: undefined };
}

export function changePlan(businessId: string, planId: AppState["plans"][number]["id"]): ActionResult {
  draft((next) => {
    const row = next.subscriptions.find((item) => item.businessId === businessId);
    const now = new Date().toISOString();
    if (row) {
      row.planId = planId;
      row.status = row.status === "trialing" ? "trialing" : "active";
    } else {
      next.subscriptions.push({
        id: nid("sub"),
        businessId,
        planId,
        status: "trialing",
        trialEndsAt: `${addDays("2026-11-19", 30)}T00:00:00`,
        renewsAt: `${addDays("2026-11-19", 30)}T00:00:00`,
        startedAt: now,
      });
    }
    next.invoices.unshift({
      id: nid("inv"),
      businessId,
      amount: 0,
      status: "open",
      description: `Plan change to ${planId} (billing not charged in this preview)`,
      issuedAt: now,
    });
  });
  syncRemote(`/api/v1/workspaces/${encodeURIComponent(businessId)}/subscription`, "PATCH", { planId });
  return { ok: true, data: undefined };
}

export function createStaffAppointment(input: {
  businessId: string;
  customerId: string;
  serviceId: string;
  employeeId: string;
  date: string;
  time: string;
}): ActionResult<{ id: string }> {
  const res = createAppointment({
    customerId: input.customerId,
    serviceId: input.serviceId,
    employeeId: input.employeeId,
    date: input.date,
    time: input.time,
  });
  if (res.ok && !usingMocks()) {
    syncRemote("/api/v1/bookings", "POST", {
      customerId: input.customerId,
      serviceId: input.serviceId,
      employeeId: input.employeeId,
      date: input.date,
      time: input.time,
      paymentMethod: "in_person",
    });
  }
  return res;
}

export function moveAppointment(id: string, date: string, time: string, actorUserId: string): ActionResult {
  return rescheduleAppointment(id, date, time, actorUserId);
}

export function reviewApplication(applicationId: string, action: "approve" | "reject" | "request_info", note: string): ActionResult {
  const application = state.applications.find((item) => item.id === applicationId);
  if (!application) return fail("Application not found");
  const status: BusinessStatus = action === "approve" ? "approved" : action === "reject" ? "rejected" : "under_review";
  draft((next) => {
    const app = next.applications.find((item) => item.id === applicationId);
    const business = next.businesses.find((item) => item.id === application.businessId);
    if (app) {
      app.status = status;
      app.reviewedAt = new Date().toISOString();
      app.reviewerNote = note || (action === "request_info" ? "Please add a clearer license document." : undefined);
    }
    if (business) {
      business.status = status;
      business.isPublic = status === "approved";
      business.updatedAt = new Date().toISOString();
    }
    if (status === "approved" && !next.subscriptions.some((item) => item.businessId === application.businessId)) {
      next.subscriptions.push({
        id: nid("sub"),
        businessId: application.businessId,
        planId: "professional",
        status: "trialing",
        trialEndsAt: `${addDays("2026-11-19", 30)}T00:00:00`,
        renewsAt: `${addDays("2026-11-19", 30)}T00:00:00`,
        startedAt: new Date().toISOString(),
      });
    }
  });
  syncRemote(`/api/v1/admin/applications/${encodeURIComponent(applicationId)}/review`, "POST", { action, note });
  return { ok: true, data: undefined };
}

export function setBusinessStatus(businessId: string, status: BusinessStatus): ActionResult {
  draft((next) => {
    const business = next.businesses.find((item) => item.id === businessId);
    if (!business) return;
    business.status = status;
    business.isPublic = status === "approved";
  });
  syncRemote(`/api/v1/admin/businesses/${encodeURIComponent(businessId)}`, "PATCH", { status });
  return { ok: true, data: undefined };
}

export function setUserStatus(userId: string, status: User["status"]): ActionResult {
  if (state.users.find((user) => user.id === userId)?.isPlatformAdmin && status !== "active") {
    return fail("The demo platform admin stays active");
  }
  draft((next) => {
    const user = next.users.find((item) => item.id === userId);
    if (user) user.status = status;
  });
  syncRemote(`/api/v1/admin/users/${encodeURIComponent(userId)}`, "PATCH", { status });
  return { ok: true, data: undefined };
}

export function moderateReview(reviewId: string, status: Review["status"]): ActionResult {
  draft((next) => {
    const review = next.reviews.find((item) => item.id === reviewId);
    if (review) review.status = status;
  });
  syncRemote(`/api/v1/admin/reviews/${encodeURIComponent(reviewId)}`, "PATCH", { status });
  return { ok: true, data: undefined };
}

export function setAdvertisementStatus(id: string, status: AppState["advertisements"][number]["status"]): ActionResult {
  draft((next) => {
    const ad = next.advertisements.find((item) => item.id === id);
    if (ad) ad.status = status;
  });
  syncRemote(`/api/v1/admin/advertisements/${encodeURIComponent(id)}`, "PATCH", { status });
  return { ok: true, data: undefined };
}

export function setReportStatus(id: string, status: AppState["reports"][number]["status"]): ActionResult {
  draft((next) => {
    const report = next.reports.find((item) => item.id === id);
    if (report) report.status = status;
  });
  syncRemote(`/api/v1/admin/reports/${encodeURIComponent(id)}`, "PATCH", { status });
  return { ok: true, data: undefined };
}

export function sendBusinessMessage(fromUserId: string, businessId: string, body: string): ActionResult {
  const business = state.businesses.find((item) => item.id === businessId);
  if (!business) return fail("Business not found");
  if (body.trim().length < 2) return fail("Write a message");
  draft((next) => {
    next.notifications.unshift({
      id: nid("ntf"),
      userId: business.ownerUserId,
      businessId,
      category: "message",
      title: "Customer message",
      body: body.trim(),
      read: false,
      createdAt: new Date().toISOString(),
      href: "/workspace/customers",
    });
    next.notifications.unshift({
      id: nid("ntf"),
      userId: fromUserId,
      businessId,
      category: "message",
      title: "Message sent",
      body: `Sent to ${business.name}.`,
      read: false,
      createdAt: new Date().toISOString(),
    });
  });
  syncRemote(`/api/v1/businesses/${encodeURIComponent(businessId)}/messages`, "POST", { body: body.trim() });
  return { ok: true, data: undefined };
}

export function saveBookingConfig(
  businessId: string,
  bookingModel: BookingModel,
  input: unknown,
): ActionResult<BusinessBookingConfig> {
  const parsed = bookingConfigSchema.safeParse(input);
  if (!parsed.success) return fail("Check booking policy fields", fieldErrors(parsed.error));
  let saved!: BusinessBookingConfig;
  draft((next) => {
    next.bookingConfigs = next.bookingConfigs ?? [];
    const existing = next.bookingConfigs.find(
      (c) => c.businessId === businessId && c.bookingModel === bookingModel,
    );
    if (existing) {
      Object.assign(existing, parsed.data);
      saved = existing;
    } else {
      saved = {
        id: nid("bcfg"),
        businessId,
        bookingModel,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        holdTtlMinutes: 10,
        allowOverbooking: false,
        settings: {},
        ...parsed.data,
      };
      next.bookingConfigs.push(saved);
    }
  });
  syncRemote(
    `/api/v1/businesses/${encodeURIComponent(businessId)}/booking-configs/${encodeURIComponent(bookingModel)}`,
    "PUT",
    saved,
  );
  return { ok: true, data: saved };
}

export function saveResource(businessId: string, input: unknown, resourceId?: string): ActionResult<Resource> {
  const parsed = resourceSchema.safeParse(input);
  if (!parsed.success) return fail("Check resource details", fieldErrors(parsed.error));
  let saved!: Resource;
  draft((next) => {
    next.resources = next.resources ?? [];
    if (resourceId) {
      const existing = next.resources.find((r) => r.id === resourceId && r.businessId === businessId);
      if (existing) {
        Object.assign(existing, parsed.data);
        saved = existing;
        return;
      }
    }
    saved = {
      id: nid("res"),
      businessId,
      name: parsed.data.name,
      resourceType: parsed.data.resourceType,
      description: parsed.data.description,
      capacityPeople: parsed.data.capacityPeople,
      unitsTotal: parsed.data.unitsTotal,
      pricingUnit: parsed.data.pricingUnit,
      slotDurationMinutes: parsed.data.slotDurationMinutes ?? 60,
      minDurationMinutes: parsed.data.slotDurationMinutes ?? 60,
      bufferMinutes: 15,
      basePrice: parsed.data.basePrice,
      currency: "USD",
      depositAmount: parsed.data.depositAmount,
      attributes: {},
      active: true,
    };
    next.resources.push(saved);
  });
  if (resourceId) {
    syncRemote(
      `/api/v1/businesses/${encodeURIComponent(businessId)}/resources/${encodeURIComponent(resourceId)}`,
      "PATCH",
      parsed.data,
    );
  } else {
    syncRemote(`/api/v1/businesses/${encodeURIComponent(businessId)}/resources`, "POST", {
      ...parsed.data,
      currency: "USD",
      minDurationMinutes: parsed.data.slotDurationMinutes ?? 60,
    });
  }
  return { ok: true, data: saved };
}

export function setResourceActive(businessId: string, resourceId: string, active: boolean): ActionResult {
  draft((next) => {
    const row = (next.resources ?? []).find((r) => r.id === resourceId && r.businessId === businessId);
    if (row) row.active = active;
  });
  syncRemote(
    `/api/v1/businesses/${encodeURIComponent(businessId)}/resources/${encodeURIComponent(resourceId)}`,
    "PATCH",
    { active },
  );
  return { ok: true, data: undefined };
}

export function saveEventOffering(businessId: string, input: unknown): ActionResult<EventOffering> {
  const parsed = eventOfferingSchema.safeParse(input);
  if (!parsed.success) return fail("Check event or class details", fieldErrors(parsed.error));
  let created!: EventOffering;
  draft((next) => {
    next.eventOfferings = next.eventOfferings ?? [];
    created = {
      id: nid("evt"),
      businessId,
      bookingModel: parsed.data.bookingModel,
      category: parsed.data.category,
      title: parsed.data.title,
      description: parsed.data.description,
      venueArea: parsed.data.venueArea || undefined,
      cancellationPolicy: parsed.data.cancellationPolicy,
      active: true,
      metadataJson: {},
      sessions: [],
    };
    next.eventOfferings.unshift(created);
  });
  syncRemote(`/api/v1/businesses/${encodeURIComponent(businessId)}/offerings`, "POST", parsed.data);
  return { ok: true, data: created };
}

export function createEventSession(businessId: string, offeringId: string, input: unknown): ActionResult {
  const parsed = eventSessionSchema.safeParse(input);
  if (!parsed.success) return fail("Check session details", fieldErrors(parsed.error));
  if (parsed.data.endAt <= parsed.data.startAt) return fail("End time must be after start time");
  draft((next) => {
    const off = (next.eventOfferings ?? []).find((o) => o.id === offeringId && o.businessId === businessId);
    if (!off) return;
    const sesId = nid("ses");
    off.sessions.push({
      id: sesId,
      offeringId: off.id,
      businessId,
      startAt: parsed.data.startAt,
      endAt: parsed.data.endAt,
      timezone: "America/Los_Angeles",
      totalCapacity: parsed.data.totalCapacity,
      reservedCount: 0,
      remainingCapacity: parsed.data.totalCapacity,
      maxPerBooking: parsed.data.maxPerBooking,
      status: "on_sale",
      tiers: [
        {
          id: nid("tier"),
          sessionId: sesId,
          name: parsed.data.tierName,
          description: "",
          price: parsed.data.tierPrice,
          currency: "USD",
          capacityLimit: parsed.data.totalCapacity,
          reservedCount: 0,
          remaining: parsed.data.totalCapacity,
          sortOrder: 1,
          active: true,
        },
      ],
    });
  });
  syncRemote(
    `/api/v1/businesses/${encodeURIComponent(businessId)}/offerings/${encodeURIComponent(offeringId)}/sessions`,
    "POST",
    {
      startAt: parsed.data.startAt,
      endAt: parsed.data.endAt,
      totalCapacity: parsed.data.totalCapacity,
      maxPerBooking: parsed.data.maxPerBooking,
      tiers: [
        {
          name: parsed.data.tierName,
          price: parsed.data.tierPrice,
          capacityLimit: parsed.data.totalCapacity,
          currency: "USD",
        },
      ],
    },
  );
  return { ok: true, data: undefined };
}

export function createUniversalBooking(
  customerId: string,
  input: UniversalBookingCreateInput,
): ActionResult<UniversalBooking> {
  if (input.bookingModel === "appointment") {
    if (!input.serviceId || !input.employeeId || !input.date || !input.time) {
      return fail("Choose a service, specialist, date, and time");
    }
    const res = createAppointment({
      customerId,
      serviceId: input.serviceId,
      employeeId: input.employeeId,
      date: input.date,
      time: input.time,
      paymentMethod: input.paymentMethod,
      notes: input.notes,
    });
    if (!res.ok) return res;
    const found = state.bookings.find((b) => b.legacyAppointmentId === res.data.id) ?? state.bookings[0]!;
    return { ok: true, data: found };
  }

  const now = new Date().toISOString();
  const paymentMethod: PaymentMethod = input.paymentMethod ?? "in_person";

  if (input.bookingModel === "resource") {
    const resource = (state.resources ?? []).find((r) => r.id === input.resourceId && r.active);
    if (!resource) return fail("Resource unavailable");
    if (!input.startAt || !input.endAt || input.endAt <= input.startAt) {
      return fail("Choose a valid reservation start and end time");
    }
    const unitsReq = input.quantityUnits ?? 1;
    if (unitsReq < 1 || unitsReq > resource.unitsTotal) {
      return fail("Requested units exceed resource capacity");
    }
    const reqStart = new Date(input.startAt).getTime();
    const reqEnd = new Date(input.endAt).getTime();
    let used = 0;
    for (const bk of state.bookings ?? []) {
      if (["cancelled", "rejected", "expired", "no_show"].includes(bk.status)) continue;
      for (const alloc of bk.resourceAllocations) {
        if (alloc.resourceId !== resource.id) continue;
        if (new Date(alloc.startAt).getTime() < reqEnd && reqStart < new Date(alloc.endAt).getTime()) {
          used += alloc.quantityUnits;
        }
      }
    }
    if (used + unitsReq > resource.unitsTotal) {
      return fail("That space or resource is already booked for the selected window");
    }
    const hours = Math.max(1, (reqEnd - reqStart) / (60 * 60 * 1000));
    const unitPrice =
      resource.pricingUnit === "per_hour"
        ? Math.round(resource.basePrice * hours * 100) / 100
        : resource.basePrice;
    const total = Math.round(unitPrice * unitsReq * 100) / 100;
    const depositDue = resource.depositAmount ?? 0;
    const cfg = (state.bookingConfigs ?? []).find(
      (c) => c.businessId === resource.businessId && c.bookingModel === "resource",
    );
    const status: UniversalBookingStatus = cfg?.approvalMode === "manual" ? "pending" : "confirmed";
    const id = nid("bk");
    const checkInCode = `BK-${id.toUpperCase()}`;
    let created!: UniversalBooking;
    draft((next) => {
      next.bookings = next.bookings ?? [];
      created = {
        id,
        businessId: resource.businessId,
        customerId,
        bookingModel: "resource",
        title: resource.name,
        startAt: input.startAt,
        endAt: input.endAt,
        timezone: resource.timezone ?? "America/Los_Angeles",
        quantity: unitsReq,
        status,
        confirmationMode: cfg?.approvalMode ?? "automatic",
        subtotalAmount: total,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount: total,
        depositDueAmount: depositDue,
        amountPaid: paymentMethod === "wallet" ? total : 0,
        refundedAmount: 0,
        currency: "USD",
        paymentStatus: paymentMethod === "wallet" ? "paid" : "unpaid",
        paymentMethod,
        cancellationPolicySnapshot: cfg?.cancellationPolicyText ?? "Standard venue cancellation rules apply.",
        notes: input.notes?.trim() || undefined,
        checkInCode,
        createdAt: now,
        updatedAt: now,
        resourceAllocations: [
          {
            id: nid("ral"),
            resourceId: resource.id,
            startAt: input.startAt!,
            endAt: input.endAt!,
            quantityUnits: unitsReq,
            partySize: input.partySize ?? 1,
            status,
            unitPrice,
          },
        ],
        ticketPasses: [],
      };
      next.bookings.unshift(created);
      next.notifications.unshift({
        id: nid("ntf"),
        userId: customerId,
        businessId: resource.businessId,
        category: "booking",
        title: "Reservation confirmed",
        body: `${resource.name} reserved.`,
        read: false,
        createdAt: now,
        href: "/bookings",
      });
    });
    return { ok: true, data: created };
  }

  // Ticket or Capacity booking
  const offerings = state.eventOfferings ?? [];
  const off = offerings.find((o) => o.sessions.some((s) => s.id === input.sessionId));
  const session = off?.sessions.find((s) => s.id === input.sessionId);
  if (!off || !session) return fail("Session not found");
  const items = input.ticketItems ?? [];
  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
  if (totalQty < 1) return fail("Select at least 1 ticket or spot");
  if (totalQty > session.maxPerBooking) return fail(`Maximum ${session.maxPerBooking} per booking`);
  if (session.reservedCount + totalQty > session.totalCapacity) {
    return fail("Not enough spots remaining in this session");
  }
  for (const item of items) {
    const tier = session.tiers.find((t) => t.id === item.tierId && t.active);
    if (!tier) return fail("Selected ticket tier unavailable");
    if (tier.capacityLimit !== undefined && tier.reservedCount + item.quantity > tier.capacityLimit) {
      return fail(`Not enough ${tier.name} passes remaining`);
    }
  }

  const customer = state.users.find((u) => u.id === customerId);
  const attendeeName = input.attendeeName?.trim() || (customer ? `${customer.firstName} ${customer.lastName}` : "Guest");
  const attendeeEmail = input.attendeeEmail?.trim() || customer?.email;
  const id = nid("bk");
  const checkInCode = `BK-${id.toUpperCase()}`;
  let created!: UniversalBooking;
  draft((next) => {
    const nextOff = (next.eventOfferings ?? []).find((o) => o.id === off.id);
    const nextSes = nextOff?.sessions.find((s) => s.id === session.id);
    if (!nextOff || !nextSes) return;
    let total = 0;
    const passes: UniversalBooking["ticketPasses"] = [];
    for (const item of items) {
      const nextTier = nextSes.tiers.find((t) => t.id === item.tierId)!;
      nextTier.reservedCount += item.quantity;
      if (nextTier.capacityLimit !== undefined) {
        nextTier.remaining = Math.max(0, nextTier.capacityLimit - nextTier.reservedCount);
      }
      for (let idx = 0; idx < item.quantity; idx += 1) {
        total += nextTier.price;
        const tktId = nid("tkt");
        passes.push({
          id: tktId,
          bookingId: id,
          businessId: nextOff.businessId,
          sessionId: nextSes.id,
          tierId: nextTier.id,
          attendeeName,
          attendeeEmail,
          unitPrice: nextTier.price,
          passCode: `TKT-${tktId.toUpperCase()}`,
          status: "valid",
        });
      }
    }
    nextSes.reservedCount += totalQty;
    nextSes.remainingCapacity = Math.max(0, nextSes.totalCapacity - nextSes.reservedCount);
    if (nextSes.remainingCapacity === 0) nextSes.status = "sold_out";

    created = {
      id,
      businessId: nextOff.businessId,
      customerId,
      bookingModel: nextOff.bookingModel,
      title: nextOff.title,
      startAt: nextSes.startAt,
      endAt: nextSes.endAt,
      timezone: nextSes.timezone,
      quantity: totalQty,
      status: "confirmed",
      confirmationMode: "automatic",
      subtotalAmount: total,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount: total,
      depositDueAmount: 0,
      amountPaid: paymentMethod === "wallet" ? total : 0,
      refundedAmount: 0,
      currency: "USD",
      paymentStatus: paymentMethod === "wallet" || total === 0 ? "paid" : "unpaid",
      paymentMethod,
      cancellationPolicySnapshot: nextOff.cancellationPolicy,
      notes: input.notes?.trim() || undefined,
      checkInCode,
      createdAt: now,
      updatedAt: now,
      resourceAllocations: [],
      ticketPasses: passes,
    };
    next.bookings = next.bookings ?? [];
    next.bookings.unshift(created);
    next.notifications.unshift({
      id: nid("ntf"),
      userId: customerId,
      businessId: nextOff.businessId,
      category: "booking",
      title: nextOff.bookingModel === "ticket" ? "Tickets issued" : "Class spot reserved",
      body: `${nextOff.title} · ${totalQty} pass(es)`,
      read: false,
      createdAt: now,
      href: "/bookings",
    });
  });
  return { ok: true, data: created };
}

export function setUniversalBookingStatus(
  bookingId: string,
  status: UniversalBookingStatus,
  actorUserId: string,
): ActionResult {
  const bk = (state.bookings ?? []).find((b) => b.id === bookingId);
  if (!bk) return fail("Booking not found");
  const isCustomer = bk.customerId === actorUserId;
  const isStaff = state.memberships.some(
    (m) => m.userId === actorUserId && m.businessId === bk.businessId && m.status === "active",
  );
  if (!isCustomer && !isStaff) return fail("You cannot update this booking");
  if (isCustomer && status !== "cancelled") return fail("Customers can only cancel bookings");
  if (bk.legacyAppointmentId) {
    return setAppointmentStatus(bk.legacyAppointmentId, status as AppointmentStatus, actorUserId);
  }
  draft((next) => {
    const row = (next.bookings ?? []).find((b) => b.id === bookingId);
    if (!row) return;
    const prev = row.status;
    row.status = status;
    row.updatedAt = new Date().toISOString();
    const releasing =
      ["cancelled", "rejected", "expired"].includes(status) &&
      !["cancelled", "rejected", "expired"].includes(prev);
    if (releasing) {
      row.resourceAllocations.forEach((a) => {
        a.status = "released";
      });
      if (row.ticketPasses.length > 0) {
        const sesIds = new Set<string>();
        row.ticketPasses.forEach((p) => {
          p.status = "cancelled";
          sesIds.add(p.sessionId);
        });
        for (const off of next.eventOfferings ?? []) {
          for (const ses of off.sessions) {
            if (!sesIds.has(ses.id)) continue;
            const qty = row.ticketPasses.filter((p) => p.sessionId === ses.id).length;
            ses.reservedCount = Math.max(0, ses.reservedCount - qty);
            ses.remainingCapacity = Math.max(0, ses.totalCapacity - ses.reservedCount);
            if (ses.status === "sold_out" && ses.remainingCapacity > 0) ses.status = "on_sale";
            for (const p of row.ticketPasses.filter((tp) => tp.sessionId === ses.id)) {
              const tier = ses.tiers.find((t) => t.id === p.tierId);
              if (tier) {
                tier.reservedCount = Math.max(0, tier.reservedCount - 1);
                if (tier.capacityLimit !== undefined) {
                  tier.remaining = Math.max(0, tier.capacityLimit - tier.reservedCount);
                }
              }
            }
          }
        }
      }
    }
  });
  syncRemote(`/api/v1/bookings/universal/${encodeURIComponent(bookingId)}/status`, "PATCH", { status });
  return { ok: true, data: undefined };
}

export function checkInUniversalQr(
  businessId: string,
  code: string,
  _actorUserId: string,
): ActionResult<UniversalCheckInResult> {
  const clean = code.trim();
  if (!clean) return fail("Enter or scan a valid check-in code");
  let result: UniversalCheckInResult | null = null;
  let error: string | null = null;
  draft((next) => {
    const bookings = next.bookings ?? [];
    for (const bk of bookings) {
      if (bk.businessId !== businessId) continue;
      const pass = bk.ticketPasses.find((p) => p.passCode === clean);
      if (pass) {
        if (pass.status === "checked_in") {
          error = "This ticket pass has already been checked in";
          return;
        }
        if (pass.status !== "valid") {
          error = "This ticket pass is no longer valid";
          return;
        }
        pass.status = "checked_in";
        pass.checkedInAt = new Date().toISOString();
        result = { matchedType: "ticket_pass", booking: bk, ticketPass: pass };
        return;
      }
      if (bk.checkInCode === clean) {
        if (["cancelled", "rejected", "expired"].includes(bk.status)) {
          error = "This booking cannot be checked in";
          return;
        }
        bk.checkedInAt = new Date().toISOString();
        result = { matchedType: "booking", booking: bk };
        return;
      }
    }
  });
  if (error) return fail(error);
  if (!result) return fail("No matching pass or booking code found for this business");
  return { ok: true, data: result };
}
