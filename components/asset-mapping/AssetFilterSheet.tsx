/**
 * Asset Directory filter sheet — the artboard's bottom sheet with wrap chips.
 * Carries the filters the old advanced sheet had that the list chrome doesn't
 * show: equipment type, high / low side, criticality and floor (each only
 * when the site has more than one value), plus the sort order. Drafts are
 * applied together on "Apply", like before. Keyword search and status live
 * on the list itself (search field + tabs); the site lives on the site chip.
 */
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { Chip, JoSheet, PrimaryButton, SecondaryButton, Segmented, f, useJoTheme } from "@/components/jo/ui";

export const SORTS = ["Name", "Type", "Recent"] as const;
export type Sort = (typeof SORTS)[number];

/** Field filters; "all" = not filtered. */
export interface FieldFilters {
  type: string;
  side: string;
  criticality: string;
  floor: string;
}
export const NO_FIELD_FILTERS: FieldFilters = { type: "all", side: "all", criticality: "all", floor: "all" };

export interface FilterGroup {
  key: keyof FieldFilters;
  label: string;
  options: { value: string; label: string }[];
}

export default function AssetFilterSheet({
  visible,
  onClose,
  groups,
  draft,
  onChangeDraft,
  sort,
  onChangeSort,
  onReset,
  onApply,
}: {
  visible: boolean;
  onClose: () => void;
  groups: FilterGroup[];
  draft: FieldFilters;
  onChangeDraft: (next: FieldFilters) => void;
  sort: Sort;
  onChangeSort: (s: Sort) => void;
  onReset: () => void;
  onApply: () => void;
}) {
  const t = useJoTheme();
  return (
    <JoSheet visible={visible} onClose={onClose} title="Filter assets" subtitle="Narrow the directory at this site.">
      <ScrollView style={{ marginTop: 16 }} contentContainerStyle={{ gap: 18 }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 9 }}>
          <Text style={[f.t(12.5, 500), { color: t.ink3, paddingHorizontal: 4 }]}>Sort by</Text>
          <Segmented
            items={SORTS.map((k) => ({ key: k, label: k }))}
            value={sort}
            onChange={onChangeSort}
          />
        </View>
        {groups.map((g) => (
          <View key={g.key} style={{ gap: 9 }}>
            <Text style={[f.t(12.5, 500), { color: t.ink3, paddingHorizontal: 4 }]}>{g.label}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {g.options.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  selected={draft[g.key] === o.value}
                  onPress={() => onChangeDraft({ ...draft, [g.key]: o.value })}
                />
              ))}
            </View>
          </View>
        ))}
        {groups.length === 0 ? (
          <Text style={[f.t(12.5), { color: t.muted, paddingHorizontal: 4 }]}>
            No type, side, criticality or floor values to filter on at this site.
          </Text>
        ) : null}
      </ScrollView>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 18 }}>
        <SecondaryButton label="Reset" onPress={onReset} style={{ flex: 1 }} />
        <PrimaryButton label="Apply" icon="bx-check" onPress={onApply} height={52} style={{ flex: 1.4 }} />
      </View>
    </JoSheet>
  );
}
