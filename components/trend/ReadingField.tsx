/**
 * The trend sheet's number fields: one plain input per reading or quantity,
 * label inside on the left, the figure large and right-aligned with its unit.
 *
 * `ReadingPair` puts yesterday's reading directly above today's field in the
 * same type, so the two figures line up at the same right edge and can be
 * compared by eye; the worked line under it (on the entry screen) does the
 * arithmetic check.
 *
 * While the field has focus it shows the digits as typed; once it is left it
 * shows them grouped the Indian way (18,242.50), as every other figure in the
 * app is written.
 */
import React, { useRef, useState } from "react";
import { Pressable, Text, TextInput, View, type KeyboardTypeOptions } from "react-native";
import { f, useJoTheme } from "@/components/jo/ui";
import { formatIndian, parseTyped } from "@/utils/trendSheet";

const num = { fontVariant: ["tabular-nums" as const] };

/** The figure's size; yesterday's reading uses the same so the two line up. */
const FIGURE = 22;

/** "18242.5" → "18,242.5": grouped, with the decimals exactly as typed. Anything unparsable is left as typed. */
export function groupedText(raw: string): string {
  const parsed = parseTyped(raw);
  if (parsed.state !== "ok") return raw;
  const dot = raw.indexOf(".");
  const decimals = dot === -1 ? 0 : raw.length - dot - 1;
  return formatIndian(parsed.value, decimals, decimals);
}

export function ReadingInput({
  label,
  hint,
  value,
  onChangeText,
  onBlur,
  unit,
  editable = true,
  error,
  muted,
  keyboardType = "decimal-pad",
}: {
  /** Shown inside the field and spoken; tests find the field by it. */
  label: string;
  hint?: string;
  value: string;
  onChangeText: (v: string) => void;
  onBlur?: () => void;
  unit?: string;
  editable?: boolean;
  error?: boolean;
  /** The value was worked out by the app, not typed. */
  muted?: boolean;
  keyboardType?: KeyboardTypeOptions;
}) {
  const t = useJoTheme();
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const border = error ? t.bad : focused ? t.accent : t.lineMid;
  return (
    // Tapping anywhere on the field, the label included, starts typing.
    <Pressable
      onPress={() => input.current?.focus()}
      disabled={!editable}
      accessible={false}
      style={{
        minHeight: 58,
        borderRadius: 14,
        borderWidth: 1.5,
        borderColor: border,
        backgroundColor: t.input,
        paddingHorizontal: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        opacity: editable ? 1 : 0.5,
      }}
    >
      <Text style={[f.t(13.5, 500), { color: muted ? t.muted : t.ink3, flexShrink: 1, maxWidth: "50%" }]}>{label}</Text>
      <TextInput
        ref={input}
        value={focused ? value : groupedText(value)}
        onChangeText={(v) => onChangeText(v.replace(/,/g, ""))}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        editable={editable}
        keyboardType={keyboardType}
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholder=""
        selectionColor={t.accent}
        style={[
          f.t(FIGURE, 600),
          num,
          {
            flex: 1,
            minWidth: 0,
            textAlign: "right",
            color: muted ? t.ink3 : t.ink,
            paddingVertical: 10,
            paddingHorizontal: 0,
            margin: 0,
            includeFontPadding: false,
          },
        ]}
      />
      {unit ? <UnitText unit={unit} /> : null}
    </Pressable>
  );
}

/** The unit beside a figure, at a fixed width so a column of figures ends at one edge. */
function UnitText({ unit }: { unit: string }) {
  const t = useJoTheme();
  return (
    <Text style={[f.t(14, 500), { color: t.muted, minWidth: 40 }]} numberOfLines={1}>
      {unit}
    </Text>
  );
}

/**
 * Yesterday's reading above today's field, the figures at the same size and
 * the same right edge. `refLabel` is "Yesterday", a date, or "Opening, typed".
 */
export function ReadingPair({
  refLabel,
  refValue,
  unit,
  children,
}: {
  refLabel: string;
  refValue: number | null;
  unit: string;
  /** Today's ReadingInput. */
  children: React.ReactNode;
}) {
  const t = useJoTheme();
  return (
    <View style={{ gap: 6 }}>
      <View
        accessible
        accessibilityLabel={`${refLabel}: ${refValue != null ? `${formatIndian(refValue)} ${unit}` : "not set"}`}
        // Matches the field's frame (14 padding + 1.5 border) so the figures share a right edge.
        style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 15.5, minHeight: 36 }}
      >
        <Text style={[f.t(13.5, 500), { color: t.muted, flex: 1 }]} numberOfLines={1}>
          {refLabel}
        </Text>
        {refValue != null ? (
          <Text style={[f.t(FIGURE, 600), num, { color: t.ink3 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {formatIndian(refValue)}
          </Text>
        ) : (
          <Text style={[f.t(15), { color: t.muted }]}>Not set</Text>
        )}
        <UnitText unit={unit} />
      </View>
      {children}
    </View>
  );
}
