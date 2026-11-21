import {
  resendVerificationRemote,
  usingMocks,
  verifyContact,
  verifyContactRemote,
  verifyEmailTokenRemote,
} from "@bookit/api-client";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Text } from "react-native";
import { BrandHeader, Button, Card, InputField, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function VerifyScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string; code?: string; token?: string }>();
  const { colors } = useThemePalette();
  const mockMode = usingMocks();

  const tokenParam = typeof params.token === "string" ? params.token.trim() : "";
  const [email, setEmail] = useState(
    typeof params.email === "string" ? params.email : auth.user?.email ?? "",
  );
  const [code, setCode] = useState(
    typeof params.code === "string" ? params.code : mockMode ? "482913" : "",
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [verifyingToken, setVerifyingToken] = useState(Boolean(tokenParam));
  const [verified, setVerified] = useState(false);
  const attemptedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!email && auth.user?.email) {
      setEmail(auth.user.email);
    }
  }, [auth.user?.email, email]);

  useEffect(() => {
    if (!tokenParam || mockMode) {
      setVerifyingToken(false);
      return;
    }
    if (attemptedTokenRef.current === tokenParam) return;
    attemptedTokenRef.current = tokenParam;

    let active = true;
    setVerifyingToken(true);
    setError("");
    setNotice("");

    void (async () => {
      const res = await verifyEmailTokenRemote(tokenParam);
      if (!active) return;
      if (!res.ok) {
        setError(res.error);
        setVerifyingToken(false);
        return;
      }
      if (auth.userId) {
        await auth.refreshSession();
      }
      if (!active) return;
      setVerified(true);
      setNotice("Your email address is verified.");
      setVerifyingToken(false);
    })();

    return () => {
      active = false;
    };
  }, [auth, mockMode, tokenParam]);

  return (
    <Screen>
      <BrandHeader title="Verify Email" showBack />
      {verifyingToken ? (
        <Card style={{ gap: 10 }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>Verifying link...</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            Confirming your single-use email verification link.
          </Text>
        </Card>
      ) : verified ? (
        <Card style={{ gap: 12 }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>Email verified</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            {notice || "Your email address is verified."}
          </Text>
          <Button
            label={auth.userId ? "Continue to BookIt" : "Sign in to continue"}
            onPress={() => router.replace(auth.userId ? "/(customer)/home" : "/(auth)/login")}
          />
        </Card>
      ) : (
        <Card style={{ gap: 12 }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "700" }}>
            Enter 6-digit verification code
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            {mockMode
              ? "Offline preview verification code: 482913"
              : "Enter the 6-digit code sent to your email, or tap the verification link in your inbox."}
          </Text>
          {!mockMode && (!auth.userId || email) ? (
            <InputField
              label="Account email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          ) : null}
          <InputField
            label="6-digit verification code"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
          />
          {error ? <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
          {notice ? <Text style={{ color: colors.muted, fontSize: 13 }}>{notice}</Text> : null}
          <Button
            label={submitting ? "Verifying..." : "Verify & Continue"}
            disabled={submitting}
            onPress={async () => {
              setError("");
              setNotice("");
              if (mockMode) {
                if (!auth.userId) {
                  setError("Sign in before verifying in offline preview mode.");
                  return;
                }
                const res = verifyContact(auth.userId, code);
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                router.replace("/(customer)/home");
                return;
              }
              const effectiveIdentifier = email.trim() || auth.user?.email || "";
              if (!auth.userId && !effectiveIdentifier) {
                setError("Enter the email address associated with your account.");
                return;
              }
              setSubmitting(true);
              try {
                const res = await verifyContactRemote(
                  code,
                  auth.userId ? undefined : effectiveIdentifier,
                );
                if (!res.ok) {
                  setError(res.error);
                  return;
                }
                if (auth.userId) {
                  await auth.refreshSession();
                  router.replace("/(customer)/home");
                  return;
                }
                setVerified(true);
                setNotice("Your email address is verified. You can sign in now.");
              } finally {
                setSubmitting(false);
              }
            }}
          />
          {!mockMode ? (
            <Button
              label={resending ? "Sending..." : "Resend verification email"}
              tone="ghost"
              disabled={resending}
              onPress={async () => {
                setError("");
                setNotice("");
                const effectiveIdentifier = email.trim() || auth.user?.email || "";
                if (!auth.userId && !effectiveIdentifier) {
                  setError("Enter your account email before requesting a new code.");
                  return;
                }
                setResending(true);
                try {
                  const res = await resendVerificationRemote(
                    auth.userId && !email.trim() ? undefined : effectiveIdentifier,
                  );
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  setNotice(res.data.message);
                } finally {
                  setResending(false);
                }
              }}
            />
          ) : null}
        </Card>
      )}
    </Screen>
  );
}
