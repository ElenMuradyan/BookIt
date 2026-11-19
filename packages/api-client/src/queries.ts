import type {
  AppState,
  Appointment,
  Business,
  Order,
  Product,
  PublicBusiness,
  Service,
  Workspace,
} from "@bookit/types";
import { fullName, toPublicBusiness } from "@bookit/utils";

export interface CatalogQuery {
  q?: string;
  category?: string;
  minRating?: number;
  maxPrice?: number;
  minPrice?: number;
  sort?: "rating" | "price_asc" | "price_desc" | "distance" | "newest";
  productCategory?: string;
  cuisine?: string;
  specialty?: string;
  inStock?: boolean;
}

function textMatch(haystack: string, query?: string): boolean {
  if (!query?.trim()) return true;
  return haystack.toLowerCase().includes(query.trim().toLowerCase());
}

export function publicBusinesses(state: AppState): PublicBusiness[] {
  return state.businesses.filter((business) => business.isPublic && business.status === "approved").map(toPublicBusiness);
}

export function findBusiness(state: AppState, id: string): Business | undefined {
  return state.businesses.find((business) => business.id === id);
}

export function publicBusinessById(state: AppState, id: string): PublicBusiness | undefined {
  const business = findBusiness(state, id);
  if (!business?.isPublic || business.status !== "approved") return undefined;
  return toPublicBusiness(business);
}

export function workspacesFor(state: AppState, userId: string): Workspace[] {
  return state.memberships
    .filter((membership) => membership.userId === userId && membership.status !== "suspended")
    .map((membership) => {
      const business = findBusiness(state, membership.businessId);
      return {
        businessId: membership.businessId,
        businessName: business?.name ?? "Workspace",
        role: membership.role,
        status: membership.status,
        category: business?.category ?? "other",
        city: business?.city ?? "",
      };
    });
}

export function searchBusinesses(state: AppState, query: CatalogQuery): PublicBusiness[] {
  const rows = publicBusinesses(state).filter((business) => {
    const blob = `${business.name} ${business.description} ${business.city} ${business.tags.join(" ")} ${business.category}`;
    if (!textMatch(blob, query.q)) return false;
    if (query.category && business.category !== query.category) return false;
    if (query.minRating && business.rating < query.minRating) return false;
    if (query.cuisine && business.cuisine !== query.cuisine) return false;
    if (query.specialty && business.specialty !== query.specialty) return false;
    return true;
  });
  return sortBusinesses(rows, query.sort);
}

function sortBusinesses(rows: PublicBusiness[], sort?: CatalogQuery["sort"]): PublicBusiness[] {
  const copy = [...rows];
  if (sort === "distance") copy.sort((a, b) => a.distanceMiles - b.distanceMiles);
  else if (sort === "rating") copy.sort((a, b) => b.rating - a.rating);
  else copy.sort((a, b) => b.rating - a.rating);
  return copy;
}

export function servicesForBusiness(state: AppState, businessId: string): Service[] {
  return state.services.filter((service) => service.businessId === businessId && service.active);
}

export function searchServices(state: AppState, query: CatalogQuery): Service[] {
  return state.services.filter((service) => {
    const business = findBusiness(state, service.businessId);
    if (!business?.isPublic || !service.active) return false;
    const blob = `${service.name} ${service.description} ${service.category} ${business.name}`;
    if (!textMatch(blob, query.q)) return false;
    if (query.category && business.category !== query.category) return false;
    if (query.maxPrice !== undefined && service.price > query.maxPrice) return false;
    if (query.minPrice !== undefined && service.price < query.minPrice) return false;
    return true;
  });
}

export function searchProducts(state: AppState, query: CatalogQuery): Product[] {
  const rows = state.products.filter((product) => {
    const business = findBusiness(state, product.businessId);
    if (!business?.isPublic || !product.active) return false;
    const category = state.productCategories.find((item) => item.id === product.categoryId);
    const blob = `${product.name} ${product.description} ${business.name} ${category?.name ?? ""}`;
    if (!textMatch(blob, query.q)) return false;
    if (query.productCategory && product.categoryId !== query.productCategory) return false;
    if (query.maxPrice !== undefined && product.price > query.maxPrice) return false;
    if (query.minPrice !== undefined && product.price < query.minPrice) return false;
    if (query.minRating && product.rating < query.minRating) return false;
    if (query.inStock && product.stock <= 0) return false;
    return true;
  });
  const copy = [...rows];
  if (query.sort === "price_asc") copy.sort((a, b) => a.price - b.price);
  else if (query.sort === "price_desc") copy.sort((a, b) => b.price - a.price);
  else if (query.sort === "newest") copy.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  else copy.sort((a, b) => Number(b.popular) - Number(a.popular) || b.rating - a.rating);
  return copy;
}

export function userById(state: AppState, id: string) {
  return state.users.find((user) => user.id === id);
}

export function displayUser(state: AppState, id: string): string {
  const user = userById(state, id);
  return user ? fullName(user) : "Guest";
}

export function customerAppointments(state: AppState, userId: string): Appointment[] {
  return state.appointments
    .filter((appointment) => appointment.customerId === userId)
    .sort((a, b) => (a.start < b.start ? 1 : -1));
}

export function businessAppointments(state: AppState, businessId: string): Appointment[] {
  return state.appointments
    .filter((appointment) => appointment.businessId === businessId)
    .sort((a, b) => (a.start > b.start ? 1 : -1));
}

export function customerOrders(state: AppState, userId: string): Order[] {
  return state.orders.filter((order) => order.userId === userId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function sellerOrders(state: AppState, businessId: string): Order[] {
  return state.orders.filter((order) => order.sellerId === businessId);
}

export function cartFor(state: AppState, userId: string) {
  return state.carts.find((cart) => cart.userId === userId);
}
