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
import "@/services/SyncManager"; // Ensure background task is defined early
import UpdateService from "@/services/UpdateService";
import { supabase } from "@/services/supabase";
import * as SplashScreen from "expo-splash-screen";

// Keep the splash screen visible until we explicitly hide it
SplashScreen.preventAutoHideAsync();

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { token, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    // Auth state resolved — hide the splash screen
    SplashScreen.hideAsync();

    const inAuthGroup =
      segments[0] === "sign-in" ||
      segments[0] === "sign-up" ||
      segments[0] === "verify-email" ||
      segments[0] === "forgot-password" ||
      segments[0] === "reset-password";

    if (!token && !inAuthGroup) {
      router.replace("/sign-in");
    } else if (token && inAuthGroup) {
      router.replace("/(tabs)/dashboard");
    }
  }, [token, isLoading, segments]);

  // Handle PASSWORD_RECOVERY deep link — navigate to reset-password screen
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "PASSWORD_RECOVERY") {
          router.push("/reset-password");
        }
      },
    );
    return () => subscription.unsubscribe();
  }, [router]);

  return <>{children}</>;
}

export default function RootLayout() {
  useEffect(() => {
    const init = async () => {
      try {
        syncManager.initialize();
        UpdateService.checkForUpdate(); // Check for updates on app start
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
                <Stack.Screen name="verify-email" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="forgot-password" />
                <Stack.Screen name="reset-password" />
                <Stack.Screen name="all-tasks" />
                <Stack.Screen name="attendance" />
                <Stack.Screen name="privacy-security" />
                <Stack.Screen name="app-settings" />
                <Stack.Screen name="notification-settings" />
                <Stack.Screen name="notifications" />
                <Stack.Screen name="sitelog-detail" />
                <Stack.Screen name="chemical-entry" />
                <Stack.Screen name="temp-rh-entry" />
                <Stack.Screen name="water-entry" />
                <Stack.Screen name="chemical" />
                <Stack.Screen name="temp-rh" />
                <Stack.Screen name="water" />
                <Stack.Screen name="chiller" />
                <Stack.Screen name="history/site-history" />
                <Stack.Screen name="pm-execution" />
              </Stack>
            </ThemeProvider>
          </AuthGuard>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
