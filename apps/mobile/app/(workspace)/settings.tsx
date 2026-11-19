import { changePlan, updateBusiness, useBookItState } from "@bookit/api-client";
import { can, formatMoney } from "@bookit/utils";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, Chip, InputField, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function WorkspaceSettingsScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const { colors } = useThemePalette();

  const bizId = auth.workspace?.businessId ?? "";
  const biz = state.businesses.find((b) => b.id === bizId);
  const sub = state.subscriptions.find((s) => s.businessId === bizId);

  const [name, setName] = useState(biz?.name ?? "");
  const [phone, setPhone] = useState(biz?.phone ?? "");
  const [policy, setPolicy] = useState(biz?.cancellationPolicy ?? "");
  const [approval, setApproval] = useState<"automatic" | "manual">(biz?.bookingApproval ?? "automatic");
  const [notice, setNotice] = useState("");

  if (!auth.workspace || !biz) return null;
  const canSub = can(auth.workspace.role, "subscription.manage");

  return (
    <Screen>
      <BrandHeader mode="workspace" showBack />

      <Card style={{ gap: 10 }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>Business Profile & Rules</Text>
        <InputField label="Business name" value={name} onChangeText={setName} />
        <InputField label="Phone" value={phone} onChangeText={setPhone} />
        <InputField label="Cancellation policy" value={policy} onChangeText={setPolicy} multiline />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip label="Auto-confirm" active={approval === "automatic"} onPress={() => setApproval("automatic")} />
          <Chip label="Manual approval" active={approval === "manual"} onPress={() => setApproval("manual")} />
        </View>
        {notice ? <Text style={{ color: colors.lavender, fontSize: 12 }}>{notice}</Text> : null}
        <Button
          label="Save Settings"
          onPress={() => {
            updateBusiness(bizId, { name, phone, cancellationPolicy: policy, bookingApproval: approval });
            setNotice("Business settings updated.");
          }}
        />
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
