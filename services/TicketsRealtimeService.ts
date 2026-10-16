import { RealtimeStreamClient } from "./RealtimeStreamClient";

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

/**
 * Tickets live stream (`/api/complaints/stream`). Built on the shared
 * RealtimeStreamClient — same reconnect/backoff/token handling it always had,
 * same `connect({ siteCode, onEvent, onStateChange })` / `disconnect()` API.
 */
export const ticketsRealtimeService = new RealtimeStreamClient<TicketRealtimeEvent>({
  module: "TICKETS_REALTIME",
  path: "/api/complaints/stream",
  siteParam: "site_code",
  eventNames: [
    "ticket_created",
    "ticket_updated",
    "ticket_status_changed",
    "ticket_line_item_added",
  ],
  enabled:
    String(process.env.EXPO_PUBLIC_ENABLE_TICKETS_REALTIME ?? "true").toLowerCase() !== "false",
  parse: (data) => {
    const e = data as TicketRealtimeEvent | null;
    if (!e?.event_id || !e?.ticket_id || !e?.site_code) return null;
    return e;
  },
});

export default ticketsRealtimeService;
