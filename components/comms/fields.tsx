/**
 * Form controls for the client-communication sheets, in the artboard's
 * visual language: radius-20 fields on the sheet-field surface, a 1.5px
 * accent outline while focused, a 12.5/500 label above and the fix-it error
 * right under the field.
 */
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import DateTimePicker from "@expo/ui/community/datetime-picker";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Calendar, ChevronDown, Clock, CloudOff, type LucideIcon } from "@/components/jo/bxIcons";
import { SearchField, SheetOption, f, useJoTheme } from "@/components/jo/ui";
import { fmtLong, hhmmToPickerDate, isoToPickerDate, nowHHMM, todayStr } from "./lib";

/* ── Label + error ─────────────────────────────────────────────────────── */

export function FieldBlock({
  label,
  required,
  error,
  hint,
  children,
  style,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  return (
    <View style={[{ gap: 7 }, style]}>
      <Text style={[f.t(12.5, 500), { color: t.ink3, paddingHorizontal: 4 }]}>
        {label}
        {required ? <Text style={{ color: t.bad }}> *</Text> : null}
      </Text>
      {children}
      {error ? (
        <Text style={[f.t(12, 500), { color: t.bad, paddingHorizontal: 4 }]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text style={[f.t(11.5), { color: t.muted, paddingHorizontal: 4 }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

function useFieldChrome(focused: boolean, error?: string) {
  const t = useJoTheme();
  return {
    borderRadius: 20,
    backgroundColor: t.sheetField,
    borderWidth: 1.5,
    borderColor: error ? t.bad : focused ? t.accent : "transparent",
  } satisfies ViewStyle;
}

/* ── Text input ────────────────────────────────────────────────────────── */

export function TextField({
  value,
  onChangeText,
  placeholder,
  multiline,
  minHeight,
  error,
  accessibilityLabel,
  ...rest
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  minHeight?: number;
  error?: string;
  accessibilityLabel: string;
} & Pick<TextInputProps, "autoCapitalize" | "keyboardType" | "returnKeyType" | "onSubmitEditing" | "editable">) {
  const t = useJoTheme();
  const [focused, setFocused] = useState(false);
  const chrome = useFieldChrome(focused, error);
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={t.faint}
      multiline={multiline}
      textAlignVertical={multiline ? "top" : "center"}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityLabel={accessibilityLabel}
      style={[
        chrome,
        f.t(14),
        {
          color: t.ink,
          paddingHorizontal: 16,
          ...(multiline
            ? { minHeight: minHeight ?? 110, paddingTop: 13, paddingBottom: 13, lineHeight: 20 }
            : { height: 48, paddingVertical: 0 }),
        },
      ]}
      {...rest}
    />
  );
}

/* ── Button-like field (opens a picker) ────────────────────────────────── */

export function SelectButton({
  value,
  placeholder,
  onPress,
  icon: Icon = ChevronDown,
  error,
  accessibilityLabel,
  disabled,
  style,
}: {
  value: string;
  placeholder: string;
  onPress: () => void;
  icon?: LucideIcon;
  error?: string;
  accessibilityLabel: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  const chrome = useFieldChrome(false, error);
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${accessibilityLabel}: ${value || placeholder}`}
      style={[
        chrome,
        {
          height: 48,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          opacity: disabled ? 0.6 : 1,
        },
        style,
      ]}
    >
      <Text style={[f.t(14), { color: value ? t.ink : t.faint, flex: 1 }]} numberOfLines={1}>
        {value || placeholder}
      </Text>
      <Icon size={17} color={t.muted} />
    </TouchableOpacity>
  );
}

/* ── Date / time ───────────────────────────────────────────────────────── */

/**
 * Calendar-date field. Value is a `YYYY-MM-DD` string; the native picker only
 * ever sees a local-noon Date built from its parts, so no UTC shift.
 * Android shows the system dialog; iOS expands an inline spinner.
 */
export function DateField({
  value,
  onChange,
  placeholder = "Pick a date",
  error,
  accessibilityLabel,
  minimumDate,
  maximumDate,
  mode = "date",
  style,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  accessibilityLabel: string;
  minimumDate?: string;
  maximumDate?: string;
  mode?: "date" | "time";
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  const [open, setOpen] = useState(false);
  const isTime = mode === "time";
  const shown = value ? (isTime ? value : fmtLong(value)) : "";
  const pickerValue = isTime
    ? hhmmToPickerDate(value || nowHHMM())
    : isoToPickerDate(value || todayStr());

  const apply = (d: Date) => {
    onChange(isTime ? nowHHMM(d) : todayStr(d));
  };

  return (
    <View style={style}>
      <SelectButton
        value={shown}
        placeholder={placeholder}
        onPress={() => setOpen((o) => !o)}
        icon={isTime ? Clock : Calendar}
        error={error}
        accessibilityLabel={accessibilityLabel}
      />
      {open ? (
        Platform.OS === "ios" ? (
          <View style={{ marginTop: 8, borderRadius: 20, backgroundColor: t.sheetField, paddingBottom: 6 }}>
            <DateTimePicker
              value={pickerValue}
              mode={mode}
              display="spinner"
              themeVariant={t.isDark ? "dark" : "light"}
              accentColor={t.accent}
              minimumDate={minimumDate ? isoToPickerDate(minimumDate) : undefined}
              maximumDate={maximumDate ? isoToPickerDate(maximumDate) : undefined}
              onValueChange={(_e, d) => apply(d)}
            />
            <TouchableOpacity
              onPress={() => {
                if (!value) apply(pickerValue);
                setOpen(false);
              }}
              style={{ alignSelf: "flex-end", paddingHorizontal: 16, paddingVertical: 8 }}
              accessibilityRole="button"
            >
              <Text style={[f.t(14, 600), { color: t.accentInk }]}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <DateTimePicker
            value={pickerValue}
            mode={mode}
            is24Hour
            minimumDate={minimumDate ? isoToPickerDate(minimumDate) : undefined}
            maximumDate={maximumDate ? isoToPickerDate(maximumDate) : undefined}
            onValueChange={(_e, d) => {
              setOpen(false);
              apply(d);
            }}
            onDismiss={() => setOpen(false)}
          />
        )
      ) : null}
    </View>
  );
}

/* ── Notices ───────────────────────────────────────────────────────────── */

export function OfflineNotice({ text, style }: { text: string; style?: StyleProp<ViewStyle> }) {
  const t = useJoTheme();
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 9,
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: 18,
          backgroundColor: t.warnTint,
        },
        style,
      ]}
      accessibilityRole="alert"
    >
      <CloudOff size={16} color={t.warn} />
      <Text style={[f.t(12.5, 500), { color: t.warn, flex: 1 }]}>{text}</Text>
    </View>
  );
}

/* ── Searchable list picker (rendered inside an open Modal) ────────────── */

export interface PickerItem {
  value: string;
  label: string;
  meta?: string;
}

/**
 * Bottom panel over the current sheet. Rendered as an absolute overlay
 * inside the parent Modal rather than as a second Modal, which iOS refuses
 * to stack reliably.
 */
export function PickerPanel({
  visible,
  title,
  items,
  value,
  onPick,
  onClose,
  searchPlaceholder = "Search",
  allowClear,
}: {
  visible: boolean;
  title: string;
  items: PickerItem[];
  value: string;
  onPick: (v: string) => void;
  onClose: () => void;
  searchPlaceholder?: string;
  allowClear?: boolean;
}) {
  const t = useJoTheme();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((i) => `${i.label} ${i.meta ?? ""}`.toLowerCase().includes(s));
  }, [items, q]);
  if (!visible) return null;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 50 }]}>
      <Animated.View entering={FadeIn.duration(180)} style={[StyleSheet.absoluteFill, { backgroundColor: t.scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <View style={{ flex: 1, justifyContent: "flex-end" }} pointerEvents="box-none">
        <Animated.View
          entering={SlideInDown.duration(240)}
          style={{
            marginHorizontal: 8,
            marginBottom: 8 + insets.bottom,
            maxHeight: "78%",
            backgroundColor: t.input,
            borderWidth: 1,
            borderColor: t.lineMid,
            borderRadius: 38,
            paddingTop: 12,
            paddingHorizontal: 18,
            paddingBottom: 18,
          }}
        >
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: t.handle, alignSelf: "center", marginBottom: 16 }} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <Text style={[f.d(22, -0.02), { color: t.ink, flexShrink: 1 }]}>{title}</Text>
            {allowClear && value ? (
              <TouchableOpacity
                onPress={() => {
                  onPick("");
                  onClose();
                }}
                accessibilityRole="button"
              >
                <Text style={[f.t(13, 600), { color: t.accentInk }]}>Clear</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {items.length > 6 ? (
            <SearchField value={q} onChangeText={setQ} placeholder={searchPlaceholder} style={{ marginTop: 14, backgroundColor: t.sheetField }} />
          ) : null}
          <FlatList
            data={list}
            keyExtractor={(i) => i.value}
            keyboardShouldPersistTaps="handled"
            style={{ marginTop: 10 }}
            contentContainerStyle={{ gap: 6 }}
            ListEmptyComponent={
              <Text style={[f.t(13), { color: t.muted, textAlign: "center", paddingVertical: 18 }]}>
                {q.trim() ? `Nothing matches “${q.trim()}”.` : "No options available."}
              </Text>
            }
            renderItem={({ item }) => (
              <SheetOption
                label={item.label}
                meta={item.meta}
                selected={item.value === value}
                onPress={() => {
                  onPick(item.value);
                  setQ("");
                  onClose();
                }}
              />
            )}
          />
        </Animated.View>
      </View>
    </View>
  );
}
