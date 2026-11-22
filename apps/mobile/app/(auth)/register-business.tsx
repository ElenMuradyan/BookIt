import { submitBusinessApplication, submitBusinessApplicationRemote, usingMocks } from "@bookit/api-client";
import { categoryLabels } from "@bookit/ui";
import { passwordScore } from "@bookit/utils";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
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
  const [submittedName, setSubmittedName] = useState("");
  const [autoLoginNotice, setAutoLoginNotice] = useState("");
  const [formError, setFormError] = useState("");
  const [signInRequired, setSignInRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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

  useEffect(() => {
    if (!auth.user) return;
    const fullName = `${auth.user.firstName} ${auth.user.lastName}`.trim();
    setForm((current) => ({
      ...current,
      ownerName: current.ownerName || fullName,
      ownerEmail: current.ownerEmail || auth.user?.email || "",
      ownerPhone: current.ownerPhone || auth.user?.phone || "",
    }));
  }, [auth.user]);

  const strength = passwordScore(form.ownerPassword);
  const descriptionLength = form.description.trim().length;

  const submit = async () => {
    if (submitting) return;
    setErrors({});
    setFormError("");
    setSignInRequired(false);
    setAutoLoginNotice("");
    setSubmitting(true);
    try {
      if (usingMocks()) {
        const res = submitBusinessApplication({ ...form, applicantUserId: auth.userId ?? undefined });
        if (!res.ok) {
          setFormError(res.error);
          setErrors(res.fieldErrors ?? {});
          setSignInRequired(res.status === 401);
          return;
        }
        if (res.data.token) {
          await auth.signInWithToken(res.data.token);
        }
        await auth.setWorkspaceId(res.data.businessId);
        setSubmittedName(form.businessName.trim());
        setDoneBusinessId(res.data.businessId);
        return;
      }
      const res = await submitBusinessApplicationRemote({ ...form, applicantUserId: auth.userId ?? undefined });
      if (!res.ok) {
        setFormError(res.error);
        setErrors(res.fieldErrors ?? {});
        setSignInRequired(res.status === 401);
        return;
      }
      if (res.data.session) {
        await auth.signInRemote(res.data.session);
      } else {
        if (res.data.autoLoginError) {
          setAutoLoginNotice(res.data.autoLoginError);
        }
        if (auth.userId) {
          await auth.refreshSession();
        }
      }
      await auth.setWorkspaceId(res.data.businessId);
      setSubmittedName(form.businessName.trim());
      setDoneBusinessId(res.data.businessId);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <BrandHeader title="Business Registration" showBack />
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <Chip label="Customer Sign Up" active={false} onPress={() => router.replace("/(auth)/register")} />
        <Chip label="Register a Business" active onPress={() => {}} />
      </View>

      {doneBusinessId ? (
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <Text style={{ color: colors.text, fontSize: 19, fontWeight: "800", flex: 1 }}>
              {submittedName || "Application submitted"}
            </Text>
            <Badge label="Submitted" tone="success" />
          </View>
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19 }}>
            Your workspace is active so you can configure services, team members, and hours now. Public discovery activates once a Platform Admin approves verification.
          </Text>
          {autoLoginNotice ? (
            <View
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.warning,
                padding: 10,
                backgroundColor: "rgba(251,191,36,0.12)",
              }}
            >
              <Text style={{ color: colors.text, fontSize: 12, lineHeight: 17 }}>
                Your business was saved, but automatic sign-in did not complete ({autoLoginNotice}). Sign in below to open your workspace.
              </Text>
            </View>
          ) : null}
          {auth.user ? (
            <Button label="Open Business Workspace" onPress={() => router.replace("/(workspace)")} />
          ) : null}
          <Button
            label="Business Sign In"
            tone={auth.user ? "ghost" : "primary"}
            onPress={() => router.replace("/(auth)/login-business")}
          />
        </Card>
      ) : (
        <View style={{ gap: 14 }}>
          <Card style={{ gap: 12 }}>
            <View style={{ gap: 2 }}>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>1. Business Details</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                Applications are reviewed before accepting public bookings.
              </Text>
            </View>
            <InputField
              label="Business name"
              placeholder="e.g. Cascade Sound Studio"
              value={form.businessName}
              onChangeText={(businessName) => setForm({ ...form, businessName })}
              error={errors.businessName}
            />
            <InputField
              label="Legal entity name"
              placeholder="e.g. Cascade Sound Studio LLC"
              value={form.legalName}
              onChangeText={(legalName) => setForm({ ...form, legalName })}
              error={errors.legalName}
            />
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {CATEGORIES.map((cat) => (
                <Chip
                  key={cat}
                  label={categoryLabels[cat]}
                  active={form.category === cat}
                  onPress={() => setForm({ ...form, category: cat })}
                />
              ))}
            </ScrollView>
            <InputField
              label={`Description (${descriptionLength}/20 min chars)`}
              placeholder="Describe services, bookings, and specialties..."
              value={form.description}
              onChangeText={(description) => setForm({ ...form, description })}
              multiline
              error={errors.description}
            />
          </Card>

          <Card style={{ gap: 12 }}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>2. Location &amp; Contact</Text>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <InputField
                  label="Country"
                  value={form.country}
                  onChangeText={(country) => setForm({ ...form, country })}
                  error={errors.country}
                />
              </View>
              <View style={{ flex: 1 }}>
                <InputField
                  label="City"
                  value={form.city}
                  onChangeText={(city) => setForm({ ...form, city })}
                  error={errors.city}
                />
              </View>
            </View>
            <InputField
              label="Street address"
              placeholder="1205 Western Ave"
              value={form.address}
              onChangeText={(address) => setForm({ ...form, address })}
              error={errors.address}
            />
            <InputField
              label="Business phone"
              keyboardType="phone-pad"
              value={form.phone}
              onChangeText={(phone) => setForm({ ...form, phone })}
              error={errors.phone}
            />
            <InputField
              label="Business email"
              keyboardType="email-address"
              value={form.email}
              onChangeText={(email) => setForm({ ...form, email })}
              autoCapitalize="none"
              error={errors.email}
            />
            <InputField
              label="Website (optional)"
              placeholder="https://yourbusiness.com"
              value={form.website}
              onChangeText={(website) => setForm({ ...form, website })}
              autoCapitalize="none"
              keyboardType="url"
              error={errors.website}
            />
          </Card>

          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>3. Owner &amp; Credentials</Text>
              {auth.user ? <Badge label="Signed in" tone="success" /> : null}
            </View>

            {auth.user ? (
              <View
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.line,
                  backgroundColor: colors.bgElevated,
                  padding: 10,
                  gap: 6,
                }}
              >
                <Text style={{ color: colors.text, fontSize: 12, lineHeight: 17 }}>
                  Applying under your signed-in account ({auth.user.email}).
                </Text>
                <Button
                  label="Use a different account"
                  tone="ghost"
                  small
                  disabled={submitting}
                  onPress={() => void auth.signOut()}
                />
              </View>
            ) : null}

            <InputField
              label="Owner full name"
              value={form.ownerName}
              onChangeText={(ownerName) => setForm({ ...form, ownerName })}
              error={errors.ownerName}
            />
            <InputField
              label="Owner email"
              keyboardType="email-address"
              value={form.ownerEmail}
              onChangeText={(ownerEmail) => setForm({ ...form, ownerEmail })}
              autoCapitalize="none"
              editable={!auth.user}
              error={errors.ownerEmail}
            />
            <InputField
              label="Owner phone"
              keyboardType="phone-pad"
              value={form.ownerPhone}
              onChangeText={(ownerPhone) => setForm({ ...form, ownerPhone })}
              error={errors.ownerPhone}
            />

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
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    Strength: {strength.hints[0] || "Strong password"}
                  </Text>
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

            {formError ? (
              <View
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.danger,
                  padding: 12,
                  gap: 10,
                }}
              >
                <Text style={{ color: colors.danger, fontSize: 13 }}>{formError}</Text>
                {signInRequired ? (
                  <View style={{ gap: 8 }}>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>
                      Sign in first to attach this new business to your existing BookIt account.
                    </Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Button
                        label="Sign in"
                        small
                        style={{ flex: 1 }}
                        onPress={() => router.push("/(auth)/login")}
                      />
                      <Button
                        label="Business Sign In"
                        tone="ghost"
                        small
                        style={{ flex: 1 }}
                        onPress={() => router.push("/(auth)/login-business")}
                      />
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}

            <Button
              label={submitting ? "Submitting..." : "Submit for verification"}
              disabled={submitting}
              onPress={submit}
            />
          </Card>
        </View>
      )}
    </Screen>
  );
}
