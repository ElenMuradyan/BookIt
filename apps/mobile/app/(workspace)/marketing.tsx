import { savePromo, savePromoRemote, useBookItState, usingMocks } from "@bookit/api-client";
import { addDays, DEMO_TODAY, todayInput } from "@bookit/utils";
import React, { useState } from "react";
import { Modal, Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, InputField, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function WorkspaceMarketingScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const { colors } = useThemePalette();
  const [showPromo, setShowPromo] = useState(false);
  const [code, setCode] = useState("FALL20");
  const [percent, setPercent] = useState("20");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!auth.workspace) return null;
  const bizId = auth.workspace.businessId;
  const promos = state.promoCodes.filter((p) => p.businessId === bizId);
  const campaigns = state.campaigns.filter((c) => c.businessId === bizId);

  return (
    <Screen>
      <BrandHeader mode="workspace" showBack right={<Button label="+ Promo" small onPress={() => setShowPromo(true)} />} />

      <Card style={{ gap: 10 }}>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>Promo Codes ({promos.length})</Text>
        {promos.map((p) => (
          <View key={p.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 }}>
            <View>
              <Text style={{ color: colors.text, fontWeight: "800" }}>{p.code}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Expires {p.expiresOn} · {p.redemptions} used</Text>
            </View>
            <Badge label={`${p.percentOff}% OFF`} tone="brand" />
          </View>
        ))}
      </Card>

      <Card style={{ gap: 10 }}>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>Campaigns ({campaigns.length})</Text>
        {campaigns.map((c) => (
          <View key={c.id} style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8, gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.text, fontWeight: "700" }}>{c.name}</Text>
              <Badge label={c.status} tone="info" />
            </View>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{c.channel.toUpperCase()} · {c.message}</Text>
          </View>
        ))}
      </Card>

      <Modal visible={showPromo} transparent animationType="slide" onRequestClose={() => setShowPromo(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(8,8,14,0.75)", justifyContent: "center", padding: 20 }}>
          <Card style={{ gap: 10 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>Create Promo Code</Text>
            <InputField label="Code (4-12 uppercase chars)" value={code} onChangeText={(t) => setCode(t.toUpperCase())} autoCapitalize="characters" />
            <InputField label="Discount %" value={percent} onChangeText={setPercent} keyboardType="numeric" />
            {error ? <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text> : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="Cancel" tone="ghost" style={{ flex: 1 }} onPress={() => setShowPromo(false)} />
              <Button
                label={busy ? "Creating..." : "Create"}
                style={{ flex: 1 }}
                disabled={busy}
                onPress={async () => {
                  setError("");
                  const today = usingMocks() ? DEMO_TODAY : todayInput();
                  const expires = addDays(today, 30);
                  const pct = Number(percent) || 15;
                  if (usingMocks()) {
                    const res = savePromo(bizId, code, pct, expires);
                    if (!res.ok) {
                      setError(res.error);
                      return;
                    }
                    setShowPromo(false);
                    return;
                  }
                  setBusy(true);
                  try {
                    const res = await savePromoRemote(bizId, code, pct, expires);
                    if (!res.ok) {
                      setError(res.error);
                      return;
                    }
                    setShowPromo(false);
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}
