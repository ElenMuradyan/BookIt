import { demoPasswordHint, loginBusiness, loginBusinessRemote, usingMocks } from "@bookit/api-client";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, Chip, InputField, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

const BUSINESS_DEMOS = [
  { label: "Owner · Jordan", email: "business@bookit.demo" },
  { label: "Staff · Elena V.", email: "employee@bookit.demo" },
];

export default function BusinessLoginScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { colors } = useThemePalette();
  const [identifier, setIdentifier] = useState("business@bookit.demo");
  const [password, setPassword] = useState(demoPasswordHint());
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");

  const submit = async (overrideEmail?: string) => {
    const id = overrideEmail ?? identifier;
    const pwd = overrideEmail ? demoPasswordHint() : password;
    setError("");
    if (usingMocks()) {
      const res = loginBusiness({ identifier: id, password: pwd, remember });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await auth.signInWithToken(res.data.token);
      await auth.setWorkspaceId(res.data.businessId);
      router.replace("/(workspace)");
      return;
    }
    const res = await loginBusinessRemote({ identifier: id, password: pwd, remember });
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await auth.signInRemote(res.data);
    await auth.setWorkspaceId(res.data.businessId);
    router.replace("/(workspace)");
  };

  return (
    <Screen>
      <BrandHeader title="Business Sign In" showBack />

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip label="Customer Sign In" active={false} onPress={() => router.replace("/(auth)/login")} />
        <Chip label="Business Sign In" active onPress={() => {}} />
      </View>

      <Card style={{ gap: 14 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>Business workspace login</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            Dedicated sign-in for business owners, managers, and staff.
          </Text>
        </View>

        <InputField
          label="Owner or staff email"
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

        <Button label="Sign in to Workspace" icon="storefront-outline" onPress={() => submit()} />
      </Card>

      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>Business Demo Accounts</Text>
          <Badge label={`Pass: ${demoPasswordHint()}`} tone="brand" />
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {BUSINESS_DEMOS.map((acc) => (
            <Button key={acc.email} label={acc.label} tone="soft" small onPress={() => submit(acc.email)} />
          ))}
        </View>
      </Card>

      <View style={{ flexDirection: "row", justifyContent: "center", gap: 16 }}>
        <Pressable onPress={() => router.push("/(auth)/register-business")} hitSlop={8}>
          <Text style={{ color: colors.lavender, fontWeight: "600", fontSize: 13 }}>Register a new business</Text>
        </Pressable>
        <Pressable onPress={() => router.replace("/(auth)/login")} hitSlop={8}>
          <Text style={{ color: colors.muted, fontWeight: "600", fontSize: 13 }}>Customer sign in</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
