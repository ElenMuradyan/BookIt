import { Ionicons } from "@expo/vector-icons";
import { brand } from "@bookit/design-system";
import {
  addToCart,
  cartFor,
  customerAppointments,
  displayUser,
  personalizedBusinesses,
  searchProducts,
  useBookItState,
} from "@bookit/api-client";
import { categoryLabels } from "@bookit/ui";
import { demoNow, formatDateTime, formatMoney } from "@bookit/utils";
import { useRouter } from "expo-router";
import React from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, Chip, GradientCard, Screen, SectionHeader } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";
import { useMobileStore } from "@/store/useMobileStore";

const SHORTCUTS = ["beauty", "wellness", "healthcare", "fitness", "restaurant", "auto"] as const;

export default function CustomerHomeScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const router = useRouter();
  const { colors } = useThemePalette();
  const setExploreCategory = useMobileStore((s) => s.setExploreCategory);

  if (!auth.user) return null;
  const user = auth.user;
  const now = demoNow().getTime();
  const appts = customerAppointments(state, user.id);
  const upcoming = appts.find(
    (a) => (a.status === "confirmed" || a.status === "pending") && new Date(a.start).getTime() >= now,
  );
  const nextBiz = upcoming ? state.businesses.find((b) => b.id === upcoming.businessId) : undefined;
  const nextSvc = upcoming ? state.services.find((s) => s.id === upcoming.serviceId) : undefined;
  const nextEmp = upcoming ? state.employees.find((e) => e.id === upcoming.employeeId) : undefined;

  const favIds = new Set(
    state.favorites.filter((f) => f.userId === user.id && f.targetType === "business").map((f) => f.targetId),
  );
  const recResult = personalizedBusinesses(state, user.id);
  const businesses = recResult.items;
  const favorites = businesses.filter((b) => favIds.has(b.id));
  const products = searchProducts(state, {}).slice(0, 4);
  const sponsored = state.advertisements.find((ad) => ad.status === "active");
  const cartCount = cartFor(state, user.id)?.items.reduce((s, i) => s + i.quantity, 0) ?? 0;
  const unread = state.notifications.filter((n) => n.userId === user.id && !n.read).length;

  return (
    <Screen>
      <BrandHeader
        right={
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Pressable
              onPress={() => router.push("/(customer)/cart")}
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: colors.card,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="bag-outline" size={18} color={colors.text} />
              {cartCount > 0 ? (
                <View
                  style={{
                    position: "absolute",
                    top: -4,
                    right: -4,
                    minWidth: 16,
                    height: 16,
                    borderRadius: 8,
                    backgroundColor: brand.primary,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: 4,
                  }}
                >
                  <Text style={{ color: "#FFF", fontSize: 10, fontWeight: "700" }}>{cartCount}</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              onPress={() => router.push("/(customer)/notifications")}
              style={{
                width: 38,
                height: 38,
                borderRadius: 11,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: colors.card,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons name="notifications-outline" size={18} color={colors.text} />
              {unread > 0 ? (
                <View
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 7,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: colors.danger,
                  }}
                />
              ) : null}
            </Pressable>
          </View>
        }
      />

      <View style={{ gap: 2 }}>
        <Text style={{ color: colors.text, fontSize: 26, fontWeight: "800" }}>Hey, {user.firstName}</Text>
        <Text style={{ color: colors.muted, fontSize: 13 }}>Appointments, favorites, orders, and spending in one view.</Text>
      </View>

      {upcoming ? (
        <GradientCard style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Badge label="Next Appointment" tone="brand" />
            <Text style={{ color: "rgba(255,255,255,0.85)", fontSize: 12, fontWeight: "600", fontVariant: ["tabular-nums"] }}>
              {formatDateTime(upcoming.start)}
            </Text>
          </View>
          <Text style={{ color: "#FFFFFF", fontSize: 20, fontWeight: "800" }}>{nextSvc?.name ?? "Appointment"}</Text>
          <Text style={{ color: "rgba(255,255,255,0.88)", fontSize: 13 }}>
            {nextBiz?.name} · with {nextEmp ? displayUser(state, nextEmp.userId) : "Specialist"}
          </Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
            <Button
              label="Manage"
              small
              style={{ flex: 1, backgroundColor: "#FFFFFF" }}
              tone="ghost"
              onPress={() => router.push(`/(customer)/booking/${upcoming.id}`)}
            />
            <Button
              label="Book Again"
              small
              style={{ flex: 1, backgroundColor: "rgba(20,20,32,0.35)" }}
              tone="soft"
              onPress={() => nextBiz && router.push(`/(customer)/book/${nextBiz.id}`)}
            />
          </View>
        </GradientCard>
      ) : (
        <Card style={{ gap: 10 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>No upcoming bookings</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>Explore top-rated salons, clinics, gyms, and cafés near you.</Text>
          <Button label="Explore Services" onPress={() => router.push("/(customer)/explore")} />
        </Card>
      )}

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Card onPress={() => router.push("/(customer)/marketplace")} style={{ flex: 1, gap: 4 }}>
          <Ionicons name="bag-handle-outline" size={20} color={brand.lavender} />
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>Marketplace</Text>
          <Text style={{ color: colors.muted, fontSize: 11 }}>{state.products.length} items</Text>
        </Card>
        <Card onPress={() => router.push("/(customer)/orders")} style={{ flex: 1, gap: 4 }}>
          <Ionicons name="cube-outline" size={20} color={brand.lavender} />
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>Orders</Text>
          <Text style={{ color: colors.muted, fontSize: 11 }}>Track deliveries</Text>
        </Card>
        <Card onPress={() => router.push("/(customer)/spending")} style={{ flex: 1, gap: 4 }}>
          <Ionicons name="pie-chart-outline" size={20} color={brand.lavender} />
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>Spending</Text>
          <Text style={{ color: colors.muted, fontSize: 11 }}>Insights</Text>
        </Card>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {SHORTCUTS.map((cat) => (
          <Chip
            key={cat}
            label={categoryLabels[cat]}
            onPress={() => {
              setExploreCategory(cat);
              router.push("/(customer)/explore");
            }}
          />
        ))}
      </ScrollView>

      <SectionHeader
        title={recResult.personalized ? "Recommended & Favorites" : "Favorites & Top Venues"}
        actionLabel="See all"
        onAction={() => router.push("/(customer)/favorites")}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
        {(favorites.length ? favorites : businesses.slice(0, 3)).map((biz) => (
          <Card
            key={biz.id}
            onPress={() => router.push(`/(customer)/business/${biz.id}`)}
            style={{ width: 224, padding: 0, overflow: "hidden" }}
          >
            {biz.coverUrl ? (
              <Image source={{ uri: biz.coverUrl }} style={{ width: "100%", height: 108 }} />
            ) : (
              <View style={{ width: "100%", height: 108, backgroundColor: colors.cardHover }} />
            )}
            <View style={{ padding: 12, gap: 4 }}>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }} numberOfLines={1}>
                {biz.name}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
                {categoryLabels[biz.category]} · ★ {biz.rating.toFixed(1)}
              </Text>
            </View>
          </Card>
        ))}
      </ScrollView>

      <SectionHeader title="Marketplace Highlights" actionLabel="Shop all" onAction={() => router.push("/(customer)/marketplace")} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
        {products.map((product) => (
          <Card
            key={product.id}
            onPress={() => router.push(`/(customer)/product/${product.id}`)}
            style={{ width: 174, padding: 0, overflow: "hidden" }}
          >
            <Image source={{ uri: product.imageUrl }} style={{ width: "100%", height: 112 }} />
            <View style={{ padding: 12, gap: 6 }}>
              <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }} numberOfLines={1}>
                {product.name}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ color: colors.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                  {formatMoney(product.price)}
                </Text>
                <Pressable
                  onPress={() => addToCart(user.id, product.id, 1, product.variants[0]?.id)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 8,
                    backgroundColor: "rgba(124,58,237,0.18)",
                  }}
                >
                  <Text style={{ color: brand.lavender, fontSize: 12, fontWeight: "700" }}>+ Bag</Text>
                </Pressable>
              </View>
            </View>
          </Card>
        ))}
      </ScrollView>

      {sponsored ? (
        <Card style={{ gap: 6 }}>
          <Badge label="Sponsored" tone="brand" />
          <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>{sponsored.title}</Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>{sponsored.body}</Text>
        </Card>
      ) : null}
    </Screen>
  );
}
