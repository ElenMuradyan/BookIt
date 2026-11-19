import { Ionicons } from "@expo/vector-icons";
import { brand } from "@bookit/design-system";
import { can } from "@bookit/utils";
import { useRouter } from "expo-router";
import React from "react";
import { Text, View } from "react-native";
import { BrandHeader, Button, Card, Screen } from "@/components/Ui";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export default function WorkspaceMoreScreen() {
  const auth = useAuth();
  const router = useRouter();
  const { colors } = useThemePalette();

  if (!auth.workspace) return null;
  const role = auth.workspace.role;

  const items = [
    { label: "Bookings", route: "/(workspace)/bookings" as const, icon: "clipboard-outline" as const, ok: can(role, "bookings.view") },
    { label: "Customers", route: "/(workspace)/customers" as const, icon: "person-outline" as const, ok: can(role, "customers.view") },
    { label: "Products", route: "/(workspace)/products" as const, icon: "bag-outline" as const, ok: can(role, "products.manage") },
    { label: "Orders", route: "/(workspace)/orders" as const, icon: "cube-outline" as const, ok: can(role, "orders.manage") },
    { label: "Finance", route: "/(workspace)/finance" as const, icon: "bar-chart-outline" as const, ok: can(role, "finance.view") },
    { label: "Marketing", route: "/(workspace)/marketing" as const, icon: "megaphone-outline" as const, ok: can(role, "marketing.manage") },
    { label: "Settings & Plan", route: "/(workspace)/settings" as const, icon: "settings-outline" as const, ok: can(role, "settings.profile") },
  ].filter((i) => i.ok);

  return (
    <Screen>
      <BrandHeader mode="workspace" />

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {items.map((item) => (
          <Card
            key={item.route}
            onPress={() => router.push(item.route)}
            style={{ width: "48%", gap: 8 }}
          >
            <Ionicons name={item.icon} size={22} color={brand.lavender} />
            <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>{item.label}</Text>
          </Card>
        ))}
      </View>

      <Card style={{ gap: 10 }}>
        <Text style={{ color: colors.text, fontWeight: "700", fontSize: 15 }}>Switch Account Mode</Text>
        <Button label="Personal Account" tone="soft" onPress={() => router.replace("/(customer)/home")} />
        {auth.user?.isPlatformAdmin ? (
          <Button label="Platform Admin" tone="ghost" onPress={() => router.replace("/(admin)")} />
        ) : null}
      </Card>
    </Screen>
  );
}
