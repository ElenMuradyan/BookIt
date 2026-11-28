import {
  moderateReview,
  moderateReviewRemote,
  resetDemoState,
  setAdvertisementStatus,
  setAdvertisementStatusRemote,
  setReportStatus,
  setReportStatusRemote,
  useBookItState,
  usingMocks,
} from "@bookit/api-client";
import { formatMoney } from "@bookit/utils";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, Chip, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function AdminMoreScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const router = useRouter();
  const { colors, themeName } = useThemePalette();
  const [section, setSection] = useState<"reports" | "ads" | "subs" | "reviews">("reports");
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");
  const mockMode = usingMocks();

  return (
    <Screen>
      <BrandHeader mode="admin" />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Chip label={`Reports (${state.reports.length})`} active={section === "reports"} onPress={() => setSection("reports")} />
        <Chip label={`Ads (${state.advertisements.length})`} active={section === "ads"} onPress={() => setSection("ads")} />
        <Chip label={`Subs (${state.subscriptions.length})`} active={section === "subs"} onPress={() => setSection("subs")} />
        <Chip label={`Reviews (${state.reviews.length})`} active={section === "reviews"} onPress={() => setSection("reviews")} />
      </View>

      {notice ? <Text style={{ color: colors.lavender, fontSize: 12 }}>{notice}</Text> : null}

      {section === "reports"
        ? state.reports.map((rep) => {
            const isBusy = busyId === rep.id;
            const handleReport = async (status: "resolved" | "dismissed") => {
              setNotice("");
              if (mockMode) {
                const res = setReportStatus(rep.id, status);
                setNotice(res.ok ? `Report ${status}.` : res.error);
                return;
              }
              setBusyId(rep.id);
              try {
                const res = await setReportStatusRemote(rep.id, status);
                setNotice(res.ok ? `Report ${status}.` : res.error);
              } finally {
                setBusyId("");
              }
            };
            return (
              <Card key={rep.id} style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: colors.text, fontWeight: "700" }}>{rep.reason}</Text>
                  <Badge label={rep.status} tone={rep.status === "resolved" ? "success" : "warning"} />
                </View>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{rep.details}</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Button label="Resolve" tone="soft" small disabled={isBusy} style={{ flex: 1 }} onPress={() => handleReport("resolved")} />
                  <Button label="Dismiss" tone="ghost" small disabled={isBusy} style={{ flex: 1 }} onPress={() => handleReport("dismissed")} />
                </View>
              </Card>
            );
          })
        : null}

      {section === "ads"
        ? state.advertisements.map((ad) => {
            const isBusy = busyId === ad.id;
            const nextStatus = ad.status === "active" ? "paused" : "active";
            return (
              <Card key={ad.id} style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: colors.text, fontWeight: "700" }}>{ad.title}</Text>
                  <Badge label={ad.status} tone={ad.status === "active" ? "success" : "neutral"} />
                </View>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {ad.placement} · Budget {formatMoney(ad.budget)}
                </Text>
                <Button
                  label={isBusy ? "Updating…" : ad.status === "active" ? "Pause Ad" : "Activate Ad"}
                  tone="soft"
                  small
                  disabled={isBusy}
                  onPress={async () => {
                    setNotice("");
                    if (mockMode) {
                      const res = setAdvertisementStatus(ad.id, nextStatus);
                      setNotice(res.ok ? `Ad set to ${nextStatus}.` : res.error);
                      return;
                    }
                    setBusyId(ad.id);
                    try {
                      const res = await setAdvertisementStatusRemote(ad.id, nextStatus);
                      setNotice(res.ok ? `Ad set to ${nextStatus}.` : res.error);
                    } finally {
                      setBusyId("");
                    }
                  }}
                />
              </Card>
            );
          })
        : null}

      {section === "subs"
        ? state.subscriptions.map((sub) => {
            const biz = state.businesses.find((b) => b.id === sub.businessId);
            return (
              <Card key={sub.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View>
                  <Text style={{ color: colors.text, fontWeight: "700" }}>{biz?.name ?? sub.businessId}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>Plan: {sub.planId.toUpperCase()}</Text>
                </View>
                <Badge label={sub.status} tone="brand" />
              </Card>
            );
          })
        : null}

      {section === "reviews"
        ? state.reviews.map((rev) => {
            const isBusy = busyId === rev.id;
            const nextStatus = rev.status === "published" ? "hidden" : "published";
            return (
              <Card key={rev.id} style={{ gap: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: colors.text, fontWeight: "700" }}>{rev.title}</Text>
                  <Badge label={rev.status} tone={rev.status === "published" ? "success" : "danger"} />
                </View>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{rev.body}</Text>
                <Button
                  label={isBusy ? "Updating…" : rev.status === "published" ? "Hide Review" : "Publish Review"}
                  tone="ghost"
                  small
                  disabled={isBusy}
                  onPress={async () => {
                    setNotice("");
                    if (mockMode) {
                      const res = moderateReview(rev.id, nextStatus);
                      setNotice(res.ok ? `Review ${nextStatus}.` : res.error);
                      return;
                    }
                    setBusyId(rev.id);
                    try {
                      const res = await moderateReviewRemote(rev.id, nextStatus);
                      setNotice(res.ok ? `Review ${nextStatus}.` : res.error);
                    } finally {
                      setBusyId("");
                    }
                  }}
                />
              </Card>
            );
          })
        : null}

      <Card style={{ gap: 10 }}>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>Controls</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Chip label="Dark Mode" active={themeName === "dark"} onPress={() => auth.switchTheme("dark")} />
          <Chip label="Light Mode" active={themeName === "light"} onPress={() => auth.switchTheme("light")} />
        </View>
        <Button label="Personal Account" tone="soft" onPress={() => router.replace("/(customer)/home")} />
        {mockMode ? (
          <Button
            label="Reset Demo Data"
            tone="ghost"
            onPress={() => {
              resetDemoState();
              setNotice("Demo state restored.");
            }}
          />
        ) : null}
        <Button
          label="Sign Out"
          tone="danger"
          onPress={async () => {
            await auth.signOut();
            router.replace("/");
          }}
        />
      </Card>
    </Screen>
  );
}
