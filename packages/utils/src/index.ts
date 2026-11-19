import type {
  Appointment,
  Business,
  Employee,
  MembershipRole,
  Payment,
  Permission,
  PublicBusiness,
  Service,
  SessionClaims,
  WeeklyHours,
} from "@bookit/types";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function formatMoney(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCompact(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatDate(iso: string, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", options ?? { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(iso),
  );
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return `${formatDate(iso, { weekday: "short", month: "short", day: "numeric" })} · ${formatTime(iso)}`;
}

export function priceLevel(level: 1 | 2 | 3 | 4): string {
  return "$".repeat(level);
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function weekdayKey(date: Date): (typeof WEEKDAYS)[number] {
  return WEEKDAYS[date.getDay()] ?? "mon";
}

export function toDateInput(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Fixed "today" keeps demo calendars stable while the machine clock moves. */
export const DEMO_TODAY = "2026-11-19";

export function demoNow(): Date {
  return new Date(`${DEMO_TODAY}T15:00:00`);
}

export function addDays(dateInput: string, days: number): string {
  const date = new Date(`${dateInput}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toDateInput(date);
}

export function atLocal(dateInput: string, time: string): Date {
  return new Date(`${dateInput}T${time}:00`);
}

export function passwordScore(password: string): { score: number; label: string; hints: string[] } {
  const hints: string[] = [];
  let score = 0;
  if (password.length >= 8) score += 1;
  else hints.push("Use at least 8 characters");
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  else hints.push("Mix upper and lower case");
  if (/\d/.test(password)) score += 1;
  else hints.push("Add a number");
  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  else hints.push("Add a symbol");
  const label = score <= 1 ? "Weak" : score === 2 ? "Fair" : score === 3 ? "Good" : "Strong";
  return { score, label, hints };
}

const ROLE_PERMISSIONS: Record<MembershipRole, Permission[]> = {
  owner: [
    "overview.view",
    "calendar.view",
    "calendar.manage",
    "bookings.view",
    "bookings.manage",
    "services.view",
    "services.manage",
    "team.view",
    "team.manage",
    "customers.view",
    "customers.notes",
    "products.manage",
    "orders.manage",
    "finance.view",
    "finance.manage",
    "marketing.manage",
    "settings.profile",
    "settings.policies",
    "settings.payments",
    "settings.security",
    "subscription.manage",
  ],
  admin: [
    "overview.view",
    "calendar.view",
    "calendar.manage",
    "bookings.view",
    "bookings.manage",
    "services.view",
    "services.manage",
    "team.view",
    "team.manage",
    "customers.view",
    "customers.notes",
    "products.manage",
    "orders.manage",
    "finance.view",
    "finance.manage",
    "marketing.manage",
    "settings.profile",
    "settings.policies",
    "settings.payments",
    "settings.security",
  ],
  manager: [
    "overview.view",
    "calendar.view",
    "calendar.manage",
    "bookings.view",
    "bookings.manage",
    "services.view",
    "services.manage",
    "team.view",
    "customers.view",
    "customers.notes",
    "products.manage",
    "orders.manage",
    "finance.view",
    "marketing.manage",
    "settings.profile",
    "settings.policies",
    "settings.payments",
  ],
  employee: ["overview.view", "calendar.view", "bookings.view", "services.view", "customers.view"],
  receptionist: [
    "overview.view",
    "calendar.view",
    "calendar.manage",
    "bookings.view",
    "bookings.manage",
    "services.view",
    "customers.view",
  ],
  accountant: ["overview.view", "customers.view", "orders.manage", "finance.view", "finance.manage"],
};

export function permissionsFor(role: MembershipRole): Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function can(role: MembershipRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function toPublicBusiness(business: Business): PublicBusiness {
  return {
    id: business.id,
    name: business.name,
    category: business.category,
    description: business.description,
    city: business.city,
    address: business.address,
    location: business.location,
    phone: business.phone,
    email: business.email,
    website: business.website,
    socials: business.socials,
    logoUrl: business.logoUrl,
    coverUrl: business.coverUrl,
    gallery: business.gallery,
    hours: business.hours,
    rating: business.rating,
    reviewCount: business.reviewCount,
    priceLevel: business.priceLevel,
    distanceMiles: business.distanceMiles,
    tags: business.tags,
    cuisine: business.cuisine,
    specialty: business.specialty,
    cancellationPolicy: business.cancellationPolicy,
  };
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function availableSlots(input: {
  date: string;
  service: Service;
  employees: Employee[];
  appointments: Appointment[];
  hours: WeeklyHours;
  holidays: { date: string }[];
  blocked: { date: string; start: string; end: string }[];
  employeeId?: string;
}): string[] {
  const { date, service, holidays } = input;
  if (holidays.some((holiday) => holiday.date === date)) return [];
  const day = new Date(`${date}T12:00:00`);
  const key = weekdayKey(day);
  const hours = input.hours[key];
  if (!hours || hours.closed) return [];

  const pool = input.employeeId
    ? input.employees.filter((employee) => employee.id === input.employeeId)
    : input.employees.filter(
        (employee) =>
          employee.serviceIds.includes(service.id) && employee.status !== "on_leave" && employee.status !== "off_shift",
      );

  const open = atLocal(date, hours.open).getTime();
  const close = atLocal(date, hours.close).getTime();
  const step = 30 * 60 * 1000;
  const duration = service.durationMinutes * 60 * 1000;
  const slots = new Set<string>();

  for (const employee of pool) {
    const employeeHours = employee.hours[key];
    if (!employeeHours || employeeHours.closed || employee.status === "on_leave" || employee.status === "off_shift") continue;
    const empOpen = Math.max(open, atLocal(date, employeeHours.open).getTime());
    const empClose = Math.min(close, atLocal(date, employeeHours.close).getTime());
    for (let cursor = empOpen; cursor + duration <= empClose; cursor += step) {
      const end = cursor + duration;
      const blocked = input.blocked.some((block) => {
        if (block.date !== date) return false;
        return overlaps(cursor, end, atLocal(date, block.start).getTime(), atLocal(date, block.end).getTime());
      });
      if (blocked) continue;
      const busy = input.appointments.some((appointment) => {
        if (appointment.employeeId !== employee.id) return false;
        if (appointment.status === "cancelled" || appointment.status === "rejected") return false;
        return overlaps(cursor, end, new Date(appointment.start).getTime(), new Date(appointment.end).getTime());
      });
      if (busy) continue;
      const slotDate = new Date(cursor);
      const hh = String(slotDate.getHours()).padStart(2, "0");
      const mm = String(slotDate.getMinutes()).padStart(2, "0");
      slots.add(`${hh}:${mm}`);
    }
  }

  return [...slots].sort();
}

function demoHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function sessionSecret(): string {
  const fromEnv =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_BOOKIT_DEMO_SECRET || process.env.EXPO_PUBLIC_BOOKIT_DEMO_SECRET
      : undefined;
  return fromEnv || "bookit-demo-secret-change-me";
}

/** Demo-only signed token. Production sessions must be httpOnly cookies from the API. */
export function createSessionToken(userId: string, flags: string, remember: boolean): string {
  const exp = Date.now() + (remember ? 30 : 1) * 24 * 60 * 60 * 1000;
  const safeFlags = flags || "-";
  const payload = ["v1", userId, String(exp), safeFlags].join(".");
  return `${payload}.${demoHash(`${payload}.${sessionSecret()}`)}`;
}

export function readSession(token?: string | null): SessionClaims | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") return null;
  const payload = parts.slice(0, 4).join(".");
  const sig = parts[4];
  if (demoHash(`${payload}.${sessionSecret()}`) !== sig) return null;
  const exp = Number(parts[2]);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  return { userId: parts[1] ?? "", exp, flags: parts[3] === "-" ? "" : (parts[3] ?? "") };
}

export function sessionFlags(isAdmin: boolean, hasWorkspace: boolean): string {
  return `${isAdmin ? "a" : ""}${hasWorkspace ? "w" : ""}`;
}

export function spendingBuckets(payments: Payment[]): {
  recorded: number;
  estimated: number;
  byCategory: { label: string; value: number }[];
} {
  const recorded = payments.filter((payment) => payment.status === "recorded").reduce((sum, payment) => sum + payment.amount, 0);
  const estimated = payments
    .filter((payment) => payment.status === "estimated")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const map = new Map<string, number>();
  for (const payment of payments.filter((item) => item.status === "recorded")) {
    const key = payment.referenceType;
    map.set(key, (map.get(key) ?? 0) + payment.amount);
  }
  return {
    recorded,
    estimated,
    byCategory: [...map.entries()].map(([label, value]) => ({ label, value })),
  };
}

export function monthKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function bookingTotals(price: number, taxRate = 0.08): { subtotal: number; tax: number; total: number } {
  const subtotal = Math.round(price * 100) / 100;
  const tax = Math.round(subtotal * taxRate * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
  return { subtotal, tax, total };
}

export const WEEKDAY_ORDER = [
  { key: "mon", label: "Monday", short: "Mon" },
  { key: "tue", label: "Tuesday", short: "Tue" },
  { key: "wed", label: "Wednesday", short: "Wed" },
  { key: "thu", label: "Thursday", short: "Thu" },
  { key: "fri", label: "Friday", short: "Fri" },
  { key: "sat", label: "Saturday", short: "Sat" },
  { key: "sun", label: "Sunday", short: "Sun" },
] as const;
