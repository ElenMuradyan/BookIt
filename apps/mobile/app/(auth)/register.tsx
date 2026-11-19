import { registerCustomer } from "@bookit/api-client";
import { passwordScore } from "@bookit/utils";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Switch, Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, Chip, InputField, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

const GENDER_OPTIONS = ["Prefer not to say", "Female", "Male", "Non-binary", "Other"] as const;

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
    dateOfBirth: "",
    gender: "",
    password: "",
    confirmPassword: "",
  });
  const [personalizationConsent, setPersonalizationConsent] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const strength = passwordScore(form.password);

  const onSubmit = async () => {
    const res = registerCustomer({
      ...form,
      gender: form.gender && form.gender !== "Prefer not to say" ? form.gender : undefined,
      dateOfBirth: form.dateOfBirth || undefined,
      personalizationConsent,
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
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip label="Customer Sign Up" active onPress={() => {}} />
        <Chip label="Register a Business" active={false} onPress={() => router.replace("/(auth)/register-business")} />
      </View>
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

        <View style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, gap: 8 }}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>Optional Personalization &amp; Eligibility</Text>
          <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17 }}>
            Location shows nearby businesses. Date of birth is only used to confirm age eligibility for restricted services. Gender is completely optional and helps service providers prepare if relevant.
          </Text>
          <InputField
            label="City / Location (optional)"
            value={form.location}
            onChangeText={(location) => setForm({ ...form, location })}
          />
          <InputField
            label="Date of birth YYYY-MM-DD (optional)"
            value={form.dateOfBirth}
            onChangeText={(dateOfBirth) => setForm({ ...form, dateOfBirth })}
            placeholder="1996-04-18"
          />
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>Gender (optional)</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {GENDER_OPTIONS.map((opt) => (
              <Chip
                key={opt}
                label={opt}
                active={(form.gender || "Prefer not to say") === opt}
                onPress={() => setForm({ ...form, gender: opt === "Prefer not to say" ? "" : opt })}
              />
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 }}>
            <Switch value={personalizationConsent} onValueChange={setPersonalizationConsent} />
            <Text style={{ color: colors.muted, fontSize: 12, flex: 1 }}>
              Consent: Use my interests and optional details to personalize service recommendations (changeable anytime in Settings).
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Switch value={acceptTerms} onValueChange={setAcceptTerms} />
          <Text style={{ color: colors.muted, fontSize: 13, flex: 1 }}>I accept BookIt Terms of Use &amp; Privacy Notice</Text>
        </View>
        {formError ? <Text style={{ color: colors.danger, fontSize: 13 }}>{formError}</Text> : null}
        <Button label="Create customer account" onPress={onSubmit} />
      </Card>
    </Screen>
  );
}
