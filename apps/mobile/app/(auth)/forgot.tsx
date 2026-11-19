import { confirmPasswordReset, requestPasswordReset } from "@bookit/api-client";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Text } from "react-native";
import { BrandHeader, Button, Card, InputField, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors } = useThemePalette();
  const [identifier, setIdentifier] = useState("customer@bookit.demo");
  const [step, setStep] = useState<"request" | "confirm" | "done">("request");
  const [code, setCode] = useState("");
  const [demoHint, setDemoHint] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  return (
    <Screen>
      <BrandHeader title="Reset Password" showBack />
      <Card style={{ gap: 12 }}>
        {step === "request" ? (
          <>
            <Text style={{ color: colors.muted, fontSize: 13 }}>Enter your account email or phone to receive a 6-digit verification code.</Text>
            <InputField label="Email or phone" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" />
            {error ? <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
            <Button
              label="Send reset code"
              onPress={() => {
                const res = requestPasswordReset(identifier);
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                setError("");
                setDemoHint(res.data.demoCode ?? "482913");
                setStep("confirm");
              }}
            />
          </>
        ) : step === "confirm" ? (
          <>
            <Text style={{ color: colors.lavender, fontSize: 12 }}>Demo verification code: {demoHint}</Text>
            <InputField label="6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" />
            <InputField label="New password" value={password} onChangeText={setPassword} secureTextEntry />
            <InputField label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry />
            {error ? <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
            <Button
              label="Update password"
              onPress={() => {
                const res = confirmPasswordReset(identifier, code, password, confirm);
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                setStep("done");
              }}
            />
          </>
        ) : (
          <>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>Password updated</Text>
            <Button label="Return to Sign in" onPress={() => router.replace("/(auth)/login")} />
          </>
        )}
      </Card>
    </Screen>
  );
}
