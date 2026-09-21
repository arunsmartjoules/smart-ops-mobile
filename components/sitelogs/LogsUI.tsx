/**
 * Site Logs chrome — Claude Design "JouleOps Logs.dc.html".
 * The header and status tabs are shared (components/shared/ListChrome); these
 * are the pieces specific to the Logs tab.
 */
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  cubicBezier,
  useReducedMotion,
} from "react-native-reanimated";
import { Check, Plus, ArrowRight } from "lucide-react-native";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import { soRadius, soShadow } from "@/components/home/SiteOverview";

export { soRadius, soShadow };

export type LogStatusFilter = "all" | "pending" | "completed";

/* ── Pending / Completed summary, doubling as the status filter ─────────── */

export function LogSummaryCards({
  pending,
  completed,
  filter,
  onToggle,
}: {
  pending: number;
  completed: number;
  filter: LogStatusFilter;
  onToggle: (next: LogStatusFilter) => void;
}) {
  const styles = useStyles();
  const ds = useDs();
  const card = (
    key: Exclude<LogStatusFilter, "all">,
    label: string,
    value: number,
    dot: string,
    valueColor: string,
  ) => {
    const on = filter === key;
    return (
      <TouchableOpacity
        onPress={() => onToggle(on ? "all" : key)}
        activeOpacity={0.85}
        style={[styles.summary, on && { borderColor: valueColor }]}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        accessibilityLabel={`${value} ${label}`}
      >
        <View style={styles.summaryHead}>
          <View style={[styles.dot, { backgroundColor: dot }]} />
          <Text style={styles.eyebrow}>{label}</Text>
        </View>
        <Text style={[styles.summaryValue, { color: valueColor }]}>{value}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.summaryRow}>
      {card("pending", "Pending", pending, ds.flame[100], ds.flame[100])}
      {card("completed", "Completed", completed, ds.sky[100], "#1F757D")}
    </View>
  );
}

/* ── Shift quick-filter (Temp & RH only) ────────────────────────────────── */

export function ShiftChips({
  value,
  onChange,
  shifts = ["A", "B", "C"],
}: {
  value: string;
  onChange: (shift: string) => void;
  shifts?: string[];
}) {
  const styles = useStyles();
  const ds = useDs();
  return (
    <View style={styles.chipRow}>
      {shifts.map((sh) => {
        const on = sh === value;
        return (
          <TouchableOpacity
            key={sh}
            onPress={() => onChange(sh)}
            activeOpacity={0.85}
            style={[
              styles.chip,
              {
                backgroundColor: on ? ds.thunder[100] : ds.white,
                borderColor: on ? ds.thunder[100] : ds.carbon[900],
              },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <Text
              style={[
                styles.chipText,
                { color: on ? ds.onChrome : ds.carbon[400] },
              ]}
            >
              Shift {sh}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* ── History heading ────────────────────────────────────────────────────── */

export function HistoryHeading({ label }: { label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.historyRow}>
      <Text style={styles.historyTitle}>History</Text>
      <Text style={styles.historyLabel}>{label}</Text>
    </View>
  );
}

/* ── Status filter popover, anchored under the header's filter tile ─────── */

export function LogFilterPopover({
  top,
  value,
  onSelect,
  onDismiss,
}: {
  top: number;
  value: LogStatusFilter;
  onSelect: (next: LogStatusFilter) => void;
  onDismiss: () => void;
}) {
  const styles = useStyles();
  const ds = useDs();
  const options: { key: LogStatusFilter; label: string; dot: string }[] = [
    { key: "all", label: "All entries", dot: ds.carbon[800] },
    { key: "pending", label: "Pending", dot: ds.flame[100] },
    { key: "completed", label: "Completed", dot: "#1F757D" },
  ];

  return (
    <>
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={onDismiss}
      />
      <View style={[styles.popover, { top }]}>
        {options.map((o) => {
          const on = o.key === value;
          return (
            <TouchableOpacity
              key={o.key}
              onPress={() => onSelect(o.key)}
              activeOpacity={0.8}
              style={[styles.popRow, on && { backgroundColor: ds.field }]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <View style={[styles.dot, { backgroundColor: o.dot }]} />
              <Text
                style={[
                  styles.popLabel,
                  { fontWeight: on ? "600" : "400" },
                ]}
              >
                {o.label}
              </Text>
              {on ? (
                <Check size={16} color={ds.flame[100]} strokeWidth={2.4} />
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );
}

/* ── Start / Continue FAB, with an idle attention nudge ─────────────────── */

const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);

/** One cycle: two quick hops, then a long rest so it never reads as a spinner. */
const FAB_BOUNCE = {
  "0%": { transform: [{ translateY: 0 }] },
  "8%": { transform: [{ translateY: -10 }] },
  "18%": { transform: [{ translateY: 0 }] },
  "25%": { transform: [{ translateY: -4 }] },
  "32%": { transform: [{ translateY: 0 }] },
  "100%": { transform: [{ translateY: 0 }] },
} as const;

/** A sonar ring leaving the pill. Scale + opacity only — both are free. */
const FAB_HALO = {
  "0%": { transform: [{ scale: 0.94 }], opacity: 0 },
  "12%": { opacity: 0.38 },
  "40%": { transform: [{ scale: 1.45 }], opacity: 0 },
  "100%": { transform: [{ scale: 1.45 }], opacity: 0 },
} as const;

/** Reduced motion keeps the pull but drops the movement: a bare glow. */
const FAB_GLOW = {
  "0%": { opacity: 0 },
  "15%": { opacity: 0.32 },
  "45%": { opacity: 0 },
  "100%": { opacity: 0 },
} as const;

const NUDGE_CYCLE_MS = 2000;
const NUDGE_REPEATS = 3;

export function LogFab({
  label,
  continuing,
  onPress,
  bottom,
  attention,
}: {
  label: string;
  continuing?: boolean;
  onPress: () => void;
  bottom: number;
  /** Idle operator — draw the eye to the button. See hooks/useIdleNudge. */
  attention?: boolean;
}) {
  const styles = useStyles();
  const ds = useDs();
  const reduced = useReducedMotion();
  const Icon = continuing ? ArrowRight : Plus;

  const halo = attention
    ? {
        animationName: reduced ? FAB_GLOW : FAB_HALO,
        animationDuration: NUDGE_CYCLE_MS,
        animationIterationCount: NUDGE_REPEATS,
        animationTimingFunction: EASE_OUT,
      }
    : null;

  // The bounce is movement, so reduced motion opts out of it entirely and
  // keeps only the glow above.
  const bounce =
    attention && !reduced
      ? {
          animationName: FAB_BOUNCE,
          animationDuration: NUDGE_CYCLE_MS,
          animationIterationCount: NUDGE_REPEATS,
          animationTimingFunction: EASE_OUT,
        }
      : null;

  return (
    <View style={[styles.fabDock, { bottom }]} pointerEvents="box-none">
      {/* Behind the pill by document order; no elevation of its own, so it
          never animates an Android shadow. */}
      {halo ? (
        <Animated.View style={[styles.fabHalo, halo]} pointerEvents="none" />
      ) : null}
      <Animated.View style={bounce}>
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.9}
          style={styles.fab}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <Icon size={21} color={ds.onChrome} strokeWidth={2.4} />
          <Text style={styles.fabLabel}>{label}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const useStyles = makeThemedStyles((ds) => ({
  eyebrow: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    color: ds.carbon[500],
  },
  dot: { width: 8, height: 8, borderRadius: 4 },

  summaryRow: { flexDirection: "row", gap: 9, marginBottom: 16 },
  summary: {
    flex: 1,
    backgroundColor: ds.white,
    borderRadius: soRadius.card,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderWidth: 2,
    borderColor: "transparent",
    ...soShadow,
  },
  summaryHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  summaryValue: { fontSize: 26, lineHeight: 26, fontWeight: "700" },

  chipRow: { flexDirection: "row", gap: 6, marginBottom: 13 },
  chip: {
    minHeight: 32,
    justifyContent: "center",
    paddingHorizontal: 12,
    borderRadius: soRadius.pill,
    borderWidth: 1,
  },
  chipText: { fontSize: 11, fontWeight: "600", letterSpacing: 0.22 },

  historyRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 7,
    marginBottom: 9,
  },
  historyTitle: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.13,
    color: ds.carbon[100],
  },
  historyLabel: { fontSize: 11.5, color: ds.carbon[600] },

  popover: {
    position: "absolute",
    right: 20,
    width: 172,
    backgroundColor: ds.white,
    borderRadius: soRadius.sm,
    padding: 5,
    zIndex: 30,
    shadowColor: ds.carbon[100],
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 18,
  },
  popRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 8,
  },
  popLabel: { flex: 1, fontSize: 12.5, color: ds.carbon[100] },

  fabDock: { position: "absolute", right: 20 },
  fabHalo: {
    position: "absolute",
    left: -8,
    right: -8,
    top: -8,
    bottom: -8,
    borderRadius: soRadius.pill,
    backgroundColor: ds.flame[100],
  },
  fab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 52,
    paddingHorizontal: 18,
    borderRadius: soRadius.pill,
    backgroundColor: ds.flame[100],
    shadowColor: ds.flame[100],
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
  },
  fabLabel: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.14,
    color: ds.onChrome,
  },
}));
