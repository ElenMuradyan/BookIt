import { cartFor, setCartQuantity, useBookItState } from "@bookit/api-client";
import { formatMoney } from "@bookit/utils";
import { useRouter } from "expo-router";
import React from "react";
import { Image, Text, View } from "react-native";
import { BrandHeader, Button, Card, EmptyState, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function CartScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const router = useRouter();
  const { colors } = useThemePalette();

  if (!auth.userId) return null;
  const cart = cartFor(state, auth.userId);
  const items = cart?.items ?? [];

  const subtotal = items.reduce((sum, item) => {
    const product = state.products.find((p) => p.id === item.productId);
    const variant = product?.variants.find((v) => v.id === item.variantId);
    const unit = (product?.price ?? 0) + (variant?.priceDelta ?? 0);
    return sum + unit * item.quantity;
  }, 0);

  return (
    <Screen>
      <BrandHeader title="Shopping Bag" showBack />

      {items.length === 0 ? (
        <Card style={{ gap: 12 }}>
          <EmptyState title="Your bag is empty" body="Browse multi-vendor marketplace items to add products." />
          <Button label="Browse Marketplace" onPress={() => router.push("/(customer)/marketplace")} />
        </Card>
      ) : (
        <>
          {items.map((item) => {
            const product = state.products.find((p) => p.id === item.productId);
            const seller = state.businesses.find((b) => b.id === item.sellerId);
            const variant = product?.variants.find((v) => v.id === item.variantId);
            const unit = (product?.price ?? 0) + (variant?.priceDelta ?? 0);
            if (!product) return null;
            return (
              <Card key={item.id} style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                <Image source={{ uri: product.imageUrl }} style={{ width: 64, height: 64, borderRadius: 10 }} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: colors.text, fontWeight: "700" }}>{product.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    {seller?.name} {variant ? `· ${variant.label}` : ""}
                  </Text>
                  <Text style={{ color: colors.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                    {formatMoney(unit * item.quantity)}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Button label="-" tone="ghost" small onPress={() => setCartQuantity(auth.userId!, item.id, item.quantity - 1)} />
                  <Text style={{ color: colors.text, fontWeight: "700", fontVariant: ["tabular-nums"] }}>{item.quantity}</Text>
                  <Button label="+" tone="soft" small onPress={() => setCartQuantity(auth.userId!, item.id, item.quantity + 1)} />
                </View>
              </Card>
            );
          })}

          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.muted }}>Subtotal</Text>
              <Text style={{ color: colors.text, fontWeight: "800", fontSize: 18, fontVariant: ["tabular-nums"] }}>
                {formatMoney(subtotal)}
              </Text>
            </View>
            <Button label="Proceed to Checkout" onPress={() => router.push("/(customer)/checkout")} />
          </Card>
        </>
      )}
    </Screen>
  );
}
