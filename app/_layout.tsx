import "react-native-gesture-handler";
import { Stack, useRouter, useSegments, router } from "expo-router";
import "react-native-reanimated";
import "./global.css";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useEffect } from "react";
import { View, Text } from "react-native";
import { syncEngine, registerBackgroundSyncAsync } from "@/services/SyncEngine";
import { syncManager } from "@/services/SyncManager";
import { initDatabase } from "@/database";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import UpdateService from "@/services/UpdateService";
import UpdateBanner from "@/components/UpdateBanner";
import * as SplashScreen from "expo-splash-screen";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";
import { setupNotificationHandlers, setupAndroidChannels } from "@/services/NotificationService";
import logger from "@/utils/logger";

// Fix: crypto.getRandomValues() not supported — required for uuid library in React Native
if (!global.crypto) {
  Object.defineProperty(global, "crypto", {
    value: {
      getRandomValues: (array: any) => Crypto.getRandomValues(array),
    },
  });
}


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

    const isAuthRelated =
      segments[0] === "sign-in" ||
      segments[0] === "sign-up" ||
      segments[0] === "verify-email" ||
      segments[0] === "forgot-password" ||
      segments[0] === "reset-password";

    // Screens that should ONLY be seen by unauthenticated users
    const isUnauthenticatedInternal =
      segments[0] === "sign-in" ||
      segments[0] === "sign-up";

    if (!token && !isAuthRelated) {
      router.replace("/sign-in");
    } else if (token && isUnauthenticatedInternal) {
      router.replace("/(tabs)/dashboard");
    }
  }, [token, isLoading, segments]);

  useEffect(() => {
    if (isLoading) return;
  }, [token, isLoading]);


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
        // Request all permissions on startup
        await Location.requestForegroundPermissionsAsync();
        await Notifications.requestPermissionsAsync();
        await ImagePicker.requestCameraPermissionsAsync();
        await ImagePicker.requestMediaLibraryPermissionsAsync();
        syncManager.initialize();
        await setupAndroidChannels();
        await registerBackgroundSyncAsync();
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
        const data = response.notification.request.content.data as any;
        logger.info("Notification tapped", { data });

        if (data?.ticket_no) {
          // Navigate to tickets screen with ticketId param
          // Note: Using push/navigate with search params
          router.push({
            pathname: "/(tabs)/tickets",
            params: { 
              ticketId: data.ticket_no,
              siteCode: data.site_code
            }
          });
        } else if (data?.screen === "attendance" || String(data?.type || "").includes("attendance")) {
          router.push("/attendance");
        } else if (data?.screen) {
          router.push(data.screen as any);
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
