import type { Employee, Product, ProductCategory, Service } from "@bookit/types";
import { day, img, weekly } from "./helpers";

const salon = weekly(day("09:00", "19:00"), day("10:00", "18:00"));
const clinic = weekly(day("08:00", "17:00"), day("09:00", "13:00"));
const shop = weekly(day("10:00", "19:00"), day("11:00", "17:00"));

export const services: Service[] = [
  svc("svc_signature", "biz_aura", "Signature Haircut & Style", "Cut, wash, and blow-dry.", "Hair", 75, 45, ["emp_vance", "emp_marcus"], "https://images.unsplash.com/photo-1562322140-8baeececf3df?auto=format&fit=crop&w=800&q=80"),
  svc("svc_balayage", "biz_aura", "Full Balayage & Gloss", "Consultation included.", "Color", 190, 150, ["emp_marcus"], "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80"),
  svc("svc_facial", "biz_aura", "Hydra-Facial Express", "Deep cleanse and peel.", "Skincare", 85, 30, ["emp_priya", "emp_sora"], "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=800&q=80"),
  svc("svc_lumina_cut", "biz_lumina", "Deluxe Haircut & Scalp", "Scalp treatment with the cut.", "Hair", 92, 60, ["emp_lumina"], "https://images.unsplash.com/photo-1519415387722-a1c3bbef716c?auto=format&fit=crop&w=800&q=80"),
  svc("svc_massage", "biz_zenith", "Deep Tissue Therapy", "60 focused minutes.", "Massage", 120, 60, ["emp_zenith"], "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=800&q=80"),
  svc("svc_beard", "biz_crown", "Executive Beard Trim", "Shape, hot towel, and finish.", "Beard", 35, 30, ["emp_marcus_crown"], "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=800&q=80"),
  svc("svc_fade", "biz_crown", "Classic Fade", "Scissor and clipper cut.", "Cut", 42, 40, ["emp_marcus_crown"], "https://images.unsplash.com/photo-1599351431202-1e0f0137899a?auto=format&fit=crop&w=800&q=80"),
  svc("svc_cleaning", "biz_opal", "Preventive Cleaning", "Exam and cleaning with a dentist.", "Dental", 95, 50, ["emp_noah", "emp_sarah"], "https://images.unsplash.com/photo-1606811971618-4486d14f3f99?auto=format&fit=crop&w=800&q=80"),
  svc("svc_coach", "biz_apex", "Strength Intro", "One-to-one coaching session.", "Training", 70, 50, ["emp_liam"], "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=800&q=80"),
  svc("svc_table", "biz_harbor", "Dinner for two", "A reserved table at 7:00-friendly seatings.", "Table", 0, 90, ["emp_host"], "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=800&q=80"),
  svc("svc_daypass", "biz_northline", "Courtyard day pass", "Workspace and courtyard access.", "Stay", 45, 480, ["emp_desk"], "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80"),
  svc("svc_detail", "biz_volt", "Ceramic detail", "Wash, decontamination, and coating.", "Detail", 220, 180, ["emp_volt"], "https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?auto=format&fit=crop&w=800&q=80"),
  svc("svc_wheel", "biz_komorebi", "Wheel throwing intro", "Clay, tools, and firing credit.", "Workshop", 65, 120, ["emp_aria"], "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?auto=format&fit=crop&w=800&q=80"),
  svc("svc_fit", "biz_trailhead", "Shoe fit session", "Gait check and size recommendation.", "Fit", 0, 25, ["emp_fit"], "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=800&q=80"),
  svc("svc_trip", "biz_passage", "Weekend itinerary", "A planned two-day route with reservations list.", "Travel", 80, 45, ["emp_passage"], "https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=800&q=80"),
];

function svc(
  id: string,
  businessId: string,
  name: string,
  description: string,
  category: string,
  price: number,
  durationMinutes: number,
  employeeIds: string[],
  imageUrl: string,
): Service {
  return {
    id,
    businessId,
    name,
    description,
    category,
    price,
    currency: "USD",
    durationMinutes,
    imageUrl,
    employeeIds,
    active: true,
    requiresApproval: businessId === "biz_opal",
    cancellationPolicy:
      businessId === "biz_opal"
        ? "48 hours notice for dental visits."
        : "Free cancellation up to 24 hours before the visit.",
  };
}

export const employees: Employee[] = [
  emp("emp_vance", "biz_aura", "usr_elena_vance", "mem_vance_aura", "Senior Stylist & Colorist", ["svc_signature"], 4.9, "available"),
  emp("emp_marcus", "biz_aura", "usr_marcus", "mem_marcus_aura", "Color Director", ["svc_signature", "svc_balayage"], 4.9, "in_appointment"),
  emp("emp_priya", "biz_aura", "usr_priya", "mem_priya_aura", "Medical Esthetician", ["svc_facial"], 4.8, "off_shift"),
  emp("emp_sora", "biz_aura", "usr_sora", "mem_sora_aura", "Esthetician", ["svc_facial"], 4.7, "available"),
  emp("emp_lumina", "biz_lumina", "usr_sophia", "mem_sophia_luxe", "Senior Stylist", ["svc_lumina_cut"], 4.8, "available"),
  emp("emp_zenith", "biz_zenith", "usr_aria", "mem_liam_apex", "Massage therapist", ["svc_massage"], 4.9, "available"),
  emp("emp_marcus_crown", "biz_crown", "usr_marcus", "mem_marcus_crown", "Owner barber", ["svc_beard", "svc_fade"], 4.9, "available"),
  emp("emp_noah", "biz_opal", "usr_noah", "mem_noah_opal", "Dentist", ["svc_cleaning"], 4.8, "available"),
  emp("emp_sarah", "biz_opal", "usr_sarah", "mem_sarah_opal", "Dentist", ["svc_cleaning"], 4.9, "available"),
  emp("emp_liam", "biz_apex", "usr_liam", "mem_liam_apex", "Coach", ["svc_coach"], 4.7, "available"),
  emp("emp_host", "biz_harbor", "usr_chloe", "mem_jordan_aura", "Host", ["svc_table"], 4.6, "available"),
  emp("emp_desk", "biz_northline", "usr_david", "mem_david_aura_acc", "Front desk", ["svc_daypass"], 4.5, "available"),
  emp("emp_volt", "biz_volt", "usr_noah", "mem_noah_opal", "Detail lead", ["svc_detail"], 4.7, "available"),
  emp("emp_aria", "biz_komorebi", "usr_aria", "mem_liam_apex", "Artist", ["svc_wheel"], 5, "available"),
  emp("emp_fit", "biz_trailhead", "usr_liam", "mem_liam_apex", "Fitter", ["svc_fit"], 4.6, "available"),
  emp("emp_passage", "biz_passage", "usr_noah", "mem_noah_opal", "Planner", ["svc_trip"], 4.8, "available"),
];

function emp(
  id: string,
  businessId: string,
  userId: string,
  membershipId: string,
  title: string,
  serviceIds: string[],
  rating: number,
  status: Employee["status"],
): Employee {
  const hours = businessId === "biz_opal" ? clinic : businessId === "biz_trailhead" ? shop : salon;
  return { id, businessId, userId, membershipId, title, bio: title, serviceIds, hours, status, rating };
}

export const productCategories: ProductCategory[] = [
  { id: "cat_electronics", name: "Electronics", slug: "electronics" },
  { id: "cat_clothing", name: "Clothing", slug: "clothing" },
  { id: "cat_accessories", name: "Accessories", slug: "accessories" },
  { id: "cat_home", name: "Home", slug: "home" },
  { id: "cat_sports", name: "Sports", slug: "sports" },
  { id: "cat_beauty", name: "Beauty", slug: "beauty" },
  { id: "cat_gifts", name: "Gifts", slug: "gifts" },
];

export const products: Product[] = [
  product("prd_headphones", "biz_circuit", "cat_electronics", "Studio Headphones", "Closed-back headphones for desks and travel.", 189, 210, "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80", 24, true, true, [
    { id: "var_hp_black", sku: "HP-BLK", label: "Black", stock: 14, priceDelta: 0, color: "Black" },
    { id: "var_hp_sand", sku: "HP-SND", label: "Sand", stock: 10, priceDelta: 0, color: "Sand" },
  ]),
  product("prd_charger", "biz_circuit", "cat_electronics", "GaN Travel Charger", "65W charger with two USB-C ports.", 48, undefined, "https://images.unsplash.com/photo-1583863788434-e58a36330cf0?auto=format&fit=crop&w=900&q=80", 80, false, true),
  product("prd_runners", "biz_trailhead", "cat_clothing", "Tempo Runners", "Daily trainer with a wide fit option.", 129, 150, "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80", 30, true, true, [
    { id: "var_run_8", sku: "RN-8", label: "US 8", stock: 6, priceDelta: 0, size: "8" },
    { id: "var_run_9", sku: "RN-9", label: "US 9", stock: 8, priceDelta: 0, size: "9" },
    { id: "var_run_10", sku: "RN-10", label: "US 10", stock: 4, priceDelta: 0, size: "10" },
  ], "14% off"),
  product("prd_jacket", "biz_trailhead", "cat_clothing", "Trail Shell Jacket", "Packable rain shell.", 168, undefined, "https://images.unsplash.com/photo-1521223890158-f9f7c3d5d504?auto=format&fit=crop&w=900&q=80", 12, false, false, [
    { id: "var_jk_s", sku: "JK-S", label: "S", stock: 3, priceDelta: 0, size: "S" },
    { id: "var_jk_m", sku: "JK-M", label: "M", stock: 5, priceDelta: 0, size: "M" },
  ]),
  product("prd_scarf", "biz_lumina", "cat_accessories", "Silk Studio Scarf", "Printed silk, made in a short run.", 45, undefined, "https://images.unsplash.com/photo-1601924994987-69e26d50dc26?auto=format&fit=crop&w=900&q=80", 18, false, false),
  product("prd_table", "biz_hearth", "cat_home", "Oak Side Table", "Solid oak, oiled finish.", 240, undefined, "https://images.unsplash.com/photo-1533090481720-856c6e3c1fdc?auto=format&fit=crop&w=900&q=80", 6, true, false),
  product("prd_throw", "biz_hearth", "cat_home", "Linen Throw", "Stonewashed linen, 50 by 70 inches.", 68, 82, "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=900&q=80", 20, false, true),
  product("prd_mat", "biz_trailhead", "cat_sports", "Training Mat", "Non-slip mat for hotel rooms and gyms.", 42, undefined, "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=900&q=80", 40, false, true),
  product("prd_bands", "biz_apex", "cat_sports", "Resistance Set", "Three bands with a cotton pouch.", 36, undefined, "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=900&q=80", 50, false, false),
  product("prd_serum", "biz_aura", "cat_beauty", "Hydra-Glow Serum", "The serum used after Aura facials.", 36, undefined, "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=900&q=80", 42, true, true),
  product("prd_oil", "biz_aura", "cat_beauty", "Keratin Repair Oil", "A few drops on damp hair.", 28, undefined, "https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=900&q=80", 36, false, false),
  product("prd_bowl", "biz_komorebi", "cat_gifts", "Stoneware Bowl", "Speckled bowl, food safe.", 54, undefined, "https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=900&q=80", 15, true, true),
  product("prd_tea", "biz_komorebi", "cat_gifts", "Tea Set", "Pot and two cups.", 88, 110, "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=900&q=80", 8, false, false, [], "Gift edit"),
  product("prd_kit", "biz_crown", "cat_gifts", "Grooming Kit", "Oil, comb, and towel.", 38, undefined, "https://images.unsplash.com/photo-1621607512022-6aecc4fed814?auto=format&fit=crop&w=900&q=80", 22, false, false),
  product("prd_kit_spa", "biz_zenith", "cat_gifts", "Recovery Kit", "Balm, roller, and eye pillow.", 72, undefined, "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=900&q=80", 11, false, true),
];

function product(
  id: string,
  businessId: string,
  categoryId: string,
  name: string,
  description: string,
  price: number,
  compareAtPrice: number | undefined,
  imageUrl: string,
  stock: number,
  featured: boolean,
  popular: boolean,
  variants: Product["variants"] = [],
  discountLabel?: string,
): Product {
  return {
    id,
    businessId,
    categoryId,
    name,
    description,
    price,
    compareAtPrice,
    currency: "USD",
    imageUrl,
    images: [img(id, name), { id: `${id}_b`, url: imageUrl, alt: name }],
    stock,
    active: stock > 0,
    variants,
    rating: 4.6,
    reviewCount: 12 + stock,
    createdAt: featured ? "2026-11-02T12:00:00" : "2026-09-14T12:00:00",
    featured,
    popular,
    discountLabel,
  };
}
