import { Stack } from "expo-router";
import "react-native-reanimated";
import "./global.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useEffect } from "react";
import { syncManager } from "@/services/SyncManager";

export default function RootLayout() {
  useEffect(() => {
    syncManager.initialize();
    return () => {
      syncManager.cleanup();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ThemeProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="sign-in" />
            <Stack.Screen name="sign-up" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="forgot-password" />
            <Stack.Screen name="all-tasks" />
            <Stack.Screen name="attendance" />
            <Stack.Screen name="privacy-security" />
            <Stack.Screen name="app-settings" />
            <Stack.Screen name="notification-settings" />
            <Stack.Screen name="notifications" />
          </Stack>
        </ThemeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
