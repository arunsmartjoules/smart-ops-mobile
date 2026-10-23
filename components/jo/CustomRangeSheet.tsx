/**
 * "Custom range" sheet shared by the date filters that otherwise only offer
 * presets (Reports › Modules, Efficiency, Attendance history): a From and a
 * To field, each opening the system date picker, and Apply.
 *
 * Dates travel as calendar strings ("YYYY-MM-DD") — never `new Date(iso)` —
 * and the range is kept in order whichever end moves. The draft starts from
 * `value` each time the sheet opens.
 */
import React, { useState } from "react";
import { Platform, Text, TouchableOpacity, View } from "react-native";
import DateTimePicker from "@expo/ui/community/datetime-picker";
import { format } from "date-fns";
import { JoSheet, PrimaryButton, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";

export interface DateRange {
  from: string;
  to: string;
}

/** "YYYY-MM-DD" → local-noon Date (clear of midnight edges) for the picker. */
function toPickerDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12);
}

const display = (iso: string) => format(toPickerDate(iso), "dd MMM yyyy");

export function CustomRangeSheet({
  visible,
  onClose,
  value,
  onApply,
  maxDate,
  minDate,
  title = "Custom range",
  subtitle,
}: {
  visible: boolean;
  onClose: () => void;
  /** Where the draft starts when the sheet opens. */
  value: DateRange;
  onApply: (range: DateRange) => void;
  /** Latest selectable day ("YYYY-MM-DD"), usually today. */
  maxDate?: string;
  /** Earliest selectable day, when the data has a floor. */
  minDate?: string;
  title?: string;
  subtitle?: string;
}) {
  return (
    <JoSheet visible={visible} onClose={onClose} title={title} subtitle={subtitle}>
      {/* Mounted per opening, so the draft always starts from `value`. */}
      {visible ? (
        <RangeEditor value={value} maxDate={maxDate} minDate={minDate} onApply={(r) => onApply(r)} />
      ) : null}
    </JoSheet>
  );
}

function RangeEditor({
  value,
  maxDate,
  minDate,
  onApply,
}: {
  value: DateRange;
  maxDate?: string;
  minDate?: string;
  onApply: (range: DateRange) => void;
}) {
  const t = useJoTheme();
  const s = useStyles();
  const [draft, setDraft] = useState<DateRange>(value);
  const [pickerFor, setPickerFor] = useState<null | "from" | "to">(null);

  const onPick = (_e: unknown, date?: Date) => {
    const which = pickerFor;
    // Android's picker is a one-shot dialog; iOS keeps an inline spinner open.
    if (Platform.OS !== "ios") setPickerFor(null);
    if (!date || !which) return;
    const iso = format(date, "yyyy-MM-dd");
    setDraft((r) => {
      const next = { ...r, [which]: iso };
      // Keep the range ordered whichever end moved.
      if (next.from > next.to) {
        if (which === "from") next.to = next.from;
        else next.from = next.to;
      }
      return next;
    });
  };

  return (
    <View>
      <View style={s.row}>
        {(["from", "to"] as const).map((which) => (
          <TouchableOpacity
            key={which}
            style={[s.field, pickerFor === which ? { borderColor: t.accent } : null]}
            activeOpacity={0.8}
            onPress={() => setPickerFor(pickerFor === which ? null : which)}
            accessibilityRole="button"
            accessibilityLabel={`${which === "from" ? "From" : "To"} date, ${display(draft[which])}`}
          >
            <Text style={[f.t(11), { color: t.muted }]}>{which === "from" ? "From" : "To"}</Text>
            <Text style={[f.t(14.5, 600), { color: t.ink, marginTop: 4 }]}>{display(draft[which])}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {pickerFor ? (
        <DateTimePicker
          value={toPickerDate(draft[pickerFor])}
          mode="date"
          maximumDate={maxDate ? toPickerDate(maxDate) : undefined}
          minimumDate={minDate ? toPickerDate(minDate) : undefined}
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={onPick}
        />
      ) : null}
      <PrimaryButton label="Apply range" onPress={() => onApply(draft)} style={{ marginTop: 14 }} />
    </View>
  );
}

const useStyles = makeJoStyles((t) => ({
  row: { flexDirection: "row", gap: 8, marginTop: 16 },
  field: {
    flex: 1,
    minWidth: 0,
    borderRadius: 20,
    backgroundColor: t.sheetField,
    borderWidth: 1.5,
    borderColor: "transparent",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
}));
