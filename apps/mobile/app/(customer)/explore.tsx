import {
  addToCart,
  addToCartRemote,
  businessesSupportingModel,
  enabledModelsForBusiness,
  searchBusinesses,
  searchProducts,
  searchServices,
  servicesForBusiness,
  useBookItState,
  usingMocks,
} from "@bookit/api-client";
import type { BookingModel } from "@bookit/types";
import { categoryLabels } from "@bookit/ui";
import { bookingModelLabel, formatDateTime, formatMoney } from "@bookit/utils";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Image, ScrollView, Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, Chip, EmptyState, Screen, SearchBar } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";
import { useMobileStore } from "@/store/useMobileStore";

const CATS = ["all", "beauty", "barber", "healthcare", "fitness", "restaurant", "hotel", "sports", "events", "wellness", "auto", "travel", "retail"] as const;
const MODELS: Array<"all" | BookingModel> = ["all", "appointment", "resource", "ticket", "capacity"];

export default function ExploreScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const router = useRouter();
  const { colors } = useThemePalette();
  const exploreCategory = useMobileStore((s) => s.exploreCategory);
  const setExploreCategory = useMobileStore((s) => s.setExploreCategory);
  const [tab, setTab] = useState<"businesses" | "spaces" | "services" | "events" | "products">("businesses");
  const [modelFilter, setModelFilter] = useState<"all" | BookingModel>("all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"rating" | "distance">("rating");
  const [maxPrice, setMaxPrice] = useState<number | undefined>(undefined);
  const [notice, setNotice] = useState("");
  const [busyProductId, setBusyProductId] = useState("");

  const modelBizIds =
    modelFilter === "all" ? null : new Set(businessesSupportingModel(state, modelFilter).map((b) => b.id));
  const businesses = searchBusinesses(state, {
    q,
    category: exploreCategory === "all" ? undefined : exploreCategory,
    sort,
  }).filter((b) => !modelBizIds || modelBizIds.has(b.id));
  const spaces = (state.resources ?? []).filter((res) => {
    if (!res.active) return false;
    const biz = state.businesses.find((b) => b.id === res.businessId && b.isPublic && b.status === "approved");
    if (!biz) return false;
    if (exploreCategory !== "all" && biz.category !== exploreCategory) return false;
    if (maxPrice !== undefined && res.basePrice > maxPrice) return false;
    if (
      q.trim() &&
      !`${res.name} ${res.description} ${res.resourceType} ${biz.name} ${biz.city}`
        .toLowerCase()
        .includes(q.trim().toLowerCase())
    ) {
      return false;
    }
    return true;
  });
  const services = searchServices(state, {
    q,
    category: exploreCategory === "all" ? undefined : exploreCategory,
    maxPrice,
  });
  const products = searchProducts(state, { q, maxPrice });
  const offerings = (state.eventOfferings ?? []).filter((off) => {
    if (!off.active) return false;
    const biz = state.businesses.find((b) => b.id === off.businessId);
    if (!biz?.isPublic || biz.status !== "approved") return false;
    if (exploreCategory !== "all" && biz.category !== exploreCategory) return false;
    if (q.trim() && !`${off.title} ${off.description} ${off.category} ${biz.name}`.toLowerCase().includes(q.trim().toLowerCase())) {
      return false;
    }
    return true;
  });

  return (
    <Screen>
      <BrandHeader
        title="Explore"
        right={<Button label="Shop" tone="soft" small onPress={() => router.push("/(customer)/marketplace")} />}
      />

      <SearchBar value={q} onChangeText={setQ} placeholder="Search salons, spaces, events, products…" />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {(
          [
            ["businesses", `Venues (${businesses.length})`],
            ["spaces", `Spaces (${spaces.length})`],
            ["services", `Services (${services.length})`],
            ["events", `Events & Classes (${offerings.length})`],
            ["products", `Products (${products.length})`],
          ] as const
        ).map(([id, label]) => (
          <Chip key={id} label={label} active={tab === id} onPress={() => setTab(id)} />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {CATS.map((cat) => (
          <Chip
            key={cat}
            label={cat === "all" ? "All" : categoryLabels[cat]}
            active={exploreCategory === cat}
            onPress={() => setExploreCategory(cat)}
          />
        ))}
      </ScrollView>

      {tab === "businesses" ? (
        <View style={{ gap: 8 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {MODELS.map((m) => (
              <Chip
                key={m}
                label={m === "all" ? "All Booking Types" : bookingModelLabel(m)}
                active={modelFilter === m}
                onPress={() => setModelFilter(m)}
              />
            ))}
          </ScrollView>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{businesses.length} approved venues</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <Chip label="Top Rated" active={sort === "rating"} onPress={() => setSort("rating")} />
              <Chip label="Nearest" active={sort === "distance"} onPress={() => setSort("distance")} />
            </View>
          </View>
        </View>
      ) : tab === "events" ? (
        <Text style={{ color: colors.muted, fontSize: 12 }}>{offerings.length} scheduled events &amp; classes</Text>
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Max price filter</Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {[
              [undefined, "Any"],
              [50, "<$50"],
              [100, "<$100"],
              [200, "<$200"],
            ].map(([val, label]) => (
              <Chip
                key={String(label)}
                label={String(label)}
                active={maxPrice === val}
                onPress={() => setMaxPrice(val as number | undefined)}
              />
            ))}
          </View>
        </View>
      )}

      {notice ? <Text style={{ color: colors.lavender, fontSize: 12 }}>{notice}</Text> : null}

      {tab === "businesses" ? (
        businesses.length === 0 ? (
          <EmptyState title="No matches" body="Try clearing filters or searching another category." />
        ) : (
          businesses.map((biz) => {
            const svcs = servicesForBusiness(state, biz.id);
            const minPrice = svcs.length ? Math.min(...svcs.map((s) => s.price)) : null;
            const models = enabledModelsForBusiness(state, biz.id);
            return (
              <Card
                key={biz.id}
                onPress={() => router.push(`/(customer)/business/${biz.id}`)}
                style={{ padding: 0, overflow: "hidden" }}
              >
                {biz.coverUrl ? <Image source={{ uri: biz.coverUrl }} style={{ width: "100%", height: 140 }} /> : null}
                <View style={{ padding: 14, gap: 8 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <Text style={{ color: colors.text, fontSize: 17, fontWeight: "800", flex: 1 }} numberOfLines={1}>
                      {biz.name}
                    </Text>
                    <Badge label={categoryLabels[biz.category]} tone="brand" />
                  </View>
                  <Text style={{ color: colors.muted, fontSize: 13 }} numberOfLines={2}>
                    {biz.description}
                  </Text>
                  {models.length > 0 ? (
                    <Text style={{ color: colors.lavender, fontSize: 11, fontWeight: "600" }}>
                      Supports: {models.map((m) => bookingModelLabel(m)).join(" · ")}
                    </Text>
                  ) : null}
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>
                      ★ {biz.rating.toFixed(1)} ({biz.reviewCount}) · {biz.city} · {biz.distanceMiles} mi
                    </Text>
                    {minPrice !== null ? (
                      <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12, fontVariant: ["tabular-nums"] }}>
                        From {minPrice === 0 ? "Free" : formatMoney(minPrice)}
                      </Text>
                    ) : null}
                  </View>
                  <Button label="Book Visit" small onPress={() => router.push(`/(customer)/book/${biz.id}`)} />
                </View>
              </Card>
            );
          })
        )
      ) : null}

      {tab === "spaces" ? (
        spaces.length === 0 ? (
          <EmptyState title="No matching spaces or resources" body="Try clearing your search or category filter." />
        ) : (
          spaces.map((res) => {
            const biz = state.businesses.find((b) => b.id === res.businessId);
            return (
              <Card key={res.id} style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800", flex: 1 }}>{res.name}</Text>
                  <Badge label={res.resourceType.replace(/_/g, " ")} tone="brand" />
                </View>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {biz?.name} · Up to {res.capacityPeople} guests · {res.unitsTotal} unit(s)
                </Text>
                {res.description ? (
                  <Text style={{ color: colors.muted, fontSize: 13 }} numberOfLines={2}>
                    {res.description}
                  </Text>
                ) : null}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: colors.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                    {res.basePrice === 0 ? "Free reservation" : `${formatMoney(res.basePrice)}/${res.pricingUnit.replace("per_", "")}`}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {biz ? (
                      <Button label="Venue" tone="ghost" small onPress={() => router.push(`/(customer)/business/${biz.id}`)} />
                    ) : null}
                    <Button
                      label="Reserve"
                      small
                      onPress={() => router.push(`/(customer)/book/${res.businessId}?model=resource&resource=${res.id}`)}
                    />
                  </View>
                </View>
              </Card>
            );
          })
        )
      ) : null}

      {tab === "services" ? (
        services.length === 0 ? (
          <EmptyState title="No matching services" body="Try clearing your search or price filters." />
        ) : (
          services.map((svc) => {
            const biz = state.businesses.find((b) => b.id === svc.businessId);
            return (
              <Card key={svc.id} onPress={() => router.push(`/(customer)/service/${svc.id}`)} style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800", flex: 1 }}>{svc.name}</Text>
                  <Badge label={`${svc.durationMinutes} min`} tone="brand" />
                </View>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{biz?.name} · {svc.category}</Text>
                <Text style={{ color: colors.muted, fontSize: 13 }} numberOfLines={2}>{svc.description}</Text>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 2 }}>
                  <Text style={{ color: colors.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                    {svc.price === 0 ? "Free" : formatMoney(svc.price)}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Button label="Details" tone="ghost" small onPress={() => router.push(`/(customer)/service/${svc.id}`)} />
                    <Button label="Book" small onPress={() => router.push(`/(customer)/book/${svc.businessId}?service=${svc.id}`)} />
                  </View>
                </View>
              </Card>
            );
          })
        )
      ) : null}

      {tab === "events" ? (
        offerings.length === 0 ? (
          <EmptyState title="No events or classes found" body="Try clearing your search or category filters." />
        ) : (
          offerings.map((off) => {
            const biz = state.businesses.find((b) => b.id === off.businessId);
            const nextSes = off.sessions.find((s) => s.status === "on_sale" || s.status === "scheduled") ?? off.sessions[0];
            const minTierPrice = nextSes?.tiers.length ? Math.min(...nextSes.tiers.map((t) => t.price)) : 0;
            return (
              <Card key={off.id} style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: "800", flex: 1 }}>{off.title}</Text>
                  <Badge label={bookingModelLabel(off.bookingModel)} tone="brand" />
                </View>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {biz?.name} · {off.venueArea || off.category}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 13 }} numberOfLines={2}>{off.description}</Text>
                {nextSes ? (
                  <Text style={{ color: colors.lavender, fontSize: 12, fontVariant: ["tabular-nums"] }}>
                    Next: {formatDateTime(nextSes.startAt)} · {nextSes.remainingCapacity} spot(s) left
                  </Text>
                ) : null}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: colors.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                    From {minTierPrice === 0 ? "Free" : formatMoney(minTierPrice)}
                  </Text>
                  <Button
                    label={off.bookingModel === "ticket" ? "Get Tickets" : "Reserve Spot"}
                    small
                    onPress={() =>
                      router.push(`/(customer)/book/${off.businessId}?model=${off.bookingModel}&offering=${off.id}`)
                    }
                  />
                </View>
              </Card>
            );
          })
        )
      ) : null}

      {tab === "products" ? (
        products.length === 0 ? (
          <EmptyState title="No matching products" body="Adjust your search or price filters." />
        ) : (
          products.map((product) => {
            const seller = state.businesses.find((b) => b.id === product.businessId);
            return (
              <Card
                key={product.id}
                onPress={() => router.push(`/(customer)/product/${product.id}`)}
                style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
              >
                <Image source={{ uri: product.imageUrl }} style={{ width: 64, height: 64, borderRadius: 10 }} />
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>{product.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{seller?.name}</Text>
                  <Text style={{ color: colors.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                    {formatMoney(product.price)}
                  </Text>
                </View>
                <Button
                  label={busyProductId === product.id ? "Adding…" : "+ Bag"}
                  tone="soft"
                  small
                  disabled={busyProductId === product.id}
                  onPress={async () => {
                    if (!auth.userId) return;
                    setNotice("");
                    if (usingMocks()) {
                      const res = addToCart(auth.userId, product.id, 1, product.variants[0]?.id);
                      setNotice(res.ok ? `Added ${product.name} to cart` : res.error);
                      return;
                    }
                    setBusyProductId(product.id);
                    try {
                      const res = await addToCartRemote(product.id, 1, product.variants[0]?.id);
                      setNotice(res.ok ? `Added ${product.name} to cart` : res.error);
                    } finally {
                      setBusyProductId("");
                    }
                  }}
                />
              </Card>
            );
          })
        )
      ) : null}
    </Screen>
  );
}
