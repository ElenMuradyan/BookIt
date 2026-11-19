import { addToCart, searchBusinesses, searchProducts, searchServices, servicesForBusiness, useBookItState } from "@bookit/api-client";
import { categoryLabels } from "@bookit/ui";
import { formatMoney } from "@bookit/utils";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Image, ScrollView, Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, Chip, EmptyState, Screen, SearchBar } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";
import { useMobileStore } from "@/store/useMobileStore";

const CATS = ["all", "beauty", "barber", "healthcare", "fitness", "restaurant", "wellness", "auto", "retail"] as const;

export default function ExploreScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const router = useRouter();
  const { colors } = useThemePalette();
  const exploreCategory = useMobileStore((s) => s.exploreCategory);
  const setExploreCategory = useMobileStore((s) => s.setExploreCategory);
  const [tab, setTab] = useState<"businesses" | "services" | "products">("businesses");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"rating" | "distance">("rating");
  const [maxPrice, setMaxPrice] = useState<number | undefined>(undefined);
  const [notice, setNotice] = useState("");

  const businesses = searchBusinesses(state, {
    q,
    category: exploreCategory === "all" ? undefined : exploreCategory,
    sort,
  });
  const services = searchServices(state, {
    q,
    category: exploreCategory === "all" ? undefined : exploreCategory,
    maxPrice,
  });
  const products = searchProducts(state, { q, maxPrice });

  return (
    <Screen>
      <BrandHeader
        title="Explore"
        right={<Button label="Shop" tone="soft" small onPress={() => router.push("/(customer)/marketplace")} />}
      />

      <SearchBar value={q} onChangeText={setQ} placeholder="Search salons, clinics, services, products…" />

      <View style={{ flexDirection: "row", gap: 8 }}>
        {(
          [
            ["businesses", `Venues (${businesses.length})`],
            ["services", `Services (${services.length})`],
            ["products", `Products (${products.length})`],
          ] as const
        ).map(([id, label]) => (
          <Chip key={id} label={label} active={tab === id} onPress={() => setTab(id)} />
        ))}
      </View>

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
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{businesses.length} approved venues</Text>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Chip label="Top Rated" active={sort === "rating"} onPress={() => setSort("rating")} />
            <Chip label="Nearest" active={sort === "distance"} onPress={() => setSort("distance")} />
          </View>
        </View>
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
                  label="+ Bag"
                  tone="soft"
                  small
                  onPress={() => {
                    if (!auth.userId) return;
                    const res = addToCart(auth.userId, product.id, 1, product.variants[0]?.id);
                    setNotice(res.ok ? `Added ${product.name} to cart` : res.error);
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
