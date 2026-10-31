/**
 * Site-log history row — "JouleOps App" list language: #141418 card, tinted
 * type icon, status pill, meta line, then the readings in raised cells.
 *
 * Readings come from the app's own columns: Temp & RH → temperature / rh,
 * Water → pH / TDS / hardness, Chemical → chemical_dosing, Chiller → the
 * chiller_readings shape.
 */
import React from "react";
import { Text, View } from "react-native";
import { Bx } from "@/components/jo/Bx";
import { Card, StatusPill, f, useJoTheme } from "@/components/jo/ui";
import { formatIST, istRelativeDayLabel } from "@/utils/istDate";
import { statusLook, typeLook } from "@/components/sitelogs/LogsKit";

/** Legacy rows use "In-progress"/"in_progress"; an empty status means logged. */
export const normaliseLogStatus = (raw?: string | null) => {
  const s = String(raw ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  if (s === "completed" || s === "") return "Completed";
  if (s === "inprogress") return "Inprogress";
  return "Pending";
};

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
      // A room nobody could enter has no reading; say so rather than "—".
      if (row.no_access === true) {
        return [
          { label: "Temp", value: "No access" },
          { label: "RH", value: "No access" },
        ];
      }
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
      // chiller_readings has no supply/return/load columns — these are the
      // real ones, labelled as the entry form and web labels them.
      return [
        { label: "Evap. In", value: show(row.evaporator_inlet_temp, "°C") },
        { label: "Evap. Out", value: show(row.evaporator_outlet_temp, "°C") },
        { label: "Load", value: show(row.compressor_load_percentage, "%") },
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

/** 24h clock in IST — never the device timezone. */
const timeLabel = (input: unknown) =>
  formatIST(input as any, { hour: "2-digit", minute: "2-digit", hour12: false });

/**
 * The day, relative where that reads better: the three days around now are
 * "Today" / "Yesterday" / "Tomorrow", everything older falls back to a date.
 */
const whenLabel = (logName: string, row: any) => {
  if (logName === "Chiller Logs") {
    const ms = row.reading_time || row.created_at;
    return ms ? `${istRelativeDayLabel(ms)} · ${timeLabel(ms)}` : "—";
  }
  if (row.scheduled_date) {
    const entry = row.entry_time ? ` · ${timeLabel(row.entry_time)}` : "";
    return `${istRelativeDayLabel(row.scheduled_date)}${entry}`;
  }
  return row.created_at ? `${istRelativeDayLabel(row.created_at)} · ${timeLabel(row.created_at)}` : "—";
};

export const LogHistoryCard = React.memo(
  ({ item, logName, onPress }: { item: any; logName: string; onPress: () => void }) => {
    const t = useJoTheme();
    const look = typeLook(t, logName);
    const status = statusLook(normaliseLogStatus(item.status));
    const readings = readingsFor(logName, item);
    const shift = shiftLabelToName(item.shift_label);
    const person = item.assigned_to || item.executor_id || "Unassigned";
    const name =
      logName === "Chiller Logs"
        ? item.asset_name || item.chiller_id || "Chiller"
        : item.task_name || "Untitled point";

    return (
      <Card
        onPress={onPress}
        radius={22}
        accessibilityLabel={`${name}, ${status.label}`}
        style={{ paddingVertical: 14, paddingHorizontal: 14, marginBottom: 8 }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: look.bg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Bx name={look.icon} size={19} color={look.fg} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
              <Text style={[f.t(14.5, 600), { color: t.ink, flex: 1, minWidth: 0 }]} numberOfLines={2}>
                {name}
              </Text>
              <StatusPill label={status.label} tone={status.tone} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
              <Text style={[f.t(11.5, 500), { color: t.ink3 }]}>{whenLabel(logName, item)}</Text>
              {shift ? (
                <View style={{ height: 20, paddingHorizontal: 8, borderRadius: 10, backgroundColor: t.raised, justifyContent: "center" }}>
                  <Text style={[f.t(10.5, 600), { color: t.ink2 }]}>{shift}</Text>
                </View>
              ) : null}
              <Text style={[f.t(11.5), { color: t.faint }]}>·</Text>
              <Text style={[f.t(11.5), { color: t.muted, flexShrink: 1 }]} numberOfLines={1}>
                {person}
              </Text>
            </View>
          </View>
        </View>

        {readings.length > 0 ? (
          <View style={{ flexDirection: "row", gap: 6, marginTop: 12 }}>
            {readings.map((r) => (
              <View
                key={r.label}
                style={{ flex: 1, minWidth: 0, borderRadius: 14, backgroundColor: t.raised, paddingVertical: 8, paddingHorizontal: 10 }}
              >
                <Text style={[f.t(11, 500), { color: t.muted }]} numberOfLines={1}>
                  {r.label}
                </Text>
                <Text
                  style={[f.d(16, -0.02, 1.2), { color: r.value === "—" ? t.faint : t.ink, marginTop: 2 }]}
                  numberOfLines={1}
                >
                  {r.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </Card>
    );
  },
);

LogHistoryCard.displayName = "LogHistoryCard";

export default LogHistoryCard;
