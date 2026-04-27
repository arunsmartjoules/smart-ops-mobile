import EventSource from "react-native-sse";
import logger from "@/utils/logger";
import { API_BASE_URL } from "@/constants/api";
import { getValidAuthToken } from "./AuthTokenManager";

export type TicketRealtimeEventType =
  | "ticket_created"
  | "ticket_updated"
  | "ticket_status_changed"
  | "ticket_line_item_added";

export type TicketRealtimeEvent = {
  event_id: string;
  event_type: TicketRealtimeEventType;
  ticket_id: string;
  site_code: string;
  ticket_no?: string;
  updated_at: string;
  payload?: Record<string, unknown>;
};

type ConnectOptions = {
  siteCode: string;
  onEvent: (event: TicketRealtimeEvent) => void | Promise<void>;
  onStateChange?: (state: "connecting" | "connected" | "disconnected" | "error") => void;
};

class TicketsRealtimeService {
  private source: EventSource | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private manualStop = false;
  private currentSiteCode = "";
  private onEvent: ((event: TicketRealtimeEvent) => void | Promise<void>) | null = null;
  private onStateChange: ConnectOptions["onStateChange"] = undefined;
  private readonly enabled =
    String(process.env.EXPO_PUBLIC_ENABLE_TICKETS_REALTIME ?? "true").toLowerCase() !== "false";

  isEnabled() {
    return this.enabled;
  }

  async connect(options: ConnectOptions) {
    if (!this.enabled) return;
    this.manualStop = false;
    this.currentSiteCode = options.siteCode;
    this.onEvent = options.onEvent;
    this.onStateChange = options.onStateChange;
    await this.open();
  }

  disconnect() {
    this.manualStop = true;
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

  private async open() {
    if (this.manualStop || !this.currentSiteCode) return;
    if (this.source) {
      this.source.close();
      this.source = null;
    }

    this.onStateChange?.("connecting");
    const token = await getValidAuthToken();
    if (!token) {
      this.scheduleReconnect("missing_token");
      return;
    }

    const url = `${API_BASE_URL}/api/complaints/stream?site_code=${encodeURIComponent(this.currentSiteCode)}`;
    this.source = new EventSource(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      // Keep stream alive indefinitely; backend heartbeat drives liveliness.
      timeout: 0,
      timeoutBeforeConnection: 0,
      pollingInterval: 0,
    });

    this.source.addEventListener("open", () => {
      this.reconnectAttempts = 0;
      this.onStateChange?.("connected");
    });

    this.source.addEventListener("error", (event: any) => {
      logger.warn("Tickets realtime stream error", {
        module: "TICKETS_REALTIME",
        event: event?.message || "unknown_error",
      });
      this.onStateChange?.("error");
      if (!this.manualStop) {
        this.scheduleReconnect("stream_error");
      }
    });

    (this.source as any).addEventListener("done", () => {
      if (this.manualStop) return;
      this.onStateChange?.("error");
      this.scheduleReconnect("stream_done");
    });

    (this.source as any).addEventListener("ticket_created", (event: any) => this.handleEvent(event));
    (this.source as any).addEventListener("ticket_updated", (event: any) => this.handleEvent(event));
    (this.source as any).addEventListener("ticket_status_changed", (event: any) => this.handleEvent(event));
    (this.source as any).addEventListener("ticket_line_item_added", (event: any) => this.handleEvent(event));
  }

  private async handleEvent(rawEvent: any) {
    if (!rawEvent?.data || !this.onEvent) return;
    try {
      const parsed = JSON.parse(rawEvent.data) as TicketRealtimeEvent;
      if (!parsed?.event_id || !parsed?.ticket_id || !parsed?.site_code) return;
      await this.onEvent(parsed);
    } catch (error) {
      logger.warn("Failed to parse realtime event", {
        module: "TICKETS_REALTIME",
        error,
      });
    }
  }

  private scheduleReconnect(reason: string) {
    if (this.manualStop) return;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const base = Math.min(30000, 1000 * 2 ** this.reconnectAttempts);
    const jitter = Math.floor(Math.random() * 400);
    const waitMs = base + jitter;
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      logger.info("Reconnecting realtime stream", {
        module: "TICKETS_REALTIME",
        reason,
        attempts: this.reconnectAttempts,
      });
      void this.open();
    }, waitMs);
  }
}

export const ticketsRealtimeService = new TicketsRealtimeService();
export default ticketsRealtimeService;

