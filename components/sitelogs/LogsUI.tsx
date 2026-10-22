/**
 * Site Logs hub pieces — "JouleOps App" artboard, site logs screen: the
 * per-type card (tinted icon well, pending / done in Bricolage, shift chips,
 * Start log + History) and the history panel's counters and filter chips.
 */
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Bx } from "@/components/jo/Bx";
import { GlossFill, Card, f, useJoTheme } from "@/components/jo/ui";
import { ShiftCells, typeLook, type ShiftCount } from "@/components/sitelogs/LogsKit";

export type { ShiftCount };

export type LogStatusFilter = "all" | "pending" | "completed";

/* ── One log type: today's pending/done, shift split, Start + History ───── */

export function LogTypeCard({
  logName,
  label,
  sub,
  pending,
  completed,
  shiftCounts,
  continuing,
  done,
  canStart,
  onStart,
  onHistory,
}: {
  /** Service key ("Temp RH", …) — picks the icon and tint. */
  logName: string;
  label: string;
  sub: string;
  pending: number;
  completed: number;
  /** Temp & RH only — omit for the single-shift logs. */
  shiftCounts?: ShiftCount[];
  continuing?: boolean;
  /** Everything owed today is logged — Start gives way to a static "Completed". */
  done?: boolean;
  /** False in view-only mode (no attendance session). */
  canStart: boolean;
  onStart: () => void;
  onHistory: () => void;
}) {
  const t = useJoTheme();
  const look = typeLook(t, logName);
  const hasPending = pending > 0;

  const btn = {
    flex: 1,
    height: 42,
    borderRadius: 21,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
  };

  return (
    <Card style={{ padding: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: look.bg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Bx name={look.icon} size={20} color={look.fg} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[f.t(14.5, 600), { color: t.ink }]} numberOfLines={1}>
            {label}
          </Text>
          <Text style={[f.t(11.5), { color: t.muted, marginTop: 2 }]} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        <View
          style={{ flexDirection: "row", alignItems: "baseline", gap: 2 }}
          accessible
          accessibilityLabel={`${pending} pending, ${completed} completed`}
        >
          <Text style={[f.d(24, -0.03, 1.1), { color: hasPending ? t.bad : t.faint }]}>{pending}</Text>
          <Text style={[f.t(13), { color: t.faint }]}>/</Text>
          <Text style={[f.d(16, -0.02, 1.1), { color: t.ok }]}>{completed}</Text>
        </View>
      </View>

      {shiftCounts && shiftCounts.length > 0 ? <ShiftCells counts={shiftCounts} style={{ marginTop: 12 }} /> : null}

      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        {done ? (
          <View
            style={[btn, { backgroundColor: t.okTint }]}
            accessibilityRole="text"
            accessibilityLabel={`${label} completed for today`}
          >
            <Bx name="bx-check" size={17} color={t.ok} />
            <Text style={[f.t(13, 700), { color: t.ok }]}>Completed</Text>
          </View>
        ) : canStart ? (
          <TouchableOpacity
            onPress={onStart}
            activeOpacity={0.85}
            style={[btn, { backgroundColor: hasPending ? t.accent : t.raised }]}
            accessibilityRole="button"
            accessibilityLabel={`${continuing ? "Continue" : "Start"} ${label} log`}
          >
            {hasPending ? <GlossFill color={t.accent} fg={t.onAccent} radius={21} /> : null}
            <Bx
              name={continuing ? "bx-right-arrow-alt" : "bx-plus"}
              size={17}
              color={hasPending ? t.onAccent : t.ink2}
            />
            <Text style={[f.t(13, 700), { color: hasPending ? t.onAccent : t.ink2 }]}>
              {continuing ? "Continue" : "Start log"}
            </Text>
          </TouchableOpacity>
        ) : (
          <View
            style={[btn, { backgroundColor: t.raised, opacity: 0.7 }]}
            accessibilityRole="text"
            accessibilityLabel="View only — start your day to log readings"
          >
            <Bx name="bx-lock-alt" size={15} color={t.muted} />
            <Text style={[f.t(13, 600), { color: t.muted }]}>View only</Text>
          </View>
        )}
        <TouchableOpacity
          onPress={onHistory}
          activeOpacity={0.85}
          style={[btn, { backgroundColor: t.raised, borderWidth: 1, borderColor: t.lineMid }]}
          accessibilityRole="button"
          accessibilityLabel={`${label} history`}
        >
          <Bx name="bx-history" size={16} color={t.ink} />
          <Text style={[f.t(13, 600), { color: t.ink }]}>History</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
}

/** "● Pending   ● Completed" key under the cards. */
export function PendingLegend() {
  const t = useJoTheme();
  const item = (color: string, label: string) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={[f.t(11.5), { color: t.muted }]}>{label}</Text>
    </View>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 14, marginTop: 12 }}>
      {item(t.bad, "Pending")}
      {item(t.ok, "Completed")}
    </View>
  );
}

/* ── History counters: total / pending / completed, doubling as filter ─── */

export function HistoryCounters({
  total,
  pending,
  completed,
  totalLabel = "Total",
  completedLabel = "Completed",
  status,
  onStatus,
}: {
  total: number;
  pending: number;
  completed: number;
  totalLabel?: string;
  completedLabel?: string;
  status: LogStatusFilter;
  onStatus: (next: LogStatusFilter) => void;
}) {
  const t = useJoTheme();
  const tile = (key: LogStatusFilter, label: string, value: number, color: string) => {
    const on = key !== "all" && status === key;
    return (
      <TouchableOpacity
        key={key}
        onPress={() => onStatus(key === "all" || on ? "all" : key)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`${value} ${label}`}
        style={{
          flex: 1,
          minWidth: 0,
          borderRadius: 22,
          backgroundColor: t.card,
          borderWidth: 1.5,
          borderColor: on ? color : t.cardBorder,
          paddingVertical: 12,
          paddingHorizontal: 14,
          gap: 4,
        }}
      >
        <Text style={[f.t(11.5, 500), { color: t.muted }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[f.d(24, -0.03, 1.1), { color }]}>{value}</Text>
      </TouchableOpacity>
    );
  };
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {tile("all", totalLabel, total, t.ink)}
      {tile("pending", "Open", pending, t.bad)}
      {tile("completed", completedLabel, completed, t.ok)}
    </View>
  );
}

/* ── Filter chip (status + shift + date presets) ───────────────────────── */

export function FilterChip({
  label,
  on,
  onPress,
}: {
  label: string;
  on: boolean;
  /** Kept for call-site compatibility; every chip now selects to ink. */
  tone?: "control" | "flame";
  onPress: () => void;
}) {
  const t = useJoTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={{
        height: 34,
        paddingHorizontal: 13,
        borderRadius: 17,
        justifyContent: "center",
        backgroundColor: on ? t.selBg : t.sheetField,
        borderWidth: 1,
        borderColor: on ? t.selBg : t.lineMid,
      }}
    >
      {on ? <GlossFill color={t.selBg} fg={t.selFg} radius={17} bleed={1} /> : null}
      <Text style={[f.t(12.5, 600), { color: on ? t.selFg : t.ink2 }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
