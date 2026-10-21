/**
 * Form controls for the ticket screens in the "JouleOps App" artboard's
 * language (ticket detail, lines 403–459): 13/600 field heads with a grey
 * Required/Optional hint, radius-18 raised boxes, dashed photo slots, the
 * incident switch row and a searchable option sheet.
 */
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { Bx, type BxName } from "@/components/jo/Bx";
import { JoSheet, SearchField, f, useJoTheme } from "@/components/jo/ui";
import type { SelectOption } from "@/components/SearchableSelect";

/* ── Field head ─────────────────────────────────────────────────────────── */

/** "Temperature ······ Before required" — 13/600 label, 11.5 grey hint. */
export function FieldHead({
  label,
  hint,
  hintBad,
  style,
}: {
  label: string;
  hint?: string;
  /** Paints the hint red once a submit attempt found it missing. */
  hintBad?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  return (
    <View
      style={[
        { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 },
        style,
      ]}
    >
      <Text style={[f.t(13, 600), { color: t.ink, flexShrink: 1 }]}>{label}</Text>
      {hint ? (
        <Text style={[f.t(11.5, hintBad ? 600 : 400), { color: hintBad ? t.bad : t.muted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

/* ── Boxes ──────────────────────────────────────────────────────────────── */

function useBoxBorder(focused: boolean, invalid?: boolean, emphasis?: boolean) {
  const t = useJoTheme();
  if (invalid) return t.bad;
  if (focused || emphasis) return t.accent;
  return t.isDark ? "rgba(255,255,255,0.07)" : t.lineMid;
}

/** Text box (height ≥ 50, radius 18, #1C1C22). */
export function BoxInput({
  invalid,
  minHeight = 50,
  style,
  ...input
}: Omit<TextInputProps, "style"> & {
  invalid?: boolean;
  minHeight?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  const [focused, setFocused] = useState(false);
  const border = useBoxBorder(focused, invalid);
  return (
    <TextInput
      placeholderTextColor={t.faint}
      {...input}
      onFocus={(e) => {
        setFocused(true);
        input.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        input.onBlur?.(e);
      }}
      style={[
        f.t(14),
        {
          minHeight,
          borderRadius: 18,
          backgroundColor: t.raised,
          borderWidth: 1,
          borderColor: border,
          color: t.ink,
          paddingHorizontal: 14,
          paddingTop: input.multiline ? 14 : 0,
          paddingBottom: input.multiline ? 14 : 0,
          textAlignVertical: input.multiline ? "top" : "center",
        },
        style as never,
      ]}
    />
  );
}

/** Before / After temperature cell: grey label over a Bricolage 20 value + °C. */
export function TempBox({
  label,
  value,
  onChangeText,
  invalid,
  emphasis,
  style,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  invalid?: boolean;
  /** Accent outline — the value the selected status needs (artboard tdAfterBd). */
  emphasis?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  const [focused, setFocused] = useState(false);
  const border = useBoxBorder(focused, invalid, emphasis);
  return (
    <View
      style={[
        {
          minHeight: 58,
          borderRadius: 18,
          backgroundColor: t.raised,
          borderWidth: 1,
          borderColor: border,
          paddingVertical: 9,
          paddingHorizontal: 14,
        },
        style,
      ]}
    >
      <Text style={[f.t(11), { color: t.muted }]}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4, marginTop: 2 }}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder="0.0"
          placeholderTextColor={t.faint}
          keyboardType="decimal-pad"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={`${label} temperature, degrees Celsius`}
          style={[f.d(20, -0.025, 1.2), { color: t.ink, flex: 1, minWidth: 0, padding: 0 }]}
        />
        <Text style={[f.t(12), { color: t.muted }]}>°C</Text>
      </View>
    </View>
  );
}

/** Button-like box that opens an option sheet. */
export function SelectBox({
  value,
  placeholder,
  onPress,
  invalid,
  loading,
  accessibilityLabel,
  style,
}: {
  value: string;
  placeholder: string;
  onPress: () => void;
  invalid?: boolean;
  loading?: boolean;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  const border = useBoxBorder(false, invalid);
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${accessibilityLabel}: ${value || placeholder}`}
      style={[
        {
          minHeight: 50,
          borderRadius: 18,
          backgroundColor: t.raised,
          borderWidth: 1,
          borderColor: border,
          paddingHorizontal: 14,
          paddingVertical: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        },
        style,
      ]}
    >
      <Text style={[f.t(14), { color: value ? t.ink : t.faint, flex: 1 }]} numberOfLines={2}>
        {value || placeholder}
      </Text>
      {loading ? (
        <ActivityIndicator size="small" color={t.muted} />
      ) : (
        <Bx name="bx-chevron-down" size={18} color={t.muted} />
      )}
    </TouchableOpacity>
  );
}

/** Dashed photo slot (height 46, radius 23). */
export function PhotoSlot({
  icon,
  iconColor,
  label,
  onPress,
  active,
}: {
  icon: BxName;
  iconColor?: string;
  label: string;
  onPress: () => void;
  /** A photo is attached — solid OK tint instead of the dashed outline. */
  active?: boolean;
}) {
  const t = useJoTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        flex: 1,
        height: 46,
        borderRadius: 23,
        borderWidth: 1,
        borderStyle: active ? "solid" : "dashed",
        borderColor: active ? "transparent" : t.lineStrong,
        backgroundColor: active ? t.okTint : "transparent",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
      }}
    >
      <Bx name={icon} size={18} color={active ? t.ok : iconColor ?? t.muted} />
      <Text style={[f.t(13, 600), { color: active ? t.ok : t.ink }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/**
 * Single-choice chip set for short option lists (artboard idMeasures: idle
 * #1C1C22 chips, the picked one in the bright "selected" fill).
 */
export function ChoiceChips({
  options,
  value,
  onChange,
  invalid,
  label,
  style,
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  /** Outlines every chip red when a submit attempt found nothing picked. */
  invalid?: boolean;
  /** Group name for screen readers. */
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={[{ flexDirection: "row", flexWrap: "wrap", gap: 6 }, style]}
    >
      {options.map((o) => {
        const on = o === value;
        return (
          <TouchableOpacity
            key={o}
            onPress={() => onChange(o)}
            activeOpacity={0.8}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={{
              height: 36,
              paddingHorizontal: 13,
              borderRadius: 18,
              justifyContent: "center",
              backgroundColor: on ? t.selBg : t.raised,
              borderWidth: 1,
              borderColor: on ? t.selBg : invalid ? t.bad : t.lineMid,
            }}
          >
            <Text style={[f.t(12.5, 600), { color: on ? t.selFg : t.ink2 }]}>{o}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/* ── Switch row ─────────────────────────────────────────────────────────── */

/** "Raise an incident" card: tinted icon well · title + sub · 46×28 switch. */
export function SwitchRow({
  icon,
  iconColor,
  iconBg,
  title,
  sub,
  value,
  onToggle,
  style,
}: {
  icon: BxName;
  /** Defaults to the artboard's BAD well (incident). */
  iconColor?: string;
  iconBg?: string;
  title: string;
  sub: string;
  value: boolean;
  onToggle: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.85}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={title}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          borderRadius: 22,
          backgroundColor: t.card,
          borderWidth: 1,
          borderColor: t.cardBorder,
          paddingVertical: 13,
          paddingHorizontal: 14,
        },
        style,
      ]}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: iconBg ?? t.badTint,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Bx name={icon} size={18} color={iconColor ?? t.bad} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[f.t(13.5, 600), { color: t.ink }]}>{title}</Text>
        <Text style={[f.t(11.5), { color: t.muted, marginTop: 2 }]}>{sub}</Text>
      </View>
      <View style={{ width: 46, height: 28, borderRadius: 14, backgroundColor: value ? t.accent : t.track }}>
        <View
          style={{
            position: "absolute",
            top: 3,
            left: value ? 21 : 3,
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: value ? t.onAccent : t.faint,
          }}
        />
      </View>
    </TouchableOpacity>
  );
}

/* ── Option sheet ───────────────────────────────────────────────────────── */

function OptionRow({
  label,
  description,
  selected,
  onPress,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useJoTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 56,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: selected ? t.lineStrong : t.line,
        backgroundColor: selected ? t.raised : "transparent",
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[f.t(14.5, 600), { color: t.ink }]} numberOfLines={2}>
          {label}
        </Text>
        {description ? (
          <Text style={[f.t(11.5), { color: t.muted, marginTop: 2 }]} numberOfLines={1}>
            {description}
          </Text>
        ) : null}
      </View>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: selected ? t.accent : "transparent",
          borderWidth: 1.5,
          borderColor: selected ? t.accent : t.disabled,
        }}
      >
        {selected ? <Bx name="bx-check" size={15} color={t.onAccent} /> : null}
      </View>
    </TouchableOpacity>
  );
}

/**
 * Bottom sheet listing options. Search filters locally unless the caller
 * drives it (`onSearchChange`), in which case the caller's list is shown as
 * returned (server search) and `onLoadMore` pages it.
 */
export function OptionSheet({
  visible,
  onClose,
  title,
  subtitle,
  options,
  value,
  onPick,
  searchPlaceholder = "Search",
  searchValue,
  onSearchChange,
  loading,
  onLoadMore,
  hasMore,
  loadingMore,
  emptyMessage = "No options available",
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  options: SelectOption[];
  value: string;
  onPick: (value: string) => void;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (q: string) => void;
  loading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  emptyMessage?: string;
}) {
  const t = useJoTheme();
  const [localQuery, setLocalQuery] = useState("");
  const remote = Boolean(onSearchChange);
  const query = remote ? searchValue ?? "" : localQuery;
  const setQuery = remote ? onSearchChange! : setLocalQuery;

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (remote || !q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.description || "").toLowerCase().includes(q),
    );
  }, [options, query, remote]);

  const close = () => {
    setQuery("");
    onClose();
  };

  const searchable = remote || options.length > 6;

  return (
    <JoSheet visible={visible} onClose={close} title={title} subtitle={subtitle}>
      {searchable ? (
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder={searchPlaceholder}
          style={{ marginTop: 14, backgroundColor: t.sheetField }}
        />
      ) : null}
      <FlatList
        data={list}
        keyExtractor={(o) => o.value}
        keyboardShouldPersistTaps="handled"
        style={{ marginTop: 12, maxHeight: 420 }}
        contentContainerStyle={{ gap: 6 }}
        onEndReached={() => {
          if (onLoadMore && hasMore && !loadingMore) onLoadMore();
        }}
        onEndReachedThreshold={0.25}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ paddingVertical: 18 }} color={t.muted} />
          ) : (
            <Text style={[f.t(13), { color: t.muted, textAlign: "center", paddingVertical: 18 }]}>
              {query.trim() ? `Nothing matches “${query.trim()}”.` : emptyMessage}
            </Text>
          )
        }
        ListFooterComponent={
          loadingMore ? <ActivityIndicator style={{ paddingVertical: 12 }} color={t.muted} /> : null
        }
        renderItem={({ item }) => (
          <OptionRow
            label={item.label}
            description={item.description}
            selected={item.value === value}
            onPress={() => {
              onPick(item.value);
              close();
            }}
          />
        )}
      />
    </JoSheet>
  );
}
