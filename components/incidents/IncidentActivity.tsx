/**
 * Activity timeline for the incident detail screen — the incident counterpart
 * of tickets/TicketActivity.
 *
 * An incident has no event log of its own, so the feed is derived from the
 * lifecycle stamps the row already carries (raised / responded / resolved /
 * RCA filed) plus its attachments, newest first. Deriving it keeps the screen
 * working offline and costs no extra request — the trade-off is that attachments
 * are not individually timestamped, so they are grouped into one entry rather
 * than placed on the minute they were added.
 */
import React, { useMemo } from "react";
import { Text, View } from "react-native";
import { formatIST } from "@/utils/istDate";
import { useDs } from "@/hooks/useDs";
import { ActivityRow, SectionTitle } from "@/components/tickets/TicketDetailUI";
import AttachmentField from "@/components/AttachmentField";

interface Entry {
  key: string;
  at: number;
  title: string;
  meta: string;
  dot: string;
  remarks?: string;
  files?: string[];
}

const toMs = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const ms = typeof v === "number" ? v : Date.parse(String(v));
  return Number.isNaN(ms) ? null : ms;
};

const when = (ms: number) => {
  const d = new Date(ms);
  return `${formatIST(d, { day: "numeric", month: "short" })} · ${formatIST(d, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;
};

const noop = () => {};

export default function IncidentActivity({
  incident,
  attachments,
  rcaAttachments,
  nameOf,
}: {
  incident: any;
  /** Saved (remote) incident photos. */
  attachments: string[];
  /** Saved RCA files. */
  rcaAttachments: string[];
  /** user_id → display name; falls back to the id. */
  nameOf: (id: string) => string;
}) {
  const ds = useDs();

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    const who = (id?: string | null) => (id ? nameOf(String(id)) : "");

    const created = toMs(incident.incident_created_time);
    if (created != null) {
      out.push({
        key: "raised",
        at: created,
        title: "Incident raised",
        meta: [when(created), who(incident.raised_by)].filter(Boolean).join(" · "),
        dot: ds.flame[100],
      });
    }

    const responded = toMs(incident.incident_updated_time);
    if (responded != null) {
      const assignee = Array.isArray(incident.assigned_to)
        ? incident.assigned_to[0]
        : incident.assigned_to;
      out.push({
        key: "responded",
        at: responded,
        title: assignee ? `In progress · ${who(assignee)}` : "In progress",
        meta: when(responded),
        dot: ds.sky[100],
      });
    }

    const resolved = toMs(incident.incident_resolved_time);
    if (resolved != null) {
      out.push({
        key: "resolved",
        at: resolved,
        title: "Resolved",
        meta: when(resolved),
        dot: ds.sky[100],
        remarks: String(incident.remarks || "").trim() || undefined,
      });
    }

    // Photos are not individually timestamped — group them just after the
    // incident was raised, which is when the bulk are taken.
    if (attachments.length > 0 && created != null) {
      out.push({
        key: "photos",
        at: created + 1,
        title: `${attachments.length} attachment${attachments.length === 1 ? "" : "s"}`,
        meta: "Added with the incident",
        dot: ds.sky[500],
        files: attachments,
      });
    }

    if (rcaAttachments.length > 0) {
      // No dedicated RCA timestamp exists; `updated_at` is the last write and
      // an RCA filing is the final write in an incident's life.
      const filedAt = toMs(incident.updated_at) ?? resolved ?? created ?? 0;
      out.push({
        key: "rca",
        at: filedAt,
        title: "RCA filed",
        meta: [when(filedAt), who(incident.rca_maker)].filter(Boolean).join(" · "),
        dot: ds.thunder[100],
        files: rcaAttachments,
      });
    }

    return out.sort((a, b) => b.at - a.at);
  }, [incident, attachments, rcaAttachments, nameOf, ds]);

  return (
    <View style={{ marginTop: 16, marginBottom: 8 }}>
      <SectionTitle>Activity</SectionTitle>
      {entries.length === 0 ? (
        <Text style={{ fontSize: 12, color: ds.carbon[500] }}>Nothing recorded yet</Text>
      ) : (
        entries.map((e, i) => (
          <ActivityRow
            key={e.key}
            title={e.title}
            meta={e.meta}
            dot={e.dot}
            line={i < entries.length - 1}
          >
            {e.remarks ? (
              <Text style={{ fontSize: 12, color: ds.carbon[200], marginTop: 5 }}>
                {e.remarks}
              </Text>
            ) : null}
            {e.files && e.files.length > 0 ? (
              <AttachmentField
                title=""
                existing={e.files}
                pending={[]}
                onChangePending={noop as never}
                readOnly
              />
            ) : null}
          </ActivityRow>
        ))
      )}
    </View>
  );
}
