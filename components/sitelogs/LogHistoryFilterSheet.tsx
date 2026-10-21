/**
 * Site Logs › History filter — date range (presets or custom), status and,
 * for Temp & RH, shift. Edits a draft; nothing applies until "Apply".
 * Drawn as a JoSheet with ink-select chips (artboard sheet language).
 */
import React, { useState } from "react";
import { Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";
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
import { Bx } from "@/components/jo/Bx";
import { JoSheet, PrimaryButton, SecondaryButton, capsStyle, f, useJoTheme } from "@/components/jo/ui";
import { FilterChip, type LogStatusFilter } from "./LogsUI";

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
  const t = useJoTheme();
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
  const section = (label: string) => (
    <Text style={[capsStyle(11.5), { color: t.muted, marginTop: 18, marginBottom: 9, paddingHorizontal: 2 }]}>
      {label}
    </Text>
  );

  return (
    <JoSheet visible onClose={onClose} title="Filter history" subtitle="Date window, status and shift">
      <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {section("Date")}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
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
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              {(["from", "to"] as const).map((edge) => (
                <TouchableOpacity
                  key={edge}
                  onPress={() => openPicker(edge)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`${edge === "from" ? "From" : "To"} date, ${format(draft.range[edge], "d MMM yyyy")}`}
                  style={{
                    flex: 1,
                    borderRadius: 18,
                    backgroundColor: t.sheetField,
                    borderWidth: 1.5,
                    borderColor: iosPicker === edge ? t.accent : "transparent",
                    paddingVertical: 9,
                    paddingHorizontal: 14,
                    gap: 3,
                  }}
                >
                  <Text style={[f.t(11.5, 500), { color: t.muted }]}>{edge === "from" ? "From" : "To"}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Bx name="bx-calendar" size={15} color={t.accentInk} />
                    <Text style={[f.t(14, 600), { color: t.ink }]}>{format(draft.range[edge], "d MMM yyyy")}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            {iosPicker && Platform.OS !== "android" ? (
              <DateTimePicker
                value={draft.range[iosPicker]}
                mode="date"
                display="inline"
                themeVariant={t.isDark ? "dark" : "light"}
                accentColor={t.accent}
                maximumDate={new Date()}
                onChange={(_, date) => {
                  if (date) setCustom(iosPicker, date);
                }}
              />
            ) : null}
          </>
        ) : null}

        {section("Status")}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {(
            [
              { key: "all", label: "All" },
              { key: "pending", label: "Open" },
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
            {section("Shift")}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {(["all", "A", "B", "C"] as const).map((sh) => (
                <FilterChip
                  key={sh}
                  label={sh === "all" ? "All shifts" : `Shift ${sh}`}
                  on={draft.shift === sh}
                  onPress={() => setDraft((d) => ({ ...d, shift: sh }))}
                />
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>

      <View style={{ flexDirection: "row", gap: 9, marginTop: 22 }}>
        <SecondaryButton
          label="Reset"
          onPress={() => {
            setIosPicker(null);
            setDraft(DEFAULT_HISTORY_FILTERS());
          }}
          style={{ paddingHorizontal: 22 }}
        />
        <PrimaryButton label="Apply" icon="bx-check" height={52} onPress={() => onApply(draft)} style={{ flex: 1 }} />
      </View>
    </JoSheet>
  );
}
