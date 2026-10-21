/**
 * Activity timeline for the incident detail's "Activity" step.
 *
 * An incident has no event log of its own, so the feed is derived from the
 * lifecycle stamps the row already carries (raised / responded / resolved /
 * RCA filed) plus its attachments, newest first. Deriving it keeps the screen
 * working offline and costs no extra request — the trade-off is that
 * attachments are not individually timestamped, so they are grouped into one
 * entry rather than placed on the minute they were added.
 */
import React, { useMemo } from "react";
import { Text, View } from "react-native";
import { formatIST } from "@/utils/istDate";
import { Bx, type BxName } from "@/components/jo/Bx";
import { EmptyState, f, useJoTheme } from "@/components/jo/ui";
import IncAttachments from "./IncAttachments";
import { toMs } from "./IncidentsUI";

interface Entry {
  key: string;
  at: number;
  title: string;
  meta: string;
  color: string;
  tint: string;
  icon: BxName;
  remarks?: string;
  files?: string[];
}

const when = (ms: number) => {
  const d = new Date(ms);
  return `${formatIST(d, { day: "numeric", month: "short" })} · ${formatIST(d, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`;
};

const noop = (() => {}) as React.Dispatch<React.SetStateAction<string[]>>;

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
  const t = useJoTheme();

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    const who = (id?: string | null) => (id ? nameOf(String(id)) : "");

    const created = toMs(incident.incident_created_time);
    if (created != null) {
      out.push({
        key: "raised",
        at: created,
        title: "Incident raised",
        // Who logged it; legacy rows without created_by fall back to raised_by.
        meta: [when(created), who(incident.created_by || incident.raised_by)].filter(Boolean).join(" · "),
        color: t.bad,
        tint: t.badTint,
        icon: "bx-error-circle",
      });
    }

    const responded = toMs(incident.incident_updated_time);
    if (responded != null) {
      const assignee = Array.isArray(incident.assigned_to) ? incident.assigned_to[0] : incident.assigned_to;
      out.push({
        key: "responded",
        at: responded,
        title: assignee ? `In progress · ${who(assignee)}` : "In progress",
        meta: when(responded),
        color: t.info,
        tint: t.infoTint,
        icon: "bx-wrench",
      });
    }

    const resolved = toMs(incident.incident_resolved_time);
    if (resolved != null) {
      out.push({
        key: "resolved",
        at: resolved,
        title: "Resolved",
        meta: when(resolved),
        color: t.ok,
        tint: t.okTint,
        icon: "bx-check",
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
        color: t.mute,
        tint: t.muteTint,
        icon: "bx-paperclip",
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
        color: t.accentInk,
        tint: t.accentTint,
        icon: "bx-search-alt",
        files: rcaAttachments,
      });
    }

    return out.sort((a, b) => b.at - a.at);
  }, [incident, attachments, rcaAttachments, nameOf, t]);

  if (entries.length === 0) {
    return <EmptyState icon="bx-time-five" title="Nothing recorded yet" sub="Status changes and files show here." />;
  }

  return (
    <View
      style={{
        borderRadius: 26,
        backgroundColor: t.card,
        borderWidth: 1,
        borderColor: t.cardBorder,
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 4,
      }}
    >
      {entries.map((e, i) => {
        const last = i === entries.length - 1;
        return (
          <View key={e.key} style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ alignItems: "center", width: 30 }}>
              <View
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  backgroundColor: e.tint,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Bx name={e.icon} size={15} color={e.color} />
              </View>
              {!last ? <View style={{ flex: 1, width: 1.5, backgroundColor: t.line, marginVertical: 4 }} /> : null}
            </View>
            <View style={{ flex: 1, minWidth: 0, paddingBottom: 16, paddingTop: 5 }}>
              <Text style={[f.t(13.5, 600), { color: t.ink }]}>{e.title}</Text>
              <Text style={[f.t(11.5), { color: t.muted, marginTop: 2 }]}>{e.meta}</Text>
              {e.remarks ? (
                <Text style={[f.t(12.5), { color: t.ink2, marginTop: 6, lineHeight: 18 }]}>{e.remarks}</Text>
              ) : null}
              {e.files && e.files.length > 0 ? (
                <IncAttachments existing={e.files} pending={[]} onChangePending={noop} readOnly />
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
