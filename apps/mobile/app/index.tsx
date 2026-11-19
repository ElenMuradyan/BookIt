import { Ionicons } from "@expo/vector-icons";
import { brand } from "@bookit/design-system";
import { publicBusinesses, useBookItState } from "@bookit/api-client";
import { Redirect, useRouter } from "expo-router";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { Badge, BrandLogo, Button, Card, GradientCard, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function WelcomeScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const router = useRouter();
  const { colors } = useThemePalette();

  if (auth.ready && auth.user) {
    return <Redirect href="/(customer)/home" />;
  }

  const featured = publicBusinesses(state).slice(0, 3);

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <BrandLogo size={34} />
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>BookIt</Text>
        </View>
        <Badge label="Mobile App" tone="brand" />
      </View>

      <GradientCard style={{ gap: 12 }}>
        <Badge label="Seamless scheduling & shopping" tone="brand" />
        <Text style={{ color: "#FFFFFF", fontSize: 28, fontWeight: "800", lineHeight: 33 }}>
          Your next appointment, effortlessly booked
        </Text>
        <Text style={{ color: "rgba(255,255,255,0.86)", fontSize: 14, lineHeight: 20 }}>
          Discover local salons, clinics, gyms, restaurants, and shops. Book a visit or order products from one account.
        </Text>
        <View style={{ gap: 10, marginTop: 4 }}>
          <Button label="Sign in" icon="log-in-outline" onPress={() => router.push("/(auth)/login")} />
          <Button
            label="Create customer account"
            tone="soft"
            icon="person-add-outline"
            onPress={() => router.push("/(auth)/register")}
            style={{ backgroundColor: "rgba(20,20,32,0.45)" }}
          />
        </View>
      </GradientCard>

      <Card style={{ gap: 10 }}>
        <Text style={{ color: colors.text, fontSize: 15, fontWeight: "700" }}>For local businesses</Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          Manage appointments, calendars, staff, customers, and products in a multi-workspace portal.
        </Text>
        <Button
          label="Register a business"
          tone="ghost"
          icon="storefront-outline"
          onPress={() => router.push("/(auth)/register-business")}
        />
      </Card>

      <View style={{ gap: 8 }}>
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>FEATURED VENUES</Text>
        {featured.map((biz) => (
          <Card key={biz.id} onPress={() => router.push("/(auth)/login")} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: "rgba(124,58,237,0.18)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="sparkles" size={20} color={brand.lavender} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>{biz.name}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {biz.city} · ★ {biz.rating.toFixed(1)} · {biz.distanceMiles} mi
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Card>
        ))}
      </View>

      <Pressable onPress={() => router.push("/(auth)/login")} style={{ alignItems: "center", paddingVertical: 8 }}>
        <Text style={{ color: colors.muted, fontSize: 12, textAlign: "center" }}>
          Google & Apple OAuth connect via FastAPI in the backend phase. Terms & Privacy apply.
        </Text>
      </Pressable>
    </Screen>
  );
}
