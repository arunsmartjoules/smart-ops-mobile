/**
 * Date range for the comms list — the web DateRangeFilter's presets
 * (Today · This Month · Last Month · All) plus a custom from/to, filtering on
 * `communication_date` like the web. Local to this screen (Resources has no
 * shared date scope).
 */
import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import {
  JoSheet,
  PrimaryButton,
  SheetOption,
  f,
  useJoTheme,
} from "@/components/jo/ui";
import { DateField, FieldBlock } from "./fields";
import { DATE_PRESETS, type DatePresetKey } from "./lib";

export function CommDateSheet({
  visible,
  preset,
  from,
  to,
  onClose,
  onPickPreset,
  onCustomRange,
}: {
  visible: boolean;
  preset: DatePresetKey;
  /** Effective range (for seeding the custom pickers). */
  from: string;
  to: string;
  onClose: () => void;
  onPickPreset: (p: DatePresetKey) => void;
  onCustomRange: (from: string, to: string) => void;
}) {
  const t = useJoTheme();
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);
  // Re-seed the custom pickers each time the sheet opens (adjust during render).
  const [seededFor, setSeededFor] = useState(false);
  if (visible !== seededFor) {
    setSeededFor(visible);
    if (visible) {
      setCustomFrom(from);
      setCustomTo(to);
    }
  }
  const backwards = !!customFrom && !!customTo && customFrom > customTo;

  return (
    <JoSheet
      visible={visible}
      onClose={onClose}
      title="Date range"
      subtitle="Filters the list by the date of communication."
    >
      {/* Scrolls when the iOS inline date spinner opens on a short screen. */}
      <ScrollView
        style={{ flexGrow: 0 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: 6, marginTop: 14 }}>
          {DATE_PRESETS.map((p) => (
            <SheetOption
              key={p.key}
              label={p.label}
              selected={preset === p.key}
              onPress={() => {
                onPickPreset(p.key);
                onClose();
              }}
            />
          ))}
        </View>
        <Text
          style={[
            f.t(12.5, 600),
            {
              color: t.ink3,
              marginTop: 18,
              marginBottom: 8,
              paddingHorizontal: 4,
            },
          ]}
        >
          Custom range
        </Text>
        {/* Stacked, not side by side: the iOS inline spinner needs the full width. */}
        <View style={{ gap: 10 }}>
          <FieldBlock label="From">
            <DateField
              value={customFrom}
              onChange={setCustomFrom}
              placeholder="Start"
              accessibilityLabel="From date"
            />
          </FieldBlock>
          <FieldBlock label="To">
            <DateField
              value={customTo}
              onChange={setCustomTo}
              placeholder="End"
              accessibilityLabel="To date"
            />
          </FieldBlock>
        </View>
        {backwards ? (
          <Text
            style={[
              f.t(12, 500),
              { color: t.bad, marginTop: 8, paddingHorizontal: 4 },
            ]}
            accessibilityLiveRegion="polite"
          >
            The start date is after the end date.
          </Text>
        ) : null}
        <PrimaryButton
          label="Apply range"
          onPress={() => {
            onCustomRange(customFrom, customTo);
            onClose();
          }}
          disabled={(!customFrom && !customTo) || backwards}
          height={50}
          style={{ marginTop: 14 }}
        />
      </ScrollView>
    </JoSheet>
  );
}
