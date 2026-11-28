import {
  addReview,
  addReviewRemote,
  addToCart,
  addToCartRemote,
  bookingConfigsForBusiness,
  displayUser,
  enabledModelsForBusiness,
  offeringsForBusiness,
  publicBusinessById,
  resourcesForBusiness,
  servicesForBusiness,
  toggleFavorite,
  toggleFavoriteRemote,
  useBookItState,
  usingMocks,
} from "@bookit/api-client";
import { brand } from "@bookit/design-system";
import { categoryLabels, primaryCtaLabelForBusiness } from "@bookit/ui";
import { formatDate, formatDateTime, formatMoney } from "@bookit/utils";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Image, Modal, Pressable, Text, View } from "react-native";
import { Avatar, Badge, BrandHeader, Button, Card, EmptyState, InputField, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";
import { useMobileStore } from "@/store/useMobileStore";

const DAYS = [
  ["mon", "Mon"],
  ["tue", "Tue"],
  ["wed", "Wed"],
  ["thu", "Thu"],
  ["fri", "Fri"],
  ["sat", "Sat"],
  ["sun", "Sun"],
] as const;

export default function BusinessProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const auth = useAuth();
  const state = useBookItState();
  const router = useRouter();
  const { colors } = useThemePalette();
  const addRecentBusiness = useMobileStore((s) => s.addRecentBusiness);
  const [notice, setNotice] = useState("");
  const [showReview, setShowReview] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [rating, setRating] = useState(5);
  const [reviewError, setReviewError] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  const [cartBusyId, setCartBusyId] = useState("");

  const business = id ? publicBusinessById(state, id) : undefined;

  useEffect(() => {
    if (business) addRecentBusiness(business.id);
  }, [business, addRecentBusiness]);

  if (!business) {
    return (
      <Screen>
        <BrandHeader title="Business" showBack />
        <EmptyState title="Business unavailable" body="This venue is pending verification or not public." />
      </Screen>
    );
  }

  const services = servicesForBusiness(state, business.id);
  const resources = resourcesForBusiness(state, business.id);
  const offerings = offeringsForBusiness(state, business.id);
  const configs = bookingConfigsForBusiness(state, business.id);
  const enabledModels = enabledModelsForBusiness(state, business.id);
  const primaryModel = enabledModels[0] ?? "appointment";
  const ctaLabel = primaryCtaLabelForBusiness(business.category, enabledModels);
  const resourceCfg = configs.find((c) => c.bookingModel === "resource");
  const employees = state.employees.filter((e) => e.businessId === business.id);
  const products = state.products.filter((p) => p.businessId === business.id && p.active);
  const reviews = state.reviews.filter((r) => r.businessId === business.id && r.status === "published");
  const isFav = auth.userId
    ? state.favorites.some((f) => f.userId === auth.userId && f.targetType === "business" && f.targetId === business.id)
    : false;

  const spacesHeading =
    business.category === "restaurant"
      ? "Dining Tables & Seating"
      : business.category === "hotel"
        ? "Rooms & Suites"
        : business.category === "sports"
          ? "Courts & Fields"
          : "Spaces & Resources";

  return (
    <Screen>
      <BrandHeader title={business.name} showBack />

      <Card style={{ padding: 0, overflow: "hidden" }}>
        {business.coverUrl ? <Image source={{ uri: business.coverUrl }} style={{ width: "100%", height: 165 }} /> : null}
        <View style={{ padding: 16, gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800", flex: 1 }}>{business.name}</Text>
            <Badge label={categoryLabels[business.category]} tone="brand" />
          </View>
          <Text style={{ color: colors.muted, fontSize: 13 }}>{business.description}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            ★ {business.rating.toFixed(1)} ({business.reviewCount} reviews) · {business.address}, {business.city} · {business.distanceMiles} mi
          </Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button
              label={ctaLabel}
              style={{ flex: 1 }}
              onPress={() => router.push(`/(customer)/book/${business.id}?model=${primaryModel}`)}
            />
            <Button
              label={favBusy ? "Saving…" : isFav ? "Saved" : "Save"}
              tone={isFav ? "soft" : "ghost"}
              icon={isFav ? "heart" : "heart-outline"}
              disabled={favBusy}
              onPress={async () => {
                if (!auth.userId) {
                  setNotice("Please sign in first.");
                  return;
                }
                setNotice("");
                if (usingMocks()) {
                  toggleFavorite(auth.userId, "business", business.id, "Weekends");
                  setNotice(isFav ? "Removed from favorites" : "Saved to favorites");
                  return;
                }
                setFavBusy(true);
                try {
                  const res = await toggleFavoriteRemote("business", business.id, "Weekends");
                  setNotice(res.ok ? (isFav ? "Removed from favorites" : "Saved to favorites") : res.error);
                } finally {
                  setFavBusy(false);
                }
              }}
            />
          </View>
          {notice ? <Text style={{ color: brand.lavender, fontSize: 12 }}>{notice}</Text> : null}
        </View>
      </Card>

      {resources.length > 0 ? (
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>{spacesHeading}</Text>
            <Button
              label={business.category === "hotel" ? "Search Stays" : "Check Slots"}
              tone="soft"
              small
              onPress={() => router.push(`/(customer)/book/${business.id}?model=resource`)}
            />
          </View>
          {business.category === "hotel" && resourceCfg?.settings ? (
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              Check-in {String(resourceCfg.settings.checkInTime ?? "15:00")} · Check-out {String(resourceCfg.settings.checkOutTime ?? "11:00")}
            </Text>
          ) : null}
          {resources.map((res) => {
            const area = typeof res.attributes?.area === "string" ? res.attributes.area : "";
            return (
              <View
                key={res.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingTop: 10,
                  borderTopWidth: 1,
                  borderTopColor: colors.line,
                  gap: 10,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>{res.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    Up to {res.capacityPeople} guests · {res.unitsTotal} unit(s){area ? ` · ${area}` : ""}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text style={{ color: colors.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                    {res.basePrice === 0 ? "Free" : `${formatMoney(res.basePrice)}/${res.pricingUnit.replace("per_", "")}`}
                  </Text>
                  <Button
                    label="Reserve"
                    tone="soft"
                    small
                    onPress={() => router.push(`/(customer)/book/${business.id}?model=resource&resource=${res.id}`)}
                  />
                </View>
              </View>
            );
          })}
        </Card>
      ) : null}

      {offerings.length > 0 ? (
        <Card style={{ gap: 10 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>Events, Tours &amp; Classes</Text>
          {offerings.map((off) => {
            const nextSes = off.sessions.find((s) => s.status === "on_sale" || s.status === "scheduled");
            const minPrice = nextSes?.tiers.length ? Math.min(...nextSes.tiers.map((t) => t.price)) : 0;
            return (
              <View
                key={off.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingTop: 10,
                  borderTopWidth: 1,
                  borderTopColor: colors.line,
                  gap: 10,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>{off.title}</Text>
                  {nextSes ? (
                    <Text style={{ color: colors.muted, fontSize: 12 }}>
                      {formatDateTime(nextSes.startAt)} · {nextSes.remainingCapacity} left
                    </Text>
                  ) : null}
                </View>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <Text style={{ color: colors.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                    {minPrice === 0 ? "Free" : `From ${formatMoney(minPrice)}`}
                  </Text>
                  <Button
                    label={off.bookingModel === "ticket" ? "Tickets" : "Join"}
                    tone="soft"
                    small
                    onPress={() => router.push(`/(customer)/book/${business.id}?model=${off.bookingModel}&offering=${off.id}`)}
                  />
                </View>
              </View>
            );
          })}
        </Card>
      ) : null}

      {services.length > 0 || (resources.length === 0 && offerings.length === 0) ? (
        <Card style={{ gap: 10 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>Services ({services.length})</Text>
          {services.map((svc) => (
            <Pressable
              key={svc.id}
              onPress={() => router.push(`/(customer)/service/${svc.id}`)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingTop: 10,
                borderTopWidth: 1,
                borderTopColor: colors.line,
                gap: 10,
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 14 }}>{svc.name}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{svc.durationMinutes} min · {svc.description}</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text style={{ color: colors.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                  {svc.price === 0 ? "Free" : formatMoney(svc.price)}
                </Text>
                <Button
                  label="Book"
                  tone="soft"
                  small
                  onPress={() => router.push(`/(customer)/book/${business.id}?model=appointment&service=${svc.id}`)}
                />
              </View>
            </Pressable>
          ))}
        </Card>
      ) : null}

      {employees.length > 0 ? (
        <Card style={{ gap: 10 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>Specialists</Text>
          {employees.map((emp) => {
            const person = state.users.find((u) => u.id === emp.userId);
            const name = displayUser(state, emp.userId);
            return (
              <Pressable
                key={emp.id}
                onPress={() => router.push(`/(customer)/book/${business.id}?model=appointment&employee=${emp.id}`)}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 }}
              >
                <Avatar name={name} uri={person?.avatarUrl} size={42} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "700" }}>{name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{emp.title} · ★ {emp.rating.toFixed(1)}</Text>
                </View>
                <Badge label="Select" tone="brand" />
              </Pressable>
            );
          })}
        </Card>
      ) : null}

      {products.length > 0 ? (
        <Card style={{ gap: 10 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>Products</Text>
          {products.map((prd) => (
            <View key={prd.id} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Image source={{ uri: prd.imageUrl }} style={{ width: 52, height: 52, borderRadius: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "700" }}>{prd.name}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{formatMoney(prd.price)}</Text>
              </View>
              <Button
                label={cartBusyId === prd.id ? "Adding…" : "+ Cart"}
                tone="soft"
                small
                disabled={cartBusyId === prd.id}
                onPress={async () => {
                  if (!auth.userId) {
                    setNotice("Please sign in first.");
                    return;
                  }
                  setNotice("");
                  if (usingMocks()) {
                    const res = addToCart(auth.userId, prd.id, 1, prd.variants[0]?.id);
                    setNotice(res.ok ? `Added ${prd.name} to cart` : res.error);
                    return;
                  }
                  setCartBusyId(prd.id);
                  try {
                    const res = await addToCartRemote(prd.id, 1, prd.variants[0]?.id);
                    setNotice(res.ok ? `Added ${prd.name} to cart` : res.error);
                  } finally {
                    setCartBusyId("");
                  }
                }}
              />
            </View>
          ))}
        </Card>
      ) : null}

      <Card style={{ gap: 6 }}>
        <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>Hours &amp; Policy</Text>
        {DAYS.map(([k, label]) => {
          const row = business.hours[k];
          return (
            <View key={k} style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
              <Text style={{ color: colors.text, fontSize: 12, fontVariant: ["tabular-nums"] }}>
                {row.closed ? "Closed" : `${row.open} – ${row.close}`}
              </Text>
            </View>
          );
        })}
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>{business.cancellationPolicy}</Text>
      </Card>

      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>Reviews ({reviews.length})</Text>
          <Button
            label="Write review"
            tone="soft"
            small
            onPress={() => {
              if (!auth.userId) {
                setNotice("Please sign in to write a review.");
                return;
              }
              setReviewError("");
              setShowReview(true);
            }}
          />
        </View>
        {reviews.map((rev) => (
          <View key={rev.id} style={{ borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8, gap: 2 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.warning, fontSize: 12 }}>{"★".repeat(rev.rating)}</Text>
              <Text style={{ color: colors.muted, fontSize: 11 }}>{formatDate(rev.createdAt)}</Text>
            </View>
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 13 }}>{rev.title}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{rev.body}</Text>
          </View>
        ))}
      </Card>

      <Modal visible={showReview} transparent animationType="slide" onRequestClose={() => setShowReview(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(8,8,14,0.75)", justifyContent: "center", padding: 20 }}>
          <Card style={{ gap: 12 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>Review {business.name}</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {[5, 4, 3, 2, 1].map((n) => (
                <Button key={n} label={`${n}★`} tone={rating === n ? "primary" : "ghost"} small onPress={() => setRating(n)} />
              ))}
            </View>
            <InputField label="Headline" value={title} onChangeText={setTitle} />
            <InputField label="Details" value={body} onChangeText={setBody} multiline />
            {reviewError ? <Text style={{ color: colors.danger, fontSize: 12 }}>{reviewError}</Text> : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="Cancel" tone="ghost" style={{ flex: 1 }} onPress={() => setShowReview(false)} />
              <Button
                label={reviewBusy ? "Publishing..." : "Publish"}
                disabled={reviewBusy}
                style={{ flex: 1 }}
                onPress={async () => {
                  if (!auth.userId) {
                    setReviewError("Please sign in to publish a review.");
                    return;
                  }
                  setReviewError("");
                  if (usingMocks()) {
                    const res = addReview({ authorId: auth.userId, businessId: business.id, rating, title, body });
                    if (!res.ok) {
                      setReviewError(res.error);
                      return;
                    }
                    setShowReview(false);
                    setTitle("");
                    setBody("");
                    setNotice("Review published.");
                    return;
                  }
                  setReviewBusy(true);
                  try {
                    const res = await addReviewRemote({ businessId: business.id, rating, title, body });
                    if (!res.ok) {
                      setReviewError(res.error);
                      return;
                    }
                    setShowReview(false);
                    setTitle("");
                    setBody("");
                    setNotice("Review published.");
                  } finally {
                    setReviewBusy(false);
                  }
                }}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}
