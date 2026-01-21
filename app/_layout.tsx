import "react-native-gesture-handler";
import { Stack } from "expo-router";
import "react-native-reanimated";
import "./global.css";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useEffect } from "react";
import { syncManager } from "@/services/SyncManager";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function RootLayout() {
  useEffect(() => {
    const init = async () => {
      try {
        syncManager.initialize();
      } catch (e) {
        console.error("SyncManager init error:", e);
      }
    };
    init();

    return () => {
      syncManager.cleanup();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
              <Stack.Screen name="new-sitelog" />
              <Stack.Screen name="sitelog-detail" />
            </Stack>
          </ThemeProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
