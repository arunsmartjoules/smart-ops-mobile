/**
 * Site-log history card — Claude Design "JouleOps Logs.dc.html".
 *
 * Readings come from the app's own columns, not the mock's sample fields:
 * Temp & RH → temperature / rh, Water → pH / TDS / hardness, Chemical →
 * chemical_dosing, Chiller → the chiller_readings shape.
 */
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import {
  Droplets,
  FlaskRound,
  Snowflake,
  Thermometer,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { format } from "date-fns";
import { makeThemedStyles, useDs, type DsTheme } from "@/hooks/useDs";
import { soRadius, soShadow } from "@/components/home/SiteOverview";

const statusMap = (
  ds: DsTheme,
): Record<string, { label: string; bg: string; fg: string }> => ({
  Pending: { label: "Pending", bg: ds.flame[1000], fg: ds.flame[100] },
  Inprogress: { label: "In progress", bg: ds.sky[1000], fg: ds.sky[100] },
  Completed: {
    label: "Completed",
    bg: ds.sky[900],
    fg: ds.isDark ? ds.sky[100] : "#1F757D",
  },
});

/** Legacy rows use "In-progress"/"in_progress"; an empty status means logged. */
export const normaliseLogStatus = (raw?: string | null) => {
  const s = String(raw ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  if (s === "completed" || s === "") return "Completed";
  if (s === "inprogress") return "Inprogress";
  return "Pending";
};

const typeVisual = (
  ds: DsTheme,
): Record<string, { icon: LucideIcon; tint: string; color: string }> => ({
  "Temp RH": { icon: Thermometer, tint: ds.flame[1000], color: ds.flame[100] },
  "Chiller Logs": { icon: Snowflake, tint: ds.flame[1000], color: ds.flame[100] },
  Water: { icon: Droplets, tint: ds.sky[1000], color: ds.sky[100] },
  "Chemical Dosing": { icon: FlaskRound, tint: ds.sky[1000], color: ds.sky[100] },
});

interface Reading {
  label: string;
  value: string;
}

const show = (v: unknown, unit?: string) => {
  if (v == null || String(v).trim() === "") return "—";
  return unit ? `${v} ${unit}` : String(v);
};

/** The readings strip, per log type, from real columns. */
function readingsFor(logName: string, row: any): Reading[] {
  switch (logName) {
    case "Temp RH":
      return [
        { label: "Temp", value: show(row.temperature, "°C") },
        { label: "RH", value: show(row.rh, "%") },
      ];
    case "Water":
      return [
        { label: "pH", value: show(row.ph) },
        { label: "TDS", value: show(row.tds, "ppm") },
        { label: "Hardness", value: show(row.hardness) },
      ];
    case "Chemical Dosing":
      return [{ label: "Dosing", value: show(row.chemical_dosing) }];
    case "Chiller Logs":
      return [
        { label: "Supply", value: show(row.supply_temp ?? row.chilled_water_supply_temp, "°C") },
        { label: "Return", value: show(row.return_temp ?? row.chilled_water_return_temp, "°C") },
        { label: "Load", value: show(row.load_percentage ?? row.load, "%") },
      ];
    default:
      return [];
  }
}

/** "1/3" → "Shift A". */
export const shiftLabelToName = (label?: string | null) => {
  const s = String(label ?? "").trim();
  if (s === "1/3") return "Shift A";
  if (s === "2/3") return "Shift B";
  if (s === "3/3") return "Shift C";
  return s || null;
};

const whenLabel = (logName: string, row: any) => {
  if (logName === "Chiller Logs") {
    const ms = row.reading_time || row.created_at;
    return ms ? format(new Date(ms), "d MMM · HH:mm") : "—";
  }
  if (row.scheduled_date) {
    const entry = row.entry_time ? ` · ${format(new Date(row.entry_time), "HH:mm")}` : "";
    return `${row.scheduled_date}${entry}`;
  }
  return row.created_at ? format(new Date(row.created_at), "d MMM · HH:mm") : "—";
};

export const LogHistoryCard = React.memo(
  ({
    item,
    logName,
    onPress,
  }: {
    item: any;
    logName: string;
    onPress: () => void;
  }) => {
    const styles = useStyles();
    const ds = useDs();
    const TYPE_VISUAL = typeVisual(ds);
    const visual = TYPE_VISUAL[logName] ?? TYPE_VISUAL["Temp RH"];
    const Icon = visual.icon;
    const status = statusMap(ds)[normaliseLogStatus(item.status)];
    const readings = readingsFor(logName, item);
    const shift = shiftLabelToName(item.shift_label);
    const person = item.assigned_to || item.executor_id || "Unassigned";
    const name =
      logName === "Chiller Logs"
        ? item.asset_name || item.chiller_id || "Chiller"
        : item.task_name || "Untitled point";

    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.iconWell, { backgroundColor: visual.tint }]}>
            <Icon size={16} color={visual.color} strokeWidth={2.1} />
          </View>

          <View style={styles.body}>
            <View style={styles.titleRow}>
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              <View style={[styles.badge, { backgroundColor: status.bg }]}>
                <Text style={[styles.badgeText, { color: status.fg }]}>
                  {status.label}
                </Text>
              </View>
            </View>

            <View style={styles.metaRow}>
              <Text style={styles.when}>{whenLabel(logName, item)}</Text>
              {shift ? (
                <View style={styles.shiftBadge}>
                  <Text style={styles.shiftBadgeText}>{shift}</Text>
                </View>
              ) : null}
              <Text style={styles.dotSep}>·</Text>
              <Text style={styles.person} numberOfLines={1}>
                {person}
              </Text>
            </View>
          </View>
        </View>

        {readings.length > 0 ? (
          <View style={styles.readings}>
            {readings.map((r, i) => (
              <View
                key={r.label}
                style={[
                  styles.reading,
                  i < readings.length - 1 && styles.readingDivider,
                ]}
              >
                <Text style={styles.readingLabel}>{r.label}</Text>
                <Text
                  style={[
                    styles.readingValue,
                    r.value === "—" && { color: ds.carbon[800] },
                  ]}
                >
                  {r.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </TouchableOpacity>
    );
  },
);

LogHistoryCard.displayName = "LogHistoryCard";

const useStyles = makeThemedStyles((ds) => ({
  card: {
    backgroundColor: ds.white,
    borderRadius: soRadius.card,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 7,
    ...soShadow,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 11 },
  iconWell: {
    width: 34,
    height: 34,
    borderRadius: soRadius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  body: { flex: 1, minWidth: 0 },

  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 4,
  },
  name: {
    flex: 1,
    minWidth: 0,
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "600",
    color: ds.carbon[100],
  },
  badge: { paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4 },
  badgeText: {
    fontSize: 8.5,
    fontWeight: "600",
    letterSpacing: 0.68,
    textTransform: "uppercase",
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  when: { fontSize: 10.5, fontWeight: "500", color: ds.carbon[400] },
  shiftBadge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    backgroundColor: ds.carbon[1000],
  },
  shiftBadgeText: {
    fontSize: 8.5,
    fontWeight: "600",
    letterSpacing: 0.68,
    textTransform: "uppercase",
    color: ds.carbon[400],
  },
  dotSep: { color: ds.carbon[800] },
  person: { flexShrink: 1, fontSize: 10.5, color: ds.carbon[600] },

  readings: {
    flexDirection: "row",
    marginTop: 10,
    backgroundColor: ds.field,
    borderRadius: soRadius.sm,
    overflow: "hidden",
  },
  reading: { flex: 1, paddingVertical: 8, paddingHorizontal: 12 },
  readingDivider: { borderRightWidth: 1, borderRightColor: ds.fieldBorder },
  readingLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    color: ds.carbon[600],
    marginBottom: 3,
  },
  readingValue: {
    fontSize: 13,
    lineHeight: 13,
    fontWeight: "700",
    color: ds.carbon[100],
  },
}));

export default LogHistoryCard;
