import {
  reviewApplication,
  reviewApplicationRemote,
  setBusinessStatus,
  setBusinessStatusRemote,
  useBookItState,
  usingMocks,
} from "@bookit/api-client";
import { categoryLabels } from "@bookit/ui";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, Chip, EmptyState, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";

export default function AdminBusinessesScreen() {
  const state = useBookItState();
  const { colors } = useThemePalette();
  const [tab, setTab] = useState<"queue" | "directory">("queue");
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");

  const apps = state.applications;

  return (
    <Screen>
      <BrandHeader mode="admin" />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Chip label={`Applications (${apps.length})`} active={tab === "queue"} onPress={() => setTab("queue")} />
        <Chip label={`Businesses (${state.businesses.length})`} active={tab === "directory"} onPress={() => setTab("directory")} />
      </View>

      {notice ? <Text style={{ color: colors.lavender, fontSize: 12 }}>{notice}</Text> : null}

      {tab === "queue" ? (
        apps.length === 0 ? (
          <EmptyState title="Queue empty" body="No business verification applications pending." />
        ) : (
          apps.map((app) => {
            const biz = state.businesses.find((b) => b.id === app.businessId);
            const isBusy = busyId === app.id;
            const handleReview = async (action: "approve" | "request_info" | "reject", note: string) => {
              setNotice("");
              if (usingMocks()) {
                const res = reviewApplication(app.id, action, note);
                setNotice(res.ok ? `Application updated (${action}).` : res.error);
                return;
              }
              setBusyId(app.id);
              try {
                const res = await reviewApplicationRemote(app.id, action, note);
                setNotice(res.ok ? `Application updated (${action}).` : res.error);
              } finally {
                setBusyId("");
              }
            };
            return (
              <Card key={app.id} style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{biz?.name ?? app.businessId}</Text>
                  <Badge
                    label={app.status}
                    tone={app.status === "approved" ? "success" : app.status === "rejected" ? "danger" : "warning"}
                  />
                </View>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {biz ? `${categoryLabels[biz.category]} · ${biz.city}` : ""}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  <Button
                    label="Approve"
                    tone="soft"
                    small
                    disabled={isBusy}
                    onPress={() => handleReview("approve", "Verified on mobile admin.")}
                  />
                  <Button
                    label="Request Info"
                    tone="ghost"
                    small
                    disabled={isBusy}
                    onPress={() => handleReview("request_info", "Upload clearer license.")}
                  />
                  <Button
                    label="Reject"
                    tone="danger"
                    small
                    disabled={isBusy}
                    onPress={() => handleReview("reject", "Incomplete documents.")}
                  />
                </View>
              </Card>
            );
          })
        )
      ) : (
        state.businesses.map((biz) => {
          const isBusy = busyId === biz.id;
          const nextStatus = biz.status === "approved" ? "suspended" : "approved";
          return (
            <Card key={biz.id} style={{ gap: 8 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ color: colors.text, fontWeight: "700", fontSize: 16 }}>{biz.name}</Text>
                <Badge label={biz.status} tone={biz.status === "approved" ? "success" : "warning"} />
              </View>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {categoryLabels[biz.category]} · {biz.city} · Public: {biz.isPublic ? "Yes" : "No"}
              </Text>
              <Button
                label={isBusy ? "Updating…" : biz.status === "approved" ? "Suspend Business" : "Approve Business"}
                tone={biz.status === "approved" ? "danger" : "soft"}
                small
                disabled={isBusy}
                onPress={async () => {
                  setNotice("");
                  if (usingMocks()) {
                    const res = setBusinessStatus(biz.id, nextStatus);
                    setNotice(res.ok ? `Business set to ${nextStatus}.` : res.error);
                    return;
                  }
                  setBusyId(biz.id);
                  try {
                    const res = await setBusinessStatusRemote(biz.id, nextStatus);
                    setNotice(res.ok ? `Business set to ${nextStatus}.` : res.error);
                  } finally {
                    setBusyId("");
                  }
                }}
              />
            </Card>
          );
        })
      )}
    </Screen>
  );
}
