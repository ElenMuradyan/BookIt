import { publicBusinessById, toggleFavorite, useBookItState } from "@bookit/api-client";
import { categoryLabels } from "@bookit/ui";
import { formatMoney } from "@bookit/utils";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, Chip, EmptyState, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function FavoritesScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const router = useRouter();
  const { colors } = useThemePalette();
  const [collection, setCollection] = useState("All");

  if (!auth.userId) return null;
  const favs = state.favorites.filter((f) => f.userId === auth.userId);
  const collections = ["All", ...new Set(favs.map((f) => f.collection))];
  const filtered = collection === "All" ? favs : favs.filter((f) => f.collection === collection);

  return (
    <Screen>
      <BrandHeader title="Favorites" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {collections.map((c) => (
          <Chip key={c} label={c} active={collection === c} onPress={() => setCollection(c)} />
        ))}
      </ScrollView>

      {filtered.length === 0 ? (
        <EmptyState title="No saved favorites" body="Tap Save on any venue or product to build collections." />
      ) : (
        filtered.map((fav) => {
          const biz = fav.targetType === "business" ? publicBusinessById(state, fav.targetId) : undefined;
          const prd = fav.targetType === "product" ? state.products.find((p) => p.id === fav.targetId) : undefined;
          const svc = fav.targetType === "service" ? state.services.find((s) => s.id === fav.targetId) : undefined;
          const title = biz?.name ?? prd?.name ?? svc?.name ?? "Saved Item";
          const subtitle = biz
            ? `${categoryLabels[biz.category]} · ${biz.city}`
            : prd
              ? formatMoney(prd.price)
              : svc
                ? `${svc.durationMinutes} min · ${formatMoney(svc.price)}`
                : fav.targetType;

          return (
            <Card key={fav.id} style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Badge label={fav.collection} tone="brand" />
                <Button
                  label="Remove"
                  tone="ghost"
                  small
                  onPress={() => toggleFavorite(auth.userId!, fav.targetType, fav.targetId, fav.collection)}
                />
              </View>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>{title}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{subtitle}</Text>
              {biz ? <Button label="Open Venue" tone="soft" small onPress={() => router.push(`/(customer)/business/${biz.id}`)} /> : null}
              {prd ? <Button label="View Product" tone="soft" small onPress={() => router.push(`/(customer)/product/${prd.id}`)} /> : null}
            </Card>
          );
        })
      )}
    </Screen>
  );
}
