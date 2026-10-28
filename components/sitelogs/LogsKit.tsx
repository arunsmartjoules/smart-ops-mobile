/**
 * Site Logs building blocks in the "JouleOps App" artboard language — the
 * site-logs hub (log-type cards, shift chips) and the chemical-entry form
 * (back header, big numeric inputs, dosed yes/no choice, dashed photo slot,
 * remarks field, gradient "Save log" bar). Every entry / history screen of
 * the module is drawn from these so they read as one set.
 *
 * Presentation only — no data access here.
 */
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Bx, type BxName } from "@/components/jo/Bx";
import {
  GlossFill,
  IconButton,
  JoPage,
  JoSheet,
  PrimaryButton,
  SearchField,
  SheetOption,
  Shimmer,
  f,
  useJoTheme,
  type JoTheme,
} from "@/components/jo/ui";
import type { JoTone } from "@/constants/jo";

/* ── Per-type look (artboard LOGS: icon + tint colour) ─────────────────── */

const TYPE_LOOK: Record<string, { icon: BxName; tone: JoTone }> = {
  "Temp RH": { icon: "bxs-thermometer", tone: "bad" },
  // The artboard's `bxs-cloud-snow` is not in the bundled Boxicons font;
  // the outline glyph is the closest available.
  "Chiller Logs": { icon: "bx-cloud-snow", tone: "info" },
  Water: { icon: "bxs-droplet", tone: "info" },
  "Water Monitoring": { icon: "bxs-droplet", tone: "info" },
  "Chemical Dosing": { icon: "bxs-flask", tone: "ok" },
};

export function typeLook(t: JoTheme, logName: string) {
  const look = TYPE_LOOK[logName] ?? TYPE_LOOK["Temp RH"]!;
  return {
    icon: look.icon,
    tone: look.tone,
    fg: t[look.tone],
    bg: t[`${look.tone}Tint` as const],
  };
}

/** Normalised log status ("Pending" | "Inprogress" | "Completed") → pill. */
export function statusLook(status: string): { label: string; tone: JoTone } {
  if (status === "Completed") return { label: "Completed", tone: "ok" };
  if (status === "Inprogress") return { label: "In progress", tone: "info" };
  return { label: "Open", tone: "bad" };
}

/** "#0A0A0C" → "#0A0A0C00" — the fade-from colour for the bottom bar. */
const clearOf = (hex: string) => (/^#[0-9a-f]{6}$/i.test(hex) ? `${hex}00` : "transparent");

/* ── Screen chrome ─────────────────────────────────────────────────────── */

/** Entry / detail header: 44 round back button · 15/600 title · grey sub. */
export function EntryHeader({
  title,
  sub,
  onBack,
  right,
}: {
  title: string;
  sub?: string;
  onBack: () => void;
  right?: React.ReactNode;
}) {
  const t = useJoTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingTop: 8,
        paddingHorizontal: 16,
        paddingBottom: 12,
      }}
    >
      <IconButton icon="bx-chevron-left" iconSize={24} label="Back" onPress={onBack} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[f.t(15, 600), { color: t.ink }]} numberOfLines={1}>
          {title}
        </Text>
        {sub ? (
          <Text style={[f.t(11.5), { color: t.muted, marginTop: 2 }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {right ? <View style={{ flexDirection: "row", gap: 8 }}>{right}</View> : null}
    </View>
  );
}

/**
 * The artboard's bottom action bar: content fades into the page through a
 * gradient (transparent → page at 34%) behind a full-width button.
 */
export function BottomBar({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useJoTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={[{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 5 }, style]}
    >
      <LinearGradient
        pointerEvents="none"
        colors={[clearOf(t.page), t.page]}
        locations={[0, 0.34]}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={{
          paddingTop: 14,
          paddingHorizontal: 16,
          paddingBottom: Math.max(insets.bottom, 12) + 14,
          gap: 10,
        }}
      >
        {children}
      </View>
    </View>
  );
}

/** Bricolage 24 question / heading above a form (padding 0 4). */
export function FormHeading({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useJoTheme();
  return (
    <View style={[{ paddingHorizontal: 4 }, style]}>
      <Text style={[f.d(24, -0.025, 1.15), { color: t.ink }]}>{children}</Text>
    </View>
  );
}

/** 15/600 heading inside a form card ("Attachment", "Remarks"). */
export function CardTitle({
  children,
  right,
  style,
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }, style]}>
      <Text style={[f.t(15, 600), { color: t.ink, flexShrink: 1 }]} numberOfLines={1}>
        {children}
      </Text>
      {right}
    </View>
  );
}

/** Small tinted tag (the artboard's "Tank 2" pill). */
export function Tag({ label, tone = "info" }: { label: string; tone?: JoTone }) {
  const t = useJoTheme();
  return (
    <View
      style={{
        height: 24,
        paddingHorizontal: 10,
        borderRadius: 12,
        backgroundColor: t[`${tone}Tint` as const],
        justifyContent: "center",
        alignSelf: "flex-start",
      }}
    >
      <Text style={[f.t(11.5, 600), { color: t[tone] }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** 12.5/500 field label with an optional required asterisk. */
export function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  const t = useJoTheme();
  return (
    <Text style={[f.t(12.5, 500), { color: t.ink3, paddingHorizontal: 4 }]} numberOfLines={1}>
      {label}
      {required ? <Text style={{ color: t.bad }}> *</Text> : null}
    </Text>
  );
}

/** Tinted pill with a dot — "3 pending across 4 log types". */
export function NoticePill({
  text,
  tone = "bad",
  icon,
  style,
}: {
  text: string;
  tone?: JoTone;
  icon?: BxName;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  return (
    <View
      accessibilityRole="text"
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 7,
          minHeight: 32,
          paddingVertical: 6,
          paddingHorizontal: 12,
          borderRadius: 16,
          backgroundColor: t[`${tone}Tint` as const],
          alignSelf: "flex-start",
        },
        style,
      ]}
    >
      {icon ? (
        <Bx name={icon} size={15} color={t[tone]} />
      ) : (
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t[tone] }} />
      )}
      <Text style={[f.t(12.5, 600), { color: t[tone], flexShrink: 1 }]}>{text}</Text>
    </View>
  );
}

/* ── Inputs ────────────────────────────────────────────────────────────── */

const NUM_SIZE = {
  xl: { font: 44, height: 78, pad: 18, radius: 20, unit: 15 },
  md: { font: 28, height: 62, pad: 14, radius: 20, unit: 13.5 },
  sm: { font: 21, height: 54, pad: 12, radius: 18, unit: 12 },
} as const;

/**
 * Big numeric reading input — the artboard's "Quantity dosed" box: raised
 * well, Bricolage digits, the unit in grey after the value, a 1.5px accent
 * outline while focused. `error` turns the outline red; `attention` marks a
 * still-empty reading with a soft red outline.
 */
export function NumberField({
  label,
  required,
  value,
  onChangeText,
  unit,
  placeholder = "0.0",
  size = "md",
  error,
  attention,
  surface = "raised",
  keyboardType = "numeric",
  editable = true,
  style,
}: {
  label?: string;
  required?: boolean;
  value: string;
  onChangeText: (v: string) => void;
  unit?: string;
  placeholder?: string;
  size?: keyof typeof NUM_SIZE;
  error?: boolean;
  attention?: boolean;
  /** "sheet" = inside a bottom sheet (#1F1F26); "raised" = inside a card (#1C1C22). */
  surface?: "raised" | "sheet";
  keyboardType?: KeyboardTypeOptions;
  editable?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  const [focused, setFocused] = useState(false);
  const sz = NUM_SIZE[size];
  const border = error ? t.bad : focused ? t.accent : attention ? t.badBorder : t.lineMid;
  return (
    <View style={[{ gap: 7 }, style]}>
      {label ? <FieldLabel label={label} required={required} /> : null}
      <View
        style={{
          height: sz.height,
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: sz.pad,
          borderRadius: sz.radius,
          backgroundColor: surface === "sheet" ? t.sheetField : t.raised,
          borderWidth: 1.5,
          borderColor: border,
        }}
      >
        <TextInput
          value={value ?? ""}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={t.faint}
          keyboardType={keyboardType}
          editable={editable}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={label ? `${label}${unit ? ` (${unit})` : ""}` : unit}
          style={{
            flex: 1,
            minWidth: 0,
            padding: 0,
            margin: 0,
            color: t.ink,
            fontFamily: f.d(sz.font).fontFamily,
            fontSize: sz.font,
            letterSpacing: -0.04 * sz.font,
            includeFontPadding: false,
          }}
        />
        {unit ? (
          <Text style={[f.t(sz.unit, 500), { color: t.muted }]} numberOfLines={1}>
            {unit}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Remarks input (height 50, radius 18); `multiline` grows it to a note box. */
export function RemarksField({
  value,
  onChangeText,
  placeholder = "Optional notes",
  multiline,
  surface = "raised",
  label,
  editable = true,
  style,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  surface?: "raised" | "sheet";
  label?: string;
  editable?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={[{ gap: 7 }, style]}>
      {label ? <FieldLabel label={label} /> : null}
      <TextInput
        value={value ?? ""}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.faint}
        multiline={multiline}
        editable={editable}
        textAlignVertical={multiline ? "top" : "center"}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={label ?? placeholder}
        style={[
          f.t(14),
          {
            color: t.ink,
            borderRadius: 18,
            backgroundColor: surface === "sheet" ? t.sheetField : t.raised,
            borderWidth: 1,
            borderColor: focused ? t.accent : t.lineMid,
            paddingHorizontal: 14,
            ...(multiline
              ? { minHeight: 96, paddingTop: 13, paddingBottom: 13, lineHeight: 20 }
              : { height: 50, paddingVertical: 0 }),
          },
        ]}
      />
    </View>
  );
}

/**
 * "Was dosing carried out?" — two big choice buttons (height 64, radius 22).
 * Values stay the app's own: "Yes" / "No" ("" = not answered yet).
 */
export function DoseChoice({
  value,
  onChange,
  onCard,
  attention,
  disabled,
}: {
  value: string;
  onChange: (v: "Yes" | "No") => void;
  /** Inside a card the idle fill steps up to the raised surface. */
  onCard?: boolean;
  attention?: boolean;
  disabled?: boolean;
}) {
  const t = useJoTheme();
  const options = [
    { label: "Yes, dosed", v: "Yes" as const, icon: "bx-check-circle" as const },
    { label: "No dosing", v: "No" as const, icon: "bx-x-circle" as const },
  ];
  return (
    <View style={{ flexDirection: "row", gap: 8 }} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = value === o.v;
        const fg = on ? t.onAccent : t.ink2;
        return (
          <TouchableOpacity
            key={o.v}
            onPress={() => onChange(o.v)}
            disabled={disabled}
            activeOpacity={0.85}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled: !!disabled }}
            accessibilityLabel={o.label}
            style={{
              flex: 1,
              height: 64,
              borderRadius: 22,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              backgroundColor: on ? t.accent : onCard ? t.raised : t.card,
              borderWidth: 1.5,
              borderColor: on ? t.accent : attention && !value ? t.badBorder : t.lineMid,
              opacity: disabled ? 0.6 : 1,
            }}
          >
            {on ? <GlossFill color={t.accent} fg={fg} radius={22} bleed={1.5} /> : null}
            <Bx name={o.icon} size={20} color={fg} />
            <Text style={[f.t(15, 700), { color: fg }]} numberOfLines={1}>
              {o.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** Button-like field that opens a picker (site, chiller, date & time). */
export function SelectField({
  label,
  required,
  value,
  placeholder,
  onPress,
  icon,
  meta,
  loading,
  disabled,
  error,
}: {
  label?: string;
  required?: boolean;
  value: string;
  placeholder: string;
  onPress?: () => void;
  icon?: BxName;
  /** Secondary text at the right (e.g. the time next to a date). */
  meta?: string;
  loading?: boolean;
  disabled?: boolean;
  error?: boolean;
}) {
  const t = useJoTheme();
  const off = disabled || !onPress;
  return (
    <View style={{ gap: 7 }}>
      {label ? <FieldLabel label={label} required={required} /> : null}
      <TouchableOpacity
        onPress={onPress}
        disabled={off || loading}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityState={{ disabled: !!off }}
        accessibilityLabel={`${label ?? placeholder}: ${value || placeholder}`}
        style={{
          height: 52,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 16,
          borderRadius: 18,
          backgroundColor: t.raised,
          borderWidth: error ? 1.5 : 1,
          borderColor: error ? t.bad : t.lineMid,
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {icon ? <Bx name={icon} size={17} color={t.accentInk} /> : null}
        <Text style={[f.t(14, value ? 500 : 400), { color: value ? t.ink : t.faint, flex: 1 }]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        {meta ? (
          <Text style={[f.t(13, 500), { color: t.ink3 }]} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {loading ? (
          <ActivityIndicator size="small" color={t.muted} />
        ) : disabled ? (
          <Bx name="bx-lock-alt" size={15} color={t.faint} />
        ) : onPress ? (
          <Bx name="bx-chevron-down" size={18} color={t.muted} />
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

/** Read-only value well (e.g. "Assigned to" on an edited record). */
export function ReadOnlyField({ label, value, icon }: { label: string; value: string; icon?: BxName }) {
  const t = useJoTheme();
  return (
    <View style={{ gap: 7 }}>
      <FieldLabel label={label} />
      <View
        style={{
          height: 50,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingHorizontal: 16,
          borderRadius: 18,
          backgroundColor: t.raised,
        }}
      >
        {icon ? <Bx name={icon} size={16} color={t.muted} /> : null}
        <Text style={[f.t(14, 500), { color: t.ink2, flex: 1 }]} numberOfLines={1}>
          {value || "—"}
        </Text>
      </View>
    </View>
  );
}

/**
 * Controlled attachment slot for screens that run their own picker/upload
 * (the single-area entry screens): dashed "Add photo" slot while empty, the
 * photo with a remove button once attached.
 */
export function AttachmentSlot({
  value,
  uploading,
  onAdd,
  onRemove,
  cta = "Add photo",
}: {
  value?: string;
  uploading?: boolean;
  onAdd: () => void;
  onRemove: () => void;
  cta?: string;
}) {
  const t = useJoTheme();
  if (value) {
    return (
      <View style={{ borderRadius: 22, overflow: "hidden", backgroundColor: t.raised }}>
        <Image source={{ uri: value }} style={{ width: "100%", height: 180 }} resizeMode="cover" />
        <TouchableOpacity
          onPress={onRemove}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Remove photo"
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: t.bad,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <GlossFill color={t.bad} fg={t.onAccent} radius={18} />
          <Bx name="bx-trash" size={17} color={t.onAccent} />
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <TouchableOpacity
      onPress={onAdd}
      disabled={uploading}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={cta}
      style={{
        height: 52,
        borderRadius: 26,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: t.lineStrong,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
      }}
    >
      {uploading ? (
        <ActivityIndicator size="small" color={t.accentInk} />
      ) : (
        <>
          <Bx name="bx-camera" size={19} color={t.accentInk} />
          <Text style={[f.t(13.5, 600), { color: t.ink }]} numberOfLines={1}>
            {cta}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

/** Full-screen loading state for an entry screen. */
export function EntryLoading({ label = "Loading log…" }: { label?: string }) {
  const t = useJoTheme();
  return (
    <JoPage glow={false}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
        <ActivityIndicator size="large" color={t.accentInk} />
        <Text style={[f.t(13, 500), { color: t.muted }]}>{label}</Text>
      </View>
    </JoPage>
  );
}

/* ── Shift cells (hub card + history strip) ────────────────────────────── */

export interface ShiftCount {
  label: string;
  pending: number;
  completed: number;
}

/**
 * The artboard's 3-up shift grid: raised cells (radius 14) with the label
 * and a status dot — red while readings are owed, mint once all are in.
 * With `onSelect` the cells become a filter; the selected one fills ink.
 */
export function ShiftCells({
  counts,
  selected,
  onSelect,
  showCounts,
  style,
}: {
  counts: ShiftCount[];
  selected?: string | null;
  onSelect?: (label: string) => void;
  /** Adds an "n open · n done" line under each label. */
  showCounts?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  return (
    <View style={[{ flexDirection: "row", gap: 6 }, style]}>
      {counts.map((sc) => {
        const on = !!onSelect && selected === sc.label;
        const dot = sc.pending > 0 ? t.bad : sc.completed > 0 ? t.ok : t.track;
        const body = (
          <>
            {on ? <GlossFill color={t.selBg} fg={t.selFg} radius={14} /> : null}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
              <Text style={[f.t(11.5, on ? 600 : 400), { color: on ? t.selFg : t.ink3 }]} numberOfLines={1}>
                {sc.label}
              </Text>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
            </View>
            {showCounts ? (
              <Text style={[f.t(11, 500), { color: on ? t.selFg : t.muted, marginTop: 3 }]} numberOfLines={1}>
                {sc.pending} open · {sc.completed} done
              </Text>
            ) : null}
          </>
        );
        const cell: ViewStyle = {
          flex: 1,
          minWidth: 0,
          borderRadius: 14,
          backgroundColor: on ? t.selBg : t.raised,
          paddingVertical: 8,
          paddingHorizontal: 10,
        };
        const a11y = `${sc.label}: ${sc.pending} open, ${sc.completed} done`;
        return onSelect ? (
          <TouchableOpacity
            key={sc.label}
            onPress={() => onSelect(sc.label)}
            activeOpacity={0.85}
            style={cell}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={a11y}
          >
            {body}
          </TouchableOpacity>
        ) : (
          <View key={sc.label} style={cell} accessible accessibilityLabel={a11y}>
            {body}
          </View>
        );
      })}
    </View>
  );
}

/* ── Sheets ────────────────────────────────────────────────────────────── */

/**
 * Keyboard-aware variant of JoSheet for sheets that hold inputs: same
 * #17171C panel (inset 8, radius 38, grabber, Bricolage 22 title), lifted
 * above the keyboard on iOS (Android's window resize does it there).
 */
export function FormSheet({
  visible,
  onClose,
  title,
  subtitle,
  right,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const t = useJoTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {/* Plain Modal + native slide, like the PM sign sheet. Reanimated
          entering animations inside a Modal left the sheet's buttons
          unreachable on Android — taps fell through to this backdrop
          (see components/sitelogs/SignatureSheet). */}
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: t.scrim }]}
        onPress={onClose}
        accessibilityLabel="Close"
      />
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: "flex-end" }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        pointerEvents="box-none"
      >
        <View
          style={{
            marginHorizontal: 8,
            marginBottom: 8 + insets.bottom,
            maxHeight: "88%",
            backgroundColor: t.input,
            borderWidth: 1,
            borderColor: t.lineMid,
            borderRadius: 38,
            paddingTop: 12,
            paddingHorizontal: 20,
            paddingBottom: 20,
          }}
        >
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: t.handle, alignSelf: "center", marginBottom: 18 }} />
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[f.d(22, -0.02), { color: t.ink }]} numberOfLines={2}>
                {title}
              </Text>
              {subtitle ? (
                <Text style={[f.t(12.5), { color: t.muted, marginTop: 4 }]} numberOfLines={2}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {right}
          </View>
          {children}
          {footer}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export interface OptionItem {
  value: string;
  label: string;
  description?: string;
}

/** Searchable single-choice list in a JoSheet (site / chiller pickers). */
export function OptionSheet({
  visible,
  title,
  subtitle,
  options,
  value,
  onPick,
  onClose,
  loading,
  emptyText = "Nothing to choose from.",
  searchPlaceholder = "Search",
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  options: OptionItem[];
  value: string;
  onPick: (v: string) => void;
  onClose: () => void;
  loading?: boolean;
  emptyText?: string;
  searchPlaceholder?: string;
}) {
  const t = useJoTheme();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) => `${o.label} ${o.description ?? ""} ${o.value}`.toLowerCase().includes(s));
  }, [options, q]);
  const close = () => {
    setQ("");
    onClose();
  };
  return (
    <JoSheet visible={visible} onClose={close} title={title} subtitle={subtitle}>
      {options.length > 6 ? (
        <SearchField
          value={q}
          onChangeText={setQ}
          placeholder={searchPlaceholder}
          style={{ marginTop: 14, backgroundColor: t.sheetField }}
        />
      ) : null}
      {loading ? (
        <View style={{ gap: 6, marginTop: 14 }}>
          {[0, 1, 2].map((i) => (
            <Shimmer key={i} height={56} radius={20} />
          ))}
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(o) => o.value}
          keyboardShouldPersistTaps="handled"
          style={{ marginTop: 14, maxHeight: 420 }}
          contentContainerStyle={{ gap: 6 }}
          ListEmptyComponent={
            <Text style={[f.t(13), { color: t.muted, textAlign: "center", paddingVertical: 18 }]}>
              {q.trim() ? `Nothing matches “${q.trim()}”.` : emptyText}
            </Text>
          }
          renderItem={({ item }) => (
            <SheetOption
              label={item.label}
              meta={item.description}
              selected={item.value === value}
              onPress={() => {
                onPick(item.value);
                close();
              }}
            />
          )}
        />
      )}
    </JoSheet>
  );
}

/* ── States ────────────────────────────────────────────────────────────── */

/**
 * Write screen opened without an open attendance session. Read-only mode
 * unlocks the list views, not data entry — starting the day is the only way
 * forward (same copy and route as components/ViewOnlyEntryNotice).
 */
export function ReadOnlyEntry({ what, onBack }: { what: string; onBack?: () => void }) {
  const t = useJoTheme();
  return (
    <JoPage>
      <View style={{ paddingTop: 8, paddingHorizontal: 16 }}>
        <IconButton icon="bx-chevron-left" iconSize={24} label="Back" onPress={onBack ?? (() => router.back())} />
      </View>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, gap: 10 }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: t.warnTint,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 6,
          }}
        >
          <Bx name="bx-lock-alt" size={28} color={t.warn} />
        </View>
        <Text style={[f.d(24, -0.025), { color: t.ink, textAlign: "center" }]}>View-only mode</Text>
        <Text style={[f.t(14), { color: t.muted, textAlign: "center", lineHeight: 21 }]}>
          Start your day to record {what}. You&apos;re currently in view-only mode and can&apos;t submit entries.
        </Text>
        <PrimaryButton
          label="Start day"
          icon="bx-log-in"
          onPress={() => router.replace("/attendance")}
          style={{ alignSelf: "stretch", marginTop: 18 }}
        />
      </View>
    </JoPage>
  );
}
