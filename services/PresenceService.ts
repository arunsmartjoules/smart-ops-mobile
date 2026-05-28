/**
 * PresenceService — feeds the admin Mobile App dashboard.
 *
 * Lifecycle:
 *   start()                  → opens a session, begins heartbeat + event flush
 *   setAuthenticated(true)   → required before start() will fire heartbeats
 *   setRoute(path)           → logs screen_view, fires an out-of-band heartbeat
 *                              and stamps duration on the previous route
 *   stop()                   → ends the current session
 *
 * Block detection: the heartbeat response returns `{ blocked: true }` for
 * deactivated accounts; apiHelper separately reacts to 403 USER_BLOCKED on
 * any request. Both paths fire authEvents.emitUnauthorized("session_revoked")
 * which the auth context translates to a forced sign-out.
 */

import * as Application from "expo-application";
import * as Device from "expo-device";
import { Platform, AppState, type AppStateStatus } from "react-native";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

import { API_URL } from "@/constants/api";
import { apiFetch } from "@/utils/apiHelper";
import logger from "@/utils/logger";
import { authEvents } from "@/utils/authEvents";
import { APP_VERSION } from "@/constants/version";

const HEARTBEAT_MS = 60_000;
const EVENTS_FLUSH_MS = 15_000;
const EVENTS_MAX_BUFFER = 50;

interface PresenceState {
  route: string | null;
  routeEnteredAt: number | null;
  siteCode: string | null;
  networkType: string | null;
  networkStrength: string | null;
  networkStrengthDbm: number | null;
  deviceId: string | null;
  sessionId: number | null;
}

interface QueuedEvent {
  event_type: string;
  route: string | null;
  site_code: string | null;
  data: Record<string, unknown> | null;
  occurred_at: string;
  session_id: number | null;
}

class PresenceService {
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private eventsTimer: ReturnType<typeof setInterval> | null = null;
  private netUnsubscribe: (() => void) | null = null;
  private appStateSub: { remove: () => void } | null = null;

  private running = false;
  private hasAuth = false;
  private appActive = true;

  private state: PresenceState = {
    route: null,
    routeEnteredAt: null,
    siteCode: null,
    networkType: null,
    networkStrength: null,
    networkStrengthDbm: null,
    deviceId: null,
    sessionId: null,
  };

  private buffer: QueuedEvent[] = [];

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.state.deviceId = this.resolveDeviceId();
    // Resolve current AppState on every start — the module-load value may be
    // "unknown" if PresenceService is imported before AppState initialises.
    this.appActive = AppState.currentState === "active";

    NetInfo.fetch()
      .then((s) => this.onNetworkChange(s))
      .catch(() => {});

    this.netUnsubscribe = NetInfo.addEventListener((state) =>
      this.onNetworkChange(state),
    );
    this.appStateSub = AppState.addEventListener("change", (next) =>
      this.onAppStateChange(next),
    );

    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat().catch(() => {});
    }, HEARTBEAT_MS);
    this.eventsTimer = setInterval(() => {
      this.flushEvents().catch(() => {});
    }, EVENTS_FLUSH_MS);

    if (this.hasAuth) {
      await this.openSession();
      this.sendHeartbeat().catch(() => {});
    }
  }

  async stop(reason: string = "stop"): Promise<void> {
    if (!this.running) return;
    this.running = false;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.eventsTimer) clearInterval(this.eventsTimer);
    this.heartbeatTimer = null;
    this.eventsTimer = null;
    this.netUnsubscribe?.();
    this.netUnsubscribe = null;
    this.appStateSub?.remove();
    this.appStateSub = null;
    // Flush any pending events before closing the session so the duration
    // computation on the dashboard has the full screen-leave record.
    this.emitScreenLeave();
    await this.flushEvents().catch(() => {});
    await this.closeSession(reason);
    this.buffer = [];
  }

  setAuthenticated(authed: boolean): void {
    const wasAuthed = this.hasAuth;
    this.hasAuth = authed;
    if (!authed) {
      this.buffer = [];
      if (this.state.sessionId !== null) {
        this.closeSession("signout").catch(() => {});
      }
    } else if (!wasAuthed && this.running && this.state.sessionId === null) {
      this.openSession().catch(() => {});
    }
  }

  setRoute(route: string | null): void {
    if (this.state.route === route) return;
    this.emitScreenLeave();
    this.state.route = route;
    this.state.routeEnteredAt = Date.now();
    if (route) this.logEvent("screen_view", { route });
    if (this.running && this.hasAuth && this.appActive) {
      this.sendHeartbeat().catch(() => {});
    }
  }

  setSite(siteCode: string | null): void {
    this.state.siteCode = siteCode;
  }

  /**
   * Record a discrete user action. `type` is the event_type column — keep
   * these stable strings (e.g. "sitelog_submit", "ticket_create") so the
   * activity timeline groups cleanly.
   */
  logEvent(type: string, data?: Record<string, unknown>): void {
    if (!this.running || !this.hasAuth) return;
    this.buffer.push({
      event_type: type,
      route: this.state.route,
      site_code: this.state.siteCode,
      data: data ?? null,
      occurred_at: new Date().toISOString(),
      session_id: this.state.sessionId,
    });
    if (this.buffer.length >= EVENTS_MAX_BUFFER) {
      this.flushEvents().catch(() => {});
    }
  }

  // ── internals ──────────────────────────────────────────────────────────

  private emitScreenLeave(): void {
    if (this.state.route && this.state.routeEnteredAt) {
      const durationMs = Date.now() - this.state.routeEnteredAt;
      // Only emit the leave event for screens we stayed on long enough to
      // matter — anything under 250ms is a routing flicker.
      if (durationMs >= 250) {
        this.logEvent("screen_leave", {
          route: this.state.route,
          duration_ms: durationMs,
        });
      }
    }
  }

  private async openSession(): Promise<void> {
    if (this.state.sessionId !== null) return;
    try {
      const res = await apiFetch(`${API_URL}/mobile-app/sessions`, {
        method: "POST",
        body: JSON.stringify({
          app_version: APP_VERSION,
          platform: Platform.OS,
          device_id: this.state.deviceId,
        }),
      });
      if (!res.ok) return;
      const body = await res.json();
      const id = body?.data?.session_id;
      if (typeof id === "number") {
        this.state.sessionId = id;
        this.logEvent("session_start", {
          app_version: APP_VERSION,
          platform: Platform.OS,
        });
      }
    } catch (err) {
      logger.debug("presence_session_open_failed", {
        module: "PRESENCE",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async closeSession(reason: string): Promise<void> {
    const id = this.state.sessionId;
    if (id === null) return;
    this.state.sessionId = null;
    try {
      await apiFetch(`${API_URL}/mobile-app/sessions/${id}/end`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    } catch {
      // Best effort — the next session open will mark this one "superseded".
    }
  }

  private resolveDeviceId(): string | null {
    try {
      if (Platform.OS === "android") {
        return Application.getAndroidId?.() ?? Device.modelName ?? null;
      }
      return Device.modelName ?? null;
    } catch {
      return null;
    }
  }

  private onNetworkChange(state: NetInfoState): void {
    this.state.networkType = state.type ?? null;
    const details = (state.details ?? {}) as Record<string, unknown>;

    // Android NetInfo exposes Wi-Fi RSSI as details.strength (dBm, negative).
    // iOS doesn't surface RSSI for sandboxed apps, so we fall back to the
    // categorical generation (4g/5g) for cellular.
    let dbm: number | null = null;
    const rawStrength = details.strength;
    if (typeof rawStrength === "number") dbm = rawStrength;

    let strengthLabel: string | null = null;
    if (dbm !== null) {
      // Map dBm → human bars. The thresholds are the standard Android RSSI
      // buckets used by SignalStrength.getLevel().
      if (dbm >= -55) strengthLabel = "excellent";
      else if (dbm >= -65) strengthLabel = "good";
      else if (dbm >= -75) strengthLabel = "fair";
      else if (dbm >= -85) strengthLabel = "poor";
      else strengthLabel = "very_poor";
    } else if (typeof details.cellularGeneration === "string") {
      strengthLabel = details.cellularGeneration as string;
    } else if (state.type === "wifi" && state.isConnected) {
      strengthLabel = "connected";
    }

    this.state.networkStrength = strengthLabel;
    this.state.networkStrengthDbm = dbm;
  }

  private onAppStateChange(next: AppStateStatus): void {
    const wasActive = this.appActive;
    this.appActive = next === "active";
    if (this.appActive && !wasActive && this.hasAuth) {
      this.sendHeartbeat().catch(() => {});
      this.flushEvents().catch(() => {});
    } else if (!this.appActive && wasActive) {
      // Mark the current screen as having been left so its duration is
      // recorded even if the app gets killed in the background.
      this.emitScreenLeave();
      this.state.routeEnteredAt = null;
      this.flushEvents().catch(() => {});
    }
  }

  private async sendHeartbeat(): Promise<void> {
    if (!this.hasAuth || !this.appActive) return;
    try {
      const res = await apiFetch(`${API_URL}/mobile-app/heartbeat`, {
        method: "POST",
        body: JSON.stringify({
          route: this.state.route,
          site_code: this.state.siteCode,
          network_type: this.state.networkType,
          network_strength: this.state.networkStrength,
          network_strength_dbm: this.state.networkStrengthDbm,
          device_id: this.state.deviceId,
          session_id: this.state.sessionId,
        }),
      });
      if (!res.ok) return;
      try {
        const body = await res.json();
        if (body?.data?.blocked === true) {
          authEvents.emitUnauthorized("session_revoked");
        }
      } catch {
        /* body parse failure doesn't matter — heartbeat already accepted */
      }
    } catch (err) {
      logger.debug("presence_heartbeat_failed", {
        module: "PRESENCE",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async flushEvents(): Promise<void> {
    if (!this.hasAuth || this.buffer.length === 0) return;
    const batch = this.buffer.splice(0, EVENTS_MAX_BUFFER);
    try {
      const res = await apiFetch(`${API_URL}/mobile-app/events`, {
        method: "POST",
        body: JSON.stringify({
          session_id: this.state.sessionId,
          events: batch,
        }),
      });
      if (!res.ok && res.status >= 500) {
        this.buffer.unshift(...batch);
      }
    } catch (err) {
      this.buffer.unshift(...batch);
      logger.debug("presence_events_flush_failed", {
        module: "PRESENCE",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export const presenceService = new PresenceService();
