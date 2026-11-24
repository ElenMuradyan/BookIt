/** Shared domain types for the BookIt frontend and the future FastAPI backend. */

export type ID = string;
export type ISODateTime = string;
export type CurrencyCode = "USD";

export type UserStatus = "active" | "suspended" | "pending";
export type MembershipRole =
  | "owner"
  | "admin"
  | "manager"
  | "employee"
  | "receptionist"
  | "accountant";
export type MembershipStatus = "active" | "invited" | "suspended";

export type Permission =
  | "overview.view"
  | "calendar.view"
  | "calendar.manage"
  | "bookings.view"
  | "bookings.manage"
  | "services.view"
  | "services.manage"
  | "resources.view"
  | "resources.manage"
  | "events.view"
  | "events.manage"
  | "team.view"
  | "team.manage"
  | "customers.view"
  | "customers.notes"
  | "products.manage"
  | "orders.manage"
  | "finance.view"
  | "finance.manage"
  | "marketing.manage"
  | "settings.profile"
  | "settings.policies"
  | "settings.payments"
  | "settings.security"
  | "subscription.manage";

export type BookingModel = "appointment" | "resource" | "ticket" | "capacity";
export type UniversalBookingStatus =
  | "held"
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "rejected"
  | "no_show"
  | "expired";
export type DepositMode = "none" | "fixed" | "percent";
export type ResourceType =
  | "hotel_room"
  | "restaurant_table"
  | "sports_court"
  | "parking_space"
  | "coworking_desk"
  | "meeting_room"
  | "vehicle"
  | "equipment"
  | "custom";
export type PricingUnit = "per_slot" | "per_hour" | "per_day" | "per_night";

export type BusinessCategory =
  | "beauty"
  | "barber"
  | "healthcare"
  | "fitness"
  | "restaurant"
  | "hotel"
  | "sports"
  | "events"
  | "auto"
  | "travel"
  | "wellness"
  | "retail"
  | "other";

export type BusinessStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "suspended";

export type AppointmentStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "rejected"
  | "no_show";

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "ready_for_pickup"
  | "shipped"
  | "completed"
  | "cancelled"
  | "refunded";

export type PaymentStatus = "recorded" | "estimated" | "refunded" | "pending";
export type PaymentMethod = "card_token_pending" | "wallet" | "in_person" | "pay_on_pickup";

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export interface DayHours {
  closed: boolean;
  open: string;
  close: string;
}

export type WeeklyHours = Record<Weekday, DayHours>;

export interface User {
  id: ID;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  phone: string;
  avatarUrl?: string;
  dateOfBirth?: string;
  gender?: string;
  location?: string;
  language: string;
  interests: string[];
  emailVerified: boolean;
  phoneVerified: boolean;
  status: UserStatus;
  isPlatformAdmin: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface CustomerProfile {
  userId: ID;
  interests: string[];
  language: string;
  marketingOptIn: boolean;
  /** Explicit consent before using profile details or interests for recommendations. */
  personalizationConsent: boolean;
  consentUpdatedAt?: ISODateTime;
  /** Recorded payments are ledger entries. Estimates are never mixed into them silently. */
  spendingVisibility: "recorded_only" | "include_estimates";
  theme: "dark" | "light" | "system";
  notificationPreferences: NotificationPreferences;
}

export interface NotificationPreferences {
  booking: boolean;
  order: boolean;
  promotion: boolean;
  message: boolean;
  security: boolean;
}

export interface Address {
  id: ID;
  userId: ID;
  label: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

export interface Membership {
  id: ID;
  userId: ID;
  businessId: ID;
  role: MembershipRole;
  status: MembershipStatus;
  title?: string;
  createdAt: ISODateTime;
}

export interface Workspace {
  businessId: ID;
  businessName: string;
  role: MembershipRole;
  status: MembershipStatus;
  category: BusinessCategory;
  city: string;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface BusinessLocation {
  id: ID;
  label: string;
  line1: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  geo: GeoPoint;
}

export interface GalleryImage {
  id: ID;
  url: string;
  alt: string;
}

export interface Business {
  id: ID;
  ownerUserId: ID;
  name: string;
  legalName: string;
  category: BusinessCategory;
  description: string;
  country: string;
  city: string;
  address: string;
  location: BusinessLocation;
  phone: string;
  email: string;
  website?: string;
  socials: { label: string; url: string }[];
  logoUrl?: string;
  coverUrl?: string;
  gallery: GalleryImage[];
  hours: WeeklyHours;
  rating: number;
  reviewCount: number;
  priceLevel: 1 | 2 | 3 | 4;
  status: BusinessStatus;
  /** Public discovery only after approval. */
  isPublic: boolean;
  distanceMiles: number;
  tags: string[];
  cuisine?: string;
  specialty?: string;
  holidays: { date: string; name: string }[];
  blocked: { id: ID; date: string; start: string; end: string; reason: string }[];
  cancellationPolicy: string;
  bookingApproval: "automatic" | "manual";
  timezone?: string;
  minNoticeMinutes?: number;
  maxAdvanceDays?: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Fields safe to render on a public profile. */
export interface PublicBusiness {
  id: ID;
  name: string;
  category: BusinessCategory;
  description: string;
  city: string;
  address: string;
  location: BusinessLocation;
  phone: string;
  email: string;
  website?: string;
  socials: { label: string; url: string }[];
  logoUrl?: string;
  coverUrl?: string;
  gallery: GalleryImage[];
  hours: WeeklyHours;
  rating: number;
  reviewCount: number;
  priceLevel: 1 | 2 | 3 | 4;
  distanceMiles: number;
  tags: string[];
  cuisine?: string;
  specialty?: string;
  cancellationPolicy: string;
}

export interface BusinessApplication {
  id: ID;
  businessId: ID;
  applicantUserId: ID;
  status: BusinessStatus;
  submittedAt?: ISODateTime;
  reviewedAt?: ISODateTime;
  reviewerNote?: string;
  documents: { id: ID; name: string; kind: string; state: "placeholder" }[];
}

export interface Service {
  id: ID;
  businessId: ID;
  name: string;
  description: string;
  category: string;
  price: number;
  currency: CurrencyCode;
  durationMinutes: number;
  imageUrl?: string;
  employeeIds: ID[];
  active: boolean;
  depositAmount?: number;
  requiresApproval: boolean;
  cancellationPolicy: string;
}

export interface Employee {
  id: ID;
  businessId: ID;
  userId: ID;
  membershipId: ID;
  title: string;
  bio: string;
  serviceIds: ID[];
  hours: WeeklyHours;
  status: "available" | "in_appointment" | "off_shift" | "on_leave";
  rating: number;
}

export interface Appointment {
  id: ID;
  bookingId?: ID;
  businessId: ID;
  serviceId: ID;
  employeeId: ID;
  customerId: ID;
  start: ISODateTime;
  end: ISODateTime;
  status: AppointmentStatus;
  price: number;
  currency: CurrencyCode;
  paymentStatus: "unpaid" | "paid" | "refunded" | "deposit";
  paymentMethod?: PaymentMethod;
  confirmationMode: "automatic" | "manual";
  notes?: string;
  checkInCode?: string;
  checkedInAt?: ISODateTime;
  createdAt: ISODateTime;
}

export interface BusinessBookingConfig {
  id: ID;
  businessId: ID;
  bookingModel: BookingModel;
  enabled: boolean;
  displayLabel?: string;
  approvalMode: "automatic" | "manual";
  minNoticeMinutes: number;
  maxAdvanceDays: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  cancellationCutoffHours: number;
  cancellationFeePercent: number;
  cancellationPolicyText: string;
  depositMode: DepositMode;
  depositValue: number;
  holdTtlMinutes: number;
  allowOverbooking: boolean;
  settings?: Record<string, unknown>;
}

export interface Resource {
  id: ID;
  businessId: ID;
  name: string;
  resourceType: ResourceType;
  description: string;
  capacityPeople: number;
  unitsTotal: number;
  pricingUnit: PricingUnit;
  slotDurationMinutes?: number;
  minDurationMinutes: number;
  maxDurationMinutes?: number;
  bufferMinutes: number;
  basePrice: number;
  currency: CurrencyCode;
  depositAmount?: number;
  scheduleHours?: WeeklyHours;
  timezone?: string;
  attributes: Record<string, unknown>;
  imageUrl?: string;
  active: boolean;
}

export interface ResourceAvailabilitySlot {
  time: string;
  startAt: ISODateTime;
  endAt: ISODateTime;
  remainingUnits: number;
}

export interface ResourceAvailability {
  businessId: ID;
  resourceId: ID;
  date: string;
  timezone: string;
  unitsTotal: number;
  slots: ResourceAvailabilitySlot[];
}

export interface ResourceAllocation {
  id: ID;
  resourceId: ID;
  startAt: ISODateTime;
  endAt: ISODateTime;
  quantityUnits: number;
  partySize: number;
  status: string;
  unitPrice: number;
}

export interface ResourceBlock {
  id: ID;
  resourceId: ID;
  startAt: ISODateTime;
  endAt: ISODateTime;
  unitsBlocked: number;
  reason: string;
  createdAt: ISODateTime;
}

export interface ResourceSearchItem {
  resource: Resource;
  date: string;
  timezone: string;
  availableAtRequestedTime?: boolean | null;
  slots: ResourceAvailabilitySlot[];
}

export interface HotelStayOption {
  resource: Resource;
  checkInAt: ISODateTime;
  checkOutAt: ISODateTime;
  nights: number;
  remainingUnits: number;
  nightlyRate: number;
  totalPrice: number;
  depositDue: number;
}

export interface HotelStayAvailability {
  businessId: ID;
  checkIn: string;
  checkOut: string;
  checkInTime: string;
  checkOutTime: string;
  nights: number;
  guests: number;
  timezone: string;
  options: HotelStayOption[];
}

export interface TicketTier {
  id: ID;
  sessionId: ID;
  name: string;
  description: string;
  price: number;
  currency: CurrencyCode;
  capacityLimit?: number;
  reservedCount: number;
  remaining?: number;
  sortOrder: number;
  active: boolean;
}

export interface EventSession {
  id: ID;
  offeringId: ID;
  businessId: ID;
  instructorEmployeeId?: ID;
  resourceId?: ID;
  titleOverride?: string;
  startAt: ISODateTime;
  endAt: ISODateTime;
  timezone: string;
  salesStartAt?: ISODateTime;
  salesEndAt?: ISODateTime;
  totalCapacity: number;
  reservedCount: number;
  remainingCapacity: number;
  maxPerBooking: number;
  status: "scheduled" | "on_sale" | "sold_out" | "cancelled" | "completed";
  tiers: TicketTier[];
}

export interface EventOffering {
  id: ID;
  businessId: ID;
  bookingModel: "ticket" | "capacity";
  category: string;
  title: string;
  description: string;
  venueArea?: string;
  imageUrl?: string;
  cancellationPolicy: string;
  active: boolean;
  metadataJson?: Record<string, unknown>;
  sessions: EventSession[];
}

export interface TicketPass {
  id: ID;
  bookingId: ID;
  businessId: ID;
  sessionId: ID;
  tierId: ID;
  attendeeName?: string;
  attendeeEmail?: string;
  seatLabel?: string;
  unitPrice: number;
  passCode: string;
  status: "valid" | "checked_in" | "cancelled" | "refunded" | "expired";
  checkedInAt?: ISODateTime;
}

export interface SessionAttendee {
  passId: ID;
  bookingId: ID;
  sessionId: ID;
  tierId?: ID;
  tierName?: string;
  customerId: ID;
  customerName: string;
  attendeeName?: string;
  bookingStatus: string;
  paymentStatus: string;
  passCode: string;
  passStatus: string;
  checkedInAt?: ISODateTime;
  createdAt: ISODateTime;
}

export interface UniversalBooking {
  id: ID;
  businessId: ID;
  customerId: ID;
  bookingModel: BookingModel;
  title: string;
  startAt?: ISODateTime;
  endAt?: ISODateTime;
  timezone: string;
  quantity: number;
  status: UniversalBookingStatus;
  confirmationMode: "automatic" | "manual";
  subtotalAmount: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  depositDueAmount: number;
  amountPaid: number;
  refundedAmount: number;
  currency: CurrencyCode;
  paymentStatus: string;
  paymentMethod?: PaymentMethod;
  cancellationCutoffAt?: ISODateTime;
  cancellationPolicySnapshot?: string;
  notes?: string;
  metadataJson?: Record<string, unknown>;
  holdExpiresAt?: ISODateTime;
  checkInCode?: string;
  checkedInAt?: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  legacyAppointmentId?: ID;
  resourceAllocations: ResourceAllocation[];
  ticketPasses: TicketPass[];
}

export interface UniversalBookingCreateInput {
  bookingModel: BookingModel;
  businessId?: ID;
  customerId?: ID;
  serviceId?: ID;
  employeeId?: ID;
  date?: string;
  time?: string;
  resourceId?: ID;
  startAt?: ISODateTime;
  endAt?: ISODateTime;
  quantityUnits?: number;
  partySize?: number;
  sessionId?: ID;
  ticketItems?: { tierId: ID; quantity: number }[];
  attendeeName?: string;
  attendeeEmail?: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
  idempotencyKey?: string;
}

export interface UniversalCheckInResult {
  matchedType: "booking" | "ticket_pass";
  booking: UniversalBooking;
  ticketPass?: TicketPass;
}

export interface Review {
  id: ID;
  businessId: ID;
  authorId: ID;
  appointmentId?: ID;
  productId?: ID;
  rating: number;
  title: string;
  body: string;
  createdAt: ISODateTime;
  status: "published" | "reported" | "hidden";
}

export interface ProductCategory {
  id: ID;
  name: string;
  slug: string;
}

export interface ProductVariant {
  id: ID;
  sku: string;
  label: string;
  stock: number;
  priceDelta: number;
  size?: string;
  color?: string;
}

export interface Product {
  id: ID;
  businessId: ID;
  categoryId: ID;
  name: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  currency: CurrencyCode;
  imageUrl: string;
  images: GalleryImage[];
  stock: number;
  active: boolean;
  variants: ProductVariant[];
  rating: number;
  reviewCount: number;
  createdAt: ISODateTime;
  featured: boolean;
  popular: boolean;
  discountLabel?: string;
}

export interface CartItem {
  id: ID;
  productId: ID;
  variantId?: ID;
  quantity: number;
  sellerId: ID;
}

export interface Cart {
  id: ID;
  userId: ID;
  items: CartItem[];
  updatedAt: ISODateTime;
}

export interface OrderItem {
  id: ID;
  productId: ID;
  variantId?: ID;
  name: string;
  quantity: number;
  unitPrice: number;
  sellerId: ID;
}

export interface Order {
  id: ID;
  checkoutGroupId: ID;
  userId: ID;
  sellerId: ID;
  items: OrderItem[];
  status: OrderStatus;
  paymentStatus: "unpaid" | "authorized_demo" | "paid" | "refunded";
  paymentMethod: PaymentMethod;
  subtotal: number;
  deliveryFee: number;
  total: number;
  currency: CurrencyCode;
  addressId: ID;
  deliveryMethod: "standard" | "express" | "pickup";
  trackingPlaceholder?: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Payment {
  id: ID;
  payerId: ID;
  businessId: ID;
  amount: number;
  currency: CurrencyCode;
  status: PaymentStatus;
  method: PaymentMethod;
  referenceType: "appointment" | "booking" | "order" | "subscription";
  referenceId: ID;
  createdAt: ISODateTime;
  /** Present only to explain estimated rows. Never a card number. */
  note?: string;
}

export type PlanId = "starter" | "professional" | "enterprise";

export interface Plan {
  id: PlanId;
  name: string;
  monthlyPrice: number;
  description: string;
  features: string[];
}

export interface Subscription {
  id: ID;
  businessId: ID;
  planId: PlanId;
  status: "trialing" | "active" | "past_due" | "canceled";
  trialEndsAt?: ISODateTime;
  renewsAt?: ISODateTime;
  startedAt: ISODateTime;
}

export interface Invoice {
  id: ID;
  businessId: ID;
  amount: number;
  status: "trial" | "open" | "paid" | "refunded";
  description: string;
  issuedAt: ISODateTime;
}

export type NotificationCategory = "booking" | "order" | "promotion" | "message" | "security";

export interface Notification {
  id: ID;
  userId: ID;
  businessId?: ID;
  category: NotificationCategory;
  title: string;
  body: string;
  read: boolean;
  createdAt: ISODateTime;
  href?: string;
}

export interface Expense {
  id: ID;
  businessId: ID;
  category: string;
  amount: number;
  note: string;
  incurredOn: string;
  source: "manual" | "recorded";
}

export interface Advertisement {
  id: ID;
  businessId: ID;
  title: string;
  body: string;
  placement: "home" | "explore" | "marketplace";
  status: "active" | "paused" | "ended";
  budget: number;
  startsAt: ISODateTime;
  endsAt: ISODateTime;
}

export interface Report {
  id: ID;
  reporterId: ID;
  targetType: "user" | "business" | "review" | "order";
  targetId: ID;
  reason: string;
  details: string;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  createdAt: ISODateTime;
}

export interface Favorite {
  id: ID;
  userId: ID;
  targetType: "business" | "service" | "employee" | "product";
  targetId: ID;
  collection: string;
  createdAt: ISODateTime;
}

export interface PromoCode {
  id: ID;
  businessId: ID;
  code: string;
  percentOff: number;
  active: boolean;
  expiresOn: string;
  redemptions: number;
}

export interface Campaign {
  id: ID;
  businessId: ID;
  name: string;
  channel: "email" | "push" | "sponsored";
  status: "draft" | "scheduled" | "active" | "ended";
  audience: string;
  startsOn: string;
  message: string;
}

export interface CustomerNote {
  id: ID;
  businessId: ID;
  customerId: ID;
  authorId: ID;
  body: string;
  createdAt: ISODateTime;
}

export interface PlatformStats {
  totalUsers: number;
  totalBusinesses: number;
  pendingApplications: number;
  approvedBusinesses: number;
  totalBookings: number;
  totalOrders: number;
  platformRevenue: number;
  activeSubscriptions: number;
  userDelta: string;
  businessDelta: string;
  subscriptionNote: string;
  revenueDelta: string;
  /** These headline figures are aggregate demonstration data, not a sum of the local seed ledger. */
  source: "aggregate_demo";
}

export interface AnalyticsPoint {
  label: string;
  value: number;
}

export interface AppState {
  users: User[];
  customerProfiles: CustomerProfile[];
  addresses: Address[];
  memberships: Membership[];
  businesses: Business[];
  applications: BusinessApplication[];
  services: Service[];
  employees: Employee[];
  appointments: Appointment[];
  bookingConfigs: BusinessBookingConfig[];
  resources: Resource[];
  resourceBlocks: ResourceBlock[];
  eventOfferings: EventOffering[];
  bookings: UniversalBooking[];
  reviews: Review[];
  productCategories: ProductCategory[];
  products: Product[];
  carts: Cart[];
  orders: Order[];
  payments: Payment[];
  plans: Plan[];
  subscriptions: Subscription[];
  invoices: Invoice[];
  notifications: Notification[];
  expenses: Expense[];
  advertisements: Advertisement[];
  reports: Report[];
  favorites: Favorite[];
  promoCodes: PromoCode[];
  campaigns: Campaign[];
  notes: CustomerNote[];
  platformStats: PlatformStats;
  revenueSeries: AnalyticsPoint[];
  bookingSeries: AnalyticsPoint[];
  growthSeries: AnalyticsPoint[];
}

export interface SessionClaims {
  userId: ID;
  exp: number;
  flags: string;
}
