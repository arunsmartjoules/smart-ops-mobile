import { GestureHandlerRootView } from "react-native-gesture-handler";
// Dev-only diagnostic: import BEFORE anything else so it patches console.error
// before any other module logs. See utils/navContextErrorTrap.ts.
import "@/utils/navContextErrorTrap";
// Dev-only LogBox filters for diagnosed third-party noise. Must be imported
// before the modules that emit those logs (e.g. expo-notifications below).
import "@/utils/devLogFilters";
import {
  Stack,
  useRouter,
  useSegments,
  usePathname,
  useRootNavigationState,
  router,
} from "expo-router";
import "react-native-reanimated";
import { enableFreeze } from "react-native-screens";
import "./global.css";

// Freeze blurred screens: a tab that isn't focused stops re-rendering, so its
// timers/websocket setState/context updates no longer steal JS-thread time from
// the tab the user is actually looking at. Must run before any navigator mounts.
enableFreeze(true);
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AttendanceGateProvider } from "@/contexts/AttendanceGateContext";
import { PermissionsProvider, usePermissions } from "@/contexts/PermissionsContext";
import { permForPath } from "@/components/jo/modules";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { registerBackgroundSyncAsync } from "@/services/SyncEngine";
import { syncManager } from "@/services/SyncManager";
import { initDatabase } from "@/database";
import { KeyboardProvider } from "react-native-keyboard-controller";
import UpdateService from "@/services/UpdateService";
import StoreUpdateService from "@/services/StoreUpdateService";
import VersionGateService from "@/services/VersionGateService";
import { presenceService } from "@/services/PresenceService";
import UpdateRequiredScreen from "@/components/UpdateRequiredScreen";
import NotificationGate from "@/components/NotificationGate";
import ServerStatusOverlay from "@/components/ServerStatusOverlay";
import SplashOverlay from "@/components/SplashOverlay";
import { useLaunchHeld } from "@/services/LaunchHold";
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
import { useFonts } from "expo-font";
import { BricolageGrotesque_600SemiBold } from "@expo-google-fonts/bricolage-grotesque/600SemiBold";
import { BricolageGrotesque_700Bold } from "@expo-google-fonts/bricolage-grotesque/700Bold";
import { BricolageGrotesque_800ExtraBold } from "@expo-google-fonts/bricolage-grotesque/800ExtraBold";
import { Geist_400Regular } from "@expo-google-fonts/geist/400Regular";
import { Geist_500Medium } from "@expo-google-fonts/geist/500Medium";
import { Geist_600SemiBold } from "@expo-google-fonts/geist/600SemiBold";
import { Geist_700Bold } from "@expo-google-fonts/geist/700Bold";
import { GeistMono_400Regular } from "@expo-google-fonts/geist-mono/400Regular";
import { GeistMono_500Medium } from "@expo-google-fonts/geist-mono/500Medium";
import { GeistMono_600SemiBold } from "@expo-google-fonts/geist-mono/600SemiBold";

// Fix: crypto.getRandomValues() not supported — required for uuid library in React Native
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, "crypto", {
    value: {
      getRandomValues: (array: any) => Crypto.getRandomValues(array),
    },
  });
}

// Keep the native splash visible until SplashOverlay has painted its logo —
// it hides the native splash itself, so the handoff is invisible. Hiding at
// module load or first mount shows a frame of bare background (the flicker).
SplashScreen.preventAutoHideAsync().catch(() => {});

/**
 * A signed-in launch keeps the splash up until the first screen has its data
 * (services/LaunchHold) — but never longer than this, so a slow or failed
 * fetch can't trap the user behind the logo.
 */
const LAUNCH_HOLD_CAP_MS = 10_000;
/**
 * The splash leaves only once "nothing is holding it" has stayed true this
 * long: the first screen mounts a beat after auth resolves (app/index
 * redirects into the tabs), and its hold must land before the exit starts.
 */
const LAUNCH_SETTLE_MS = 250;

function AuthGuard({
  children,
  fontsReady,
}: {
  children: React.ReactNode;
  /** The design fonts (constants/jo.ts JF) — held behind the splash so text never flashes in the system face. */
  fontsReady: boolean;
}) {
  const { token, isLoading: authLoading, isEmailVerified } = useAuth();
  const isLoading = authLoading || !fontsReady;
  const segments = useSegments();
  const router = useRouter();
  // The Stack below only mounts once auth resolves, so on that same commit the
  // root navigator isn't ready yet — replacing then updates expo-router's
  // store before it has mounted ("Can't perform a React state update on a
  // component that hasn't mounted yet"). Wait for the navigator's state key.
  const navigatorReady = !!useRootNavigationState()?.key;

  useEffect(() => {
    if (isLoading || !navigatorReady) return;

    // Every screen a signed-out user may open. A route missing here bounces to
    // /sign-in the moment it's pushed — which is how the sign-up code step
    // (/signup-verify) silently dumped users back on sign-in.
    const isAuthRelated =
      segments[0] === "sign-in" ||
      segments[0] === "sign-up" ||
      segments[0] === "signup-verify" ||
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
  }, [token, isLoading, isEmailVerified, segments, router, navigatorReady]);

  // The animated splash stays on top while auth resolves AND, when signed in,
  // until the first screen has landed with its data (sites resolved, Home
  // loaded), then cross-fades onto it — the redirect, the site check and the
  // first paint all happen out of sight.
  const [splashDone, setSplashDone] = useState(false);
  const finishSplash = useCallback(() => setSplashDone(true), []);
  const held = useLaunchHeld();
  const [holdCapped, setHoldCapped] = useState(false);
  useEffect(() => {
    if (isLoading) return;
    const id = setTimeout(() => setHoldCapped(true), LAUNCH_HOLD_CAP_MS);
    return () => clearTimeout(id);
  }, [isLoading]);
  const canLeave = !isLoading && (!token || !held || holdCapped);
  const [splashReady, setSplashReady] = useState(false);
  useEffect(() => {
    if (!canLeave || splashReady) return;
    const id = setTimeout(() => setSplashReady(true), LAUNCH_SETTLE_MS);
    return () => clearTimeout(id);
  }, [canLeave, splashReady]);

  return (
    <>
      {!isLoading && children}
      {!splashDone && (
        <SplashOverlay ready={splashReady} onFinish={finishSplash} />
      )}
    </>
  );
}

/**
 * Routes whose first screenful is the thunder header — these need light
 * status-bar icons; everything else sits on the light page canvas and needs
 * dark ones. `usePathname` drops the `(tabs)` group, so tab routes are bare.
 */
const LIGHT_STATUS_BAR_ROUTES = new Set([
  "/sign-up",
  "/signup-verify",
  "/pm-execution",
]);

/**
 * One source of truth for the status-bar tint. Screens must not set their own:
 * `expo-status-bar` applies imperatively and never restores on unmount, so a
 * per-screen tint leaks into whatever you navigate to next. Driving it off the
 * live pathname re-applies on every route change instead.
 */
function RouteStatusBar() {
  const pathname = usePathname();
  const { isDark } = useTheme();
  // In dark mode every surface is near-black, so the icons are always light;
  // in light mode only the thunder-header routes need them.
  const light = isDark || LIGHT_STATUS_BAR_ROUTES.has(pathname);
  return <StatusBar style={light ? "light" : "dark"} />;
}

/**
 * Drives PresenceService from app context: starts when authenticated, stops
 * on sign-out, and forwards every route change so the admin dashboard can
 * show which screen the user is on.
 */
function PresenceTracker() {
  const { token, user } = useAuth();
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

  // PresenceService has always stamped events with its site code, but nothing
  // ever called setSite — so mobile_events.site_code was null on all ~147k
  // rows and no per-site usage breakdown was possible. The signed-in user's
  // home site is the correct default; screens that operate on a different site
  // can still override it with presenceService.setSite().
  useEffect(() => {
    presenceService.setSite(user?.site_code ?? null);
  }, [user?.site_code]);

  return null;
}

/**
 * A module the role can't view is hidden everywhere; this catches the ways in
 * that bypass the bar (deep links, notifications, back stack) and returns the
 * user to Home.
 */
function ModuleRouteGuard() {
  const pathname = usePathname();
  const { canView } = usePermissions();
  const perm = pathname ? permForPath(pathname) : null;
  const denied = !!perm && !canView(perm);
  useEffect(() => {
    if (denied) router.replace("/(tabs)/dashboard");
  }, [denied]);
  return null;
}

export default function RootLayout() {
  // A font that fails to load falls back to the system face rather than
  // holding the app behind the splash.
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    GeistMono_400Regular,
    GeistMono_500Medium,
    GeistMono_600SemiBold,
    // Boxicons — the artboards' icon font (components/jo/Bx.tsx).
    boxicons: require("../assets/fonts/boxicons.ttf"),
  });
  const fontsReady = fontsLoaded || !!fontError;

  useEffect(() => {
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
        // Mandatory updates: an OTA downloads and blocks until restart; a newer
        // store build blocks until installed (see UpdateRequiredScreen).
        UpdateService.checkForUpdate();
        StoreUpdateService.check(true);
        // Force-update gate: verify this build is still allowed by the backend.
        VersionGateService.check();
      } catch (e) {
        console.error("Init error:", e);
      }
    };
    init();

    // Re-check the version gate (and, throttled, OTA + store updates)
    // whenever the app returns to the foreground.
    const appStateSub = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      VersionGateService.check();
      UpdateService.checkOnForeground();
      StoreUpdateService.check();
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
          <PermissionsProvider>
          <AttendanceGateProvider>
            <AuthGuard fontsReady={fontsReady}>
              <ThemeProvider>
                <ServerStatusOverlay />
                <NotificationGate />
                <UpdateRequiredScreen />
                <PendingNotificationNavigation />
                <PresenceTracker />
                <ModuleRouteGuard />
                <RouteStatusBar />
                <Stack screenOptions={{ headerShown: false }}>
                  <Stack.Screen name="index" />
                  <Stack.Screen name="sign-in" />
                  <Stack.Screen name="sign-up" />
                  <Stack.Screen name="verify-email" />
                  <Stack.Screen name="signup-verify" />
                  <Stack.Screen name="(tabs)" />
                  <Stack.Screen name="forgot-password" />
                  <Stack.Screen name="reset-password" />
                  <Stack.Screen name="all-tasks" />
                  <Stack.Screen name="privacy-security" />
                  <Stack.Screen name="app-settings" />
                  <Stack.Screen name="appearance" />
                  <Stack.Screen name="attendance-logs" />
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
                  <Stack.Screen name="shift-signoff" />
                </Stack>
              </ThemeProvider>
            </AuthGuard>
          </AttendanceGateProvider>
          </PermissionsProvider>
        </AuthProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
