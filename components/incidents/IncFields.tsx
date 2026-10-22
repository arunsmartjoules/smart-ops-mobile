/**
 * Form + chrome pieces for the incident screens, in the JouleOps App
 * artboard's language (app.dc.html incident detail / RCA): 26-radius #141418
 * panels, #1C1C22 inputs with a hairline, 11.5 grey labels, accent CTAs.
 *
 * Module-local on purpose — the shared ListChrome / TicketDetailUI pieces
 * belong to other modules and are being rebuilt separately.
 */
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
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
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bx, type BxName } from "@/components/jo/Bx";
import { GlossFill, IconButton, PrimaryButton, SearchField, f, useJoTheme } from "@/components/jo/ui";
import type { SelectOption } from "@/components/SearchableSelect";
import { formatIST } from "@/utils/istDate";

export const IST_DT_OPTS: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
};

/* ── Screen header (artboard detail: 44 back · title/sub · right slot) ──── */

export function IncHeader({
  title,
  subtitle,
  subtitleColor,
  onBack,
  backIcon = "bx-chevron-left",
  right,
}: {
  title: string;
  subtitle?: string;
  subtitleColor?: string;
  onBack: () => void;
  backIcon?: BxName;
  right?: React.ReactNode;
}) {
  const t = useJoTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        paddingTop: insets.top + 8,
        paddingHorizontal: 16,
        paddingBottom: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <IconButton icon={backIcon} iconSize={24} label="Back" onPress={onBack} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[f.t(15, 600), { color: t.ink }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[f.t(11.5), { color: subtitleColor ?? t.muted, marginTop: 2 }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/* ── Panels ────────────────────────────────────────────────────────────── */

/** Artboard RCA panel: radius 26, padding 16, 15/600 title + grey meta. */
export function Panel({
  title,
  meta,
  metaTone,
  children,
  style,
}: {
  title?: string;
  meta?: string;
  metaTone?: "bad" | "muted";
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  return (
    <View
      style={[
        {
          marginTop: 10,
          borderRadius: 26,
          backgroundColor: t.card,
          borderWidth: 1,
          borderColor: t.cardBorder,
          padding: 16,
        },
        style,
      ]}
    >
      {title ? (
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <Text style={[f.t(15, 600), { color: t.ink, flexShrink: 1 }]}>{title}</Text>
          {meta ? (
            <Text style={[f.t(12, metaTone === "bad" ? 600 : 400), { color: metaTone === "bad" ? t.bad : t.muted }]}>
              {meta}
            </Text>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

/* ── Label + error ─────────────────────────────────────────────────────── */

export function FieldLabel({
  label,
  required,
  style,
}: {
  label: string;
  required?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  return (
    <View style={style}>
      <Text style={[f.t(11.5), { color: t.muted }]}>
        {label}
        {required ? <Text style={{ color: t.bad }}> *</Text> : null}
      </Text>
    </View>
  );
}

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
  error?: string | null;
  hint?: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  return (
    <View style={[{ marginTop: 14 }, style]}>
      <FieldLabel label={label} required={required} />
      <View style={{ marginTop: 6 }}>{children}</View>
      {error ? (
        <InlineError text={error} style={{ marginTop: 6 }} />
      ) : hint ? (
        <Text style={[f.t(11.5), { color: t.muted, marginTop: 6 }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

export function InlineError({ text, style }: { text?: string | null; style?: StyleProp<ViewStyle> }) {
  const t = useJoTheme();
  if (!text) return null;
  return (
    <View style={[{ flexDirection: "row", alignItems: "flex-start", gap: 6 }, style]} accessibilityLiveRegion="polite">
      <Bx name="bx-error-circle" size={14} color={t.bad} style={{ marginTop: 1 }} />
      <Text style={[f.t(12, 500), { color: t.bad, flex: 1, lineHeight: 17 }]}>{text}</Text>
    </View>
  );
}

/** Tinted one-line notice (offline, read-only, info). */
export function Notice({
  icon,
  tone = "info",
  children,
  style,
}: {
  icon: BxName;
  tone?: "info" | "warn" | "bad" | "mute";
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  const fg = t[tone];
  const bg = t[`${tone}Tint` as const];
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 9,
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: 18,
          backgroundColor: bg,
        },
        style,
      ]}
    >
      <Bx name={icon} size={16} color={fg} style={{ marginTop: 1 }} />
      <Text style={[f.t(12.5, 500), { color: tone === "mute" ? t.ink2 : fg, flex: 1, lineHeight: 18 }]}>{children}</Text>
    </View>
  );
}

/* ── Inputs ────────────────────────────────────────────────────────────── */

function useInputChrome(focused: boolean, invalid?: boolean) {
  const t = useJoTheme();
  return {
    borderRadius: 14,
    backgroundColor: t.raised,
    borderWidth: 1,
    borderColor: invalid ? t.bad : focused ? t.accent : t.isDark ? "rgba(255,255,255,0.07)" : t.lineMid,
  } satisfies ViewStyle;
}

export function TextField({
  value,
  onChangeText,
  placeholder,
  multiline,
  minHeight,
  invalid,
  accessibilityLabel,
  ...rest
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  minHeight?: number;
  invalid?: boolean;
  accessibilityLabel: string;
} & Pick<TextInputProps, "maxLength" | "editable" | "autoCapitalize" | "returnKeyType">) {
  const t = useJoTheme();
  const [focused, setFocused] = useState(false);
  const chrome = useInputChrome(focused, invalid);
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
        f.t(13.5),
        {
          color: t.ink,
          paddingHorizontal: 12,
          ...(multiline
            ? { minHeight: minHeight ?? 96, paddingTop: 12, paddingBottom: 12, lineHeight: 19 }
            : { height: 46, paddingVertical: 0 }),
        },
      ]}
      {...rest}
    />
  );
}

/** A field-shaped button (opens a picker / date). */
export function SelectButton({
  value,
  placeholder,
  onPress,
  icon = "bx-chevron-down",
  invalid,
  disabled,
  loading,
  accessibilityLabel,
  style,
}: {
  value: string;
  placeholder: string;
  onPress: () => void;
  icon?: BxName;
  invalid?: boolean;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  const chrome = useInputChrome(false, invalid);
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityLabel={`${accessibilityLabel}: ${value || placeholder}`}
      style={[
        chrome,
        {
          minHeight: 46,
          paddingHorizontal: 12,
          paddingVertical: 10,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          opacity: disabled ? 0.55 : 1,
        },
        style,
      ]}
    >
      <Text style={[f.t(13.5), { color: value ? t.ink : t.faint, flex: 1 }]} numberOfLines={2}>
        {value || placeholder}
      </Text>
      {loading ? (
        <ActivityIndicator size="small" color={t.muted} />
      ) : disabled ? (
        <Bx name="bx-lock-alt" size={15} color={t.faint} />
      ) : (
        <Bx name={icon} size={17} color={t.muted} />
      )}
    </TouchableOpacity>
  );
}

/* ── Searchable picker ─────────────────────────────────────────────────── */

/**
 * Field + bottom-sheet list. Same contract as FullscreenPicker: local
 * filtering by default; `remoteSearch` hands the query to the caller
 * (`searchValue` / `onSearchChange`) and shows `options` as given.
 */
export function IncPicker({
  label,
  required,
  value,
  options,
  onChange,
  placeholder = "Select an option",
  loading,
  disabled,
  searchPlaceholder = "Search",
  emptyMessage = "No options found",
  searchValue,
  onSearchChange,
  remoteSearch,
  error,
  hint,
  style,
}: {
  label: string;
  required?: boolean;
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
  placeholder?: string;
  loading?: boolean;
  disabled?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  searchValue?: string;
  onSearchChange?: (q: string) => void;
  remoteSearch?: boolean;
  error?: string | null;
  hint?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [localQ, setLocalQ] = useState("");
  const q = searchValue ?? localQ;
  const setQ = (v: string) => (onSearchChange ? onSearchChange(v) : setLocalQ(v));

  const selected = options.find((o) => o.value === value);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (remoteSearch || !s) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(s) || (o.description ?? "").toLowerCase().includes(s),
    );
  }, [options, q, remoteSearch]);

  const close = () => {
    setOpen(false);
    setQ("");
  };

  return (
    <FieldBlock label={label} required={required} error={error} hint={hint} style={style}>
      <SelectButton
        value={selected?.label ?? value}
        placeholder={placeholder}
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityLabel={label}
        invalid={!!error}
      />
      <Modal visible={open} transparent animationType="fade" onRequestClose={close} statusBarTranslucent navigationBarTranslucent>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: t.scrim }]} onPress={close} accessibilityLabel="Close" />
          <View style={{ flex: 1, justifyContent: "flex-end" }} pointerEvents="box-none">
            <View
              style={{
                marginHorizontal: 8,
                marginBottom: 8 + insets.bottom,
                maxHeight: "82%",
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
              <Text style={[f.d(22, -0.02), { color: t.ink }]} numberOfLines={1}>
                {label}
              </Text>
              {remoteSearch || options.length > 6 ? (
                <SearchField
                  value={q}
                  onChangeText={setQ}
                  placeholder={searchPlaceholder}
                  style={{ marginTop: 14, backgroundColor: t.sheetField }}
                />
              ) : null}
              {loading ? (
                <ActivityIndicator color={t.muted} style={{ paddingVertical: 22 }} />
              ) : (
                <FlatList
                  data={list}
                  keyExtractor={(o, i) => `${o.value}-${i}`}
                  keyboardShouldPersistTaps="handled"
                  style={{ marginTop: 10 }}
                  contentContainerStyle={{ gap: 6 }}
                  ListEmptyComponent={
                    <Text style={[f.t(13), { color: t.muted, textAlign: "center", paddingVertical: 18 }]}>
                      {emptyMessage}
                    </Text>
                  }
                  renderItem={({ item }) => {
                    const on = item.value === value;
                    return (
                      <TouchableOpacity
                        onPress={() => {
                          onChange(item.value);
                          close();
                        }}
                        activeOpacity={0.8}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 12,
                          minHeight: 56,
                          paddingVertical: 10,
                          paddingHorizontal: 16,
                          borderRadius: 20,
                          borderWidth: 1,
                          borderColor: on ? t.lineStrong : t.line,
                          backgroundColor: on ? t.raised : "transparent",
                        }}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[f.t(14, 600), { color: t.ink }]} numberOfLines={2}>
                            {item.label}
                          </Text>
                          {item.description ? (
                            <Text style={[f.t(12), { color: t.muted, marginTop: 2 }]} numberOfLines={1}>
                              {item.description}
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
                            backgroundColor: on ? t.accent : "transparent",
                            borderWidth: 1.5,
                            borderColor: on ? t.accent : t.disabled,
                          }}
                        >
                          {on ? <GlossFill color={t.accent} fg={t.onAccent} radius={11} bleed={1.5} /> : null}
                          {on ? <Bx name="bx-check" size={15} color={t.onAccent} /> : null}
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                />
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </FieldBlock>
  );
}

/* ── Date + time ───────────────────────────────────────────────────────── */

/**
 * Date-then-time picker writing one Date. Android chains the system date and
 * time dialogs (as before); iOS expands an inline spinner with Done.
 * `noFuture` refuses a future instant at pick time.
 */
export function DateTimeField({
  label,
  value,
  onChange,
  disabled,
  noFuture,
  style,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  disabled?: boolean;
  noFuture?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  const [iosOpen, setIosOpen] = useState(false);
  const apply = (d: Date) => {
    if (noFuture && d.getTime() > Date.now()) {
      Alert.alert("Invalid time", "Future date/time is not allowed.");
      return;
    }
    onChange(d);
  };
  const open = () => {
    if (disabled) return;
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value,
        mode: "date",
        is24Hour: true,
        ...(noFuture ? { maximumDate: new Date() } : {}),
        onChange: (_e, d1) => {
          if (!d1) return;
          DateTimePickerAndroid.open({
            value: d1,
            mode: "time",
            is24Hour: true,
            onChange: (_e2, d2) => {
              if (!d2) return;
              apply(d2);
            },
          });
        },
      });
      return;
    }
    setIosOpen((o) => !o);
  };
  return (
    <FieldBlock label={label} style={style}>
      <SelectButton
        value={formatIST(value, IST_DT_OPTS, "en-US")}
        placeholder="Pick date and time"
        onPress={open}
        icon="bx-calendar"
        disabled={disabled}
        accessibilityLabel={label}
      />
      {iosOpen && Platform.OS !== "android" ? (
        <View style={{ marginTop: 8, borderRadius: 20, backgroundColor: t.raised, paddingBottom: 6 }}>
          <DateTimePicker
            value={value}
            mode="datetime"
            display="spinner"
            themeVariant={t.isDark ? "dark" : "light"}
            maximumDate={noFuture ? new Date() : undefined}
            onChange={(_e, d) => {
              if (d) apply(d);
            }}
          />
          <TouchableOpacity
            onPress={() => setIosOpen(false)}
            style={{ alignSelf: "flex-end", paddingHorizontal: 16, paddingVertical: 8 }}
            accessibilityRole="button"
          >
            <Text style={[f.t(14, 600), { color: t.accentInk }]}>Done</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </FieldBlock>
  );
}

/* ── Toggle row (artboard "Asset verified stable") ─────────────────────── */

export function ToggleRow({
  icon,
  title,
  sub,
  on,
  onToggle,
  disabled,
  style,
}: {
  icon: BxName;
  title: string;
  sub?: string;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  return (
    <TouchableOpacity
      onPress={onToggle}
      disabled={disabled}
      activeOpacity={0.85}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled: !!disabled }}
      accessibilityLabel={title}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          marginTop: 10,
          borderRadius: 22,
          backgroundColor: t.card,
          borderWidth: 1,
          borderColor: t.cardBorder,
          paddingVertical: 13,
          paddingHorizontal: 14,
          opacity: disabled ? 0.6 : 1,
        },
        style,
      ]}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: t.okTint,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Bx name={icon} size={18} color={t.ok} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[f.t(13.5, 600), { color: t.ink }]}>{title}</Text>
        {sub ? <Text style={[f.t(11.5), { color: t.muted, marginTop: 2 }]}>{sub}</Text> : null}
      </View>
      <View style={{ width: 46, height: 28, borderRadius: 14, backgroundColor: on ? t.ok : t.track }}>
        <View
          style={{
            position: "absolute",
            top: 3,
            left: on ? 21 : 3,
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: t.isDark ? t.ink : t.card,
          }}
        />
      </View>
    </TouchableOpacity>
  );
}

/* ── Bottom action bar (artboard: fade to page + 54 buttons) ───────────── */

export function ActionBar({
  bottomInset,
  note,
  noteTone = "bad",
  children,
}: {
  bottomInset: number;
  note?: string | null;
  noteTone?: "bad" | "muted";
  children: React.ReactNode;
}) {
  const t = useJoTheme();
  return (
    <View>
      <LinearGradient
        pointerEvents="none"
        colors={[t.isDark ? "rgba(10,10,12,0)" : "rgba(244,244,246,0)", t.page]}
        style={{ position: "absolute", left: 0, right: 0, top: -24, height: 24 }}
      />
      <View style={{ backgroundColor: t.page, paddingTop: 10, paddingHorizontal: 16, paddingBottom: Math.max(bottomInset, 16) + 6 }}>
        {note ? (
          noteTone === "bad" ? (
            <InlineError text={note} style={{ marginBottom: 10, paddingHorizontal: 4 }} />
          ) : (
            <Text style={[f.t(12), { color: t.muted, marginBottom: 10, paddingHorizontal: 4 }]}>{note}</Text>
          )
        ) : null}
        <View style={{ flexDirection: "row", gap: 8 }}>{children}</View>
      </View>
    </View>
  );
}

/** The bar's primary CTA — stretches to fill. */
export function BarPrimary(props: React.ComponentProps<typeof PrimaryButton>) {
  return <PrimaryButton {...props} style={[{ flex: 1 }, props.style]} />;
}

/** The bar's secondary button ("Save draft" look). */
export function BarSecondary({
  label,
  onPress,
  disabled,
  flex,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  flex?: number;
}) {
  const t = useJoTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        height: 54,
        paddingHorizontal: 20,
        borderRadius: 27,
        borderWidth: 1,
        borderColor: t.isDark ? "rgba(255,255,255,0.12)" : t.lineMid,
        backgroundColor: t.input,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.55 : 1,
        ...(flex ? { flex } : null),
      }}
    >
      <Text style={[f.t(14, 600), { color: t.ink }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/** Artboard filter chip: 34 high, label + plain count. */
export function IncChip({
  label,
  count,
  selected,
  onPress,
}: {
  label: string;
  count?: number;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useJoTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}${count != null ? `, ${count}` : ""}`}
      style={{
        height: 34,
        paddingHorizontal: 12,
        borderRadius: 17,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: selected ? t.selBg : t.raised,
        borderWidth: 1,
        borderColor: selected ? t.selBg : t.lineMid,
      }}
    >
      {selected ? <GlossFill color={t.selBg} fg={t.selFg} radius={17} bleed={1} /> : null}
      <Text style={[f.t(12.5, 600), { color: selected ? t.selFg : t.ink2 }]} numberOfLines={1}>
        {label}
      </Text>
      {count != null ? (
        <Text style={[f.t(11, 600), { color: selected ? t.faint : t.muted }]}>{count}</Text>
      ) : null}
    </TouchableOpacity>
  );
}
