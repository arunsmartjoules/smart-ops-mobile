import "react-native-gesture-handler";
import { Stack, useRouter, useSegments } from "expo-router";
import "react-native-reanimated";
import "./global.css";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useEffect } from "react";
import { View, Text } from "react-native";
import { syncManager } from "@/services/SyncManager";
import { initDatabase } from "@/database";
import UpdateService from "@/services/UpdateService";
import UpdateBanner from "@/components/UpdateBanner";
import { supabase } from "@/services/supabase";
import * as SplashScreen from "expo-splash-screen";
import * as Location from "expo-location";
import { setupNotificationHandlers } from "@/services/NotificationService";

// Keep the native splash visible until JS is ready
SplashScreen.preventAutoHideAsync().catch(() => {});

// Hide native splash immediately — JS splash takes over
SplashScreen.hideAsync().catch(() => {});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { token, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

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

  useEffect(() => {
    if (isLoading) return;
  }, [token, isLoading]);

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

  // Show full-screen JS splash while auth is resolving
  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#b91c1c", alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "white", fontSize: 36, fontWeight: "800", letterSpacing: 1 }}>
          JouleOps
        </Text>
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  useEffect(() => {
    const init = async () => {
      try {
        // Initialize local SQLite database
        initDatabase();
        // Request location permission on startup so it's ready for punch-in
        await Location.requestForegroundPermissionsAsync();
        syncManager.initialize();
        UpdateService.checkForUpdate();
      } catch (e) {
        console.error("Init error:", e);
      }
    };
    init();

    // Setup notification handlers
    const cleanupNotifications = setupNotificationHandlers(
      (notification) => {
        console.log("Notification received:", notification);
      },
      (response) => {
        console.log("Notification tapped:", response);
        // Handle navigation based on notification data
        const data = response.notification.request.content.data;
        if (data?.screen) {
          // You can add navigation logic here based on data.screen
          console.log("Navigate to:", data.screen);
        }
      }
    );

    return () => {
      syncManager.cleanup();
      cleanupNotifications();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <AuthGuard>
            <ThemeProvider>
              <UpdateBanner />
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
