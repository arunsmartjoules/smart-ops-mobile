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
import { LogBox, Platform } from "react-native";

if (__DEV__ && Platform.OS === "ios" && !Device.isDevice) {
  LogBox.ignoreLogs([
    /\[expo-notifications\] Error reading persisted server registration info/,
  ]);
}

export {}; // ensure this is treated as a module
