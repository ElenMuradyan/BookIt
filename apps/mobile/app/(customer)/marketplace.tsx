import { addToCart, cartFor, searchProducts, useBookItState } from "@bookit/api-client";
import { formatMoney } from "@bookit/utils";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Image, ScrollView, Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, Chip, EmptyState, Screen, SearchBar } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function MarketplaceScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const router = useRouter();
  const { colors } = useThemePalette();
  const [q, setQ] = useState("");
  const [catId, setCatId] = useState("all");
  const [sort, setSort] = useState<"rating" | "price_asc" | "price_desc">("rating");
  const [notice, setNotice] = useState("");

  const products = searchProducts(state, {
    q,
    productCategory: catId === "all" ? undefined : catId,
    sort,
    inStock: true,
  });
  const cartCount = auth.userId ? cartFor(state, auth.userId)?.items.reduce((s, i) => s + i.quantity, 0) ?? 0 : 0;

  return (
    <Screen>
      <BrandHeader
        title="Marketplace"
        showBack
        right={<Button label={`Bag (${cartCount})`} tone="soft" small onPress={() => router.push("/(customer)/cart")} />}
      />

      <SearchBar value={q} onChangeText={setQ} placeholder="Search electronics, apparel, home, skincare…" />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip label="All" active={catId === "all"} onPress={() => setCatId("all")} />
        {state.productCategories.map((c) => (
          <Chip key={c.id} label={c.name} active={catId === c.id} onPress={() => setCatId(c.id)} />
        ))}
      </ScrollView>

      <View style={{ flexDirection: "row", gap: 6 }}>
        <Chip label="Popular" active={sort === "rating"} onPress={() => setSort("rating")} />
        <Chip label="Price ↑" active={sort === "price_asc"} onPress={() => setSort("price_asc")} />
        <Chip label="Price ↓" active={sort === "price_desc"} onPress={() => setSort("price_desc")} />
      </View>

      {notice ? <Text style={{ color: colors.lavender, fontSize: 12 }}>{notice}</Text> : null}

      {products.length === 0 ? (
        <EmptyState title="No products found" body="Try clearing your search or category filter." />
      ) : (
        products.map((product) => {
          const seller = state.businesses.find((b) => b.id === product.businessId);
          return (
            <Card
              key={product.id}
              onPress={() => router.push(`/(customer)/product/${product.id}`)}
              style={{ flexDirection: "row", gap: 12 }}
            >
              <Image source={{ uri: product.imageUrl }} style={{ width: 90, height: 90, borderRadius: 12 }} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }} numberOfLines={1}>
                  {product.name}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{seller?.name}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={{ color: colors.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                    {formatMoney(product.price)}
                  </Text>
                  {product.discountLabel ? <Badge label={product.discountLabel} tone="brand" /> : null}
                </View>
                <Button
                  label="Add to Bag"
                  tone="soft"
                  small
                  onPress={() => {
                    if (!auth.userId) return;
                    const res = addToCart(auth.userId, product.id, 1, product.variants[0]?.id);
                    setNotice(res.ok ? `Added ${product.name}` : res.error);
                  }}
                />
              </View>
            </Card>
          );
        })
      )}
    </Screen>
  );
}
