import assert from "node:assert/strict";
import {
  checkInUniversalQr,
  checkout,
  createAppointment,
  createUniversalBooking,
  demoPasswordHint,
  getState,
  login,
  loginBusiness,
  publicBusinesses,
  resetDemoState,
  setUniversalBookingStatus,
  submitBusinessApplication,
} from "./index";

resetDemoState();

const auth = login({ identifier: "customer@bookit.demo", password: demoPasswordHint(), remember: true });
if (!auth.ok) {
  throw new Error(`Customer login should succeed: ${auth.error}`);
}

const state = getState();
const venues = publicBusinesses(state);
assert.ok(venues.length > 0, "Approved businesses should be visible");

const service = state.services.find((s) => s.businessId === venues[0]!.id && s.active);
const employee = state.employees.find((e) => e.businessId === venues[0]!.id);
if (!service || !employee) {
  throw new Error("Seed venue should have an active service and employee");
}

const booked = createAppointment({
  customerId: auth.data.userId,
  serviceId: service.id,
  employeeId: employee.id,
  date: "2026-11-20",
  time: "11:00",
});
if (!booked.ok) {
  throw new Error(`Booking creation should succeed: ${booked.error}`);
}

const resBooking = createUniversalBooking(auth.data.userId, {
  bookingModel: "resource",
  businessId: "biz_harbor",
  resourceId: "res_harbor_patio",
  startAt: "2026-12-20T19:00:00",
  endAt: "2026-12-20T20:30:00",
  quantityUnits: 1,
  partySize: 2,
});
if (!resBooking.ok) {
  throw new Error(`Resource booking should succeed: ${resBooking.error}`);
}

const ticketBooking = createUniversalBooking(auth.data.userId, {
  bookingModel: "ticket",
  businessId: "biz_aura",
  sessionId: "ses_aura_live_1",
  ticketItems: [{ tierId: "tier_aura_ga", quantity: 2 }],
});
if (!ticketBooking.ok) {
  throw new Error(`Ticket booking should succeed: ${ticketBooking.error}`);
}
assert.equal(ticketBooking.data.ticketPasses.length, 2, "Two ticket passes should be issued");

const qrRes = checkInUniversalQr(
  "biz_aura",
  ticketBooking.data.ticketPasses[0]!.passCode,
  auth.data.userId,
);
if (!qrRes.ok) {
  throw new Error(`Universal QR check-in should succeed: ${qrRes.error}`);
}

const cancelledRes = setUniversalBookingStatus(resBooking.data.id, "cancelled", auth.data.userId);
if (!cancelledRes.ok) {
  throw new Error(`Resource booking cancellation should succeed: ${cancelledRes.error}`);
}

const orderResult = checkout({
  userId: auth.data.userId,
  addressId: state.addresses.find((a) => a.userId === auth.data.userId)?.id ?? "",
  deliveryMethod: "standard",
  paymentMethod: "wallet",
});
if (!orderResult.ok) {
  throw new Error(`Marketplace checkout should succeed: ${orderResult.error}`);
}

const existingEmailBiz = submitBusinessApplication({
  businessName: "Duplicate Check Studio",
  legalName: "Duplicate Check Studio LLC",
  category: "beauty",
  country: "United States",
  city: "Seattle",
  address: "1200 Western Ave",
  phone: "+1 206 555 0111",
  email: "hello@duplicate.test",
  website: "",
  description: "Testing existing email sign-in enforcement during business onboarding.",
  ownerName: "Elena",
  ownerEmail: "customer@bookit.demo",
  ownerPhone: "+1 206 555 0112",
  ownerPassword: "StrongOwnerPass1!",
  ownerConfirmPassword: "StrongOwnerPass1!",
});
assert.equal(existingEmailBiz.ok, false, "Existing unauthenticated owner email must require sign-in");
if (!existingEmailBiz.ok) {
  assert.equal(existingEmailBiz.status, 401);
}

const newOwnerBiz = submitBusinessApplication({
  businessName: "Rainier Sound Lab",
  legalName: "Rainier Sound Lab LLC",
  category: "beauty",
  country: "United States",
  city: "Seattle",
  address: "1400 Pike St",
  phone: "+1 206 555 0144",
  email: "hello@rainiersound.test",
  website: "",
  description: "Boutique studio accepting appointments and capacity workshops.",
  ownerName: "Taylor Brooks",
  ownerEmail: "taylor.brooks@rainiersound.test",
  ownerPhone: "+1 206 555 0145",
  ownerPassword: "StrongOwnerPass1!",
  ownerConfirmPassword: "StrongOwnerPass1!",
});
assert.equal(newOwnerBiz.ok, true, "New unauthenticated owner application should succeed");
if (newOwnerBiz.ok) {
  const bizLogin = loginBusiness({
    identifier: "taylor.brooks@rainiersound.test",
    password: "StrongOwnerPass1!",
    remember: true,
  });
  assert.equal(bizLogin.ok, true, "New business owner should be able to sign in immediately");
}

console.log(
  `BookIt API smoke test passed (${venues.length} public venues, booking ${booked.data.id}, resource ${resBooking.data.id}, ${ticketBooking.data.ticketPasses.length} passes, ${orderResult.data.orderIds.length} orders).`,
);
