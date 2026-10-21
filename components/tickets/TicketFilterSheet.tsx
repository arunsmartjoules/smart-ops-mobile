/**
 * Period + priority filter for the tickets list, opened from the artboard's
 * date button ("1–19 Aug"). Replaces the old full-screen AdvancedFilterModal
 * for this screen: search, site and status already live on the list header.
 *
 * Every range is an IST calendar range ("YYYY-MM-DD"), matching how the screen
 * turns them into API bounds.
 */
import React, { useState } from "react";
import { Platform, ScrollView, Text, TouchableOpacity, View } from "react-native";
import DateTimePicker from "@expo/ui/community/datetime-picker";
import { Bx } from "@/components/jo/Bx";
import { JoSheet, PrimaryButton, SecondaryButton, f, useJoTheme } from "@/components/jo/ui";
import { formatIST, istDayStartMsFromYmd, istParts, istTodayString } from "@/utils/istDate";
import { ChoiceChips, FieldHead } from "./TicketFormParts";

export const TICKET_PRIORITY_FILTERS = ["All", "Medium", "High", "Very High"] as const;

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => {
  // Normalise month overflow/underflow (e.g. month 0 → Dec of the year before).
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};

type Range = { from: string | null; to: string | null };

/** Quick ranges, computed on the IST calendar. */
function presets(): { key: string; label: string; range: Range }[] {
  const today = istTodayString();
  const { year, month } = istParts(new Date());
  return [
    { key: "this_month", label: "This month", range: { from: ymd(year, month, 1), to: today } },
    {
      key: "last_month",
      label: "Last month",
      range: { from: ymd(year, month - 1, 1), to: ymd(year, month, 0) },
    },
    { key: "last_3", label: "Last 3 months", range: { from: ymd(year, month - 2, 1), to: today } },
    { key: "this_year", label: "This year", range: { from: ymd(year, 1, 1), to: today } },
    { key: "all", label: "All dates", range: { from: null, to: null } },
  ];
}

const showDate = (value: string | null) => {
  const ms = istDayStartMsFromYmd(value);
  return ms == null ? "" : formatIST(ms, { day: "numeric", month: "short", year: "numeric" });
};

/** "YYYY-MM-DD" → a local-noon Date, only ever handed to the native picker. */
const toPicker = (value: string | null) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || istTodayString());
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
};
const fromPicker = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function DateBox({
  label,
  value,
  onChange,
  minimum,
  maximum,
}: {
  label: string;
  value: string | null;
  onChange: (v: string) => void;
  minimum?: string | null;
  maximum?: string | null;
}) {
  const t = useJoTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <TouchableOpacity
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${showDate(value) || "not set"}`}
        style={{
          minHeight: 58,
          borderRadius: 18,
          backgroundColor: t.sheetField,
          borderWidth: 1,
          borderColor: open ? t.accent : "transparent",
          paddingVertical: 9,
          paddingHorizontal: 14,
        }}
      >
        <Text style={[f.t(11), { color: t.muted }]}>{label}</Text>
        <Text style={[f.t(14, 600), { color: value ? t.ink : t.faint, marginTop: 3 }]} numberOfLines={1}>
          {showDate(value) || "Any"}
        </Text>
      </TouchableOpacity>
      {open ? (
        Platform.OS === "ios" ? (
          <View style={{ marginTop: 8, borderRadius: 18, backgroundColor: t.sheetField }}>
            <DateTimePicker
              value={toPicker(value)}
              mode="date"
              display="spinner"
              themeVariant={t.isDark ? "dark" : "light"}
              accentColor={t.accent}
              minimumDate={minimum ? toPicker(minimum) : undefined}
              maximumDate={maximum ? toPicker(maximum) : undefined}
              onValueChange={(_e, d) => onChange(fromPicker(d))}
            />
            <TouchableOpacity
              onPress={() => {
                if (!value) onChange(fromPicker(toPicker(null)));
                setOpen(false);
              }}
              style={{ alignSelf: "flex-end", paddingHorizontal: 14, paddingVertical: 8 }}
              accessibilityRole="button"
            >
              <Text style={[f.t(14, 600), { color: t.accentInk }]}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <DateTimePicker
            value={toPicker(value)}
            mode="date"
            minimumDate={minimum ? toPicker(minimum) : undefined}
            maximumDate={maximum ? toPicker(maximum) : undefined}
            onValueChange={(_e, d) => {
              setOpen(false);
              onChange(fromPicker(d));
            }}
            onDismiss={() => setOpen(false)}
          />
        )
      ) : null}
    </View>
  );
}

export default function TicketFilterSheet({
  visible,
  onClose,
  fromDate,
  toDate,
  priority,
  defaultRange,
  onApply,
}: {
  visible: boolean;
  onClose: () => void;
  fromDate: string | null;
  toDate: string | null;
  priority: string;
  /** What "Reset" goes back to (the screen's default: this month). */
  defaultRange: Range;
  onApply: (next: Range & { priority: string }) => void;
}) {
  const t = useJoTheme();
  // Mounted per open by the screen, so every open starts from what the list
  // is showing.
  const [from, setFrom] = useState(fromDate);
  const [to, setTo] = useState(toDate);
  const [prio, setPrio] = useState(priority);

  const quick = presets();
  const activePreset = quick.find((p) => p.range.from === from && p.range.to === to)?.key;
  const invalidRange = !!from && !!to && from > to;

  return (
    <JoSheet visible={visible} onClose={onClose} title="Filter tickets" subtitle="Raised date and priority">
      <ScrollView style={{ marginTop: 6 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <FieldHead label="Raised" style={{ marginTop: 12 }} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
          {quick.map((p) => {
            const on = p.key === activePreset;
            return (
              <TouchableOpacity
                key={p.key}
                onPress={() => {
                  setFrom(p.range.from);
                  setTo(p.range.to);
                }}
                activeOpacity={0.8}
                accessibilityRole="radio"
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
                <Text style={[f.t(12.5, 600), { color: on ? t.selFg : t.ink2 }]}>{p.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <DateBox label="From" value={from} onChange={setFrom} maximum={to} />
          <DateBox label="To" value={to} onChange={setTo} minimum={from} />
        </View>
        {invalidRange ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, paddingHorizontal: 4 }}>
            <Bx name="bx-error-circle" size={14} color={t.bad} />
            <Text style={[f.t(12, 500), { color: t.bad }]}>“From” must be on or before “To”.</Text>
          </View>
        ) : null}

        <FieldHead label="Priority" style={{ marginTop: 18 }} />
        <ChoiceChips
          label="Priority"
          options={TICKET_PRIORITY_FILTERS}
          value={prio}
          onChange={setPrio}
          style={{ marginTop: 9 }}
        />

        <View style={{ flexDirection: "row", gap: 8, marginTop: 22 }}>
          <SecondaryButton
            label="Reset"
            height={52}
            style={{ flex: 1 }}
            onPress={() => {
              setFrom(defaultRange.from);
              setTo(defaultRange.to);
              setPrio("All");
            }}
          />
          <PrimaryButton
            label="Apply"
            icon="bx-check"
            height={52}
            style={{ flex: 1.4 }}
            disabled={invalidRange}
            onPress={() => onApply({ from, to, priority: prio })}
          />
        </View>
      </ScrollView>
    </JoSheet>
  );
}
