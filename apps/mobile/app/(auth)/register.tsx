import { registerCustomer } from "@bookit/api-client";
import { passwordScore } from "@bookit/utils";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Switch, Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, InputField, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function RegisterScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { colors } = useThemePalette();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    username: "",
    email: "",
    phone: "",
    location: "Seattle, WA",
    password: "",
    confirmPassword: "",
  });
  const [acceptTerms, setAcceptTerms] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const strength = passwordScore(form.password);

  const onSubmit = async () => {
    const res = registerCustomer({
      ...form,
      language: "English",
      interests: ["Beauty", "Wellness"],
      acceptTerms: acceptTerms as true,
    });
    if (!res.ok) {
      setFormError(res.error);
      setErrors(res.fieldErrors ?? {});
      return;
    }
    await auth.signInWithToken(res.data.token);
    router.replace("/(auth)/verify");
  };

  return (
    <Screen>
      <BrandHeader title="Create Account" showBack />
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <InputField
              label="First name"
              value={form.firstName}
              onChangeText={(firstName) => setForm({ ...form, firstName })}
              error={errors.firstName}
            />
          </View>
          <View style={{ flex: 1 }}>
            <InputField
              label="Last name"
              value={form.lastName}
              onChangeText={(lastName) => setForm({ ...form, lastName })}
              error={errors.lastName}
            />
          </View>
        </View>
        <InputField
          label="Username"
          value={form.username}
          onChangeText={(username) => setForm({ ...form, username })}
          autoCapitalize="none"
          error={errors.username}
        />
        <InputField
          label="Email"
          value={form.email}
          onChangeText={(email) => setForm({ ...form, email })}
          autoCapitalize="none"
          keyboardType="email-address"
          error={errors.email}
        />
        <InputField
          label="Phone"
          value={form.phone}
          onChangeText={(phone) => setForm({ ...form, phone })}
          keyboardType="phone-pad"
          error={errors.phone}
        />
        <InputField
          label="City / Location"
          value={form.location}
          onChangeText={(location) => setForm({ ...form, location })}
        />
        <InputField
          label="Password"
          value={form.password}
          onChangeText={(password) => setForm({ ...form, password })}
          secureTextEntry
          error={errors.password}
        />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Password strength</Text>
          <Badge label={strength.label} tone={strength.score >= 3 ? "success" : "warning"} />
        </View>
        <InputField
          label="Confirm password"
          value={form.confirmPassword}
          onChangeText={(confirmPassword) => setForm({ ...form, confirmPassword })}
          secureTextEntry
          error={errors.confirmPassword}
        />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Switch value={acceptTerms} onValueChange={setAcceptTerms} />
          <Text style={{ color: colors.muted, fontSize: 13, flex: 1 }}>I accept BookIt Terms of Use & Privacy Notice</Text>
        </View>
        {formError ? <Text style={{ color: colors.danger, fontSize: 13 }}>{formError}</Text> : null}
        <Button label="Create customer account" onPress={onSubmit} />
      </Card>
    </Screen>
  );
}
