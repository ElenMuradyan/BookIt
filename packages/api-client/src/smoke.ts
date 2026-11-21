import assert from "node:assert/strict";
import { checkout, createAppointment, demoPasswordHint, getState, login, publicBusinesses, resetDemoState } from "./index";

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

const orderResult = checkout({
  userId: auth.data.userId,
  addressId: state.addresses.find((a) => a.userId === auth.data.userId)?.id ?? "",
  deliveryMethod: "standard",
  paymentMethod: "wallet",
});
if (!orderResult.ok) {
  throw new Error(`Marketplace checkout should succeed: ${orderResult.error}`);
}

console.log(`BookIt API smoke test passed (${venues.length} public venues, booking ${booked.data.id}, ${orderResult.data.orderIds.length} orders).`);
