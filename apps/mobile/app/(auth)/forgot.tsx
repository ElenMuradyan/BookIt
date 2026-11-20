import {
  confirmPasswordReset,
  confirmPasswordResetRemote,
  requestPasswordReset,
  requestPasswordResetRemote,
  usingMocks,
} from "@bookit/api-client";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Text } from "react-native";
import { BrandHeader, Button, Card, InputField, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors } = useThemePalette();
  const mockMode = usingMocks();
  const [identifier, setIdentifier] = useState("customer@bookit.demo");
  const [step, setStep] = useState<"request" | "confirm" | "done">("request");
  const [code, setCode] = useState("");
  const [demoHint, setDemoHint] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <Screen>
      <BrandHeader title="Reset Password" showBack />
      <Card style={{ gap: 12 }}>
        {step === "request" ? (
          <>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              Enter your account email or phone to receive a 6-digit verification code.
            </Text>
            <InputField label="Email or phone" value={identifier} onChangeText={setIdentifier} autoCapitalize="none" />
            {error ? <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
            <Button
              label={submitting ? "Sending..." : "Send reset code"}
              disabled={submitting}
              onPress={async () => {
                setError("");
                if (mockMode) {
                  const res = requestPasswordReset(identifier);
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  setDemoHint(res.data.demoCode ?? "482913");
                  setStep("confirm");
                  return;
                }
                setSubmitting(true);
                try {
                  const res = await requestPasswordResetRemote(identifier);
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  setDemoHint("");
                  setStep("confirm");
                } finally {
                  setSubmitting(false);
                }
              }}
            />
          </>
        ) : step === "confirm" ? (
          <>
            <Text style={{ color: colors.lavender, fontSize: 12 }}>
              {mockMode
                ? `Demo verification code: ${demoHint}`
                : `Enter the 6-digit verification code sent to ${identifier} if an account exists.`}
            </Text>
            <InputField label="6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" />
            <InputField label="New password" value={password} onChangeText={setPassword} secureTextEntry />
            <InputField label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry />
            {error ? <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
            <Button
              label={submitting ? "Updating..." : "Update password"}
              disabled={submitting}
              onPress={async () => {
                setError("");
                if (mockMode) {
                  const res = confirmPasswordReset(identifier, code, password, confirm);
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  setStep("done");
                  return;
                }
                setSubmitting(true);
                try {
                  const res = await confirmPasswordResetRemote(identifier, code, password, confirm);
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  setStep("done");
                } finally {
                  setSubmitting(false);
                }
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
