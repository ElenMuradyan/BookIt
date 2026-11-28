import {
  addToCart,
  addToCartRemote,
  toggleFavorite,
  toggleFavoriteRemote,
  useBookItState,
  usingMocks,
} from "@bookit/api-client";
import { formatMoney } from "@bookit/utils";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Image, Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, Chip, EmptyState, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const auth = useAuth();
  const state = useBookItState();
  const router = useRouter();
  const { colors } = useThemePalette();

  const product = state.products.find((p) => p.id === id);
  const [variantId, setVariantId] = useState(product?.variants[0]?.id);
  const [notice, setNotice] = useState("");
  const [cartBusy, setCartBusy] = useState(false);
  const [favBusy, setFavBusy] = useState(false);

  if (!product) {
    return (
      <Screen>
        <BrandHeader title="Product" showBack />
        <EmptyState title="Product not found" body="This item may no longer be available." />
      </Screen>
    );
  }

  const seller = state.businesses.find((b) => b.id === product.businessId);
  const variant = product.variants.find((v) => v.id === variantId);
  const price = product.price + (variant?.priceDelta ?? 0);
  const isFav = auth.userId
    ? state.favorites.some((f) => f.userId === auth.userId && f.targetType === "product" && f.targetId === product.id)
    : false;

  return (
    <Screen>
      <BrandHeader title={product.name} showBack />

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <Image source={{ uri: product.imageUrl }} style={{ width: "100%", height: 220 }} />
        <View style={{ padding: 16, gap: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Badge label={seller?.name ?? "Vendor"} tone="brand" />
            <Text style={{ color: colors.warning, fontSize: 12 }}>★ {product.rating.toFixed(1)} ({product.reviewCount})</Text>
          </View>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800" }}>{product.name}</Text>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
            {formatMoney(price)}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 13 }}>{product.description}</Text>

          {product.variants.length > 0 ? (
            <View style={{ gap: 6 }}>
              <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>Options</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {product.variants.map((v) => (
                  <Chip key={v.id} label={v.label} active={variantId === v.id} onPress={() => setVariantId(v.id)} />
                ))}
              </View>
            </View>
          ) : null}

          <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
            <Button
              label={cartBusy ? "Adding…" : "Add to Bag"}
              disabled={cartBusy}
              style={{ flex: 1 }}
              onPress={async () => {
                if (!auth.userId) return;
                setNotice("");
                if (usingMocks()) {
                  const res = addToCart(auth.userId, product.id, 1, variantId);
                  setNotice(res.ok ? "Added to shopping bag" : res.error);
                  return;
                }
                setCartBusy(true);
                try {
                  const res = await addToCartRemote(product.id, 1, variantId);
                  setNotice(res.ok ? "Added to shopping bag" : res.error);
                } finally {
                  setCartBusy(false);
                }
              }}
            />
            <Button
              label={favBusy ? "Saving…" : isFav ? "Saved" : "Save"}
              tone={isFav ? "soft" : "ghost"}
              icon={isFav ? "heart" : "heart-outline"}
              disabled={favBusy}
              onPress={async () => {
                if (!auth.userId) return;
                setNotice("");
                if (usingMocks()) {
                  toggleFavorite(auth.userId, "product", product.id, "Gifts");
                  setNotice(isFav ? "Removed from favorites" : "Saved to favorites");
                  return;
                }
                setFavBusy(true);
                try {
                  const res = await toggleFavoriteRemote("product", product.id, "Gifts");
                  setNotice(res.ok ? (isFav ? "Removed from favorites" : "Saved to favorites") : res.error);
                } finally {
                  setFavBusy(false);
                }
              }}
            />
          </View>
          {notice ? <Text style={{ color: colors.lavender, fontSize: 12 }}>{notice}</Text> : null}
          <Button label="Go to Bag" tone="ghost" small onPress={() => router.push("/(customer)/cart")} />
        </View>
      </Card>
    </Screen>
  );
}
