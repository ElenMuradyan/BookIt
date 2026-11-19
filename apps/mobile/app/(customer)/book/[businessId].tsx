import {
  createAppointment,
  displayUser,
  publicBusinessById,
  servicesForBusiness,
  useBookItState,
} from "@bookit/api-client";
import { brand } from "@bookit/design-system";
import { addDays, availableSlots, DEMO_TODAY, formatDate, formatMoney } from "@bookit/utils";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Avatar, Badge, BrandHeader, Button, Card, EmptyState, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function BookAppointmentScreen() {
  const { businessId, service: initialSvc, employee: initialEmp } = useLocalSearchParams<{
    businessId: string;
    service?: string;
    employee?: string;
  }>();
  const auth = useAuth();
  const state = useBookItState();
  const router = useRouter();
  const { colors } = useThemePalette();

  const business = businessId ? publicBusinessById(state, businessId) : undefined;
  const rawBiz = businessId ? state.businesses.find((b) => b.id === businessId) : undefined;
  const services = business ? servicesForBusiness(state, business.id) : [];
  const employees = business ? state.employees.filter((e) => e.businessId === business.id) : [];

  const [step, setStep] = useState<1 | 2 | 3 | 4>(3);
  const [serviceId, setServiceId] = useState(initialSvc || services[0]?.id || "");
  const [employeeId, setEmployeeId] = useState(initialEmp || employees[0]?.id || "");
  const [date, setDate] = useState(DEMO_TODAY);
  const [selectedTime, setSelectedTime] = useState("");
  const [error, setError] = useState("");

  const activeService = services.find((s) => s.id === serviceId) ?? services[0];
  const activeEmployee = employees.find((e) => e.id === employeeId) ?? employees[0];
  const dateDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(DEMO_TODAY, i)), []);

  const slots = useMemo(() => {
    if (!rawBiz || !activeService) return [];
    return availableSlots({
      date,
      service: activeService,
      employees,
      appointments: state.appointments.filter((a) => a.businessId === rawBiz.id),
      hours: rawBiz.hours,
      holidays: rawBiz.holidays,
      blocked: rawBiz.blocked,
      employeeId: activeEmployee?.id,
    });
  }, [rawBiz, activeService, employees, state.appointments, date, activeEmployee]);

  if (!business || !rawBiz || !activeService) {
    return (
      <Screen>
        <BrandHeader title="Book" showBack />
        <EmptyState title="Booking unavailable" body="No active services found for this business." />
      </Screen>
    );
  }

  const chosenTime = selectedTime && slots.includes(selectedTime) ? selectedTime : slots[0] ?? "";

  const confirmBooking = () => {
    if (!auth.userId || !activeEmployee || !chosenTime) {
      setError("Please select an available time slot.");
      return;
    }
    const res = createAppointment({
      customerId: auth.userId,
      serviceId: activeService.id,
      employeeId: activeEmployee.id,
      date,
      time: chosenTime,
    });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.replace("/(customer)/bookings");
  };

  return (
    <Screen scroll={false} padded={false}>
      <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
        <BrandHeader title={`Book (${step}/4)`} showBack />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 120 }}>
        <Card onPress={() => setStep(1)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <Text style={{ color: colors.muted, fontSize: 11 }}>1. SERVICE</Text>
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>
              {activeService.name} · {activeService.price === 0 ? "Free" : formatMoney(activeService.price)}
            </Text>
          </View>
          <Badge label="Change" tone="brand" />
        </Card>

        {step === 1 ? (
          <Card style={{ gap: 8 }}>
            {services.map((svc) => (
              <Pressable
                key={svc.id}
                onPress={() => {
                  setServiceId(svc.id);
                  setStep(2);
                }}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: svc.id === activeService.id ? brand.primary : colors.line,
                  backgroundColor: colors.bgElevated,
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <View>
                  <Text style={{ color: colors.text, fontWeight: "700" }}>{svc.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{svc.durationMinutes} min</Text>
                </View>
                <Text style={{ color: colors.text, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                  {svc.price === 0 ? "Free" : formatMoney(svc.price)}
                </Text>
              </Pressable>
            ))}
          </Card>
        ) : null}

        <Card onPress={() => setStep(2)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Avatar name={activeEmployee ? displayUser(state, activeEmployee.userId) : "Staff"} size={34} />
            <View>
              <Text style={{ color: colors.muted, fontSize: 11 }}>2. PROFESSIONAL</Text>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>
                {activeEmployee ? displayUser(state, activeEmployee.userId) : "Any Specialist"}
              </Text>
            </View>
          </View>
          <Badge label="Change" tone="brand" />
        </Card>

        {step === 2 ? (
          <Card style={{ gap: 8 }}>
            {employees.map((emp) => {
              const name = displayUser(state, emp.userId);
              return (
                <Pressable
                  key={emp.id}
                  onPress={() => {
                    setEmployeeId(emp.id);
                    setStep(3);
                  }}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: emp.id === activeEmployee?.id ? brand.primary : colors.line,
                    backgroundColor: colors.bgElevated,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <Avatar name={name} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: "700" }}>{name}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>{emp.title}</Text>
                  </View>
                </Pressable>
              );
            })}
          </Card>
        ) : null}

        <Card style={{ gap: 12 }}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>3. Select Date & Time</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {dateDays.map((d) => {
              const active = d === date;
              return (
                <Pressable
                  key={d}
                  onPress={() => {
                    setDate(d);
                    setSelectedTime("");
                  }}
                  style={{
                    width: 58,
                    paddingVertical: 10,
                    borderRadius: 14,
                    alignItems: "center",
                    backgroundColor: active ? brand.primary : colors.bgElevated,
                    borderWidth: 1,
                    borderColor: active ? brand.primary : colors.line,
                  }}
                >
                  <Text style={{ color: active ? "#FFF" : colors.muted, fontSize: 11 }}>
                    {formatDate(`${d}T12:00:00`, { weekday: "short" })}
                  </Text>
                  <Text style={{ color: active ? "#FFF" : colors.text, fontSize: 16, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                    {d.slice(8, 10)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {slots.length === 0 ? (
            <Text style={{ color: colors.muted, fontSize: 13 }}>Closed or fully booked on this date. Try another day.</Text>
          ) : (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {slots.map((slot) => {
                const on = slot === chosenTime;
                return (
                  <Pressable
                    key={slot}
                    onPress={() => setSelectedTime(slot)}
                    style={{
                      width: "48%",
                      minHeight: 44,
                      borderRadius: 12,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: on ? brand.primary : colors.bgElevated,
                      borderWidth: 1,
                      borderColor: on ? brand.primary : colors.line,
                    }}
                  >
                    <Text style={{ color: on ? "#FFF" : colors.text, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                      {slot}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </Card>

        {error ? <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
      </ScrollView>

      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderTopWidth: 1,
          borderTopColor: colors.line,
          backgroundColor: colors.sidebar,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View>
          <Text style={{ color: colors.muted, fontSize: 11 }}>
            Total ({activeService.durationMinutes} min)
          </Text>
          <Text style={{ color: colors.text, fontSize: 20, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
            {activeService.price === 0 ? "Free" : formatMoney(activeService.price)}
          </Text>
        </View>
        <Button label="Confirm Booking →" disabled={!chosenTime} onPress={confirmBooking} style={{ minWidth: 180 }} />
      </View>
    </Screen>
  );
}
