/**
 * One PM in the list — artboard `v_pmRows` card (app.dc.html `r_pm`):
 * asset · status pill · frequency pill, the PM title, area + due line, then a
 * hairline over the assignee avatar and, for in-progress PMs, a progress bar.
 */
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Bx } from "@/components/jo/Bx";
import { Avatar, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import { toneBg, toneFg } from "@/constants/jo";
import {
  PM_TONE,
  formatPmDue,
  parsePmProgress,
  pmStatusKey,
} from "@/components/pm/PMUI";

export interface PMRow {
  id: string;
  title: string;
  asset_id?: string | null;
  location?: string | null;
  frequency?: string | null;
  status: string;
  progress?: string | null;
  assigned_to_name?: string | null;
  start_due_date?: number | null;
  completed_on?: number | null;
}

interface PMItemProps {
  instance: PMRow;
  /** Stable callback — receives the row, so the memo can compare by identity. */
  onPress: (row: PMRow) => void;
  /** Show the completed date instead of the due date. */
  showCompletedDate?: boolean;
  /** IST start of today — every row is classified against the same day. */
  todayStartMs: number;
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
  // Pills pin to the top-right while a long asset path wraps beside them.
  head: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  asset: { ...f.t(12, 600), color: t.ink, flex: 1, minWidth: 0, lineHeight: 17, paddingTop: 1.5 },
  pill: {
    height: 20,
    paddingHorizontal: 8,
    borderRadius: 10,
    justifyContent: "center",
    flexShrink: 0,
  },
  pillText: { ...f.t(10.5, 600) },
  title: { ...f.t(14, 600), color: t.ink, marginTop: 7, lineHeight: 18.5 },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 7,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minWidth: 0,
  },
  metaText: { ...f.t(11.5), color: t.muted },
  foot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 11,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: t.line,
  },
  person: { ...f.t(12), color: t.ink2, flexShrink: 1 },
  unassignedWell: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: t.raised,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  track: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: t.track,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 2, backgroundColor: t.info },
  pct: { ...f.t(11.5, 600), color: t.info },
}));

const PMItem = React.memo(
  ({ instance, onPress, showCompletedDate, todayStartMs }: PMItemProps) => {
    const t = useJoTheme();
    const s = useStyles();
    const key = pmStatusKey(instance.status, instance.start_due_date, todayStartMs);
    const tone = PM_TONE[key];
    const due = formatPmDue(
      instance.start_due_date,
      instance.completed_on,
      showCompletedDate || key === "Completed",
    );
    const percent =
      key === "In progress" ? parsePmProgress(instance.progress) : null;
    const person = (instance.assigned_to_name || "").trim();
    const frequency = (instance.frequency || "").trim();
    const area = (instance.location || "").trim();
    const dueColor = due.late && key !== "Completed" ? t.bad : t.muted;

    return (
      <TouchableOpacity
        onPress={() => onPress(instance)}
        activeOpacity={0.85}
        style={s.card}
        accessibilityRole="button"
        accessibilityLabel={[
          instance.asset_id,
          key,
          frequency,
          instance.title,
          area,
          due.label,
          person || "Unassigned",
          percent != null ? `${percent}% done` : null,
        ]
          .filter(Boolean)
          .join(", ")}
      >
        <View style={s.head}>
          {/* asset_id is the full asset path (up to ~65 chars) — wrap, don't clip. */}
          <Text style={s.asset} numberOfLines={3}>
            {instance.asset_id || "Asset"}
          </Text>
          <View style={[s.pill, { backgroundColor: toneBg(t, tone) }]}>
            <Text style={[s.pillText, { color: toneFg(t, tone) }]}>{key}</Text>
          </View>
          {frequency ? (
            <View style={[s.pill, { backgroundColor: t.muteTint }]}>
              <Text style={[s.pillText, { color: t.ink2 }]} numberOfLines={1}>
                {frequency}
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={s.title} numberOfLines={2}>
          {instance.title || "PM task"}
        </Text>

        <View style={s.meta}>
          {area ? (
            <View style={[s.metaItem, { flexShrink: 1 }]}>
              <Bx name="bx-map" size={13} color={t.muted} />
              <Text style={s.metaText} numberOfLines={1}>
                {area}
              </Text>
            </View>
          ) : null}
          <View style={[s.metaItem, { flexShrink: 0 }]}>
            <Bx name="bx-calendar" size={13} color={dueColor} />
            <Text style={[s.metaText, { color: dueColor }]} numberOfLines={1}>
              {due.label}
            </Text>
          </View>
        </View>

        <View style={s.foot}>
          {person ? (
            <Avatar name={person} size={26} textSize={10} />
          ) : (
            <View style={s.unassignedWell}>
              <Bx name="bx-user" size={14} color={t.muted} />
            </View>
          )}
          <Text
            style={[s.person, !person && { color: t.faint }]}
            numberOfLines={1}
          >
            {person || "Unassigned"}
          </Text>
          {percent != null ? (
            <>
              <View style={s.track}>
                <View style={[s.fill, { width: `${percent}%` }]} />
              </View>
              <Text style={s.pct}>{percent}%</Text>
            </>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  },
  (prev, next) =>
    prev.instance.id === next.instance.id &&
    prev.instance.status === next.instance.status &&
    prev.instance.progress === next.instance.progress &&
    prev.instance.assigned_to_name === next.instance.assigned_to_name &&
    prev.instance.start_due_date === next.instance.start_due_date &&
    prev.instance.completed_on === next.instance.completed_on &&
    prev.instance.title === next.instance.title &&
    prev.instance.location === next.instance.location &&
    prev.instance.frequency === next.instance.frequency &&
    prev.instance.asset_id === next.instance.asset_id &&
    prev.showCompletedDate === next.showCompletedDate &&
    prev.todayStartMs === next.todayStartMs &&
    prev.onPress === next.onPress,
);

PMItem.displayName = "PMItem";

export default PMItem;
