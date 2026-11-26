import {
  acceptWorkspaceInviteRemote,
  declineWorkspaceInviteRemote,
  resetDemoState,
  setPersonalizationConsent,
  updateProfile,
  useBookItState,
  usingMocks,
} from "@bookit/api-client";
import { roleLabels } from "@bookit/ui";
import { fullName } from "@bookit/utils";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Switch, Text, View } from "react-native";
import { Avatar, Badge, BrandHeader, Button, Card, Chip, InputField, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

const GENDER_OPTIONS = ["Prefer not to say", "Female", "Male", "Non-binary", "Other"] as const;

export default function CustomerAccountScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const router = useRouter();
  const { colors, themeName } = useThemePalette();

  if (!auth.user) return null;
  const user = auth.user;

  return <AccountBody user={user} state={state} auth={auth} router={router} colors={colors} themeName={themeName} />;
}

function AccountBody({
  user,
  state,
  auth,
  router,
  colors,
  themeName,
}: {
  user: NonNullable<ReturnType<typeof useAuth>["user"]>;
  state: ReturnType<typeof useBookItState>;
  auth: ReturnType<typeof useAuth>;
  router: ReturnType<typeof useRouter>;
  colors: ReturnType<typeof useThemePalette>["colors"];
  themeName: "dark" | "light";
}) {
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [phone, setPhone] = useState(user.phone);
  const [location, setLocation] = useState(user.location ?? "");
  const [gender, setGender] = useState(user.gender ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(user.dateOfBirth ?? "");
  const [notice, setNotice] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const profile = state.customerProfiles.find((p) => p.userId === user.id);
  const addresses = state.addresses.filter((a) => a.userId === user.id);

  return (
    <Screen>
      <BrandHeader title="My Account" />

      <Card style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Avatar name={fullName(user)} uri={user.avatarUrl} size={54} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 19, fontWeight: "800" }}>{fullName(user)}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>@{user.username} · {user.email}</Text>
        </View>
      </Card>

      {auth.workspaces.length > 0 || user.isPlatformAdmin ? (
        <Card style={{ gap: 10 }}>
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>My Workspaces & Admin</Text>
          {user.isPlatformAdmin ? (
            <Button
              label="Open Platform Admin Console"
              tone="soft"
              icon="shield-checkmark-outline"
              onPress={() => router.replace("/(admin)")}
            />
          ) : null}
          {auth.workspaces.map((ws) =>
            ws.status === "invited" ? (
              <Card key={ws.businessId} style={{ gap: 8, backgroundColor: colors.bgElevated }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>{ws.businessName}</Text>
                  <Badge label="Invited" tone="warning" />
                </View>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {roleLabels[ws.role]} · {ws.city}
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Button
                    label="Accept"
                    small
                    disabled={inviteBusy}
                    style={{ flex: 1 }}
                    onPress={async () => {
                      setInviteError("");
                      setNotice("");
                      if (usingMocks()) {
                        setNotice("Workspace invites are managed via the live backend.");
                        return;
                      }
                      setInviteBusy(true);
                      try {
                        const res = await acceptWorkspaceInviteRemote(ws.businessId);
                        if (!res.ok) {
                          setInviteError(res.error);
                          return;
                        }
                        await auth.refreshSession();
                        setNotice(`Joined ${ws.businessName}.`);
                      } finally {
                        setInviteBusy(false);
                      }
                    }}
                  />
                  <Button
                    label="Decline"
                    tone="ghost"
                    small
                    disabled={inviteBusy}
                    style={{ flex: 1 }}
                    onPress={async () => {
                      setInviteError("");
                      setNotice("");
                      if (usingMocks()) {
                        setNotice("Workspace invites are managed via the live backend.");
                        return;
                      }
                      setInviteBusy(true);
                      try {
                        const res = await declineWorkspaceInviteRemote(ws.businessId);
                        if (!res.ok) {
                          setInviteError(res.error);
                          return;
                        }
                        await auth.refreshSession();
                        setNotice(`Declined invitation from ${ws.businessName}.`);
                      } finally {
                        setInviteBusy(false);
                      }
                    }}
                  />
                </View>
              </Card>
            ) : (
              <Button
                key={ws.businessId}
                label={`${ws.businessName} (${roleLabels[ws.role]})`}
                tone="ghost"
                icon="storefront-outline"
                onPress={async () => {
                  await auth.setWorkspaceId(ws.businessId);
                  router.replace("/(workspace)");
                }}
              />
            ),
          )}
          {inviteError ? <Text style={{ color: colors.danger, fontSize: 12 }}>{inviteError}</Text> : null}
        </Card>
      ) : null}

      <Card style={{ gap: 10 }}>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>Appearance</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip label="Dark Mode" active={themeName === "dark"} onPress={() => auth.switchTheme("dark")} />
          <Chip label="Light Mode" active={themeName === "light"} onPress={() => auth.switchTheme("light")} />
        </View>
      </Card>

      <Card style={{ gap: 10 }}>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>Quick Links</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Button label="My Orders" tone="ghost" small onPress={() => router.push("/(customer)/orders")} />
          <Button label="My Spending" tone="ghost" small onPress={() => router.push("/(customer)/spending")} />
          <Button label="Notifications" tone="ghost" small onPress={() => router.push("/(customer)/notifications")} />
          <Button label="Register Business" tone="soft" small onPress={() => router.push("/(auth)/register-business")} />
        </View>
      </Card>

      <Card style={{ gap: 10 }}>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>Personal Information</Text>
        <InputField label="First name" value={firstName} onChangeText={setFirstName} />
        <InputField label="Last name" value={lastName} onChangeText={setLastName} />
        <InputField label="Phone" value={phone} onChangeText={setPhone} />
        <InputField label="Location (optional)" value={location} onChangeText={setLocation} />
        <InputField label="Date of birth YYYY-MM-DD (optional)" value={dateOfBirth} onChangeText={setDateOfBirth} placeholder="1996-04-18" />
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>Gender (optional)</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {GENDER_OPTIONS.map((opt) => (
            <Chip
              key={opt}
              label={opt}
              active={(gender || "Prefer not to say") === opt}
              onPress={() => setGender(opt === "Prefer not to say" ? "" : opt)}
            />
          ))}
        </View>
        <Text style={{ color: colors.muted, fontSize: 11, lineHeight: 16 }}>
          Date of birth verifies minimum-age eligibility where needed; gender is optional and shared only with providers when relevant.
        </Text>
        {notice ? <Text style={{ color: colors.lavender, fontSize: 12 }}>{notice}</Text> : null}
        <Button
          label="Save Profile"
          onPress={() => {
            updateProfile(user.id, {
              firstName,
              lastName,
              phone,
              location,
              gender: gender || undefined,
              dateOfBirth: dateOfBirth || undefined,
            });
            setNotice("Profile updated.");
          }}
        />
      </Card>

      <Card style={{ gap: 8 }}>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>Privacy &amp; Recommendations Consent</Text>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17 }}>
          Allow BookIt to use your saved interests and location to tailor Home and Explore recommendations.
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: "600", flex: 1 }}>
            Personalized recommendations
          </Text>
          <Switch
            value={Boolean(profile?.personalizationConsent)}
            onValueChange={(val) => {
              setPersonalizationConsent(user.id, val);
              setNotice(val ? "Personalized recommendations enabled." : "Personalized recommendations paused.");
            }}
          />
        </View>
      </Card>

      <Card style={{ gap: 8 }}>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>Saved Addresses ({addresses.length})</Text>
        {addresses.map((a) => (
          <View key={a.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>{a.label}: {a.line1}, {a.city}</Text>
            {a.isDefault ? <Badge label="Default" tone="brand" /> : null}
          </View>
        ))}
      </Card>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Button
          label="Reset Demo"
          tone="ghost"
          small
          style={{ flex: 1 }}
          onPress={() => {
            resetDemoState();
            setNotice("Demo state reset.");
          }}
        />
        <Button
          label="Sign Out"
          tone="danger"
          small
          style={{ flex: 1 }}
          onPress={async () => {
            await auth.signOut();
            router.replace("/");
          }}
        />
      </View>
    </Screen>
  );
}
