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
import { Card, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";

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

/** One timeline row: 10px dot on a 1.5px rail, 13/500 title, 11.5 grey meta. */
function ActivityRow({
  title,
  meta,
  dot,
  line,
}: {
  title: string;
  meta: string;
  dot: string;
  line: boolean;
}) {
  const s = useStyles();
  return (
    <View style={s.row}>
      <View style={s.rail}>
        <View style={[s.dot, { backgroundColor: dot }]} />
        {line ? <View style={s.railLine} /> : null}
      </View>
      <View style={s.rowBody}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.meta}>{meta}</Text>
      </View>
    </View>
  );
}

/** Artboard "Activity" card (radius 26, padding 16) — newest first. */
export function TicketActivity({ ticket }: { ticket: Ticket }) {
  const t = useJoTheme();
  const s = useStyles();
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
        dot: t.bad,
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
        dot: t.info,
      });
    }

    const resolved = stamp(ticket.resolved_at);
    if (resolved != null) {
      out.push({
        key: "resolved",
        at: resolved,
        title: "Resolved",
        meta: when(resolved),
        dot: t.ok,
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
        dot: isPhoto ? t.info : t.muted,
      });
    });

    return out.sort((a, b) => b.at - a.at);
  }, [ticket, items, t]);

  return (
    <Card style={s.card}>
      <Text style={s.cardTitle}>Activity</Text>
      <View style={s.list}>
        {loading && entries.length === 0 ? (
          <ActivityIndicator size="small" color={t.muted} style={{ alignSelf: "flex-start" }} />
        ) : entries.length === 0 ? (
          <Text style={s.empty}>Nothing recorded yet</Text>
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
    </Card>
  );
}

const useStyles = makeJoStyles((t) => ({
  card: { padding: 16, marginTop: 10 },
  cardTitle: { ...f.t(15, 600), color: t.ink },
  list: { marginTop: 12 },
  empty: { ...f.t(12.5), color: t.muted },
  row: { flexDirection: "row", gap: 12 },
  rail: { width: 12, alignItems: "center" },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  railLine: { flex: 1, width: 1.5, backgroundColor: t.track, marginVertical: 4 },
  rowBody: { flex: 1, minWidth: 0, paddingBottom: 14 },
  title: { ...f.t(13, 500), color: t.ink },
  meta: { ...f.t(11.5), color: t.muted, marginTop: 2 },
}));

export default TicketActivity;
