import assert from "node:assert/strict";
import { checkout, createAppointment, demoPasswordHint, getState, login, publicBusinesses, resetDemoState } from "./index";

resetDemoState();

const auth = login({ identifier: "customer@bookit.demo", password: demoPasswordHint(), remember: true });
assert.equal(auth.ok, true, "Customer login should succeed");

const state = getState();
const venues = publicBusinesses(state);
assert.ok(venues.length > 0, "Approved businesses should be visible");

const service = state.services.find((s) => s.businessId === venues[0].id && s.active);
const employee = state.employees.find((e) => e.businessId === venues[0].id);
assert.ok(service && employee, "Seed venue should have an active service and employee");

const booked = createAppointment({
  customerId: auth.data.userId,
  serviceId: service.id,
  employeeId: employee.id,
  date: "2026-11-20",
  time: "11:00",
});
assert.equal(booked.ok, true, "Booking creation should succeed");

const orderResult = checkout({
  userId: auth.data.userId,
  addressId: state.addresses.find((a) => a.userId === auth.data.userId)?.id ?? "",
  deliveryMethod: "standard",
  paymentMethod: "wallet",
});
assert.equal(orderResult.ok, true, "Marketplace checkout should succeed");

console.log(`BookIt API smoke test passed (${venues.length} public venues, booking ${booked.data.id}, ${orderResult.data.orderIds.length} orders).`);
