import { usingMocks, verifyContact, verifyContactRemote } from "@bookit/api-client";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Text } from "react-native";
import { BrandHeader, Button, Card, InputField, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function VerifyScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { colors } = useThemePalette();
  const mockMode = usingMocks();
  const [code, setCode] = useState(mockMode ? "482913" : "");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <Screen>
      <BrandHeader title="Verify Contact" showBack />
      <Card style={{ gap: 12 }}>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>Enter 6-digit verification code</Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          {mockMode
            ? "Demo verification code: 482913"
            : "Enter the 6-digit verification code sent to your email or phone."}
        </Text>
        <InputField label="Verification code" value={code} onChangeText={setCode} keyboardType="number-pad" />
        {error ? <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
        <Button
          label={submitting ? "Verifying..." : "Verify & Continue"}
          disabled={submitting}
          onPress={async () => {
            if (!auth.userId) {
              setError("Sign in before verifying.");
              return;
            }
            setError("");
            if (mockMode) {
              const res = verifyContact(auth.userId, code);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              router.replace("/(customer)/home");
              return;
            }
            setSubmitting(true);
            try {
              const res = await verifyContactRemote(code);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              await auth.refreshSession();
              router.replace("/(customer)/home");
            } finally {
              setSubmitting(false);
            }
          }}
        />
      </Card>
    </Screen>
  );
}
