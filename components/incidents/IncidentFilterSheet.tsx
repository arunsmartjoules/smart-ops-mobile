/**
 * Incidents filter (the header's filter button): the date range the list,
 * the counts and the live stream filter on. Quick ranges + custom From / To,
 * in the artboard's sheet language. Calendar dates travel as "YYYY-MM-DD".
 */
import React, { useState } from "react";
import { Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import { JoSheet, PrimaryButton, SecondaryButton, f, useJoTheme } from "@/components/jo/ui";
import { istParts, istTodayString } from "@/utils/istDate";
import { FieldLabel, IncChip, InlineError, SelectButton } from "./IncFields";

type Range = { from: string | null; to: string | null };

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => {
  // Date.UTC normalises overflow (month 0 → previous December, day 0 → last day).
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};

/** Quick ranges on the IST calendar; each ends today except Last month. */
function quickRanges(): { key: string; label: string; range: Range }[] {
  const today = istTodayString();
  const { year, month, day } = istParts(new Date());
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sun
  const sinceMonday = (dow + 6) % 7;
  return [
    { key: "today", label: "Today", range: { from: today, to: today } },
    { key: "week", label: "This week", range: { from: ymd(year, month, day - sinceMonday), to: today } },
    { key: "month", label: "This month", range: { from: ymd(year, month, 1), to: today } },
    { key: "last_month", label: "Last month", range: { from: ymd(year, month - 1, 1), to: ymd(year, month, 0) } },
    { key: "3m", label: "Last 3 months", range: { from: ymd(year, month - 3, day), to: today } },
    { key: "6m", label: "Last 6 months", range: { from: ymd(year, month - 6, day), to: today } },
    { key: "year", label: "This year", range: { from: ymd(year, 1, 1), to: today } },
    { key: "all", label: "All dates", range: { from: null, to: null } },
  ];
}

export default function IncidentFilterSheet({
  visible,
  onClose,
  from,
  to,
  defaultRange,
  onApply,
}: {
  visible: boolean;
  onClose: () => void;
  from: string | null;
  to: string | null;
  /** What Reset restores (the screen's default: this month). */
  defaultRange: Range;
  onApply: (range: Range) => void;
}) {
  return (
    <JoSheet visible={visible} onClose={onClose} title="Filter incidents" subtitle="Date the incident was raised">
      {/* The Modal unmounts its children while hidden, so every open starts
          the draft from what is applied now. */}
      <FilterBody initial={{ from, to }} defaultRange={defaultRange} onApply={onApply} />
    </JoSheet>
  );
}

function FilterBody({
  initial,
  defaultRange,
  onApply,
}: {
  initial: Range;
  defaultRange: Range;
  onApply: (range: Range) => void;
}) {
  const t = useJoTheme();
  const [draft, setDraft] = useState<Range>(initial);
  const [error, setError] = useState<string | null>(null);

  const ranges = quickRanges();
  const activeKey = ranges.find((r) => r.range.from === draft.from && r.range.to === draft.to)?.key;

  const apply = () => {
    if (draft.from && draft.to && draft.from > draft.to) {
      setError("The From date is after the To date.");
      return;
    }
    onApply(draft);
  };

  return (
    <ScrollView style={{ marginTop: 16 }} contentContainerStyle={{ paddingBottom: 4 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {ranges.map((r) => (
            <IncChip
              key={r.key}
              label={r.label}
              selected={activeKey === r.key}
              onPress={() => {
                setDraft(r.range);
                setError(null);
              }}
            />
          ))}
        </View>

        <View style={{ gap: 12, marginTop: 16 }}>
          <DateOnlyField
            label="From"
            value={draft.from}
            max={draft.to}
            onChange={(v) => {
              setDraft((d) => ({ ...d, from: v }));
              setError(null);
            }}
          />
          <DateOnlyField
            label="To"
            value={draft.to}
            min={draft.from}
            onChange={(v) => {
              setDraft((d) => ({ ...d, to: v }));
              setError(null);
            }}
          />
        </View>
        <InlineError text={error} style={{ marginTop: 10 }} />

        <View style={{ flexDirection: "row", gap: 8, marginTop: 20 }}>
          <SecondaryButton label="Reset" onPress={() => setDraft(defaultRange)} style={{ flex: 1 }} height={52} />
          <PrimaryButton label="Apply" onPress={apply} style={{ flex: 1.6 }} height={52} />
        </View>
        <Text style={[f.t(11.5), { color: t.muted, textAlign: "center", marginTop: 12 }]}>
          Status and search stay as they are.
        </Text>
    </ScrollView>
  );
}

const toPicker = (v: string | null) => {
  if (!v) return new Date();
  const [y, m, d] = v.split("-").map(Number);
  return new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1, 12);
};

function DateOnlyField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  min?: string | null;
  max?: string | null;
}) {
  const t = useJoTheme();
  const [iosOpen, setIosOpen] = useState(false);
  const shown = value ? format(toPicker(value), "d MMM yyyy") : "";
  const open = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: toPicker(value),
        mode: "date",
        minimumDate: min ? toPicker(min) : undefined,
        maximumDate: max ? toPicker(max) : undefined,
        onChange: (e, d) => {
          if (e.type === "set" && d) onChange(format(d, "yyyy-MM-dd"));
        },
      });
      return;
    }
    setIosOpen((o) => !o);
  };
  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
        <FieldLabel label={label} />
        {value ? (
          <TouchableOpacity onPress={() => onChange(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Clear ${label}`}>
            <Text style={[f.t(11.5, 600), { color: t.accentInk }]}>Clear</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <SelectButton value={shown} placeholder="Any" onPress={open} icon="bx-calendar" accessibilityLabel={label} />
      {iosOpen && Platform.OS !== "android" ? (
        <View style={{ marginTop: 8, borderRadius: 18, backgroundColor: t.sheetField }}>
          <DateTimePicker
            value={toPicker(value)}
            mode="date"
            display="inline"
            themeVariant={t.isDark ? "dark" : "light"}
            minimumDate={min ? toPicker(min) : undefined}
            maximumDate={max ? toPicker(max) : undefined}
            onChange={(_e, d) => {
              if (d) {
                onChange(format(d, "yyyy-MM-dd"));
                setIosOpen(false);
              }
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
