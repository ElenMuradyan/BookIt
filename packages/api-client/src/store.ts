import type {
  Appointment,
  AppointmentStatus,
  AppState,
  BusinessCategory,
  BusinessStatus,
  Campaign,
  Employee,
  MembershipRole,
  OrderStatus,
  PaymentMethod,
  Product,
  Review,
  Service,
  User,
  WeeklyHours,
} from "@bookit/types";
import { addDays, createSessionToken, sessionFlags } from "@bookit/utils";
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
  reviewSchema,
  serviceSchema,
  type BusinessApplicationInput,
  type LoginInput,
  type RegisterInput,
} from "@bookit/validation";
import { createSeed } from "./seed";
import { cartFor, workspacesFor } from "./queries";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

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
  listeners.forEach((listener) => listener());
}

function commit(next: AppState): void {
  state = next;
  listeners.forEach((listener) => listener());
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
    if (!existing && !parsed.data.ownerPassword) {
      return fail("Create an owner password to sign in to your business workspace", {
        ownerPassword: "Create an owner password (8+ characters with upper, lower, number, symbol)",
      });
    }
    ownerId = existing?.id ?? nid("usr");
    if (!existing) {
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
  return { ok: true, data: undefined };
}

export function setTheme(userId: string, theme: "dark" | "light" | "system"): ActionResult {
  draft((next) => {
    const profile = next.customerProfiles.find((item) => item.userId === userId);
    if (profile) profile.theme = theme;
  });
  return { ok: true, data: undefined };
}

export function updateNotificationPrefs(userId: string, patch: Partial<AppState["customerProfiles"][number]["notificationPreferences"]>): ActionResult {
  draft((next) => {
    const profile = next.customerProfiles.find((item) => item.userId === userId);
    if (profile) profile.notificationPreferences = { ...profile.notificationPreferences, ...patch };
  });
  return { ok: true, data: undefined };
}

export function setSpendingVisibility(userId: string, value: "recorded_only" | "include_estimates"): ActionResult {
  draft((next) => {
    const profile = next.customerProfiles.find((item) => item.userId === userId);
    if (profile) profile.spendingVisibility = value;
  });
  return { ok: true, data: undefined };
}

export function addAddress(userId: string, input: unknown): ActionResult {
  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) return fail("Check the address", fieldErrors(parsed.error));
  draft((next) => {
    if (!next.addresses.some((address) => address.userId === userId)) parsed.data.label;
    const isFirst = !next.addresses.some((address) => address.userId === userId);
    next.addresses.push({ id: nid("addr"), userId, ...parsed.data, isDefault: isFirst });
  });
  return { ok: true, data: undefined };
}

export function toggleFavorite(userId: string, targetType: AppState["favorites"][number]["targetType"], targetId: string, collection = "Saved"): ActionResult {
  draft((next) => {
    const index = next.favorites.findIndex((favorite) => favorite.userId === userId && favorite.targetId === targetId && favorite.targetType === targetType);
    if (index >= 0) next.favorites.splice(index, 1);
    else next.favorites.push({ id: nid("fav"), userId, targetType, targetId, collection, createdAt: new Date().toISOString() });
  });
  return { ok: true, data: undefined };
}

export function moveFavorite(userId: string, favoriteId: string, collection: string): ActionResult {
  draft((next) => {
    const favorite = next.favorites.find((item) => item.id === favoriteId && item.userId === userId);
    if (favorite) favorite.collection = collection;
  });
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
    next.appointments.push({
      id,
      businessId: service.businessId,
      serviceId: service.id,
      employeeId: employee.id,
      customerId: input.customerId,
      start: `${input.date}T${input.time}:00`,
      end: `${input.date}T${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}:00`,
      status,
      price: service.price,
      currency: "USD",
      paymentStatus: paymentMethod === "wallet" ? "paid" : "unpaid",
      paymentMethod,
      confirmationMode: status === "pending" ? "manual" : "automatic",
      notes: input.notes?.trim() || undefined,
      createdAt: now,
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
  return { ok: true, data: undefined };
}

export function updateAppointmentNotes(businessId: string, appointmentId: string, notes: string): ActionResult {
  draft((next) => {
    const row = next.appointments.find((item) => item.id === appointmentId && item.businessId === businessId);
    if (row) row.notes = notes.trim() || undefined;
  });
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
  return { ok: true, data: undefined };
}

export function markNotificationRead(id: string, userId: string): ActionResult {
  draft((next) => {
    const row = next.notifications.find((item) => item.id === id && item.userId === userId);
    if (row) row.read = true;
  });
  return { ok: true, data: undefined };
}

export function markAllNotificationsRead(userId: string): ActionResult {
  draft((next) => {
    next.notifications.forEach((item) => {
      if (item.userId === userId) item.read = true;
    });
  });
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
  return { ok: true, data: undefined };
}

export function setServiceActive(businessId: string, serviceId: string, active: boolean): ActionResult {
  draft((next) => {
    const row = next.services.find((item) => item.id === serviceId && item.businessId === businessId);
    if (row) row.active = active;
  });
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
  return { ok: true, data: undefined };
}

export function inviteMember(businessId: string, email: string, role: MembershipRole, title: string): ActionResult {
  const user = state.users.find((item) => item.email.toLowerCase() === email.toLowerCase());
  if (!user) return fail("No BookIt account uses that email yet");
  if (state.memberships.some((item) => item.userId === user.id && item.businessId === businessId && item.status !== "suspended")) {
    return fail("That person is already in this workspace");
  }
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
  return { ok: true, data: undefined };
}

export function setMemberRole(businessId: string, membershipId: string, role: MembershipRole): ActionResult {
  draft((next) => {
    const row = next.memberships.find((item) => item.id === membershipId && item.businessId === businessId);
    if (row && row.role !== "owner") row.role = role;
  });
  return { ok: true, data: undefined };
}

export function addCustomerNote(businessId: string, customerId: string, authorId: string, body: string): ActionResult {
  if (body.trim().length < 2) return fail("Write a note");
  draft((next) => {
    next.notes.unshift({ id: nid("note"), businessId, customerId, authorId, body: body.trim(), createdAt: new Date().toISOString() });
  });
  return { ok: true, data: undefined };
}

export function addExpense(businessId: string, input: unknown): ActionResult {
  const parsed = expenseSchema.safeParse(input);
  if (!parsed.success) return fail("Check the expense", fieldErrors(parsed.error));
  draft((next) => {
    next.expenses.unshift({ id: nid("exp"), businessId, ...parsed.data, source: "manual" });
  });
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
  return { ok: true, data: undefined };
}

export function setProductActive(businessId: string, productId: string, active: boolean): ActionResult {
  draft((next) => {
    const row = next.products.find((item) => item.id === productId && item.businessId === businessId);
    if (row) row.active = active;
  });
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
  return { ok: true, data: undefined };
}

export function saveCampaign(businessId: string, campaign: Pick<Campaign, "name" | "channel" | "audience" | "message" | "startsOn">): ActionResult {
  if (campaign.name.trim().length < 2) return fail("Name the campaign");
  draft((next) => {
    next.campaigns.unshift({ id: nid("cmp"), businessId, status: "scheduled", ...campaign });
  });
  return { ok: true, data: undefined };
}

export function savePromo(businessId: string, code: string, percentOff: number, expiresOn: string): ActionResult {
  if (!/^[A-Z0-9]{4,12}$/.test(code)) return fail("Use 4–12 letters or numbers");
  draft((next) => {
    next.promoCodes.unshift({ id: nid("promo"), businessId, code, percentOff, active: true, expiresOn, redemptions: 0 });
  });
  return { ok: true, data: undefined };
}

export function updateBusiness(businessId: string, patch: Partial<Pick<AppState["businesses"][number], "name" | "description" | "phone" | "email" | "website" | "cancellationPolicy" | "bookingApproval" | "hours" | "address" | "city">>): ActionResult {
  draft((next) => {
    const business = next.businesses.find((item) => item.id === businessId);
    if (!business) return;
    Object.assign(business, patch, { updatedAt: new Date().toISOString() });
  });
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
  return { ok: true, data: undefined };
}

export function removeBusinessHoliday(businessId: string, date: string): ActionResult {
  draft((next) => {
    const business = next.businesses.find((item) => item.id === businessId);
    if (!business) return;
    business.holidays = business.holidays.filter((h) => h.date !== date);
    business.updatedAt = new Date().toISOString();
  });
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
  return { ok: true, data: undefined };
}

export function removeBlockedSlot(businessId: string, blockId: string): ActionResult {
  draft((next) => {
    const business = next.businesses.find((item) => item.id === businessId);
    if (!business) return;
    business.blocked = business.blocked.filter((b) => b.id !== blockId);
    business.updatedAt = new Date().toISOString();
  });
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
  return { ok: true, data: undefined };
}

export function markBusinessNotificationRead(businessId: string, notificationId: string): ActionResult {
  draft((next) => {
    const row = next.notifications.find((item) => item.id === notificationId && item.businessId === businessId);
    if (row) row.read = true;
  });
  return { ok: true, data: undefined };
}

export function markAllBusinessNotificationsRead(businessId: string): ActionResult {
  draft((next) => {
    next.notifications.forEach((item) => {
      if (item.businessId === businessId) item.read = true;
    });
  });
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
  return createAppointment({
    customerId: input.customerId,
    serviceId: input.serviceId,
    employeeId: input.employeeId,
    date: input.date,
    time: input.time,
  });
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
  return { ok: true, data: undefined };
}

export function setBusinessStatus(businessId: string, status: BusinessStatus): ActionResult {
  draft((next) => {
    const business = next.businesses.find((item) => item.id === businessId);
    if (!business) return;
    business.status = status;
    business.isPublic = status === "approved";
  });
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
  return { ok: true, data: undefined };
}

export function moderateReview(reviewId: string, status: Review["status"]): ActionResult {
  draft((next) => {
    const review = next.reviews.find((item) => item.id === reviewId);
    if (review) review.status = status;
  });
  return { ok: true, data: undefined };
}

export function setAdvertisementStatus(id: string, status: AppState["advertisements"][number]["status"]): ActionResult {
  draft((next) => {
    const ad = next.advertisements.find((item) => item.id === id);
    if (ad) ad.status = status;
  });
  return { ok: true, data: undefined };
}

export function setReportStatus(id: string, status: AppState["reports"][number]["status"]): ActionResult {
  draft((next) => {
    const report = next.reports.find((item) => item.id === id);
    if (report) report.status = status;
  });
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
  return { ok: true, data: undefined };
}
