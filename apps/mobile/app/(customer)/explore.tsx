import { searchBusinesses, servicesForBusiness, useBookItState } from "@bookit/api-client";
import { categoryLabels } from "@bookit/ui";
import { formatMoney } from "@bookit/utils";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Image, ScrollView, Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, Chip, EmptyState, Screen, SearchBar } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useMobileStore } from "@/store/useMobileStore";

const CATS = ["all", "beauty", "barber", "healthcare", "fitness", "restaurant", "wellness", "auto"] as const;

export default function ExploreScreen() {
  const state = useBookItState();
  const router = useRouter();
  const { colors } = useThemePalette();
  const exploreCategory = useMobileStore((s) => s.exploreCategory);
  const setExploreCategory = useMobileStore((s) => s.setExploreCategory);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"rating" | "distance">("rating");

  const businesses = searchBusinesses(state, {
    q,
    category: exploreCategory === "all" ? undefined : exploreCategory,
    sort,
  });

  return (
    <Screen>
      <BrandHeader
        title="Explore"
        right={<Button label="Shop" tone="soft" small onPress={() => router.push("/(customer)/marketplace")} />}
      />

      <SearchBar value={q} onChangeText={setQ} placeholder="Search salons, clinics, gyms, restaurants…" />

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

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{businesses.length} approved venues</Text>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Chip label="Top Rated" active={sort === "rating"} onPress={() => setSort("rating")} />
          <Chip label="Nearest" active={sort === "distance"} onPress={() => setSort("distance")} />
        </View>
      </View>

      {businesses.length === 0 ? (
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
      )}
    </Screen>
  );
}
