import "react-native-gesture-handler";
import { Stack, useRouter, useSegments } from "expo-router";
import "react-native-reanimated";
import "./global.css";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useEffect } from "react";
import { syncManager } from "@/services/SyncManager";
import { GestureHandlerRootView } from "react-native-gesture-handler";

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup =
      segments[0] === "sign-in" ||
      segments[0] === "sign-up" ||
      segments[0] === "forgot-password";

    if (!user && !inAuthGroup) {
      // If NOT logged in and NOT in auth group, redirect to sign-in
      router.replace("/sign-in");
    } else if (user && inAuthGroup) {
      // If logged in and in auth group, redirect to dashboard
      router.replace("/(tabs)/dashboard");
    }
  }, [user, isLoading, segments]);

  return <>{children}</>;
}

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
          <AuthGuard>
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
          </AuthGuard>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
