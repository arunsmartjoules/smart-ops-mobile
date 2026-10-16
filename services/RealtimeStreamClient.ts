import EventSource from "react-native-sse";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { AppState, type AppStateStatus } from "react-native";
import logger from "@/utils/logger";
import { API_BASE_URL } from "@/constants/api";
import { forceRefreshAuthToken, getValidAuthToken } from "./AuthTokenManager";

/**
 * One reusable server-sent-events client for the app's live channels
 * (tickets, incidents, PM). Each instance owns its own EventSource, and keeps
 * the reconnect / backoff / token logic the tickets stream has always had:
 *
 * - Bearer token from AuthTokenManager on every (re)open; a 401 forces one
 *   token refresh before the next attempt.
 * - Exponential backoff with jitter, capped at 30 s. A 429 (too many streams
 *   for this user) and a 403 (no access to the site) wait the full cap rather
 *   than hammering the server.
 * - `manualStop` (disconnect) beats every pending reconnect.
 * - Offline or app in background → the stream is closed and no reconnects
 *   are attempted (no battery spent dialling a dead network). Back online /
 *   foreground → reconnect at once, then `onResync` so the screen reloads
 *   whatever changed meanwhile. Offline-first data keeps working throughout;
 *   live updates only ever add to it.
 *
 * Live updates are best-effort: nothing here ever surfaces to the user.
 */

export type RealtimeConnectionState = "connecting" | "connected" | "disconnected" | "error";

export interface RealtimeStreamConfig<E> {
  /** Logger module tag, e.g. "TICKETS_REALTIME". */
  module: string;
  /** Path under API_BASE_URL, e.g. "/api/incidents/stream". */
  path: string;
  /** How the stream takes its sites — tickets use `site_code`, the change feeds `site_codes`. */
  siteParam: "site_code" | "site_codes";
  /** SSE `event:` names to listen for. */
  eventNames: string[];
  /** Build-time kill switch. */
  enabled: boolean;
  /** Parse + validate one event's JSON; null drops it. */
  parse: (data: unknown) => E | null;
}

export type RealtimeConnectOptions<E> = {
  /** Single site (what every screen uses today) … */
  siteCode?: string;
  /** … or several, for streams that accept `site_codes`. */
  siteCodes?: string[];
  onEvent: (event: E) => void | Promise<void>;
  onStateChange?: (state: RealtimeConnectionState) => void;
  /**
   * Called when the stream comes back after dropping — events may have been
   * missed while it was down, so the screen should reload what it shows.
   */
  onResync?: () => void;
};

const MAX_BACKOFF_MS = 30_000;

export class RealtimeStreamClient<E> {
  private source: EventSource<string> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private manualStop = false;
  private siteCodes: string[] = [];
  private onEvent: RealtimeConnectOptions<E>["onEvent"] | null = null;
  private onStateChange: RealtimeConnectOptions<E>["onStateChange"] = undefined;
  private onResync: RealtimeConnectOptions<E>["onResync"] = undefined;
  private needsResync = false;
  private refreshTokenNext = false;
  /** Paused while the device is offline or the app is backgrounded. */
  private offline = false;
  private background = AppState.currentState !== "active";
  private unsubscribeNet: (() => void) | null = null;
  private appStateSub: { remove: () => void } | null = null;

  constructor(private readonly config: RealtimeStreamConfig<E>) {}

  isEnabled() {
    return this.config.enabled;
  }

  async connect(options: RealtimeConnectOptions<E>) {
    if (!this.config.enabled) return;
    this.manualStop = false;
    this.siteCodes = (options.siteCodes ?? (options.siteCode ? [options.siteCode] : [])).filter(Boolean);
    this.onEvent = options.onEvent;
    this.onStateChange = options.onStateChange;
    this.onResync = options.onResync;
    this.needsResync = false;
    this.watchDevice();
    await this.open();
  }

  private get paused() {
    return this.offline || this.background;
  }

  /** Follow connectivity and foreground state for as long as we're connected. */
  private watchDevice() {
    this.unwatchDevice();
    this.background = AppState.currentState !== "active";
    this.appStateSub = AppState.addEventListener("change", (next: AppStateStatus) => {
      const wasPaused = this.paused;
      this.background = next !== "active";
      this.onPauseChange(wasPaused);
    });
    this.unsubscribeNet = NetInfo.addEventListener((net: NetInfoState) => {
      const wasPaused = this.paused;
      // Unknown reachability (null) counts as online — same rule as the services.
      this.offline = net.isConnected === false || net.isInternetReachable === false;
      this.onPauseChange(wasPaused);
    });
  }

  private unwatchDevice() {
    this.unsubscribeNet?.();
    this.unsubscribeNet = null;
    this.appStateSub?.remove();
    this.appStateSub = null;
  }

  private onPauseChange(wasPaused: boolean) {
    if (this.manualStop || wasPaused === this.paused) return;
    if (this.paused) {
      // Going dark: drop the stream; whatever happens meanwhile is caught up on resume.
      this.needsResync = true;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      if (this.source) {
        this.source.close();
        this.source = null;
      }
      this.onStateChange?.("disconnected");
      return;
    }
    // Back: reconnect straight away rather than waiting out a backoff.
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    void this.open();
  }

  disconnect() {
    this.manualStop = true;
    this.unwatchDevice();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.source) {
      this.source.close();
      this.source = null;
    }
    this.onStateChange?.("disconnected");
  }

  private buildUrl() {
    const { path, siteParam } = this.config;
    const value =
      siteParam === "site_code" ? (this.siteCodes[0] ?? "") : this.siteCodes.join(",");
    return `${API_BASE_URL}${path}?${siteParam}=${encodeURIComponent(value)}`;
  }

  private async open() {
    if (this.manualStop || this.paused || this.siteCodes.length === 0) return;
    if (this.source) {
      this.source.close();
      this.source = null;
    }

    this.onStateChange?.("connecting");
    let token: string | null = null;
    try {
      token = this.refreshTokenNext ? await forceRefreshAuthToken() : await getValidAuthToken();
    } catch {
      token = null;
    }
    this.refreshTokenNext = false;
    // The await above may have raced a disconnect or the device going offline.
    if (this.manualStop || this.paused) return;
    if (!token) {
      this.scheduleReconnect("missing_token");
      return;
    }

    const source = new EventSource<string>(this.buildUrl(), {
      headers: { Authorization: `Bearer ${token}` },
      // Keep the stream open indefinitely; the server's heartbeat keeps it alive.
      timeout: 0,
      timeoutBeforeConnection: 0,
      pollingInterval: 0,
    });
    this.source = source;

    source.addEventListener("open", () => {
      if (this.source !== source) return;
      this.reconnectAttempts = 0;
      this.onStateChange?.("connected");
      // Any open after a drop or pause may have missed events.
      if (this.needsResync) {
        this.needsResync = false;
        try {
          this.onResync?.();
        } catch {
          // best-effort
        }
      }
    });

    source.addEventListener("error", (event: any) => {
      if (this.source !== source) return;
      const status = Number(event?.xhrStatus || 0);
      logger.warn(`${this.config.module} stream error`, {
        module: this.config.module,
        event: event?.message || "unknown_error",
        status,
      });
      this.onStateChange?.("error");
      if (this.manualStop) return;
      if (status === 401) this.refreshTokenNext = true;
      this.scheduleReconnect("stream_error", status === 429 || status === 403);
    });

    (source as any).addEventListener("done", () => {
      if (this.source !== source || this.manualStop) return;
      this.onStateChange?.("error");
      this.scheduleReconnect("stream_done");
    });

    for (const name of this.config.eventNames) {
      source.addEventListener(name, (event: any) => {
        if (this.source !== source) return;
        void this.handleEvent(event);
      });
    }
  }

  private async handleEvent(rawEvent: any) {
    if (!rawEvent?.data || !this.onEvent) return;
    try {
      const parsed = this.config.parse(JSON.parse(rawEvent.data));
      if (!parsed) return;
      await this.onEvent(parsed);
    } catch (error) {
      logger.warn("Failed to parse realtime event", {
        module: this.config.module,
        error,
      });
    }
  }

  private scheduleReconnect(reason: string, slow = false) {
    if (this.manualStop) return;
    this.needsResync = true;
    if (this.paused) return; // resumes on its own when the device is back
    if (this.source) {
      this.source.close();
      this.source = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const base = slow
      ? MAX_BACKOFF_MS
      : Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.reconnectAttempts);
    const waitMs = base + Math.floor(Math.random() * 400);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      logger.info("Reconnecting realtime stream", {
        module: this.config.module,
        reason,
        attempts: this.reconnectAttempts,
      });
      void this.open();
    }, waitMs);
  }
}

/* ── Change feeds (incidents, PM) ────────────────────────────────────────── */

/**
 * `incidents_changed` / `pm_changed` — fired by DB triggers on commit. Carries
 * ids only; screens re-fetch what they show. `bulk` (or site "*") = reload.
 * Mirrors backend/shared/src/lib/realtime.ts.
 */
export interface ChangeFeedEvent {
  event_id: string;
  event_type: "incidents_changed" | "pm_changed";
  channel: "incidents" | "pm";
  op: "INSERT" | "UPDATE" | "DELETE" | "MIXED";
  site_code: string;
  ids: string[];
  bulk: boolean;
  updated_at: string;
}

const parseChangeFeed = (data: unknown): ChangeFeedEvent | null => {
  const e = data as Partial<ChangeFeedEvent> | null;
  if (!e?.event_id || typeof e.site_code !== "string") return null;
  return {
    ...(e as ChangeFeedEvent),
    ids: Array.isArray(e.ids) ? e.ids.filter((x): x is string => typeof x === "string") : [],
    bulk: !!e.bulk || e.site_code === "*",
  };
};

/** Kill switch for the incidents + PM live channels (default on). */
const changeFeedsEnabled =
  String(process.env.EXPO_PUBLIC_ENABLE_REALTIME ?? "true").toLowerCase() !== "false";

export const incidentsRealtimeService = new RealtimeStreamClient<ChangeFeedEvent>({
  module: "INCIDENTS_REALTIME",
  path: "/api/incidents/stream",
  siteParam: "site_codes",
  eventNames: ["incidents_changed"],
  enabled: changeFeedsEnabled,
  parse: parseChangeFeed,
});

export const pmRealtimeService = new RealtimeStreamClient<ChangeFeedEvent>({
  module: "PM_REALTIME",
  path: "/api/pm-instances/stream",
  siteParam: "site_codes",
  eventNames: ["pm_changed"],
  enabled: changeFeedsEnabled,
  parse: parseChangeFeed,
});

/** Bounded event-id memory for de-duplicating a stream's events. */
export function makeEventDeduper(max = 200) {
  const seen: string[] = [];
  const set = new Set<string>();
  return (id: string): boolean => {
    if (set.has(id)) return false;
    seen.push(id);
    set.add(id);
    if (seen.length > max) {
      const drop = seen.splice(0, seen.length - Math.floor(max * 0.75));
      drop.forEach((d) => set.delete(d));
    }
    return true;
  };
}
