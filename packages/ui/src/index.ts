import type {
  AppointmentStatus,
  BusinessCategory,
  MembershipRole,
  OrderStatus,
  Permission,
} from "@bookit/types";
import type { Tone } from "@bookit/design-system";

export interface StatusMeta {
  label: string;
  tone: Tone;
}

export function appointmentStatus(status: AppointmentStatus): StatusMeta {
  const map: Record<AppointmentStatus, StatusMeta> = {
    pending: { label: "Pending", tone: "warning" },
    confirmed: { label: "Confirmed", tone: "success" },
    completed: { label: "Completed", tone: "info" },
    cancelled: { label: "Cancelled", tone: "neutral" },
    rejected: { label: "Rejected", tone: "danger" },
    no_show: { label: "No-show", tone: "danger" },
  };
  return map[status];
}

export function orderStatus(status: OrderStatus): StatusMeta {
  const map: Record<OrderStatus, StatusMeta> = {
    pending: { label: "Pending", tone: "warning" },
    confirmed: { label: "Confirmed", tone: "info" },
    processing: { label: "Processing", tone: "brand" },
    ready_for_pickup: { label: "Ready for pickup", tone: "success" },
    shipped: { label: "Shipped", tone: "info" },
    completed: { label: "Completed", tone: "success" },
    cancelled: { label: "Cancelled", tone: "neutral" },
    refunded: { label: "Refunded", tone: "warning" },
  };
  return map[status];
}

export const categoryLabels: Record<BusinessCategory, string> = {
  beauty: "Hair & styling",
  barber: "Barbershops",
  healthcare: "Healthcare",
  fitness: "Fitness & gym",
  restaurant: "Restaurants",
  hotel: "Hotels",
  auto: "Auto detailing",
  travel: "Travel",
  wellness: "Spa & wellness",
  retail: "Retail",
  other: "Other",
};

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  permission?: Permission;
}

export const customerNav: NavItem[] = [
  { href: "/home", label: "Home", icon: "home" },
  { href: "/explore", label: "Explore", icon: "compass" },
  { href: "/bookings", label: "Bookings", icon: "calendar" },
  { href: "/favorites", label: "Favorites", icon: "heart" },
  { href: "/account", label: "My Account", icon: "user" },
];

export const customerSecondary: NavItem[] = [
  { href: "/marketplace", label: "Marketplace", icon: "bag" },
  { href: "/orders", label: "My Orders", icon: "package" },
  { href: "/spending", label: "My Spending", icon: "chart" },
  { href: "/notifications", label: "Notifications", icon: "bell" },
];

export const workspaceNav: NavItem[] = [
  { href: "/workspace", label: "Overview", icon: "home", permission: "overview.view" },
  { href: "/workspace/calendar", label: "Calendar", icon: "calendar", permission: "calendar.view" },
  { href: "/workspace/bookings", label: "Bookings", icon: "clipboard", permission: "bookings.view" },
  { href: "/workspace/services", label: "Services", icon: "spark", permission: "services.view" },
  { href: "/workspace/team", label: "Team", icon: "users", permission: "team.view" },
  { href: "/workspace/customers", label: "Customers", icon: "user", permission: "customers.view" },
  { href: "/workspace/products", label: "Products", icon: "bag", permission: "products.manage" },
  { href: "/workspace/orders", label: "Orders", icon: "package", permission: "orders.manage" },
  { href: "/workspace/finance", label: "Finance", icon: "chart", permission: "finance.view" },
  { href: "/workspace/marketing", label: "Marketing", icon: "megaphone", permission: "marketing.manage" },
  { href: "/workspace/settings", label: "Settings", icon: "settings", permission: "settings.profile" },
];

export const adminNav: NavItem[] = [
  { href: "/admin", label: "Overview", icon: "home" },
  { href: "/admin/applications", label: "Business Applications", icon: "inbox" },
  { href: "/admin/businesses", label: "Businesses", icon: "store" },
  { href: "/admin/users", label: "Users", icon: "users" },
  { href: "/admin/workspaces", label: "Workspaces", icon: "layers" },
  { href: "/admin/subscriptions", label: "Subscriptions", icon: "card" },
  { href: "/admin/payments", label: "Payments", icon: "wallet" },
  { href: "/admin/advertisements", label: "Advertisements", icon: "megaphone" },
  { href: "/admin/reports", label: "Reports", icon: "flag" },
  { href: "/admin/reviews", label: "Reviews", icon: "star" },
  { href: "/admin/analytics", label: "Analytics", icon: "chart" },
  { href: "/admin/settings", label: "Settings", icon: "settings" },
];

export const roleLabels: Record<MembershipRole, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  employee: "Employee",
  receptionist: "Receptionist",
  accountant: "Accountant",
};

export const exploreFilterHints: Record<string, string[]> = {
  restaurant: ["Cuisine", "Price range", "Neighborhood", "Available tables"],
  beauty: ["Service", "Price", "Stylist", "Available date"],
  barber: ["Service", "Barber", "Price", "Available date"],
  healthcare: ["Specialty", "Location", "Available appointment", "Provider"],
  fitness: ["Class type", "Coach", "Time of day"],
  hotel: ["Dates", "Guests", "Neighborhood"],
  auto: ["Service", "Vehicle type", "Same-day"],
  travel: ["Destination", "Dates", "Group size"],
  wellness: ["Treatment", "Duration", "Therapist"],
  retail: ["Product type", "Price", "In stock"],
  other: ["Category", "Price", "Rating"],
};

export const customerSettingSections = [
  { id: "profile", label: "Personal information" },
  { id: "photo", label: "Profile picture" },
  { id: "contact", label: "Email and phone" },
  { id: "security", label: "Password and security" },
  { id: "connected", label: "Connected accounts" },
  { id: "addresses", label: "Addresses" },
  { id: "payments", label: "Payment methods" },
  { id: "language", label: "Language" },
  { id: "theme", label: "Theme" },
  { id: "notifications", label: "Notification preferences" },
  { id: "privacy", label: "Privacy settings" },
  { id: "data", label: "Data controls" },
  { id: "help", label: "Help center" },
] as const;

export const businessSettingSections = [
  { id: "profile", label: "Business profile" },
  { id: "locations", label: "Locations" },
  { id: "hours", label: "Working hours" },
  { id: "booking", label: "Booking policies" },
  { id: "cancellation", label: "Cancellation policies" },
  { id: "payments", label: "Payment settings" },
  { id: "permissions", label: "Team permissions" },
  { id: "notifications", label: "Notifications" },
  { id: "subscription", label: "Subscription" },
  { id: "security", label: "Security" },
  { id: "integrations", label: "Integrations" },
] as const;
