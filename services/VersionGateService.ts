/**
 * VersionGateService
 *
 * Drives the mobile force-update gate. The app is blocked from use when the
 * backend version gate decides this build is too old — either proactively via
 * the public `/api/app-versions/check` endpoint on launch/resume, or
 * reactively when any request comes back 426 (see utils/apiHelper.ts).
 *
 * Offline safety: a failed check never blocks the app. Field operators in
 * basements with no signal keep working — the gate only engages on an
 * explicit "blocked" verdict from the server.
 */

import Constants from "expo-constants";
import { Platform, Linking } from "react-native";
import logger from "@/utils/logger";
import { API_BASE_URL } from "@/constants/api";
import { APP_VERSION } from "@/constants/version";
import ServerStatusService from "@/services/ServerStatusService";

export interface VersionGateState {
  blocked: boolean;
  message?: string;
  reason?: string;
}

type Listener = (state: VersionGateState) => void;

// iOS deep-linking needs the numeric App Store ID — fill this in once the app
// is published. Android works out of the box from the package name.
const IOS_APP_STORE_ID = "";

const DEFAULT_MESSAGE =
  "A newer version of JouleOps is required to continue. Please update to keep using the app.";

class VersionGateService {
  private state: VersionGateState = { blocked: false };
  private listeners = new Set<Listener>();

  /** Release version of this build — see constants/version.ts. */
  get appVersion(): string {
    return APP_VERSION;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    this.listeners.forEach((fn) => fn(this.state));
  }

  /** Mark the app as blocked. Called by apiHelper on a 426, and by check(). */
  reportBlocked(details: { message?: string; reason?: string }) {
    if (this.state.blocked) return; // Already blocked — keep the first reason.
    this.state = {
      blocked: true,
      message: details.message || DEFAULT_MESSAGE,
      reason: details.reason,
    };
    logger.warn("App version blocked by backend gate", {
      module: "VERSION_GATE",
      version: this.appVersion,
      reason: details.reason,
    });
    this.emit();
  }

  /** Lift the block — used when a re-check finds the build is allowed again. */
  clearBlocked() {
    if (!this.state.blocked) return;
    this.state = { blocked: false };
    logger.info("App version block lifted", { module: "VERSION_GATE" });
    this.emit();
  }

  /**
   * Ask the backend whether this build is still allowed and whether
   * maintenance mode is on. Safe to call on launch, on every foreground, and
   * on a poll. Doubles as a health ping — the result feeds ServerStatusService
   * so the version gate and the server-status overlay stay in sync.
   *
   * A network failure never hard-blocks the app; it only flags a possible
   * outage (which shows a non-blocking banner, not a lockout).
   */
  async check(): Promise<void> {
    const url =
      `${API_BASE_URL}/api/app-versions/check` +
      `?platform=${encodeURIComponent(Platform.OS)}` +
      `&version=${encodeURIComponent(this.appVersion)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) {
        ServerStatusService.reportUnreachable();
        return;
      }
      const body = await res.json();
      ServerStatusService.reportReachable();
      if (body?.success && body?.data) {
        if (body.data.blocked) {
          this.reportBlocked({ reason: body.data.reason });
        } else {
          // A re-check came back clean — e.g. the rule was changed on the
          // server. Lift the block so the app becomes usable again.
          this.clearBlocked();
        }
        ServerStatusService.setMaintenance(body.data.maintenance);
      }
    } catch {
      // Offline or server unreachable — flag it, but never hard-block.
      ServerStatusService.reportUnreachable();
    } finally {
      clearTimeout(timer);
    }
  }

  /** Open the platform app store so the user can update. */
  async openStore(): Promise<void> {
    const androidPkg =
      Constants.expoConfig?.android?.package || "com.arundev2025.jouleops";
    const iosId = IOS_APP_STORE_ID;

    const candidates =
      Platform.OS === "android"
        ? [
            `market://details?id=${androidPkg}`,
            `https://play.google.com/store/apps/details?id=${androidPkg}`,
          ]
        : iosId
          ? [
              `itms-apps://apps.apple.com/app/id${iosId}`,
              `https://apps.apple.com/app/id${iosId}`,
            ]
          : ["https://apps.apple.com/"];

    for (const target of candidates) {
      try {
        await Linking.openURL(target);
        return;
      } catch {
        // Try the next candidate (e.g. market:// not available).
      }
    }
    logger.warn("Could not open app store", { module: "VERSION_GATE" });
  }
}

export default new VersionGateService();
