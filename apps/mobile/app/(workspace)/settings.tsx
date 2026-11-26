import {
  bookingConfigsForBusiness,
  changePlan,
  changePlanRemote,
  saveBookingConfig,
  updateBusiness,
  updateBusinessHours,
  updateBusinessHoursRemote,
  updateBusinessRemote,
  upsertBookingConfigRemote,
  useBookItState,
  usingMocks,
} from "@bookit/api-client";
import type { BookingModel, BusinessCategory, DepositMode, WeeklyHours } from "@bookit/types";
import { categoryLabels } from "@bookit/ui";
import { bookingModelLabel, can, formatMoney, WEEKDAY_ORDER } from "@bookit/utils";
import React, { useEffect, useState } from "react";
import { ScrollView, Switch, Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, Chip, InputField, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

const BOOKING_MODELS: BookingModel[] = ["appointment", "resource", "ticket", "capacity"];
const CATEGORIES = Object.keys(categoryLabels) as BusinessCategory[];

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
  const modelConfigs = bookingConfigsForBusiness(state, bizId);

  const [name, setName] = useState(biz?.name ?? "");
  const [category, setCategory] = useState<BusinessCategory>(biz?.category ?? "other");
  const [phone, setPhone] = useState(biz?.phone ?? "");
  const [email, setEmail] = useState(biz?.email ?? "");
  const [website, setWebsite] = useState(biz?.website ?? "");
  const [address, setAddress] = useState(biz?.address ?? "");
  const [city, setCity] = useState(biz?.city ?? "");
  const [policy, setPolicy] = useState(biz?.cancellationPolicy ?? "");
  const [approval, setApproval] = useState<"automatic" | "manual">(biz?.bookingApproval ?? "automatic");
  const [hours, setHours] = useState<WeeklyHours>(biz?.hours ?? EMPTY_HOURS);
  const [activeModel, setActiveModel] = useState<BookingModel>("appointment");
  const currentCfg = modelConfigs.find((c) => c.bookingModel === activeModel);
  const [cfgEnabled, setCfgEnabled] = useState(currentCfg?.enabled ?? true);
  const [cfgApproval, setCfgApproval] = useState<"automatic" | "manual">(currentCfg?.approvalMode ?? "automatic");
  const [cfgCutoff, setCfgCutoff] = useState(String(currentCfg?.cancellationCutoffHours ?? 24));
  const [cfgDepositMode, setCfgDepositMode] = useState<DepositMode>(currentCfg?.depositMode ?? "none");
  const [cfgDepositVal, setCfgDepositVal] = useState(String(currentCfg?.depositValue ?? 0));
  const [cfgPolicyText, setCfgPolicyText] = useState(
    currentCfg?.cancellationPolicyText ?? biz?.cancellationPolicy ?? "Free cancellation up to 24 hours before start.",
  );
  const [checkInTime, setCheckInTime] = useState(String(currentCfg?.settings?.checkInTime ?? "15:00"));
  const [checkOutTime, setCheckOutTime] = useState(String(currentCfg?.settings?.checkOutTime ?? "11:00"));
  const [notice, setNotice] = useState<{ err?: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!biz) return;
    setName(biz.name);
    setCategory(biz.category);
    setPhone(biz.phone);
    setEmail(biz.email);
    setWebsite(biz.website ?? "");
    setAddress(biz.address);
    setCity(biz.city);
    setPolicy(biz.cancellationPolicy);
    setApproval(biz.bookingApproval);
    setHours(biz.hours);
  }, [bizId, biz]);

  useEffect(() => {
    if (!biz) return;
    const found = modelConfigs.find((c) => c.bookingModel === activeModel);
    setCfgEnabled(found?.enabled ?? activeModel === "appointment");
    setCfgApproval(found?.approvalMode ?? "automatic");
    setCfgCutoff(String(found?.cancellationCutoffHours ?? 24));
    setCfgDepositMode(found?.depositMode ?? "none");
    setCfgDepositVal(String(found?.depositValue ?? 0));
    setCfgPolicyText(found?.cancellationPolicyText ?? biz.cancellationPolicy ?? "Free cancellation up to 24 hours before start.");
    setCheckInTime(String(found?.settings?.checkInTime ?? "15:00"));
    setCheckOutTime(String(found?.settings?.checkOutTime ?? "11:00"));
  }, [activeModel, bizId, currentCfg]);

  if (!auth.workspace || !biz) return null;
  const canSub = can(auth.workspace.role, "subscription.manage");
  const canEdit = can(auth.workspace.role, "settings.profile");
  const canPolicies = can(auth.workspace.role, "settings.policies");

  return (
    <Screen>
      <BrandHeader mode="workspace" showBack />

      <Card style={{ gap: 10 }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>Business Profile &amp; Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {CATEGORIES.map((cat) => (
            <Chip
              key={cat}
              label={categoryLabels[cat]}
              active={category === cat}
              onPress={() => canEdit && setCategory(cat)}
            />
          ))}
        </ScrollView>
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
        {notice ? (
          <Text style={{ color: notice.err ? colors.danger : colors.lavender, fontSize: 12 }}>{notice.text}</Text>
        ) : null}
        {canEdit ? (
          <Button
            label={saving ? "Saving..." : "Save Settings"}
            disabled={saving}
            onPress={async () => {
              setNotice(null);
              setSaving(true);
              try {
                const patch = {
                  name,
                  category,
                  phone,
                  email,
                  website: website.trim() || undefined,
                  address,
                  city,
                  cancellationPolicy: policy,
                  bookingApproval: approval,
                };
                const res = usingMocks()
                  ? updateBusiness(bizId, patch)
                  : await updateBusinessRemote(bizId, patch);
                setNotice(res.ok ? { text: "Business settings updated." } : { err: true, text: res.error });
              } finally {
                setSaving(false);
              }
            }}
          />
        ) : null}
      </Card>

      <Card style={{ gap: 10 }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>Per-Model Booking Rules</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {BOOKING_MODELS.map((m) => (
            <Chip key={m} label={bookingModelLabel(m)} active={activeModel === m} onPress={() => setActiveModel(m)} />
          ))}
        </ScrollView>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: colors.text, fontWeight: "600" }}>Enable {bookingModelLabel(activeModel)}</Text>
          <Switch value={cfgEnabled} disabled={!canPolicies} onValueChange={setCfgEnabled} />
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip label="Auto-confirm" active={cfgApproval === "automatic"} onPress={() => canPolicies && setCfgApproval("automatic")} />
          <Chip label="Manual" active={cfgApproval === "manual"} onPress={() => canPolicies && setCfgApproval("manual")} />
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <InputField label="Cutoff (hrs)" value={cfgCutoff} onChangeText={setCfgCutoff} keyboardType="numeric" editable={canPolicies} />
          </View>
          <View style={{ flex: 1 }}>
            <InputField label="Deposit ($ / %)" value={cfgDepositVal} onChangeText={setCfgDepositVal} keyboardType="numeric" editable={canPolicies} />
          </View>
        </View>
        {activeModel === "resource" && category === "hotel" ? (
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <InputField label="Check-in (HH:MM)" value={checkInTime} onChangeText={setCheckInTime} editable={canPolicies} />
            </View>
            <View style={{ flex: 1 }}>
              <InputField label="Check-out (HH:MM)" value={checkOutTime} onChangeText={setCheckOutTime} editable={canPolicies} />
            </View>
          </View>
        ) : null}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {(["none", "fixed", "percent"] as DepositMode[]).map((dm) => (
            <Chip key={dm} label={`Deposit: ${dm}`} active={cfgDepositMode === dm} onPress={() => canPolicies && setCfgDepositMode(dm)} />
          ))}
        </View>
        <InputField label="Model policy copy" value={cfgPolicyText} onChangeText={setCfgPolicyText} multiline editable={canPolicies} />
        {canPolicies ? (
          <Button
            label={saving ? "Saving..." : `Save ${bookingModelLabel(activeModel)}`}
            tone="soft"
            disabled={saving}
            onPress={async () => {
              setNotice(null);
              setSaving(true);
              try {
                const nextSettings = { ...(currentCfg?.settings ?? {}) };
                if (activeModel === "resource" && category === "hotel") {
                  nextSettings.checkInTime = checkInTime || "15:00";
                  nextSettings.checkOutTime = checkOutTime || "11:00";
                }
                if (usingMocks()) {
                  const res = saveBookingConfig(bizId, activeModel, {
                    enabled: cfgEnabled,
                    displayLabel: bookingModelLabel(activeModel),
                    approvalMode: cfgApproval,
                    minNoticeMinutes: currentCfg?.minNoticeMinutes ?? 60,
                    maxAdvanceDays: currentCfg?.maxAdvanceDays ?? 90,
                    cancellationCutoffHours: cfgCutoff,
                    cancellationFeePercent: currentCfg?.cancellationFeePercent ?? 0,
                    cancellationPolicyText: cfgPolicyText,
                    depositMode: cfgDepositMode,
                    depositValue: cfgDepositVal,
                    settings: nextSettings,
                  });
                  setNotice(res.ok ? { text: `${bookingModelLabel(activeModel)} rules saved.` } : { err: true, text: res.error });
                } else {
                  const res = await upsertBookingConfigRemote(bizId, activeModel, {
                    enabled: cfgEnabled,
                    displayLabel: bookingModelLabel(activeModel),
                    approvalMode: cfgApproval,
                    minNoticeMinutes: currentCfg?.minNoticeMinutes ?? 60,
                    maxAdvanceDays: currentCfg?.maxAdvanceDays ?? 90,
                    bufferBeforeMinutes: currentCfg?.bufferBeforeMinutes ?? 0,
                    bufferAfterMinutes: currentCfg?.bufferAfterMinutes ?? 0,
                    cancellationCutoffHours: Number(cfgCutoff) || 0,
                    cancellationFeePercent: currentCfg?.cancellationFeePercent ?? 0,
                    cancellationPolicyText: cfgPolicyText,
                    depositMode: cfgDepositMode,
                    depositValue: Number(cfgDepositVal) || 0,
                    holdTtlMinutes: currentCfg?.holdTtlMinutes ?? 15,
                    allowOverbooking: currentCfg?.allowOverbooking ?? false,
                    settings: nextSettings,
                  });
                  setNotice(res.ok ? { text: `${bookingModelLabel(activeModel)} rules saved.` } : { err: true, text: res.error });
                }
              } finally {
                setSaving(false);
              }
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
            label={saving ? "Saving..." : "Save Working Hours"}
            tone="soft"
            disabled={saving}
            onPress={async () => {
              setNotice(null);
              setSaving(true);
              try {
                const res = usingMocks()
                  ? updateBusinessHours(bizId, hours)
                  : await updateBusinessHoursRemote(bizId, hours);
                setNotice(res.ok ? { text: "Working hours updated." } : { err: true, text: res.error });
              } finally {
                setSaving(false);
              }
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
                  label={active ? "Active" : saving ? "Saving..." : "Select"}
                  tone={active ? "soft" : "ghost"}
                  small
                  disabled={active || saving}
                  onPress={async () => {
                    setNotice(null);
                    if (usingMocks()) {
                      changePlan(bizId, plan.id);
                      setNotice({ text: `Switched plan to ${plan.name} (preview only).` });
                      return;
                    }
                    setSaving(true);
                    try {
                      const res = await changePlanRemote(bizId, plan.id);
                      setNotice(
                        res.ok
                          ? { text: `Subscription plan updated to ${plan.name}.` }
                          : { err: true, text: res.error },
                      );
                    } finally {
                      setSaving(false);
                    }
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
