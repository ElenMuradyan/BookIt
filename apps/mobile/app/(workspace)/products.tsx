import { saveProduct, setProductActive, useBookItState } from "@bookit/api-client";
import { formatMoney } from "@bookit/utils";
import React, { useState } from "react";
import { Image, Modal, Switch, Text, View } from "react-native";
import { BrandHeader, Button, Card, InputField, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function WorkspaceProductsScreen() {
  const auth = useAuth();
  const state = useBookItState();
  const { colors } = useThemePalette();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", categoryId: state.productCategories[0]?.id ?? "cat_beauty", price: "28", stock: "12" });
  const [error, setError] = useState("");

  if (!auth.workspace) return null;
  const bizId = auth.workspace.businessId;
  const products = state.products.filter((p) => p.businessId === bizId);

  return (
    <Screen>
      <BrandHeader mode="workspace" showBack right={<Button label="+ Product" small onPress={() => setShowAdd(true)} />} />

      {products.map((p) => (
        <Card key={p.id} style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
          <Image source={{ uri: p.imageUrl }} style={{ width: 64, height: 64, borderRadius: 12 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>{p.name}</Text>
            <Text style={{ color: colors.muted, fontSize: 12, fontVariant: ["tabular-nums"] }}>
              {formatMoney(p.price)} · Stock: {p.stock}
            </Text>
          </View>
          <Switch value={p.active} onValueChange={(v) => { setProductActive(bizId, p.id, v); }} />
        </Card>
      ))}

      <Modal visible={showAdd} transparent animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(8,8,14,0.75)", justifyContent: "center", padding: 20 }}>
          <Card style={{ gap: 10 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }}>Add Product</Text>
            <InputField label="Product name" value={form.name} onChangeText={(name) => setForm({ ...form, name })} />
            <InputField label="Description" value={form.description} onChangeText={(description) => setForm({ ...form, description })} multiline />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <InputField label="Price ($)" value={form.price} onChangeText={(price) => setForm({ ...form, price })} keyboardType="numeric" />
              </View>
              <View style={{ flex: 1 }}>
                <InputField label="Stock" value={form.stock} onChangeText={(stock) => setForm({ ...form, stock })} keyboardType="numeric" />
              </View>
            </View>
            {error ? <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text> : null}
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="Cancel" tone="ghost" style={{ flex: 1 }} onPress={() => setShowAdd(false)} />
              <Button
                label="Save"
                style={{ flex: 1 }}
                onPress={() => {
                  const res = saveProduct(bizId, form);
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
