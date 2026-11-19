import { demoPasswordHint, login } from "@bookit/api-client";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, Chip, InputField, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

const DEMO_ACCOUNTS = [
  { label: "Customer · Elena", email: "customer@bookit.demo", route: "/(customer)/home" as const },
  { label: "Business · Jordan", email: "business@bookit.demo", route: "/(workspace)" as const },
  { label: "Employee · Elena V.", email: "employee@bookit.demo", route: "/(workspace)" as const },
  { label: "Admin · Alexander", email: "admin@bookit.demo", route: "/(admin)" as const },
];

export default function LoginScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { colors } = useThemePalette();
  const [identifier, setIdentifier] = useState("customer@bookit.demo");
  const [password, setPassword] = useState(demoPasswordHint());
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [oauthNotice, setOauthNotice] = useState("");

  const submit = async (overrideEmail?: string, targetRoute?: "/(customer)/home" | "/(workspace)" | "/(admin)") => {
    const id = overrideEmail ?? identifier;
    const pwd = overrideEmail ? demoPasswordHint() : password;
    const res = login({ identifier: id, password: pwd, remember });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError("");
    await auth.signInWithToken(res.data.token);
    router.replace(targetRoute ?? "/(customer)/home");
  };

  return (
    <Screen>
      <BrandHeader title="Customer Sign In" showBack />

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip label="Customer Sign In" active onPress={() => {}} />
        <Chip label="Business Sign In" active={false} onPress={() => router.replace("/(auth)/login-business")} />
      </View>

      <Card style={{ gap: 14 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>Welcome back</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>Sign in with your BookIt customer email or username.</Text>
        </View>

        <InputField
          label="Email, username, or phone"
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <InputField label="Password" value={password} onChangeText={setPassword} secureTextEntry />

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Switch value={remember} onValueChange={setRemember} />
            <Text style={{ color: colors.muted, fontSize: 13 }}>Remember me</Text>
          </View>
          <Pressable onPress={() => router.push("/(auth)/forgot")} hitSlop={8}>
            <Text style={{ color: colors.lavender, fontSize: 13, fontWeight: "600" }}>Forgot password?</Text>
          </Pressable>
        </View>

        {error ? <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null}

        <Button label="Sign in" onPress={() => submit()} />

        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button
            label="Google"
            tone="ghost"
            small
            style={{ flex: 1 }}
            onPress={() => setOauthNotice("Google OAuth connects via FastAPI in the backend phase.")}
          />
          <Button
            label="Apple"
            tone="ghost"
            small
            style={{ flex: 1 }}
            onPress={() => setOauthNotice("Apple Sign-In connects via FastAPI in the backend phase.")}
          />
        </View>
        {oauthNotice ? <Text style={{ color: colors.muted, fontSize: 12 }}>{oauthNotice}</Text> : null}
      </Card>

      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>Quick Demo Accounts</Text>
          <Badge label={`Pass: ${demoPasswordHint()}`} tone="brand" />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {DEMO_ACCOUNTS.map((acc) => (
            <Button
              key={acc.email}
              label={acc.label}
              tone="soft"
              small
              onPress={() => submit(acc.email, acc.route)}
            />
          ))}
        </View>
      </Card>

      <View style={{ flexDirection: "row", justifyContent: "center", gap: 16 }}>
        <Pressable onPress={() => router.push("/(auth)/register")} hitSlop={8}>
          <Text style={{ color: colors.lavender, fontWeight: "600", fontSize: 13 }}>Create account</Text>
        </Pressable>
        <Pressable onPress={() => router.push("/(auth)/register-business")} hitSlop={8}>
          <Text style={{ color: colors.muted, fontWeight: "600", fontSize: 13 }}>Register business</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
