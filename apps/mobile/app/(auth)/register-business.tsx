import { submitBusinessApplication, submitBusinessApplicationRemote, usingMocks } from "@bookit/api-client";
import { categoryLabels } from "@bookit/ui";
import { passwordScore } from "@bookit/utils";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, Chip, InputField, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

const CATEGORIES = Object.keys(categoryLabels) as Array<keyof typeof categoryLabels>;

export default function RegisterBusinessScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { colors } = useThemePalette();
  const [doneBusinessId, setDoneBusinessId] = useState("");
  const [formError, setFormError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    businessName: "",
    legalName: "",
    category: "beauty",
    country: "United States",
    city: "Seattle",
    address: "",
    phone: "",
    email: "",
    website: "",
    description: "",
    ownerName: auth.user ? `${auth.user.firstName} ${auth.user.lastName}` : "",
    ownerEmail: auth.user?.email ?? "",
    ownerPhone: auth.user?.phone ?? "",
    ownerPassword: "",
    ownerConfirmPassword: "",
  });

  const strength = passwordScore(form.ownerPassword);

  const submit = async () => {
    setErrors({});
    setFormError("");
    if (usingMocks()) {
      const res = submitBusinessApplication({ ...form, applicantUserId: auth.userId ?? undefined });
      if (!res.ok) {
        setFormError(res.error);
        setErrors(res.fieldErrors ?? {});
        return;
      }
      if (res.data.token) {
        await auth.signInWithToken(res.data.token);
      }
      await auth.setWorkspaceId(res.data.businessId);
      setDoneBusinessId(res.data.businessId);
      return;
    }
    const res = await submitBusinessApplicationRemote({ ...form, applicantUserId: auth.userId ?? undefined });
    if (!res.ok) {
      setFormError(res.error);
      setErrors(res.fieldErrors ?? {});
      return;
    }
    if (res.data.session) {
      await auth.signInRemote(res.data.session);
    }
    await auth.setWorkspaceId(res.data.businessId);
    setDoneBusinessId(res.data.businessId);
  };

  return (
    <Screen>
      <BrandHeader title="Business Registration" showBack />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip label="Customer Sign Up" active={false} onPress={() => router.replace("/(auth)/register")} />
        <Chip label="Register a Business" active onPress={() => {}} />
      </View>
      {doneBusinessId ? (
        <Card style={{ gap: 12 }}>
          <Text style={{ color: colors.text, fontSize: 19, fontWeight: "800" }}>Application submitted</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            Your workspace is active so you can configure services, team members, and hours now. Public discovery activates once a Platform Admin approves verification.
          </Text>
          <Button label="Open Business Workspace" onPress={() => router.replace("/(workspace)")} />
          <Button label="Business Sign In" tone="ghost" onPress={() => router.replace("/(auth)/login-business")} />
        </Card>
      ) : (
        <Card style={{ gap: 12 }}>
          <InputField label="Business name" value={form.businessName} onChangeText={(businessName) => setForm({ ...form, businessName })} error={errors.businessName} />
          <InputField label="Legal entity name" value={form.legalName} onChangeText={(legalName) => setForm({ ...form, legalName })} error={errors.legalName} />
          <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {CATEGORIES.map((cat) => (
              <Chip key={cat} label={categoryLabels[cat]} active={form.category === cat} onPress={() => setForm({ ...form, category: cat })} />
            ))}
          </ScrollView>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <InputField label="Country" value={form.country} onChangeText={(country) => setForm({ ...form, country })} error={errors.country} />
            </View>
            <View style={{ flex: 1 }}>
              <InputField label="City" value={form.city} onChangeText={(city) => setForm({ ...form, city })} error={errors.city} />
            </View>
          </View>
          <InputField label="Street address" value={form.address} onChangeText={(address) => setForm({ ...form, address })} error={errors.address} />
          <InputField label="Business phone" value={form.phone} onChangeText={(phone) => setForm({ ...form, phone })} error={errors.phone} />
          <InputField label="Business email" value={form.email} onChangeText={(email) => setForm({ ...form, email })} autoCapitalize="none" error={errors.email} />
          <InputField label="Description" value={form.description} onChangeText={(description) => setForm({ ...form, description })} multiline error={errors.description} />
          <InputField label="Owner full name" value={form.ownerName} onChangeText={(ownerName) => setForm({ ...form, ownerName })} error={errors.ownerName} />
          <InputField label="Owner email" value={form.ownerEmail} onChangeText={(ownerEmail) => setForm({ ...form, ownerEmail })} autoCapitalize="none" error={errors.ownerEmail} />
          <InputField label="Owner phone" value={form.ownerPhone} onChangeText={(ownerPhone) => setForm({ ...form, ownerPhone })} error={errors.ownerPhone} />
          {!auth.user ? (
            <>
              <InputField
                label="Create owner password"
                value={form.ownerPassword}
                onChangeText={(ownerPassword) => setForm({ ...form, ownerPassword })}
                secureTextEntry
                error={errors.ownerPassword}
              />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: colors.muted, fontSize: 12 }}>Password strength</Text>
                <Badge label={strength.label} tone={strength.score >= 3 ? "success" : "warning"} />
              </View>
              <InputField
                label="Confirm owner password"
                value={form.ownerConfirmPassword}
                onChangeText={(ownerConfirmPassword) => setForm({ ...form, ownerConfirmPassword })}
                secureTextEntry
                error={errors.ownerConfirmPassword}
              />
            </>
          ) : null}
          {formError ? <Text style={{ color: colors.danger, fontSize: 13 }}>{formError}</Text> : null}
          <Button label="Submit for verification" onPress={submit} />
        </Card>
      )}
    </Screen>
  );
}
