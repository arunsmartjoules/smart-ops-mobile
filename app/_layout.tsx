import { GestureHandlerRootView } from "react-native-gesture-handler";
// Dev-only diagnostic: import BEFORE anything else so it patches console.error
// before any other module logs. See utils/navContextErrorTrap.ts.
import "@/utils/navContextErrorTrap";
import { Stack, useRouter, useSegments, usePathname, router } from "expo-router";
import "react-native-reanimated";
import "./global.css";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AttendanceGateProvider } from "@/contexts/AttendanceGateContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useEffect } from "react";
import { View, Image, AppState } from "react-native";
import { registerBackgroundSyncAsync } from "@/services/SyncEngine";
import { syncManager } from "@/services/SyncManager";
import { initDatabase } from "@/database";
import { KeyboardProvider } from "react-native-keyboard-controller";
import UpdateService from "@/services/UpdateService";
import UpdateBanner from "@/components/UpdateBanner";
import VersionGateService from "@/services/VersionGateService";
import { presenceService } from "@/services/PresenceService";
import UpdateRequiredScreen from "@/components/UpdateRequiredScreen";
import ServerStatusOverlay from "@/components/ServerStatusOverlay";
import * as SplashScreen from "expo-splash-screen";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as ImagePicker from "expo-image-picker";
import * as Crypto from "expo-crypto";
import {
  setupNotificationHandlers,
  setupAndroidChannels,
} from "@/services/NotificationService";
import { applyNotificationNavigation } from "@/utils/notificationDeepLink";
import { PendingNotificationNavigation } from "@/components/PendingNotificationNavigation";

// Fix: crypto.getRandomValues() not supported — required for uuid library in React Native
if (!global.crypto) {
  Object.defineProperty(global, "crypto", {
    value: {
      getRandomValues: (array: any) => Crypto.getRandomValues(array),
    },
  });
}

// Keep the native splash visible until React has mounted its first frame.
// The JS-level splash in AuthGuard is rendered to look identical to the
// native splash, so the handoff is invisible. Hiding too early (e.g. at
// module load) causes a visible flash of a blank/different screen.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Splash background — must match app.json -> expo-splash-screen.backgroundColor
// and the native splash colors in android/res/values/colors.xml +
// ios/.../SplashScreenBackground.colorset.
const SPLASH_BG = "#E11111";
const SPLASH_LOGO_WIDTH = 220;
const SPLASH_LOGO = require("@/assets/images/jouleops-splash.png");

function SplashView() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: SPLASH_BG,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Image
        source={SPLASH_LOGO}
        style={{ width: SPLASH_LOGO_WIDTH, height: SPLASH_LOGO_WIDTH }}
        resizeMode="contain"
      />
    </View>
  );
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { token, isLoading, isEmailVerified } = useAuth();
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

    // Screens that should ONLY be seen by fully unauthenticated users
    const isUnauthenticatedInternal =
      segments[0] === "sign-in" || segments[0] === "sign-up";

    if (!token && !isAuthRelated) {
      router.replace("/sign-in");
    } else if (token && !isEmailVerified && segments[0] !== "verify-email") {
      router.replace("/verify-email");
    } else if (token && isEmailVerified && isUnauthenticatedInternal) {
      router.replace("/(tabs)/dashboard");
    }
  }, [token, isLoading, isEmailVerified, segments, router]);

  useEffect(() => {
    if (isLoading) return;
  }, [token, isLoading]);

  // While auth is resolving, render a screen that visually matches the native
  // splash (same color, same logo, same size) so users don't perceive a second
  // splash when the native one hands off to React.
  if (isLoading) {
    return <SplashView />;
  }

  return <>{children}</>;
}

/**
 * Drives PresenceService from app context: starts when authenticated, stops
 * on sign-out, and forwards every route change so the admin dashboard can
 * show which screen the user is on.
 */
function PresenceTracker() {
  const { token } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (token) {
      presenceService.setAuthenticated(true);
      presenceService.start();
    } else {
      presenceService.setAuthenticated(false);
      presenceService.stop();
    }
  }, [token]);

  useEffect(() => {
    presenceService.setRoute(pathname || null);
  }, [pathname]);

  return null;
}

export default function RootLayout() {
  useEffect(() => {
    // First-frame is mounted — hand off from the native splash to the JS
    // SplashView, which is rendered to look identical. Done in a useEffect
    // (not at module load) so React paints at least one frame first.
    SplashScreen.hideAsync().catch(() => {});

    const init = async () => {
      try {
        // Initialize local SQLite database
        initDatabase();
        // Permission prompts are independent — fire in parallel so cold start
        // isn't waiting on three sequential native bridges.
        await Promise.all([
          Location.requestForegroundPermissionsAsync(),
          ImagePicker.requestCameraPermissionsAsync(),
          ImagePicker.requestMediaLibraryPermissionsAsync(),
        ]);
        syncManager.initialize();
        await setupAndroidChannels();
        await registerBackgroundSyncAsync();
        UpdateService.checkForUpdate();
        // Force-update gate: verify this build is still allowed by the backend.
        VersionGateService.check();
      } catch (e) {
        console.error("Init error:", e);
      }
    };
    init();

    // Re-check the version gate whenever the app returns to the foreground.
    const appStateSub = AppState.addEventListener("change", (next) => {
      if (next === "active") VersionGateService.check();
    });

    const handleNotificationResponse = (
      response: Notifications.NotificationResponse,
    ) => {
      applyNotificationNavigation(router, response, { replace: false });
    };

    // Warm / foreground taps only — cold start is handled in PendingNotificationNavigation
    const cleanupNotifications = setupNotificationHandlers((notification) => {
      console.log("Notification received:", notification);
    }, handleNotificationResponse);

    return () => {
      syncManager.cleanup();
      cleanupNotifications();
      appStateSub.remove();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <AuthProvider>
          <AttendanceGateProvider>
            <AuthGuard>
              <ThemeProvider>
                <UpdateBanner />
                <ServerStatusOverlay />
                <UpdateRequiredScreen />
                <PendingNotificationNavigation />
                <PresenceTracker />
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
          </AttendanceGateProvider>
        </AuthProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
