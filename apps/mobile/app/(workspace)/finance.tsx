import { addExpense, useBookItState } from "@bookit/api-client";
import { can, DEMO_TODAY, formatMoney } from "@bookit/utils";
import React, { useState } from "react";
import { Modal, Text, View } from "react-native";
import { Badge, BrandHeader, Button, Card, InputField, MiniBarChart, Screen, StatCard } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function WorkspaceFinanceScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const { colors } = useThemePalette();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ category: "Supplies", amount: "120", note: "Salon inventory", incurredOn: DEMO_TODAY });
  const [error, setError] = useState("");

  if (!auth.workspace) return null;
  const bizId = auth.workspace.businessId;
  const canEdit = can(auth.workspace.role, "finance.manage");

  const payments = state.payments.filter((p) => p.businessId === bizId && p.status === "recorded");
  const expenses = state.expenses.filter((e) => e.businessId === bizId);
  const revenue = payments.reduce((s, p) => s + p.amount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <Screen>
      <BrandHeader
        mode="workspace"
        showBack
        right={canEdit ? <Button label="+ Expense" small onPress={() => setShowAdd(true)} /> : undefined}
      />

      <View style={{ flexDirection: "row", gap: 10 }}>
        <StatCard label="Recorded Revenue" value={formatMoney(revenue)} hint={`${payments.length} ledger rows`} icon="trending-up" />
        <StatCard label="Expenses" value={formatMoney(totalExpenses)} hint={`${expenses.length} entries`} icon="receipt-outline" />
      </View>

      <Card style={{ gap: 6 }}>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>Weekly Revenue Trend</Text>
        <MiniBarChart points={state.revenueSeries.slice(0, 6)} />
      </Card>

      <Card style={{ gap: 10 }}>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>Expenses</Text>
        {expenses.map((exp) => (
          <View key={exp.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 }}>
            <View>
              <Text style={{ color: colors.text, fontWeight: "600" }}>{exp.category}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{exp.note} · {exp.incurredOn}</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 2 }}>
              <Text style={{ color: colors.text, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{formatMoney(exp.amount)}</Text>
              <Badge label={exp.source} tone={exp.source === "recorded" ? "success" : "warning"} />
            </View>
          </View>
        ))}
      </Card>

      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(8,8,14,0.75)", justifyContent: "center", padding: 20 }}>
          <Card style={{ gap: 10 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>Record Expense</Text>
            <InputField label="Category" value={form.category} onChangeText={(category) => setForm({ ...form, category })} />
            <InputField label="Amount ($)" value={form.amount} onChangeText={(amount) => setForm({ ...form, amount })} keyboardType="numeric" />
            <InputField label="Note" value={form.note} onChangeText={(note) => setForm({ ...form, note })} />
            {error ? <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text> : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="Cancel" tone="ghost" style={{ flex: 1 }} onPress={() => setShowAdd(false)} />
              <Button
                label="Save"
                style={{ flex: 1 }}
                onPress={() => {
                  const res = addExpense(bizId, form);
                  if (!res.ok) {
                    setError(res.error);
                    return;
                  }
                  setShowAdd(false);
                }}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}
