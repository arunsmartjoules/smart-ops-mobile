/**
 * StoreUpdateService
 *
 * Detects a newer native build in the app store so the app can force the user
 * onto it (see components/UpdateRequiredScreen.tsx). OTA updates can't ship
 * native changes, so a store release needs its own nudge.
 *
 *  - Android: Google Play In-App Updates API via the `expo-in-app-updates`
 *    native module. Play only reports an update once it is actually
 *    installable on *this* device (staged rollouts included), so nobody is
 *    blocked on a release they can't get yet. Sideloaded / internal builds
 *    aren't "owned" by Play — the check errors and we stay out of the way.
 *  - iOS: the public iTunes lookup API, compared against APP_VERSION.
 *
 * The native module is loaded with `requireOptionalNativeModule`, NOT the
 * library's JS entry (which calls `requireNativeModule` and throws). Binaries
 * built before the module was added receive this code over OTA and must not
 * crash — they just never detect a store update (the backend version gate
 * still covers them).
 *
 * Like the version gate, a failed check never blocks the app.
 */

import { requireOptionalNativeModule } from "expo";
import Constants from "expo-constants";
import { Linking, Platform } from "react-native";
import logger from "@/utils/logger";
import { APP_VERSION } from "@/constants/version";
import VersionGateService from "@/services/VersionGateService";

export interface StoreUpdateState {
  available: boolean;
  /** Store version string — iOS only (Android exposes just a versionCode). */
  storeVersion?: string;
}

type Listener = (state: StoreUpdateState) => void;

interface InAppUpdatesNative {
  IMMEDIATE: number;
  checkForUpdate(): Promise<{
    updateAvailable: boolean;
    updateInProgress?: boolean;
    immediateAllowed?: boolean;
    storeVersion?: string;
  }>;
  startUpdate(updateType?: number): Promise<boolean>;
}

const InAppUpdates =
  Platform.OS === "android"
    ? requireOptionalNativeModule<InAppUpdatesNative>("ExpoInAppUpdates")
    : null;

// Foreground re-checks are throttled; launch and manual checks are not.
const MIN_RECHECK_MS = 15 * 60 * 1000;

function compareVersions(a: string, b: string): number {
  const pa = (a.split(/[-+]/)[0] ?? "").split(".").map((s) => parseInt(s, 10) || 0);
  const pb = (b.split(/[-+]/)[0] ?? "").split(".").map((s) => parseInt(s, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

class StoreUpdateService {
  private state: StoreUpdateState = { available: false };
  private listeners = new Set<Listener>();
  private checking = false;
  private lastCheckedAt = 0;
  private iosStoreUrl: string | null = null;
  private immediateAllowed = false;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private emit(state: StoreUpdateState) {
    this.state = state;
    this.listeners.forEach((fn) => fn(state));
  }

  /**
   * Ask the store whether a newer build exists. Resolves true when one does.
   * `force` skips the foreground throttle (launch / manual "check for updates").
   */
  async check(force = false): Promise<boolean> {
    if (__DEV__) return false;
    if (this.state.available) return true; // Sticky until the app is updated.
    if (this.checking) return false;
    if (!force && Date.now() - this.lastCheckedAt < MIN_RECHECK_MS) return false;

    this.checking = true;
    this.lastCheckedAt = Date.now();
    try {
      const result =
        Platform.OS === "android"
          ? await this.checkPlay()
          : Platform.OS === "ios"
            ? await this.checkAppStore()
            : null;
      if (result) {
        logger.info("Store update available", {
          module: "STORE_UPDATE",
          installed: APP_VERSION,
          storeVersion: result.storeVersion,
        });
        this.emit({ available: true, storeVersion: result.storeVersion });
        return true;
      }
      return false;
    } catch (e: any) {
      // Not installed from the store, offline, Play services missing, etc.
      logger.debug("Store update check failed", {
        module: "STORE_UPDATE",
        error: e?.message,
      });
      return false;
    } finally {
      this.checking = false;
    }
  }

  private async checkPlay(): Promise<{ storeVersion?: string } | null> {
    if (!InAppUpdates) return null; // Binary predates the native module.
    const info = await InAppUpdates.checkForUpdate();
    if (!info.updateAvailable) return null;
    this.immediateAllowed = !!info.immediateAllowed;
    // storeVersion is a versionCode here — not meaningful to show users.
    return {};
  }

  private async checkAppStore(): Promise<{ storeVersion?: string } | null> {
    const bundleId =
      Constants.expoConfig?.ios?.bundleIdentifier || "com.smartjoules.jouleops";
    // The app is listed in India; fall back to the default storefront.
    for (const country of ["in", ""]) {
      const url =
        `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}` +
        (country ? `&country=${country}` : "") +
        `&_=${Date.now()}`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const body = await res.json();
      const app = body?.results?.[0];
      if (!app?.version) continue;
      if (app.trackViewUrl) this.iosStoreUrl = String(app.trackViewUrl);
      return compareVersions(String(app.version), APP_VERSION) > 0
        ? { storeVersion: String(app.version) }
        : null;
    }
    return null;
  }

  /**
   * Send the user to the new build. On Android this runs Play's full-screen
   * in-app update (download + install + relaunch without leaving the app),
   * falling back to the Play Store listing if that flow can't start.
   */
  async startUpdate(): Promise<void> {
    if (Platform.OS === "android" && InAppUpdates && this.immediateAllowed) {
      try {
        const started = await InAppUpdates.startUpdate(InAppUpdates.IMMEDIATE);
        if (started) return;
      } catch (e: any) {
        logger.warn("In-app update failed to start", {
          module: "STORE_UPDATE",
          error: e?.message,
        });
      }
    }
    if (Platform.OS === "ios" && this.iosStoreUrl) {
      try {
        await Linking.openURL(this.iosStoreUrl);
        return;
      } catch {
        // Fall through to the generic store opener.
      }
    }
    await VersionGateService.openStore();
  }
}

export default new StoreUpdateService();
