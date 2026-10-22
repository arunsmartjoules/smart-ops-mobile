/**
 * Site Logs › History filter — status and, for Temp & RH, shift. Edits a
 * draft; nothing applies until "Apply". The date window is NOT here: it is
 * the shared Ops range (services/OpsDateRange), set from the Ops header.
 * Drawn as a JoSheet with ink-select chips (artboard sheet language).
 */
import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { JoSheet, PrimaryButton, SecondaryButton, capsStyle, useJoTheme } from "@/components/jo/ui";
import { FilterChip, type LogStatusFilter } from "./LogsUI";

export interface HistoryFilters {
  status: LogStatusFilter;
  shift: "all" | "A" | "B" | "C";
}

export const DEFAULT_HISTORY_FILTERS: HistoryFilters = {
  status: "all",
  shift: "all",
};

/** Anything other than all statuses and all shifts. */
export const filtersActive = (f: HistoryFilters) =>
  f.status !== "all" || f.shift !== "all";

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

  const section = (label: string) => (
    <Text style={[capsStyle(11.5), { color: t.muted, marginTop: 18, marginBottom: 9, paddingHorizontal: 2 }]}>
      {label}
    </Text>
  );

  return (
    <JoSheet visible onClose={onClose} title="Filter history" subtitle={hasShift ? "Status and shift" : "Status"}>
      <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
          onPress={() => setDraft(DEFAULT_HISTORY_FILTERS)}
          style={{ paddingHorizontal: 22 }}
        />
        <PrimaryButton label="Apply" icon="bx-check" height={52} onPress={() => onApply(draft)} style={{ flex: 1 }} />
      </View>
    </JoSheet>
  );
}
