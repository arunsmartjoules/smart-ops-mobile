import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme as useNativeWindColorScheme } from "nativewind";
import { useColorScheme as useSystemColorScheme } from "react-native";
import { StatusBar } from "expo-status-bar";

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
  const { colorScheme, setColorScheme } = useNativeWindColorScheme();
  const systemColorScheme = useSystemColorScheme();
  const [theme, setThemeState] = useState<Theme>("system");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    loadTheme();
  }, []);

  useEffect(() => {
    if (!isReady) return;

    const applyTheme = (newTheme: Theme) => {
      if (newTheme === "system") {
        const systemTheme = systemColorScheme === "dark" ? "dark" : "light";
        setColorScheme(systemTheme);
      } else {
        setColorScheme(newTheme);
      }
    };

    applyTheme(theme);
  }, [theme, systemColorScheme, isReady]);

  const loadTheme = async () => {
    try {
      const savedTheme = await AsyncStorage.getItem("user-theme");
      if (
        savedTheme === "light" ||
        savedTheme === "dark" ||
        savedTheme === "system"
      ) {
        setThemeState(savedTheme);
      }
    } catch (error) {
      console.error("Failed to load theme preference", error);
    } finally {
      setIsReady(true);
    }
  };

  const setTheme = async (newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      await AsyncStorage.setItem("user-theme", newTheme);
    } catch (error) {
      console.error("Failed to save theme preference", error);
    }
  };

  const isDark =
    theme === "dark" || (theme === "system" && systemColorScheme === "dark");

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark }}>
      <StatusBar style={isDark ? "light" : "dark"} />
      {children}
    </ThemeContext.Provider>
  );
}
