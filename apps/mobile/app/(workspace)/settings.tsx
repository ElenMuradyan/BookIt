import { changePlan, updateBusiness, updateBusinessHours, useBookItState } from "@bookit/api-client";
import type { WeeklyHours } from "@bookit/types";
import { can, formatMoney, WEEKDAY_ORDER } from "@bookit/utils";
import React, { useEffect, useState } from "react";
import { Switch, Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, Chip, InputField, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

const EMPTY_HOURS: WeeklyHours = {
  mon: { closed: false, open: "09:00", close: "18:00" },
  tue: { closed: false, open: "09:00", close: "18:00" },
  wed: { closed: false, open: "09:00", close: "18:00" },
  thu: { closed: false, open: "09:00", close: "18:00" },
  fri: { closed: false, open: "09:00", close: "18:00" },
  sat: { closed: true, open: "09:00", close: "17:00" },
  sun: { closed: true, open: "09:00", close: "17:00" },
};

export default function WorkspaceSettingsScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const { colors } = useThemePalette();

  const bizId = auth.workspace?.businessId ?? "";
  const biz = state.businesses.find((b) => b.id === bizId);
  const sub = state.subscriptions.find((s) => s.businessId === bizId);

  const [name, setName] = useState(biz?.name ?? "");
  const [phone, setPhone] = useState(biz?.phone ?? "");
  const [email, setEmail] = useState(biz?.email ?? "");
  const [website, setWebsite] = useState(biz?.website ?? "");
  const [address, setAddress] = useState(biz?.address ?? "");
  const [city, setCity] = useState(biz?.city ?? "");
  const [policy, setPolicy] = useState(biz?.cancellationPolicy ?? "");
  const [approval, setApproval] = useState<"automatic" | "manual">(biz?.bookingApproval ?? "automatic");
  const [hours, setHours] = useState<WeeklyHours>(biz?.hours ?? EMPTY_HOURS);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!biz) return;
    setName(biz.name);
    setPhone(biz.phone);
    setEmail(biz.email);
    setWebsite(biz.website ?? "");
    setAddress(biz.address);
    setCity(biz.city);
    setPolicy(biz.cancellationPolicy);
    setApproval(biz.bookingApproval);
    setHours(biz.hours);
  }, [bizId, biz]);

  if (!auth.workspace || !biz) return null;
  const canSub = can(auth.workspace.role, "subscription.manage");
  const canEdit = can(auth.workspace.role, "settings.profile");

  return (
    <Screen>
      <BrandHeader mode="workspace" showBack />

      <Card style={{ gap: 10 }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>Business Profile & Rules</Text>
        <InputField label="Business name" value={name} onChangeText={setName} editable={canEdit} />
        <InputField label="Phone" value={phone} onChangeText={setPhone} editable={canEdit} />
        <InputField label="Email" value={email} onChangeText={setEmail} editable={canEdit} autoCapitalize="none" />
        <InputField label="Website" value={website} onChangeText={setWebsite} editable={canEdit} autoCapitalize="none" />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <InputField label="Address" value={address} onChangeText={setAddress} editable={canEdit} />
          </View>
          <View style={{ flex: 1 }}>
            <InputField label="City" value={city} onChangeText={setCity} editable={canEdit} />
          </View>
        </View>
        <InputField label="Cancellation policy" value={policy} onChangeText={setPolicy} multiline editable={canEdit} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip label="Auto-confirm" active={approval === "automatic"} onPress={() => canEdit && setApproval("automatic")} />
          <Chip label="Manual approval" active={approval === "manual"} onPress={() => canEdit && setApproval("manual")} />
        </View>
        {notice ? <Text style={{ color: colors.lavender, fontSize: 12 }}>{notice}</Text> : null}
        {canEdit ? (
          <Button
            label="Save Settings"
            onPress={() => {
              updateBusiness(bizId, {
                name,
                phone,
                email,
                website: website.trim() || undefined,
                address,
                city,
                cancellationPolicy: policy,
                bookingApproval: approval,
              });
              setNotice("Business settings updated.");
            }}
          />
        ) : null}
      </Card>

      <Card style={{ gap: 10 }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>Working Hours</Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          Customer booking slots automatically follow these opening hours.
        </Text>
        {WEEKDAY_ORDER.map(({ key, short }) => {
          const day = hours[key];
          return (
            <View
              key={key}
              style={{
                borderTopWidth: 1,
                borderTopColor: colors.line,
                paddingTop: 10,
                gap: 8,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>{short}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{day.closed ? "Closed" : "Open"}</Text>
                  <Switch
                    value={!day.closed}
                    disabled={!canEdit}
                    onValueChange={(open) =>
                      setHours({
                        ...hours,
                        [key]: { ...day, closed: !open },
                      })
                    }
                  />
                </View>
              </View>
              {!day.closed ? (
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <InputField
                      label="Opens (HH:MM)"
                      value={day.open}
                      editable={canEdit}
                      onChangeText={(open) => setHours({ ...hours, [key]: { ...day, open } })}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <InputField
                      label="Closes (HH:MM)"
                      value={day.close}
                      editable={canEdit}
                      onChangeText={(close) => setHours({ ...hours, [key]: { ...day, close } })}
                    />
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}
        {canEdit ? (
          <Button
            label="Save Working Hours"
            tone="soft"
            onPress={() => {
              updateBusinessHours(bizId, hours);
              setNotice("Working hours updated.");
            }}
          />
        ) : null}
      </Card>

      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>Subscription Plan</Text>
          <Badge label={(sub?.planId ?? "professional").toUpperCase()} tone="brand" />
        </View>
        {state.plans.map((plan) => {
          const active = (sub?.planId ?? "professional") === plan.id;
          return (
            <View key={plan.id} style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "700" }}>{plan.name} · {formatMoney(plan.monthlyPrice)}/mo</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{plan.description}</Text>
              </View>
              {canSub ? (
                <Button
                  label={active ? "Active" : "Select"}
                  tone={active ? "soft" : "ghost"}
                  small
                  disabled={active}
                  onPress={() => {
                    changePlan(bizId, plan.id);
                    setNotice(`Switched plan to ${plan.name} (preview only).`);
                  }}
                />
              ) : null}
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}
