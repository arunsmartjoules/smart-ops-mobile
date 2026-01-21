import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme as useSystemColorScheme, Platform } from "react-native";
import { StatusBar } from "expo-status-bar";
import logger from "@/utils/logger";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "system",
  setTheme: () => {},
  isDark: false,
});

export const useTheme = () => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useSystemColorScheme();
  const [theme, setThemeState] = useState<Theme>("system");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    loadTheme();
  }, []);

  // Apply theme to document for web
  useEffect(() => {
    if (!isReady) return;

    const effectiveTheme =
      theme === "system"
        ? systemColorScheme === "dark"
          ? "dark"
          : "light"
        : theme;

    // For web, apply dark class to document
    if (Platform.OS === "web" && typeof document !== "undefined") {
      if (effectiveTheme === "dark") {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  }, [theme, systemColorScheme, isReady]);

  const loadTheme = useCallback(async () => {
    try {
      const savedTheme = await AsyncStorage.getItem("user-theme");
      if (
        savedTheme === "light" ||
        savedTheme === "dark" ||
        savedTheme === "system"
      ) {
        setThemeState(savedTheme);
      }
    } catch (error: any) {
      logger.error("Failed to load theme preference", {
        module: "THEME_CONTEXT",
        error: error.message,
      });
    } finally {
      setIsReady(true);
    }
  }, []);

  const setTheme = useCallback(async (newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      await AsyncStorage.setItem("user-theme", newTheme);
    } catch (error: any) {
      logger.error("Failed to save theme preference", {
        module: "THEME_CONTEXT",
        error: error.message,
        theme: newTheme,
      });
    }
  }, []);

  const isDark =
    theme === "dark" || (theme === "system" && systemColorScheme === "dark");

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      isDark,
    }),
    [theme, setTheme, isDark]
  );

  return (
    <ThemeContext.Provider value={value}>
      <StatusBar style={isDark ? "light" : "dark"} />
      {children}
    </ThemeContext.Provider>
  );
}
