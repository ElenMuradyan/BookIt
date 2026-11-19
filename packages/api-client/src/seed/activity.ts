import type {
  AnalyticsPoint,
  Appointment,
  Campaign,
  Cart,
  CustomerNote,
  Expense,
  Favorite,
  Invoice,
  Notification,
  Order,
  Payment,
  Plan,
  PlatformStats,
  PromoCode,
  Report,
  Review,
  Subscription,
} from "@bookit/types";
import { stamp } from "./helpers";

export const plans: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    monthlyPrice: 29,
    description: "For a single location finding its rhythm.",
    features: ["Calendar", "Bookings", "1 location", "Email notifications"],
  },
  {
    id: "professional",
    name: "Professional",
    monthlyPrice: 79,
    description: "For teams that sell services and products.",
    features: ["Everything in Starter", "Team permissions", "Products", "Campaigns", "Finance reports"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthlyPrice: 199,
    description: "For multi-location operators.",
    features: ["Everything in Professional", "Multiple locations", "Priority review", "Advanced roles"],
  },
];

export const subscriptions: Subscription[] = [
  {
    id: "sub_aura",
    businessId: "biz_aura",
    planId: "professional",
    status: "trialing",
    trialEndsAt: "2026-12-19T00:00:00",
    renewsAt: "2026-12-19T00:00:00",
    startedAt: "2026-11-19T00:00:00",
  },
  {
    id: "sub_opal",
    businessId: "biz_opal",
    planId: "enterprise",
    status: "active",
    renewsAt: "2026-12-01T00:00:00",
    startedAt: "2026-01-01T00:00:00",
  },
  {
    id: "sub_crown",
    businessId: "biz_crown",
    planId: "starter",
    status: "active",
    renewsAt: "2026-12-04T00:00:00",
    startedAt: "2026-04-04T00:00:00",
  },
];

export const invoices: Invoice[] = [
  { id: "inv_aura_trial", businessId: "biz_aura", amount: 0, status: "trial", description: "Professional trial", issuedAt: "2026-11-19T00:00:00" },
  { id: "inv_opal_nov", businessId: "biz_opal", amount: 199, status: "paid", description: "Enterprise · November", issuedAt: "2026-11-01T00:00:00" },
  { id: "inv_crown_nov", businessId: "biz_crown", amount: 29, status: "paid", description: "Starter · November", issuedAt: "2026-11-04T00:00:00" },
];

export const appointments: Appointment[] = [
  appt("apt_elena_upcoming", "biz_aura", "svc_signature", "emp_vance", "usr_elena", "2026-11-20", "10:30", "11:15", "confirmed", 75, "paid"),
  appt("apt_elena_dental", "biz_opal", "svc_cleaning", "emp_sarah", "usr_elena", "2026-11-24", "09:00", "09:50", "pending", 95, "unpaid"),
  appt("apt_elena_done", "biz_aura", "svc_facial", "emp_sora", "usr_elena", "2026-11-02", "15:00", "15:30", "completed", 85, "paid"),
  appt("apt_elena_cancel", "biz_zenith", "svc_massage", "emp_zenith", "usr_elena", "2026-11-12", "16:00", "17:00", "cancelled", 120, "refunded"),
  appt("apt_elena_train", "biz_apex", "svc_coach", "emp_liam", "usr_elena", "2026-11-21", "07:30", "08:20", "confirmed", 70, "paid"),
  appt("apt_sophia", "biz_aura", "svc_signature", "emp_vance", "usr_sophia", "2026-11-19", "10:00", "10:45", "confirmed", 75, "paid"),
  appt("apt_liam_color", "biz_aura", "svc_balayage", "emp_marcus", "usr_liam", "2026-11-19", "11:00", "13:30", "confirmed", 190, "deposit"),
  appt("apt_aria_facial", "biz_aura", "svc_facial", "emp_sora", "usr_aria", "2026-11-19", "15:00", "15:30", "confirmed", 85, "unpaid"),
  appt("apt_david_beard", "biz_crown", "svc_beard", "emp_marcus_crown", "usr_david", "2026-11-19", "13:00", "13:30", "confirmed", 35, "paid"),
  appt("apt_chloe_progress", "biz_crown", "svc_fade", "emp_marcus_crown", "usr_chloe", "2026-11-19", "14:00", "14:40", "confirmed", 42, "unpaid"),
  appt("apt_pending_desk", "biz_aura", "svc_signature", "emp_vance", "usr_david", "2026-11-23", "16:00", "16:45", "pending", 75, "unpaid"),
];

function appt(
  id: string,
  businessId: string,
  serviceId: string,
  employeeId: string,
  customerId: string,
  date: string,
  start: string,
  end: string,
  status: Appointment["status"],
  price: number,
  paymentStatus: Appointment["paymentStatus"],
): Appointment {
  return {
    id,
    businessId,
    serviceId,
    employeeId,
    customerId,
    start: stamp(date, start),
    end: stamp(date, end),
    status,
    price,
    currency: "USD",
    paymentStatus,
    confirmationMode: businessId === "biz_opal" ? "manual" : "automatic",
    createdAt: "2026-11-10T12:00:00",
  };
}

export const orders: Order[] = [
  {
    id: "ord_9042",
    checkoutGroupId: "chk_1",
    userId: "usr_elena",
    sellerId: "biz_komorebi",
    items: [item("oi_1", "prd_bowl", "Stoneware Bowl", 1, 54, "biz_komorebi")],
    status: "shipped",
    paymentStatus: "paid",
    paymentMethod: "card_token_pending",
    subtotal: 54,
    deliveryFee: 6,
    total: 60,
    currency: "USD",
    addressId: "addr_elena_home",
    deliveryMethod: "standard",
    trackingPlaceholder: "Demo tracking BK9042",
    createdAt: "2026-11-08T12:00:00",
    updatedAt: "2026-11-16T12:00:00",
  },
  {
    id: "ord_9041",
    checkoutGroupId: "chk_2",
    userId: "usr_elena",
    sellerId: "biz_circuit",
    items: [item("oi_2", "prd_charger", "GaN Travel Charger", 1, 48, "biz_circuit")],
    status: "processing",
    paymentStatus: "authorized_demo",
    paymentMethod: "wallet",
    subtotal: 48,
    deliveryFee: 0,
    total: 48,
    currency: "USD",
    addressId: "addr_elena_home",
    deliveryMethod: "express",
    createdAt: "2026-11-15T12:00:00",
    updatedAt: "2026-11-15T12:00:00",
  },
  {
    id: "ord_9030",
    checkoutGroupId: "chk_3",
    userId: "usr_elena",
    sellerId: "biz_aura",
    items: [item("oi_3", "prd_serum", "Hydra-Glow Serum", 1, 36, "biz_aura")],
    status: "completed",
    paymentStatus: "paid",
    paymentMethod: "in_person",
    subtotal: 36,
    deliveryFee: 0,
    total: 36,
    currency: "USD",
    addressId: "addr_elena_home",
    deliveryMethod: "pickup",
    createdAt: "2026-10-24T12:00:00",
    updatedAt: "2026-10-24T12:00:00",
  },
  {
    id: "ord_8801",
    checkoutGroupId: "chk_4",
    userId: "usr_liam",
    sellerId: "biz_hearth",
    items: [item("oi_4", "prd_throw", "Linen Throw", 1, 68, "biz_hearth")],
    status: "confirmed",
    paymentStatus: "paid",
    paymentMethod: "card_token_pending",
    subtotal: 68,
    deliveryFee: 8,
    total: 76,
    currency: "USD",
    addressId: "addr_elena_home",
    deliveryMethod: "standard",
    createdAt: "2026-11-18T12:00:00",
    updatedAt: "2026-11-18T12:00:00",
  },
];

function item(id: string, productId: string, name: string, quantity: number, unitPrice: number, sellerId: string) {
  return { id, productId, name, quantity, unitPrice, sellerId };
}

export const carts: Cart[] = [
  {
    id: "cart_elena",
    userId: "usr_elena",
    updatedAt: "2026-11-18T18:00:00",
    items: [
      { id: "ci_1", productId: "prd_throw", variantId: undefined, quantity: 1, sellerId: "biz_hearth" },
      { id: "ci_2", productId: "prd_charger", variantId: undefined, quantity: 2, sellerId: "biz_circuit" },
    ],
  },
];

export const payments: Payment[] = [
  pay("pay_1", "usr_elena", "biz_aura", 75, "recorded", "card_token_pending", "appointment", "apt_elena_upcoming", "2026-11-18T12:00:00"),
  pay("pay_2", "usr_elena", "biz_aura", 85, "recorded", "in_person", "appointment", "apt_elena_done", "2026-11-02T15:30:00"),
  pay("pay_3", "usr_elena", "biz_apex", 70, "recorded", "wallet", "appointment", "apt_elena_train", "2026-11-11T12:00:00"),
  pay("pay_4", "usr_elena", "biz_komorebi", 60, "recorded", "card_token_pending", "order", "ord_9042", "2026-11-08T12:00:00"),
  pay("pay_5", "usr_elena", "biz_circuit", 48, "recorded", "wallet", "order", "ord_9041", "2026-11-15T12:00:00"),
  pay("pay_6", "usr_elena", "biz_aura", 36, "recorded", "in_person", "order", "ord_9030", "2026-10-24T12:00:00"),
  pay("pay_7", "usr_elena", "biz_zenith", 40, "estimated", "wallet", "appointment", "apt_elena_cancel", "2026-11-01T12:00:00", "Estimate only — not a captured charge"),
  pay("pay_8", "usr_liam", "biz_hearth", 76, "recorded", "card_token_pending", "order", "ord_8801", "2026-11-18T12:00:00"),
  pay("pay_9", "usr_sophia", "biz_aura", 75, "recorded", "card_token_pending", "appointment", "apt_sophia", "2026-11-19T09:00:00"),
  pay("pay_10", "biz_opal", "biz_opal", 199, "recorded", "card_token_pending", "subscription", "sub_opal", "2026-11-01T00:00:00"),
];

function pay(
  id: string,
  payerId: string,
  businessId: string,
  amount: number,
  status: Payment["status"],
  method: Payment["method"],
  referenceType: Payment["referenceType"],
  referenceId: string,
  createdAt: string,
  note?: string,
): Payment {
  return { id, payerId, businessId, amount, currency: "USD", status, method, referenceType, referenceId, createdAt, note };
}

export const reviews: Review[] = [
  {
    id: "rev_1",
    businessId: "biz_aura",
    authorId: "usr_elena",
    appointmentId: "apt_elena_done",
    rating: 5,
    title: "Calm and precise",
    body: "Elena completely transformed my skin and the room stayed quiet.",
    createdAt: "2026-11-02T18:00:00",
    status: "published",
  },
  {
    id: "rev_2",
    businessId: "biz_crown",
    authorId: "usr_david",
    rating: 5,
    title: "Clean fade",
    body: "On time, careful around the beard line.",
    createdAt: "2026-10-30T18:00:00",
    status: "published",
  },
  {
    id: "rev_3",
    businessId: "biz_harbor",
    authorId: "usr_chloe",
    rating: 2,
    title: "Long wait",
    body: "Food was good. The table was held past the reservation window.",
    createdAt: "2026-11-11T20:00:00",
    status: "reported",
  },
];

export const favorites: Favorite[] = [
  fav("fav_1", "usr_elena", "business", "biz_aura", "Weekends"),
  fav("fav_2", "usr_elena", "business", "biz_zenith", "Weekends"),
  fav("fav_3", "usr_elena", "business", "biz_komorebi", "Gifts"),
  fav("fav_4", "usr_elena", "service", "svc_signature", "Weekends"),
  fav("fav_5", "usr_elena", "employee", "emp_vance", "Weekends"),
  fav("fav_6", "usr_elena", "product", "prd_bowl", "Gifts"),
  fav("fav_7", "usr_elena", "product", "prd_serum", "Restock"),
];

function fav(id: string, userId: string, targetType: Favorite["targetType"], targetId: string, collection: string): Favorite {
  return { id, userId, targetType, targetId, collection, createdAt: "2026-10-01T12:00:00" };
}

export const notifications: Notification[] = [
  note("ntf_1", "usr_elena", "booking", "Appointment confirmed", "Signature Haircut & Style · Fri, Nov 20 · 10:30 AM", "/bookings/apt_elena_upcoming", "biz_aura"),
  note("ntf_2", "usr_elena", "order", "Order shipped", "Stoneware Bowl is on the way. Tracking is a placeholder.", "/orders/ord_9042"),
  note("ntf_3", "usr_elena", "promotion", "Sponsored · Aura color", "November color seats are open this week.", "/business/biz_aura", "biz_aura"),
  note("ntf_4", "usr_elena", "security", "New sign-in", "Demo session on this browser.", "/account/settings/security"),
  note("ntf_5", "usr_jordan", "booking", "Pending request", "David Miller requested a signature cut.", "/workspace/bookings", "biz_aura"),
  note("ntf_6", "usr_alex", "message", "Application waiting", "Luxe Studio Lounge is under review.", "/admin/applications"),
];

function note(
  id: string,
  userId: string,
  category: Notification["category"],
  title: string,
  body: string,
  href?: string,
  businessId?: string,
): Notification {
  return { id, userId, businessId, category, title, body, read: false, createdAt: "2026-11-18T09:00:00", href };
}

export const expenses: Expense[] = [
  { id: "exp_1", businessId: "biz_aura", category: "Rent", amount: 4200, note: "November studio rent", incurredOn: "2026-11-01", source: "recorded" },
  { id: "exp_2", businessId: "biz_aura", category: "Backbar", amount: 640, note: "Color and skincare stock", incurredOn: "2026-11-08", source: "recorded" },
  { id: "exp_3", businessId: "biz_aura", category: "Software", amount: 79, note: "Estimated BookIt plan after trial", incurredOn: "2026-11-19", source: "manual" },
  { id: "exp_4", businessId: "biz_opal", category: "Supplies", amount: 1100, note: "Clinical supplies", incurredOn: "2026-11-06", source: "recorded" },
];

export const notes: CustomerNote[] = [
  {
    id: "note_1",
    businessId: "biz_aura",
    customerId: "usr_elena",
    authorId: "usr_elena_vance",
    body: "Prefers a low-maintenance gloss. Sensitive along the hairline.",
    createdAt: "2026-11-02T16:00:00",
  },
];

export const promoCodes: PromoCode[] = [
  { id: "promo_glow", businessId: "biz_aura", code: "GLOW15", percentOff: 15, active: true, expiresOn: "2026-12-31", redemptions: 18 },
];

export const campaigns: Campaign[] = [
  {
    id: "cmp_1",
    businessId: "biz_aura",
    name: "November color",
    channel: "sponsored",
    status: "active",
    audience: "Seattle · hair interest",
    startsOn: "2026-11-01",
    message: "Color appointments this month.",
  },
];

export const reports: Report[] = [
  {
    id: "rpt_1",
    reporterId: "usr_elena",
    targetType: "review",
    targetId: "rev_3",
    reason: "Unrelated complaint",
    details: "The review mixes a wait-time issue with staff who were not working.",
    status: "open",
    createdAt: "2026-11-12T10:00:00",
  },
  {
    id: "rpt_2",
    reporterId: "usr_jordan",
    targetType: "user",
    targetId: "usr_liam",
    reason: "Repeated no-communication",
    details: "Two reschedule requests went unanswered. Demo report only.",
    status: "reviewing",
    createdAt: "2026-11-14T10:00:00",
  },
];

export const platformStats: PlatformStats = {
  totalUsers: 148290,
  totalBusinesses: 3420,
  pendingApplications: 36,
  approvedBusinesses: 2890,
  totalBookings: 86420,
  totalOrders: 24110,
  platformRevenue: 482650,
  activeSubscriptions: 2890,
  userDelta: "+12.4% this month",
  businessDelta: "+8.1% vs last period",
  subscriptionNote: "94.2% retention",
  revenueDelta: "+18.7% YoY",
  source: "aggregate_demo",
};

export const revenueSeries: AnalyticsPoint[] = [
  { label: "Mon", value: 420 },
  { label: "Tue", value: 510 },
  { label: "Wed", value: 480 },
  { label: "Thu", value: 690 },
  { label: "Fri", value: 860 },
  { label: "Sat", value: 940 },
  { label: "Sun", value: 610 },
];

export const bookingSeries: AnalyticsPoint[] = [
  { label: "Mon", value: 18 },
  { label: "Tue", value: 22 },
  { label: "Wed", value: 19 },
  { label: "Thu", value: 28 },
  { label: "Fri", value: 31 },
  { label: "Sat", value: 36 },
  { label: "Sun", value: 14 },
];

export const growthSeries: AnalyticsPoint[] = [
  { label: "Jun", value: 120 },
  { label: "Jul", value: 132 },
  { label: "Aug", value: 141 },
  { label: "Sep", value: 150 },
  { label: "Oct", value: 168 },
  { label: "Nov", value: 184 },
];
