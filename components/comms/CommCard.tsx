/**
 * One entry in the comms list — artboard `v_ccRows` card: tinted type icon,
 * type + ref, priority pill, 2-line title, "from" line, then a hairline and
 * status pill · owner · due.
 */
import React, { memo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Calendar, Check, CircleAlert, Speech } from "@/components/jo/bxIcons";
import { toneBg, toneFg } from "@/constants/jo";
import { StatusPill, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import type { CommRow } from "@/services/CustomerCommunicationService";
import {
  dueOf,
  priorityTone,
  splitList,
  statusOf,
  statusTone,
  streamOf,
  titleOf,
  typeDef,
} from "./lib";

const useStyles = makeJoStyles((t) => ({
  card: {
    borderRadius: 22,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.cardBorder,
    padding: 14,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 8 },
  typeWell: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  type: { ...f.t(12, 600), flexShrink: 1 },
  ref: { ...f.t(11.5), color: t.faint, flexShrink: 0 },
  prio: {
    height: 20,
    paddingHorizontal: 8,
    borderRadius: 10,
    justifyContent: "center",
    flexShrink: 0,
  },
  prioText: { ...f.t(10.5, 600) },
  title: { ...f.t(14, 600), color: t.ink, lineHeight: 18.5, marginTop: 9 },
  from: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  fromText: { ...f.t(11.5), color: t.muted, flex: 1 },
  foot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 11,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: t.line,
  },
  owner: { ...f.t(11.5), color: t.ink3, flex: 1, minWidth: 0 },
  due: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 0 },
  dueText: { ...f.t(11.5, 600) },
}));

/** Owner text: the assignee and the first owner team ("+n" for more). */
export function ownerLine(row: CommRow): string {
  const teams = splitList(row.owner);
  const team = teams.length > 1 ? `${teams[0]} +${teams.length - 1}` : teams[0];
  const parts = [row.assignee, team].filter((x): x is string => !!x && !!x.trim());
  if (parts.length) return parts.join(" · ");
  return streamOf(row) === "action" ? "Unassigned" : "For the record";
}

export function fromLine(row: CommRow): string {
  return [row.input_from, row.role_of_person].filter((x) => !!x && !!String(x).trim()).join(" · ") || "—";
}

export const CommCard = memo(function CommCard({
  row,
  today,
  onPress,
}: {
  row: CommRow;
  today: string;
  onPress: (row: CommRow) => void;
}) {
  const t = useJoTheme();
  const s = useStyles();
  const types = splitList(row.communication_type);
  const type = typeDef(types[0]);
  const typeLabel = types.length > 1 ? `${type.key} +${types.length - 1}` : type.key;
  const TypeIcon = type.icon;
  const typeFg = toneFg(t, type.tone);
  const status = statusOf(row);
  const due = dueOf(row, today);
  const pTone = priorityTone(row.priority);
  const critical = row.priority === "Critical";
  const dueColor = due.kind === "overdue" ? t.bad : due.kind === "soon" ? t.warn : t.muted;
  const DueIcon = due.kind === "overdue" ? CircleAlert : due.kind === "done" ? Check : Calendar;
  const title = titleOf(row);

  return (
    <TouchableOpacity
      onPress={() => onPress(row)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${row.cc_id || "Entry"}, ${typeLabel}${row.priority ? `, ${row.priority} priority` : ""}, ${title}, ${status}, ${due.label}`}
      style={s.card}
    >
      <View style={s.head}>
        <View style={[s.typeWell, { backgroundColor: toneBg(t, type.tone) }]}>
          <TypeIcon size={15} color={typeFg} />
        </View>
        <Text style={[s.type, { color: typeFg }]} numberOfLines={1}>
          {typeLabel}
        </Text>
        {row.cc_id ? <Text style={s.ref}>{row.cc_id}</Text> : null}
        <View style={{ flex: 1 }} />
        {row.priority ? (
          <View style={[s.prio, { backgroundColor: critical ? t.bad : toneBg(t, pTone) }]}>
            <Text style={[s.prioText, { color: critical ? t.onAccent : toneFg(t, pTone) }]}>{row.priority}</Text>
          </View>
        ) : null}
      </View>
      <Text style={s.title} numberOfLines={2}>
        {title}
      </Text>
      <View style={s.from}>
        <Speech size={14} color={t.muted} />
        <Text style={s.fromText} numberOfLines={1}>
          {fromLine(row)}
        </Text>
      </View>
      <View style={s.foot}>
        <StatusPill label={status} tone={statusTone(status)} />
        <Text style={s.owner} numberOfLines={1}>
          {ownerLine(row)}
        </Text>
        <View style={s.due}>
          <DueIcon size={13} color={dueColor} />
          <Text style={[s.dueText, { color: dueColor }]}>{due.label}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
});
