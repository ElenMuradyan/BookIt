import { useBookItState } from "@bookit/api-client";
import { darkTheme, lightTheme } from "@bookit/design-system";
import { useAuth } from "@/services/session";

export type ThemePalette = typeof darkTheme | typeof lightTheme;

export function useThemePalette(): {
  themeName: "dark" | "light";
  colors: ThemePalette;
  isDark: boolean;
} {
  const { userId, localTheme } = useAuth();
  const state = useBookItState();
  const profile = userId ? state.customerProfiles.find((p) => p.userId === userId) : undefined;
  const resolved: "dark" | "light" =
    profile?.theme === "light" || profile?.theme === "dark" ? profile.theme : localTheme;

  return {
    themeName: resolved,
    colors: resolved === "light" ? lightTheme : darkTheme,
    isDark: resolved === "dark",
  };
}
