/**
 * Activity timeline for the ticket detail screen.
 *
 * The design's timeline is built from real data: the ticket's own lifecycle
 * stamps (raised / assigned / responded / resolved) merged with its line items
 * (operator messages and photo uploads), newest first.
 */
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import TicketsService, { type Ticket } from "@/services/TicketsService";
import { formatIST } from "@/utils/istDate";
import { ds } from "@/constants/ds";
import { ActivityRow, SectionTitle } from "./TicketDetailUI";

interface LineItem {
  image_url?: string;
  video_url?: string;
  message_text?: string;
  created_at: string;
}

interface Entry {
  key: string;
  at: number;
  title: string;
  meta: string;
  dot: string;
}

const stamp = (value?: string | null) => {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
};

const when = (ms: number) => {
  const d = new Date(ms);
  return `${formatIST(d, { day: "numeric", month: "short" })} · ${formatIST(
    d,
    { hour: "2-digit", minute: "2-digit", hour12: false },
  )}`;
};

export function TicketActivity({ ticket }: { ticket: Ticket }) {
  const [items, setItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const ticketId = ticket.id || ticket.ticket_no;

  // The detail modal unmounts this component per ticket, so `loading` only
  // ever needs to fall from its initial true — no setState in the effect body.
  useEffect(() => {
    let alive = true;
    TicketsService.getLineItems(ticketId)
      .then((res: any) => {
        if (alive && res?.success) setItems(res.data || []);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [ticketId]);

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];

    const created = stamp(ticket.created_at);
    if (created != null) {
      out.push({
        key: "raised",
        at: created,
        title: "Ticket raised",
        meta: [when(created), ticket.created_user].filter(Boolean).join(" · "),
        dot: ds.flame[100],
      });
    }

    const responded = stamp(ticket.responded_at);
    if (responded != null) {
      out.push({
        key: "responded",
        at: responded,
        title: ticket.assigned_to
          ? `Picked up by ${ticket.assigned_to}`
          : "Work started",
        meta: when(responded),
        dot: ds.sky[100],
      });
    }

    const resolved = stamp(ticket.resolved_at);
    if (resolved != null) {
      out.push({
        key: "resolved",
        at: resolved,
        title: "Resolved",
        meta: when(resolved),
        dot: "#1F757D",
      });
    }

    items.forEach((item, i) => {
      const at = stamp(item.created_at);
      if (at == null) return;
      const isPhoto = !!item.image_url || !!item.video_url;
      out.push({
        key: `line-${i}`,
        at,
        title:
          item.message_text?.trim() ||
          (item.image_url ? "Photo attached" : "Video attached"),
        meta: when(at),
        dot: isPhoto ? ds.sky[500] : ds.carbon[900],
      });
    });

    return out.sort((a, b) => b.at - a.at);
  }, [ticket, items]);

  return (
    <View style={{ marginTop: 16 }}>
      <SectionTitle>Activity</SectionTitle>
      {loading && entries.length === 0 ? (
        <ActivityIndicator size="small" color={ds.thunder[100]} />
      ) : entries.length === 0 ? (
        <Text style={{ fontSize: 12, color: ds.carbon[500] }}>
          Nothing recorded yet
        </Text>
      ) : (
        entries.map((e, i) => (
          <ActivityRow
            key={e.key}
            title={e.title}
            meta={e.meta}
            dot={e.dot}
            line={i < entries.length - 1}
          />
        ))
      )}
    </View>
  );
}

export default TicketActivity;
