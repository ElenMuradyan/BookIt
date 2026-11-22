import { Ionicons } from "@expo/vector-icons";
import { brand, radius, type Tone } from "@bookit/design-system";
import { roleLabels } from "@bookit/ui";
import { initials } from "@bookit/utils";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemePalette } from "@/hooks/useThemePalette";
import { useAuth } from "@/services/session";

export function BrandLogo({ size = 28 }: { size?: number }) {
  return (
    <LinearGradient
      colors={["#8B5CF6", "#7C3AED"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons name="calendar-outline" size={Math.round(size * 0.56)} color="#FFFFFF" />
    </LinearGradient>
  );
}

export function Screen({
  children,
  scroll = true,
  padded = true,
  edges = ["top"],
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: ("top" | "bottom" | "left" | "right")[];
}) {
  const { colors } = useThemePalette();
  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: colors.bg }]}>
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[padded ? styles.scrollPad : undefined, { paddingBottom: 32 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, padded ? styles.scrollPad : undefined]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  onPress?: () => void;
}) {
  const { colors } = useThemePalette();
  const base: ViewStyle = {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: 16,
  };
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [base, pressed && { opacity: 0.88 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}

export function GradientCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return (
    <LinearGradient
      colors={["#6D28D9", "#7C3AED", "#8B5CF6"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        {
          borderRadius: radius.lg,
          padding: 18,
          borderWidth: 1,
          borderColor: "rgba(167,139,250,0.45)",
        },
        style,
      ]}
    >
      {children}
    </LinearGradient>
  );
}

export function Badge({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const { colors, isDark } = useThemePalette();
  const palette: Record<Tone, { bg: string; fg: string; border: string }> = {
    neutral: {
      bg: isDark ? "rgba(255,255,255,0.06)" : "#F2EFF9",
      fg: colors.muted,
      border: colors.line,
    },
    brand: {
      bg: "rgba(124,58,237,0.16)",
      fg: isDark ? brand.lavender : brand.primaryDark,
      border: "rgba(124,58,237,0.35)",
    },
    success: {
      bg: "rgba(52,211,153,0.14)",
      fg: colors.success,
      border: "rgba(52,211,153,0.34)",
    },
    warning: {
      bg: "rgba(251,191,36,0.14)",
      fg: colors.warning,
      border: "rgba(251,191,36,0.34)",
    },
    danger: {
      bg: "rgba(251,113,133,0.14)",
      fg: colors.danger,
      border: "rgba(251,113,133,0.34)",
    },
    info: {
      bg: "rgba(96,165,250,0.14)",
      fg: colors.info,
      border: "rgba(96,165,250,0.34)",
    },
  };
  const p = palette[tone];
  return (
    <View style={[styles.badge, { backgroundColor: p.bg, borderColor: p.border }]}>
      <Text style={[styles.badgeText, { color: p.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function Button({
  label,
  onPress,
  tone = "primary",
  small = false,
  disabled = false,
  icon,
  style,
}: {
  label: string;
  onPress?: () => void;
  tone?: "primary" | "soft" | "ghost" | "danger";
  small?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: ViewStyle;
}) {
  const { colors, isDark } = useThemePalette();
  const bg =
    tone === "primary"
      ? brand.primary
      : tone === "soft"
        ? "rgba(124,58,237,0.16)"
        : tone === "danger"
          ? "rgba(251,113,133,0.16)"
          : "transparent";
  const border =
    tone === "ghost"
      ? colors.line
      : tone === "soft"
        ? "rgba(124,58,237,0.35)"
        : tone === "danger"
          ? "rgba(251,113,133,0.35)"
          : "transparent";
  const fg =
    tone === "primary"
      ? "#FFFFFF"
      : tone === "soft"
        ? isDark
          ? brand.lavender
          : brand.primaryDark
        : tone === "danger"
          ? colors.danger
          : colors.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        small ? styles.btnSmall : styles.btnRegular,
        { backgroundColor: bg, borderColor: border, borderWidth: tone === "primary" ? 0 : 1 },
        disabled && { opacity: 0.45 },
        pressed && !disabled && { opacity: 0.84 },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={small ? 15 : 17} color={fg} /> : null}
      <Text style={[styles.btnText, small && { fontSize: 13 }, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  const { colors, isDark } = useThemePalette();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? brand.primary : colors.card,
          borderColor: active ? brand.primary : colors.line,
        },
      ]}
    >
      <Text
        style={{
          color: active ? "#FFFFFF" : isDark ? colors.text : colors.muted,
          fontSize: 13,
          fontWeight: "600",
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function InputField({
  label,
  error,
  secureTextEntry,
  style,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  const { colors } = useThemePalette();
  const [revealed, setRevealed] = useState(false);
  const isPasswordField = Boolean(secureTextEntry) && !props.multiline;

  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>{label}</Text>
      {isPasswordField ? (
        <View
          style={[
            styles.passwordWrap,
            {
              backgroundColor: colors.bgElevated,
              borderColor: error ? colors.danger : colors.line,
            },
          ]}
        >
          <TextInput
            placeholderTextColor={colors.muted}
            {...props}
            secureTextEntry={!revealed}
            style={[
              styles.passwordInput,
              { color: colors.text },
              style,
            ]}
          />
          <Pressable
            onPress={() => setRevealed((prev) => !prev)}
            accessibilityRole="button"
            accessibilityLabel={revealed ? `Hide ${label}` : `Show ${label}`}
            hitSlop={6}
            style={styles.passwordToggleBtn}
          >
            <Ionicons
              name={revealed ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={colors.muted}
            />
          </Pressable>
        </View>
      ) : (
        <TextInput
          placeholderTextColor={colors.muted}
          {...props}
          secureTextEntry={secureTextEntry}
          style={[
            styles.input,
            {
              backgroundColor: colors.bgElevated,
              borderColor: error ? colors.danger : colors.line,
              color: colors.text,
              minHeight: props.multiline ? 88 : 44,
              textAlignVertical: props.multiline ? "top" : "center",
            },
            style,
          ]}
        />
      )}
      {error ? <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text> : null}
    </View>
  );
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = "Search…",
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}) {
  const { colors } = useThemePalette();
  return (
    <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <Ionicons name="search-outline" size={18} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={{ flex: 1, color: colors.text, fontSize: 14, paddingVertical: 8 }}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText("")} hitSlop={8}>
          <Ionicons name="close-circle" size={18} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Avatar({
  name,
  uri,
  size = 40,
}: {
  name: string;
  uri?: string;
  size?: number;
}) {
  const { isDark } = useThemePalette();
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#242438" }}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: "rgba(124,58,237,0.22)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: isDark ? brand.lavender : brand.primaryDark, fontWeight: "700", fontSize: size * 0.36 }}>
        {initials(name)}
      </Text>
    </View>
  );
}

export function BrandHeader({
  title,
  mode = "customer",
  right,
  showBack = false,
}: {
  title?: string;
  mode?: "customer" | "workspace" | "admin";
  right?: React.ReactNode;
  showBack?: boolean;
}) {
  const { colors } = useThemePalette();
  const auth = useAuth();
  const router = useRouter();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const label =
    mode === "admin"
      ? "BookIt Admin"
      : mode === "workspace"
        ? auth.workspace?.businessName ?? "Workspace"
        : title ?? "BookIt";

  const canSwitch = auth.workspaces.length > 0 || Boolean(auth.user?.isPlatformAdmin);

  return (
    <View style={styles.headerRow}>
      <View style={styles.headerLeft}>
        {showBack ? (
          <Pressable
            onPress={() => router.back()}
            style={[styles.iconBtn, { borderColor: colors.line, backgroundColor: colors.card }]}
          >
            <Ionicons name="arrow-back" size={18} color={colors.text} />
          </Pressable>
        ) : (
          <BrandLogo size={30} />
        )}
        <View style={{ flexShrink: 1 }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: "800" }} numberOfLines={1}>
            {label}
          </Text>
          {mode === "workspace" && auth.workspace ? (
            <Text style={{ color: colors.muted, fontSize: 11 }}>{roleLabels[auth.workspace.role]}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.headerRight}>
        {right}
        {canSwitch ? (
          <Pressable
            onPress={() => setSwitcherOpen(true)}
            style={[styles.switchPill, { backgroundColor: colors.card, borderColor: colors.line }]}
          >
            <Ionicons name="swap-horizontal" size={14} color={brand.lavender} />
            <Text style={{ color: colors.text, fontSize: 12, fontWeight: "600" }}>Switch</Text>
          </Pressable>
        ) : null}
      </View>

      <Modal visible={switcherOpen} transparent animationType="fade" onRequestClose={() => setSwitcherOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setSwitcherOpen(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[styles.modalCard, { backgroundColor: colors.bgElevated, borderColor: colors.line }]}
          >
            <View style={styles.rowBetween}>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>Switch Mode / Workspace</Text>
              <Pressable onPress={() => setSwitcherOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={20} color={colors.muted} />
              </Pressable>
            </View>

            <Pressable
              onPress={() => {
                setSwitcherOpen(false);
                router.replace("/(customer)/home");
              }}
              style={[styles.switchItem, { borderColor: colors.line, backgroundColor: colors.card }]}
            >
              <Ionicons name="person-outline" size={18} color={brand.lavender} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "700" }}>Personal Account</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>Customer bookings, orders & spending</Text>
              </View>
            </Pressable>

            {auth.workspaces.map((ws) => (
              <Pressable
                key={ws.businessId}
                onPress={async () => {
                  await auth.setWorkspaceId(ws.businessId);
                  setSwitcherOpen(false);
                  router.replace("/(workspace)");
                }}
                style={[
                  styles.switchItem,
                  {
                    borderColor: mode === "workspace" && auth.workspaceId === ws.businessId ? brand.primary : colors.line,
                    backgroundColor: colors.card,
                  },
                ]}
              >
                <Ionicons name="storefront-outline" size={18} color={brand.lavender} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "700" }}>{ws.businessName}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    {roleLabels[ws.role]} · {ws.city}
                  </Text>
                </View>
              </Pressable>
            ))}

            {auth.user?.isPlatformAdmin ? (
              <Pressable
                onPress={() => {
                  setSwitcherOpen(false);
                  router.replace("/(admin)");
                }}
                style={[styles.switchItem, { borderColor: colors.line, backgroundColor: colors.card }]}
              >
                <Ionicons name="shield-checkmark-outline" size={18} color={brand.lavender} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "700" }}>Platform Admin</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>Applications, moderation & analytics</Text>
                </View>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors, isDark } = useThemePalette();
  return (
    <View style={styles.rowBetween}>
      <Text style={{ color: colors.text, fontSize: 17, fontWeight: "700" }}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={{ color: isDark ? brand.lavender : brand.primary, fontSize: 13, fontWeight: "600" }}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const { colors } = useThemePalette();
  return (
    <Card style={{ flex: 1, minWidth: 140, gap: 6 }}>
      <View style={styles.rowBetween}>
        <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>{label}</Text>
        {icon ? <Ionicons name={icon} size={16} color={brand.lavender} /> : null}
      </View>
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
      {hint ? <Text style={{ color: colors.muted, fontSize: 11 }}>{hint}</Text> : null}
    </Card>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  const { colors } = useThemePalette();
  return (
    <Card style={{ alignItems: "center", paddingVertical: 28, gap: 6 }}>
      <Ionicons name="sparkles-outline" size={24} color={brand.lavender} />
      <Text style={{ color: colors.text, fontSize: 16, fontWeight: "700" }}>{title}</Text>
      <Text style={{ color: colors.muted, fontSize: 13, textAlign: "center" }}>{body}</Text>
    </Card>
  );
}

export function MiniBarChart({ points }: { points: { label: string; value: number }[] }) {
  const { colors } = useThemePalette();
  const max = Math.max(1, ...points.map((p) => p.value));
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, height: 110, paddingTop: 12 }}>
      {points.map((pt) => {
        const pct = Math.max(12, Math.round((pt.value / max) * 76));
        return (
          <View key={pt.label} style={{ flex: 1, alignItems: "center", gap: 4 }}>
            <View
              style={{
                width: "100%",
                height: pct,
                borderRadius: 6,
                backgroundColor: brand.primary,
              }}
            />
            <Text style={{ color: colors.muted, fontSize: 10 }} numberOfLines={1}>
              {pt.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollPad: { paddingHorizontal: 16, paddingTop: 12, gap: 14 },
  badge: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: 11, fontWeight: "700" },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
  },
  btnRegular: { minHeight: 46, paddingHorizontal: 16 },
  btnSmall: { minHeight: 38, paddingHorizontal: 12 },
  btnText: { fontSize: 14, fontWeight: "700" },
  chip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  passwordWrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 46,
    paddingLeft: 12,
    paddingRight: 4,
  },
  passwordInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 10,
  },
  passwordToggleBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    minHeight: 46,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 4,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  switchPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    minHeight: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(8,8,14,0.72)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  switchItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
});
