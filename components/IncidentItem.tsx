/**
 * Incident list row — artboard "Incidents" card (app.dc.html incRows):
 * id · status pill · owner avatar / title / RCA stage + bar / age · asset.
 */
import React, { useCallback } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Bx } from "@/components/jo/Bx";
import { GlossFill, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import { avatarColor, initials } from "@/constants/jo";
import {
  formatAge,
  getIncidentStatus,
  isIncidentOpen,
  looksLikeId,
  rcaStage,
} from "@/components/incidents/IncidentsUI";

export interface IncidentRow {
  id: string;
  incident_id: string;
  site_code: string;
  asset_location?: string | null;
  fault_symptom: string;
  status: string;
  rca_status: string;
  incident_created_time?: string | number | null;
  assigned_to?: string[] | string | null;
}

interface IncidentItemProps {
  item: IncidentRow;
  assignee: string;
  onPress: (item: IncidentRow) => void;
  /**
   * Flag resolved incidents that still owe an RCA. Only the All tab asks for
   * it: under Resolved every row would carry it, and under In progress the
   * RCA is not due yet. The stage bar shows on every row either way.
   */
  showRcaPending?: boolean;
}

const useStyles = makeJoStyles((t) => ({
  card: {
    borderRadius: 22,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.cardBorder,
    padding: 14,
    marginBottom: 8,
  },
  top: { flexDirection: "row", alignItems: "center", gap: 6 },
  id: { ...f.t(11.5, 500), color: t.muted },
  pill: { height: 20, paddingHorizontal: 8, borderRadius: 10, justifyContent: "center" },
  pillText: { ...f.t(10.5, 600) },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  avatarText: { ...f.t(10.5, 700), color: t.onAccent },
  title: { ...f.t(14, 600), color: t.ink, lineHeight: 18, marginTop: 6 },
  rcaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  rcaLabel: { ...f.t(11.5, 600) },
  track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: t.track, overflow: "hidden" },
  meta: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 9 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { ...f.t(11.5), color: t.muted },
}));

const IncidentItem = React.memo(({ item, assignee, onPress, showRcaPending }: IncidentItemProps) => {
  const t = useJoTheme();
  const s = useStyles();
  const handlePress = useCallback(() => onPress(item), [item, onPress]);
  const status = getIncidentStatus(item.status, t);
  const stage = rcaStage(item, t);
  const rcaPending = !!showRcaPending && item.status === "Resolved" && item.rca_status !== "RCA Submitted";
  const late = isIncidentOpen(item.status);
  const area = item.asset_location || item.site_code || "—";
  const who = assignee.split(",")[0]?.trim() ?? "";
  const named = !!who && !looksLikeId(who);

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.85}
      style={s.card}
      accessibilityRole="button"
      accessibilityLabel={`${item.incident_id || "Incident"}, ${status.label}. ${item.fault_symptom}. ${stage.label}`}
    >
      <View style={s.top}>
        <Text style={s.id} numberOfLines={1}>
          {item.incident_id || "INCIDENT"}
        </Text>
        <View style={[s.pill, { backgroundColor: status.bg }]}>
          <Text style={[s.pillText, { color: status.fg }]}>{status.label}</Text>
        </View>
        {rcaPending ? (
          <View style={[s.pill, { backgroundColor: t.badTint }]}>
            <Text style={[s.pillText, { color: t.bad }]}>RCA pending</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        <View style={[s.avatar, { backgroundColor: who ? avatarColor(t, who) : t.raised }]}>
          {named ? (
            <Text style={s.avatarText}>{initials(who)}</Text>
          ) : (
            <Bx name="bx-user" size={14} color={who ? t.onAccent : t.muted} />
          )}
        </View>
      </View>

      <Text style={s.title} numberOfLines={2}>
        {item.fault_symptom || "Incident"}
      </Text>

      <View style={s.rcaRow}>
        <Text style={[s.rcaLabel, { color: stage.color }]} numberOfLines={1}>
          {stage.label}
        </Text>
        <View style={s.track}>
          <View style={{ height: "100%", borderRadius: 2, width: `${stage.pct}%`, backgroundColor: stage.color }}>
            <GlossFill color={stage.color} radius={2} />
          </View>
        </View>
      </View>

      <View style={s.meta}>
        <View style={s.metaItem}>
          <Bx name="bx-time-five" size={13} color={late ? t.bad : t.muted} />
          <Text style={[s.metaText, late && { color: t.bad }]}>{formatAge(item.incident_created_time)}</Text>
        </View>
        <View style={[s.metaItem, { flex: 1, minWidth: 0 }]}>
          <Bx name="bx-map-pin" size={13} color={t.muted} />
          <Text style={[s.metaText, { flexShrink: 1 }]} numberOfLines={1}>
            {area}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});

IncidentItem.displayName = "IncidentItem";

export default IncidentItem;
