/**
 * Site Logs › History filter — date range (presets or custom), status and,
 * for Temp & RH, shift. Edits a draft; nothing applies until "Apply".
 */
import React, { useState } from "react";
import { Platform, Text, TouchableOpacity, View } from "react-native";
import BottomSheet, { BottomSheetView } from "@expo/ui/community/bottom-sheet";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import {
  addDays,
  endOfDay,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { Calendar, Check } from "lucide-react-native";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import { FilterChip, soRadius, type LogStatusFilter } from "./LogsUI";

export type RangePreset = "today" | "7d" | "week" | "30d" | "month" | "custom";

export interface HistoryRange {
  preset: RangePreset;
  /** Start of the first day (local). */
  from: Date;
  /** End of the last day (local). */
  to: Date;
}

export interface HistoryFilters {
  range: HistoryRange;
  status: LogStatusFilter;
  shift: "all" | "A" | "B" | "C";
}

const PRESETS: { key: Exclude<RangePreset, "custom">; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "week", label: "This week" },
  { key: "30d", label: "Last 30 days" },
  { key: "month", label: "This month" },
];

/** Resolves a preset against now. Weeks start on Monday. */
export function presetRange(preset: Exclude<RangePreset, "custom">): HistoryRange {
  const now = new Date();
  const to = endOfDay(now);
  switch (preset) {
    case "today":
      return { preset, from: startOfDay(now), to };
    case "week":
      return { preset, from: startOfWeek(now, { weekStartsOn: 1 }), to };
    case "30d":
      return { preset, from: startOfDay(addDays(now, -29)), to };
    case "month":
      return { preset, from: startOfMonth(now), to };
    case "7d":
    default:
      return { preset: "7d", from: startOfDay(addDays(now, -6)), to };
  }
}

export const DEFAULT_HISTORY_FILTERS = (): HistoryFilters => ({
  range: presetRange("7d"),
  status: "all",
  shift: "all",
});

export function rangeLabel(range: HistoryRange): string {
  const preset = PRESETS.find((p) => p.key === range.preset);
  if (preset) return preset.label;
  const sameDay =
    format(range.from, "yyyy-MM-dd") === format(range.to, "yyyy-MM-dd");
  return sameDay
    ? format(range.from, "d MMM yyyy")
    : `${format(range.from, "d MMM")} – ${format(range.to, "d MMM yyyy")}`;
}

/** Anything other than the default window, all statuses and all shifts. */
export const filtersActive = (f: HistoryFilters) =>
  f.range.preset !== "7d" || f.status !== "all" || f.shift !== "all";

export function LogHistoryFilterSheet({
  value,
  hasShift,
  onApply,
  onClose,
}: {
  value: HistoryFilters;
  hasShift: boolean;
  onApply: (next: HistoryFilters) => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const ds = useDs();
  const [draft, setDraft] = useState<HistoryFilters>(value);
  const [iosPicker, setIosPicker] = useState<"from" | "to" | null>(null);

  const setCustom = (edge: "from" | "to", picked: Date) => {
    setDraft((d) => {
      let from = edge === "from" ? startOfDay(picked) : d.range.from;
      let to = edge === "to" ? endOfDay(picked) : d.range.to;
      // Keep the window the right way round.
      if (from.getTime() > to.getTime()) {
        if (edge === "from") to = endOfDay(picked);
        else from = startOfDay(picked);
      }
      return { ...d, range: { preset: "custom", from, to } };
    });
  };

  const openPicker = (edge: "from" | "to") => {
    const current = edge === "from" ? draft.range.from : draft.range.to;
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: current,
        mode: "date",
        maximumDate: new Date(),
        onChange: (event, date) => {
          if (event.type !== "set" || !date) return;
          setCustom(edge, date);
        },
      });
      return;
    }
    setIosPicker((cur) => (cur === edge ? null : edge));
  };

  const isCustom = draft.range.preset === "custom";

  return (
    <BottomSheet
      enableDynamicSizing
      enablePanDownToClose
      onClose={onClose}
      backgroundStyle={{ backgroundColor: ds.white }}
    >
      <BottomSheetView
        style={{ paddingHorizontal: 22, paddingTop: 6, paddingBottom: 30 }}
      >
        <Text style={styles.heading}>Filter history</Text>

        <Text style={styles.section}>Date</Text>
        <View style={styles.wrap}>
          {PRESETS.map((p) => (
            <FilterChip
              key={p.key}
              label={p.label}
              on={draft.range.preset === p.key}
              onPress={() => {
                setIosPicker(null);
                setDraft((d) => ({ ...d, range: presetRange(p.key) }));
              }}
            />
          ))}
          <FilterChip
            label="Custom range"
            on={isCustom}
            onPress={() =>
              setDraft((d) => ({
                ...d,
                range: { ...d.range, preset: "custom" },
              }))
            }
          />
        </View>

        {isCustom ? (
          <>
            <View style={styles.dateRow}>
              {(["from", "to"] as const).map((edge) => (
                <TouchableOpacity
                  key={edge}
                  onPress={() => openPicker(edge)}
                  activeOpacity={0.85}
                  style={[
                    styles.dateField,
                    iosPicker === edge && { borderColor: ds.controlOn },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${edge === "from" ? "From" : "To"} date`}
                >
                  <Text style={styles.dateLabel}>
                    {edge === "from" ? "From" : "To"}
                  </Text>
                  <View style={styles.dateValueRow}>
                    <Calendar size={14} color={ds.carbon[500]} strokeWidth={2} />
                    <Text style={styles.dateValue}>
                      {format(draft.range[edge], "d MMM yyyy")}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            {iosPicker && Platform.OS !== "android" ? (
              <DateTimePicker
                value={draft.range[iosPicker]}
                mode="date"
                display="inline"
                maximumDate={new Date()}
                onChange={(_, date) => {
                  if (date) setCustom(iosPicker, date);
                }}
              />
            ) : null}
          </>
        ) : null}

        <Text style={styles.section}>Status</Text>
        <View style={styles.wrap}>
          {(
            [
              { key: "all", label: "All" },
              { key: "pending", label: "Pending" },
              { key: "completed", label: "Completed" },
            ] as const
          ).map((o) => (
            <FilterChip
              key={o.key}
              label={o.label}
              on={draft.status === o.key}
              onPress={() => setDraft((d) => ({ ...d, status: o.key }))}
            />
          ))}
        </View>

        {hasShift ? (
          <>
            <Text style={styles.section}>Shift</Text>
            <View style={styles.wrap}>
              {(["all", "A", "B", "C"] as const).map((sh) => (
                <FilterChip
                  key={sh}
                  label={sh === "all" ? "All shifts" : `Shift ${sh}`}
                  tone={sh === "all" ? "control" : "flame"}
                  on={draft.shift === sh}
                  onPress={() => setDraft((d) => ({ ...d, shift: sh }))}
                />
              ))}
            </View>
          </>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity
            onPress={() => {
              setIosPicker(null);
              setDraft(DEFAULT_HISTORY_FILTERS());
            }}
            activeOpacity={0.85}
            style={styles.resetBtn}
            accessibilityRole="button"
          >
            <Text style={styles.resetText}>Reset</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onApply(draft)}
            activeOpacity={0.85}
            style={styles.applyBtn}
            accessibilityRole="button"
          >
            <Check size={17} color={ds.onControl} strokeWidth={2.4} />
            <Text style={styles.applyText}>Apply</Text>
          </TouchableOpacity>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}

const useStyles = makeThemedStyles((ds) => ({
  heading: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.36,
    color: ds.carbon[100],
    marginBottom: 6,
  },
  section: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    color: ds.carbon[600],
    marginTop: 14,
    marginBottom: 8,
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  dateRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  dateField: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: ds.fieldBorder,
    backgroundColor: ds.field,
    borderRadius: soRadius.sm,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  dateLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    color: ds.carbon[600],
    marginBottom: 3,
  },
  dateValueRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dateValue: { fontSize: 14, fontWeight: "600", color: ds.carbon[100] },
  actions: { flexDirection: "row", gap: 9, marginTop: 22 },
  resetBtn: {
    minHeight: 46,
    justifyContent: "center",
    paddingHorizontal: 18,
    borderRadius: soRadius.sm,
    borderWidth: 1,
    borderColor: ds.carbon[800],
    backgroundColor: ds.white,
  },
  resetText: { fontSize: 14, fontWeight: "500", color: ds.carbon[400] },
  applyBtn: {
    flex: 1,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: soRadius.sm,
    backgroundColor: ds.controlOn,
  },
  applyText: {
    fontSize: 14.5,
    fontWeight: "600",
    letterSpacing: 0.15,
    color: ds.onControl,
  },
}));
