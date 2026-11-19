import { cartFor, checkout, useBookItState } from "@bookit/api-client";
import type { PaymentMethod } from "@bookit/types";
import { formatMoney } from "@bookit/utils";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { BrandHeader, Button, Card, Chip, EmptyState, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function CheckoutScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const router = useRouter();
  const { colors } = useThemePalette();

  const addresses = auth.userId ? state.addresses.filter((a) => a.userId === auth.userId) : [];
  const [addressId, setAddressId] = useState(addresses[0]?.id ?? "");
  const [deliveryMethod, setDeliveryMethod] = useState<"standard" | "express" | "pickup">("standard");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card_token_pending");
  const [error, setError] = useState("");

  if (!auth.userId) return null;
  const cart = cartFor(state, auth.userId);
  const items = cart?.items ?? [];

  if (items.length === 0) {
    return (
      <Screen>
        <BrandHeader title="Checkout" showBack />
        <EmptyState title="Nothing to check out" body="Add items to your bag before checking out." />
      </Screen>
    );
  }

  const subtotal = items.reduce((sum, item) => {
    const product = state.products.find((p) => p.id === item.productId);
    const variant = product?.variants.find((v) => v.id === item.variantId);
    return sum + ((product?.price ?? 0) + (variant?.priceDelta ?? 0)) * item.quantity;
  }, 0);
  const sellers = new Set(items.map((i) => i.sellerId)).size;
  const deliveryFee = (deliveryMethod === "express" ? 12 : deliveryMethod === "standard" ? 6 : 0) * sellers;

  return (
    <Screen>
      <BrandHeader title="Checkout" showBack />

      <Card style={{ gap: 8 }}>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>Delivery Address</Text>
        {addresses.map((addr) => (
          <Button
            key={addr.id}
            label={`${addr.label} · ${addr.line1}, ${addr.city}`}
            tone={addressId === addr.id ? "soft" : "ghost"}
            small
            onPress={() => setAddressId(addr.id)}
          />
        ))}
      </Card>

      <Card style={{ gap: 8 }}>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>Delivery Method</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Chip label="Standard ($6/seller)" active={deliveryMethod === "standard"} onPress={() => setDeliveryMethod("standard")} />
          <Chip label="Express ($12/seller)" active={deliveryMethod === "express"} onPress={() => setDeliveryMethod("express")} />
          <Chip label="Pickup (Free)" active={deliveryMethod === "pickup"} onPress={() => setDeliveryMethod("pickup")} />
        </View>
      </Card>

      <Card style={{ gap: 8 }}>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>Payment Method</Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          Card numbers are never collected in the frontend demo. Tokenized billing connects via FastAPI.
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Chip label="Saved Card Token" active={paymentMethod === "card_token_pending"} onPress={() => setPaymentMethod("card_token_pending")} />
          <Chip label="Wallet" active={paymentMethod === "wallet"} onPress={() => setPaymentMethod("wallet")} />
          <Chip label="Pay on Pickup" active={paymentMethod === "pay_on_pickup"} onPress={() => setPaymentMethod("pay_on_pickup")} />
        </View>
      </Card>

      <Card style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: colors.muted }}>Items ({items.length})</Text>
          <Text style={{ color: colors.text, fontVariant: ["tabular-nums"] }}>{formatMoney(subtotal)}</Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: colors.muted }}>Delivery ({sellers} seller{sellers > 1 ? "s" : ""})</Text>
          <Text style={{ color: colors.text, fontVariant: ["tabular-nums"] }}>{formatMoney(deliveryFee)}</Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 }}>
          <Text style={{ color: colors.text, fontWeight: "800", fontSize: 16 }}>Total</Text>
          <Text style={{ color: colors.text, fontWeight: "800", fontSize: 18, fontVariant: ["tabular-nums"] }}>
            {formatMoney(subtotal + deliveryFee)}
          </Text>
        </View>
        {error ? <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text> : null}
        <Button
          label="Place Order"
          onPress={() => {
            const res = checkout({
              userId: auth.userId!,
              addressId: addressId || addresses[0]?.id || "",
              deliveryMethod,
              paymentMethod,
            });
            if (!res.ok) {
              setError(res.error);
              return;
            }
            router.replace("/(customer)/orders");
          }}
        />
      </Card>
    </Screen>
  );
}
