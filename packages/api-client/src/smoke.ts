import assert from "node:assert/strict";
import {
  checkInUniversalQr,
  checkout,
  createAppointment,
  createUniversalBooking,
  demoPasswordHint,
  getState,
  login,
  publicBusinesses,
  resetDemoState,
  setUniversalBookingStatus,
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

console.log(
  `BookIt API smoke test passed (${venues.length} public venues, booking ${booked.data.id}, resource ${resBooking.data.id}, ${ticketBooking.data.ticketPasses.length} passes, ${orderResult.data.orderIds.length} orders).`,
);
