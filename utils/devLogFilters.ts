/**
 * Dev-only LogBox filters for third-party log noise we can't fix at the source.
 *
 * expo-notifications runs a device-push-token auto-registration effect at module
 * load (DevicePushTokenAutoRegistration.fx) that reads its persisted registration
 * info out of the iOS Keychain. Simulator builds are unsigned — the Xcode project
 * only sets CODE_SIGN_IDENTITY for sdk=iphoneos*, so the .app carries no
 * entitlements at all; with no application-identifier there is no default keychain
 * access group and SecItemCopyMatching fails (ERR_NOTIFICATIONS_KEYCHAIN_ACCESS).
 * The module reports it with console.error, so LogBox reds it out on every launch.
 *
 * Harmless on the simulator: push registration already bails on !Device.isDevice
 * and APNs doesn't work there anyway. Signed device/EAS builds do carry the
 * entitlement, so the read succeeds and this never fires — hence the simulator-only
 * scoping, so a genuine keychain failure on a real device still surfaces.
 *
 * Imported once from app/_layout.tsx; no-op in production.
 */
import * as Device from "expo-device";
import React from "react";
import { LogBox, Platform } from "react-native";

if (__DEV__ && Platform.OS === "ios" && !Device.isDevice) {
  LogBox.ignoreLogs([
    /\[expo-notifications\] Error reading persisted server registration info/,
  ]);
}

/**
 * expo-router's forked NavigationContainer pipes Android's asynchronous
 * Linking.getInitialURL() straight into setLastUnhandledLink from
 * useLinking.native's getInitialState(). getInitialState() is invoked during
 * render, so on a cold start with a heavy first screen the native round-trip
 * can resolve before NavigationContainer commits — React then drops the update
 * and reds out "Can't perform a React state update on a component that hasn't
 * mounted yet" with <ContextNavigator /> (ExpoRoot.js) as the component stack.
 *
 * Upstream and still open: https://github.com/expo/expo/issues/50282 (see also
 * expo/expo#49378). Android only — iOS resolves the initial URL synchronously.
 * Nothing in this app causes it or can fix it, and the only casualty is
 * expo-router's bookkeeping of an unhandled cold-start deep link inside the
 * race window; navigation itself is unaffected.
 *
 * Scoped by the owner stack — React captures it the same way LogBox does, so
 * this identical warning raised by any of OUR components has a different stack
 * and still reds out normally. Downgraded to console.log rather than dropped,
 * so it stays visible in the Metro terminal.
 */
if (__DEV__ && Platform.OS === "android") {
  const NOT_MOUNTED =
    "Can't perform a React state update on a component that hasn't mounted yet";
  const origError = console.error.bind(console);
  const origLog = console.log.bind(console);

  console.error = (...args: unknown[]) => {
    try {
      if (typeof args[0] === "string" && args[0].includes(NOT_MOUNTED)) {
        // React is still inside runWithFiberInDEV here, so the owner stack is
        // the offending fiber's — the same source LogBox reads for its
        // "Component Stack" section.
        const ownerStack = React.captureOwnerStack?.() ?? "";
        if (/ContextNavigator|ExpoRoot/.test(ownerStack)) {
          origLog(
            "[devLogFilters] suppressed expo-router cold-start warning " +
              "(expo/expo#50282): setLastUnhandledLink fired before " +
              "<ContextNavigator /> mounted.",
          );
          return;
        }
      }
    } catch {
      // never let the filter break logging
    }
    origError(...args);
  };
}

export {}; // ensure this is treated as a module
