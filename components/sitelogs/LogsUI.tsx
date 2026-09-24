/**
 * Site Logs chrome — Claude Design "JouleOps Logs.dc.html".
 * The header is shared (components/shared/ListChrome); these are the pieces
 * specific to the Logs tab: the per-type overview card and the history
 * panel's filter chips.
 */
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { ArrowRight, Check, History, Plus } from "lucide-react-native";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import { soRadius, soShadow } from "@/components/home/SiteOverview";
import { typeVisual } from "@/components/sitelogs/LogHistoryCard";

export { soRadius, soShadow };

export type LogStatusFilter = "all" | "pending" | "completed";

export interface ShiftCount {
  label: string;
  pending: number;
  completed: number;
}

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
  /** Service key ("Temp RH", …) — picks the icon. */
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
  canStart: boolean;
  onStart: () => void;
  onHistory: () => void;
}) {
  const styles = useStyles();
  const ds = useDs();
  const visual = typeVisual(ds)[logName] ?? typeVisual(ds)["Temp RH"];
  const Icon = visual.icon;
  const StartIcon = continuing ? ArrowRight : Plus;
  const hasPending = pending > 0;

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={[styles.iconWell, { backgroundColor: visual.tint }]}>
          <Icon size={17} color={visual.color} strokeWidth={2.1} />
        </View>
        <View style={styles.cardTitleWrap}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {label}
          </Text>
          <Text style={styles.cardSub} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        <View style={styles.counts}>
          <CountPill
            text={`${pending} open`}
            bg={hasPending ? ds.flame[1000] : ds.carbon[1000]}
            fg={hasPending ? ds.flame[100] : ds.carbon[600]}
          />
          <CountPill
            text={`${completed} done`}
            bg={ds.sky[900]}
            fg={ds.sky[100]}
          />
        </View>
      </View>

      {shiftCounts && shiftCounts.length > 0 ? (
        <ShiftCountStrip counts={shiftCounts} style={{ marginTop: 9 }} />
      ) : null}

      <View style={styles.actions}>
        {done ? (
          <View
            style={[styles.action, styles.actionDone]}
            accessibilityRole="text"
            accessibilityLabel={`${label} completed for today`}
          >
            <Check size={15} color={ds.sky[100]} strokeWidth={2.4} />
            <Text style={[styles.actionText, { color: ds.sky[100] }]}>
              Completed
            </Text>
          </View>
        ) : canStart ? (
          <TouchableOpacity
            onPress={onStart}
            activeOpacity={0.85}
            style={[styles.action, styles.actionPrimary]}
            accessibilityRole="button"
            accessibilityLabel={`${continuing ? "Continue" : "Start"} ${label} log`}
          >
            <StartIcon size={15} color={ds.onControl} strokeWidth={2.4} />
            <Text style={[styles.actionText, { color: ds.onControl }]}>
              {continuing ? "Continue" : "Start log"}
            </Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={onHistory}
          activeOpacity={0.85}
          style={[styles.action, styles.actionSecondary]}
          accessibilityRole="button"
          accessibilityLabel={`${label} history`}
        >
          <History size={15} color={ds.carbon[400]} strokeWidth={2.1} />
          <Text style={[styles.actionText, { color: ds.carbon[400] }]}>
            History
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function CountPill({ text, bg, fg }: { text: string; bg: string; fg: string }) {
  const styles = useStyles();
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]}>{text}</Text>
    </View>
  );
}

/* ── Pending/done per shift; tappable in the history panel ─────────────── */

export function ShiftCountStrip({
  counts,
  selected,
  onSelect,
  style,
}: {
  counts: ShiftCount[];
  /** The selected shift's `label`, or null — only used when `onSelect` is set. */
  selected?: string | null;
  onSelect?: (label: string) => void;
  style?: object;
}) {
  const styles = useStyles();
  const ds = useDs();
  return (
    <View style={[styles.shiftStrip, style]}>
      {counts.map((sc, i) => {
        const on = !!onSelect && selected === sc.label;
        const body = (
          <>
            <Text style={[styles.eyebrow, on && { color: ds.onChrome }]}>
              {sc.label}
            </Text>
            <Text style={styles.shiftValue}>
              <Text
                style={{
                  color: on
                    ? ds.onChrome
                    : sc.pending > 0
                      ? ds.flame[100]
                      : ds.carbon[600],
                }}
              >
                {sc.pending}
              </Text>
              <Text
                style={{
                  color: on ? ds.onChrome : ds.carbon[800],
                  fontWeight: "500",
                }}
              >
                /
              </Text>
              <Text style={{ color: on ? ds.onChrome : ds.sky[100] }}>
                {sc.completed}
              </Text>
            </Text>
          </>
        );
        const cellStyle = [
          styles.shiftCell,
          i < counts.length - 1 && styles.shiftDivider,
          on && { backgroundColor: ds.flame[100] },
        ];
        return onSelect ? (
          <TouchableOpacity
            key={sc.label}
            onPress={() => onSelect(sc.label)}
            activeOpacity={0.85}
            style={cellStyle}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${sc.label}: ${sc.pending} open, ${sc.completed} done`}
          >
            {body}
          </TouchableOpacity>
        ) : (
          <View key={sc.label} style={cellStyle}>
            {body}
          </View>
        );
      })}
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
  const styles = useStyles();
  const ds = useDs();
  const tile = (
    key: LogStatusFilter,
    label: string,
    value: number,
    color: string,
  ) => {
    const on = key !== "all" && status === key;
    return (
      <TouchableOpacity
        key={key}
        onPress={() => onStatus(key === "all" || on ? "all" : key)}
        activeOpacity={0.85}
        style={[styles.counter, on && { borderColor: color }]}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`${value} ${label}`}
      >
        <Text style={styles.eyebrow}>{label}</Text>
        <Text style={[styles.counterValue, { color }]}>{value}</Text>
      </TouchableOpacity>
    );
  };
  return (
    <View style={styles.counterRow}>
      {tile("all", totalLabel, total, ds.carbon[100])}
      {tile("pending", "Open", pending, ds.flame[100])}
      {tile("completed", completedLabel, completed, ds.sky[100])}
    </View>
  );
}

/* ── History panel filter chip (status + shift) ─────────────────────────── */

export function FilterChip({
  label,
  on,
  tone = "control",
  onPress,
}: {
  label: string;
  on: boolean;
  /** Status chips fill with the control colour, shift chips with flame. */
  tone?: "control" | "flame";
  onPress: () => void;
}) {
  const styles = useStyles();
  const ds = useDs();
  const fill = tone === "flame" ? ds.flame[100] : ds.controlOn;
  const onText = tone === "flame" ? ds.onChrome : ds.onControl;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.chip,
        {
          backgroundColor: on ? fill : ds.white,
          borderColor: on ? fill : ds.carbon[900],
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      <Text style={[styles.chipText, { color: on ? onText : ds.carbon[400] }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const useStyles = makeThemedStyles((ds) => ({
  eyebrow: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    color: ds.carbon[600],
  },

  card: {
    backgroundColor: ds.white,
    borderRadius: soRadius.card,
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginBottom: 9,
    ...soShadow,
  },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconWell: {
    width: 32,
    height: 32,
    borderRadius: soRadius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitleWrap: { flex: 1, minWidth: 0 },
  cardTitle: {
    fontSize: 13.5,
    lineHeight: 16,
    fontWeight: "600",
    color: ds.carbon[100],
  },
  cardSub: { fontSize: 10.5, color: ds.carbon[600], marginTop: 2 },
  counts: { flexDirection: "row", alignItems: "center", gap: 5 },
  pill: { paddingVertical: 3, paddingHorizontal: 7, borderRadius: 5 },
  pillText: { fontSize: 10, fontWeight: "600", letterSpacing: 0.1 },

  shiftStrip: {
    flexDirection: "row",
    backgroundColor: ds.field,
    borderRadius: soRadius.sm,
    overflow: "hidden",
  },
  shiftCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  shiftDivider: { borderRightWidth: 1, borderRightColor: ds.fieldBorder },
  shiftValue: { fontSize: 12, lineHeight: 12, fontWeight: "700" },

  actions: { flexDirection: "row", gap: 8, marginTop: 9 },

  counterRow: { flexDirection: "row", gap: 8 },
  counter: {
    flex: 1,
    backgroundColor: ds.white,
    borderRadius: soRadius.card,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: "transparent",
    gap: 5,
    ...soShadow,
  },
  counterValue: { fontSize: 22, lineHeight: 24, fontWeight: "700" },
  action: {
    flex: 1,
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: soRadius.sm,
  },
  actionPrimary: { backgroundColor: ds.controlOn },
  actionDone: { backgroundColor: ds.sky[900] },
  actionSecondary: {
    backgroundColor: ds.white,
    borderWidth: 1,
    borderColor: ds.carbon[900],
  },
  actionText: { fontSize: 12.5, fontWeight: "600", letterSpacing: 0.13 },

  chip: {
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: soRadius.pill,
    borderWidth: 1,
  },
  chipText: { fontSize: 11, fontWeight: "600", letterSpacing: 0.22 },
}));
