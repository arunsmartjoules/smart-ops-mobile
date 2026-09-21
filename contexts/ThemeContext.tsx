import React, {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { Platform } from "react-native";
import { useColorScheme as useNativeWindColorScheme } from "nativewind";
import logger from "@/utils/logger";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark",
  setTheme: () => {},
  isDark: true,
});

export const useTheme = () => useContext(ThemeContext);

/**
 * The app is dark-only: every screen uses the navy/red palette from the
 * "JouleOps Role Dashboard v2" design. The Light / System options were retired
 * with it, so the provider pins "dark" and ignores any saved preference.
 * `setTheme` stays on the context as a no-op for existing callers.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { setColorScheme } = useNativeWindColorScheme();

  // Pin NativeWind so every `dark:` class applies. Deferred a tick — a
  // synchronous call during mount trips "Can't perform a React state update
  // on a component that hasn't mounted yet" under React 19 / NativeWind 4.
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        setColorScheme("dark");
      } catch (e) {
        logger.warn("Failed to sync NativeWind color scheme", { error: e });
      }
    }, 0);
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.documentElement.classList.add("dark");
    }
    return () => clearTimeout(timer);
  }, [setColorScheme]);

  const setTheme = useCallback((_theme: Theme) => {}, []);

  const value = useMemo(
    () => ({ theme: "dark" as Theme, setTheme, isDark: true }),
    [setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
