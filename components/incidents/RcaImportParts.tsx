/**
 * Building blocks shared by the "Upload RCA report" screens: big option cards
 * with a Recommended badge, a date + time tile pair (no future times), the
 * footer button row and the small notice/error lines.
 *
 * Drawn in the JouleOps App artboard's language (jo tokens), so light and
 * dark both follow the user's accent.
 */
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  Text,
  TouchableOpacity,
  View,
  type ViewStyle,
} from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Bx, type BxName } from "@/components/jo/Bx";
import { GlossFill, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import { InlineError as JoInlineError, Notice as JoNotice } from "./IncFields";
import {
  formatClock,
  formatDay,
  isFuture,
  parseLocal,
  parseLocalDate,
  toLocalDateString,
  toLocalString,
} from "./rcaImportLib";

const tap = () => Haptics.selectionAsync().catch(() => {});

/* ── Recommended badge ───────────────────────────────────────────────────── */

export function RecommendedPill({ label = "Recommended" }: { label?: string }) {
  const s = useStyles();
  const t = useJoTheme();
  return (
    <View style={s.pill}>
      <Bx name="bxs-magic-wand" size={11} color={t.accentInk} />
      <Text style={s.pillText}>{label}</Text>
    </View>
  );
}

/* ── Option card ─────────────────────────────────────────────────────────── */

export function OptionCard({
  label,
  hint,
  selected,
  recommended,
  badge,
  onPress,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  recommended?: boolean;
  /** Replaces the Recommended badge, e.g. "From search". */
  badge?: string;
  onPress: () => void;
}) {
  const s = useStyles();
  const t = useJoTheme();
  return (
    <TouchableOpacity
      onPress={() => {
        tap();
        onPress();
      }}
      activeOpacity={0.85}
      style={[s.option, selected && s.optionOn]}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${label}${recommended ? ", recommended" : ""}${hint ? `. ${hint}` : ""}`}
    >
      <View style={[s.radio, selected && s.radioOn]}>
        {selected ? <GlossFill color={t.accent} fg={t.onAccent} radius={12} bleed={1.5} /> : null}
        {selected ? <Bx name="bx-check" size={15} color={t.onAccent} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={s.optionTitleRow}>
          <Text style={s.optionLabel}>{label}</Text>
          {badge ? (
            <View style={[s.pill, { backgroundColor: t.track }]}>
              <Text style={[s.pillText, { color: t.ink2 }]}>{badge}</Text>
            </View>
          ) : recommended ? (
            <RecommendedPill />
          ) : null}
        </View>
        {hint ? <Text style={s.optionHint}>{hint}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

/* ── Notice + error lines ────────────────────────────────────────────────── */

export function InlineError({ text, style }: { text?: string | null; style?: ViewStyle }) {
  return <JoInlineError text={text} style={style} />;
}

export function Notice({
  icon,
  children,
  tone = "info",
  style,
}: {
  icon: BxName;
  children: React.ReactNode;
  tone?: "info" | "warn";
  style?: ViewStyle;
}) {
  return (
    <JoNotice icon={icon} tone={tone} style={style}>
      {children}
    </JoNotice>
  );
}

/* ── Footer buttons ──────────────────────────────────────────────────────── */

export function FooterButtons({
  bottomInset,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  quiet,
  busy,
  secondaryLabel,
  onSecondary,
  tertiaryLabel,
  onTertiary,
  note,
}: {
  bottomInset: number;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  /** Draw the only button as a secondary one (e.g. "Cancel" while working). */
  quiet?: boolean;
  busy?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** A quiet text action above the buttons, e.g. "Skip this question". */
  tertiaryLabel?: string;
  onTertiary?: () => void;
  /** A line above the buttons — an error or what's still missing. */
  note?: string | null;
}) {
  const s = useStyles();
  const t = useJoTheme();
  const off = primaryDisabled || busy;
  return (
    <View style={[s.footer, { paddingBottom: Math.max(bottomInset, 16) + 6 }]}>
      {note ? <InlineError text={note} style={{ marginBottom: 10, paddingHorizontal: 4 }} /> : null}
      {tertiaryLabel && onTertiary ? (
        <TouchableOpacity
          onPress={onTertiary}
          hitSlop={8}
          style={s.tertiary}
          accessibilityRole="button"
          accessibilityLabel={tertiaryLabel}
        >
          <Text style={s.tertiaryText}>{tertiaryLabel}</Text>
        </TouchableOpacity>
      ) : null}
      <View style={s.footerRow}>
        {secondaryLabel && onSecondary ? (
          <TouchableOpacity
            onPress={onSecondary}
            activeOpacity={0.85}
            disabled={busy}
            style={[s.btn, s.btnSecondary]}
            accessibilityRole="button"
            accessibilityLabel={secondaryLabel}
          >
            <Text style={[s.btnText, { color: t.ink }]} numberOfLines={1}>
              {secondaryLabel}
            </Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={onPrimary}
          activeOpacity={0.85}
          disabled={off}
          style={[
            s.btn,
            quiet ? s.btnSecondary : { backgroundColor: off && !busy ? t.track : t.accent },
            { flex: secondaryLabel ? 1.6 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
          accessibilityState={{ disabled: !!off, busy: !!busy }}
        >
          {!quiet && !(off && !busy) ? <GlossFill color={t.accent} fg={t.onAccent} radius={27} glow={12} /> : null}
          {busy ? (
            <ActivityIndicator size="small" color={t.onAccent} />
          ) : (
            <Text
              style={[
                quiet ? s.btnText : s.btnTextPrimary,
                { color: quiet ? t.ink : off ? t.muted : t.onAccent },
              ]}
              numberOfLines={1}
            >
              {primaryLabel}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ── Date + time tiles ───────────────────────────────────────────────────── */

const FUTURE_MSG = "That time is in the future. Please pick a time that has already passed.";

/**
 * A date tile and a time tile writing one local "YYYY-MM-DDTHH:mm" value.
 * `fallbackDate` ("YYYY-MM-DD") pre-fills the date when only the day is known:
 * the value stays empty until a time is chosen, so the person has to pick it.
 * Future times are refused at pick time.
 */
export function DateTimeTiles({
  value,
  fallbackDate,
  onChange,
  invalid,
  large,
}: {
  value: string | null;
  fallbackDate?: string | null;
  onChange: (local: string) => void;
  invalid?: boolean;
  /** Question screens: taller tiles with bigger text. */
  large?: boolean;
}) {
  const s = useStyles();
  const t = useJoTheme();
  const insets = useSafeAreaInsets();
  const [draftDate, setDraftDate] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [iosSheet, setIosSheet] = useState<{ mode: "date" | "time"; temp: Date } | null>(null);

  const full = parseLocal(value);
  const day = full ?? parseLocalDate(draftDate) ?? parseLocalDate(fallbackDate);
  const needsTime = !!day && !full;

  const combine = (d: Date, tm: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), tm.getHours(), tm.getMinutes(), 0, 0);

  const applyTime = (tm: Date, onDay: Date | null = day) => {
    const next = combine(onDay ?? new Date(), tm);
    if (isFuture(next)) {
      setPickError(FUTURE_MSG);
      return false;
    }
    setPickError(null);
    setDraftDate(null);
    onChange(toLocalString(next));
    return true;
  };

  /** Returns true when a time still has to be chosen for this day. */
  const applyDate = (d: Date): boolean => {
    setPickError(null);
    if (full) {
      const next = combine(d, full);
      if (isFuture(next)) {
        setPickError(FUTURE_MSG);
        return false;
      }
      onChange(toLocalString(next));
      return false;
    }
    setDraftDate(toLocalDateString(d));
    return true;
  };

  const openTime = (onDay: Date | null = day) => {
    tap();
    const base = full ?? (onDay ? combine(onDay, new Date()) : new Date());
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: base,
        mode: "time",
        onChange: (evt, tm) => {
          if (evt.type !== "set" || !tm) return;
          applyTime(tm, onDay);
        },
      });
      return;
    }
    setIosSheet({ mode: "time", temp: base });
  };

  const openDate = () => {
    tap();
    const base = day ?? new Date();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: base,
        mode: "date",
        maximumDate: new Date(),
        onChange: (evt, d) => {
          if (evt.type !== "set" || !d) return;
          // No time yet → go straight on to the time, as the create form does.
          if (applyDate(d)) setTimeout(() => openTime(d), 150);
        },
      });
      return;
    }
    setIosSheet({ mode: "date", temp: base });
  };

  const confirmIos = () => {
    if (!iosSheet) return;
    const { mode, temp } = iosSheet;
    if (mode === "date") {
      if (applyDate(temp)) {
        setIosSheet({ mode: "time", temp: combine(temp, new Date()) });
        return;
      }
    } else if (!applyTime(temp)) {
      return; // keep the sheet open so the person can correct it
    }
    setIosSheet(null);
  };

  const tileStyle = [s.tile, large && s.tileLarge];
  return (
    <View>
      <View style={s.tileRow}>
        <TouchableOpacity
          onPress={openDate}
          activeOpacity={0.85}
          style={[...tileStyle, invalid && !day && s.tileInvalid]}
          accessibilityRole="button"
          accessibilityLabel={day ? `Date: ${formatDay(day)}. Tap to change` : "Choose date"}
        >
          <Bx name="bx-calendar" size={large ? 20 : 17} color={t.accentInk} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.tileEyebrow}>Date</Text>
            <Text style={[s.tileValue, large && s.tileValueLarge, !day && s.tilePlaceholder]} numberOfLines={1}>
              {day ? formatDay(day) : "Choose date"}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => openTime()}
          activeOpacity={0.85}
          style={[...tileStyle, (needsTime || (invalid && !full)) && s.tileNeeds]}
          accessibilityRole="button"
          accessibilityLabel={full ? `Time: ${formatClock(full)}. Tap to change` : "Choose time"}
        >
          <Bx name="bx-time-five" size={large ? 20 : 17} color={needsTime ? t.bad : t.accentInk} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.tileEyebrow}>Time</Text>
            <Text
              style={[
                s.tileValue,
                large && s.tileValueLarge,
                !full && s.tilePlaceholder,
                needsTime && { color: t.bad },
              ]}
              numberOfLines={1}
            >
              {full ? formatClock(full) : "Choose time"}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
      {needsTime && !pickError ? <Text style={s.tileHint}>Pick the time to continue.</Text> : null}
      <InlineError text={pickError} style={{ marginTop: 8 }} />

      {Platform.OS !== "android" ? (
        <Modal visible={!!iosSheet} transparent animationType="fade" onRequestClose={() => setIosSheet(null)} statusBarTranslucent>
          <Pressable style={s.sheetBackdrop} onPress={() => setIosSheet(null)}>
            <Pressable onPress={() => {}} style={[s.sheet, { marginBottom: 8 + insets.bottom }]}>
              <View style={s.grabber} />
              <View style={s.sheetHead}>
                <TouchableOpacity onPress={() => setIosSheet(null)} hitSlop={10} accessibilityRole="button">
                  <Text style={s.sheetCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={s.sheetTitle}>{iosSheet?.mode === "time" ? "Choose time" : "Choose date"}</Text>
                <TouchableOpacity onPress={confirmIos} hitSlop={10} accessibilityRole="button">
                  <Text style={s.sheetDone}>Done</Text>
                </TouchableOpacity>
              </View>
              {iosSheet ? (
                <DateTimePicker
                  value={iosSheet.temp}
                  mode={iosSheet.mode}
                  display="spinner"
                  themeVariant={t.isDark ? "dark" : "light"}
                  maximumDate={iosSheet.mode === "date" ? new Date() : undefined}
                  onChange={(_e, d) => {
                    if (d) setIosSheet((cur) => (cur ? { ...cur, temp: d } : cur));
                  }}
                  style={{ alignSelf: "stretch" }}
                />
              ) : null}
              <InlineError text={pickError} style={{ marginTop: 4, paddingHorizontal: 4 }} />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

/* ── Step dots ───────────────────────────────────────────────────────────── */

export function StepDots({ count, index }: { count: number; index: number }) {
  const s = useStyles();
  return (
    <View style={s.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[s.dot, i < index && s.dotDone, i === index && s.dotActive]} />
      ))}
    </View>
  );
}

const useStyles = makeJoStyles((t) => ({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 20,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: t.accentTint,
  },
  pillText: { ...f.t(10.5, 600), color: t.accentInk },

  option: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    minHeight: 60,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: t.cardBorder,
    backgroundColor: t.card,
  },
  optionOn: { borderColor: t.accent, backgroundColor: t.accentTint },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: t.disabled,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  radioOn: { borderColor: t.accent, backgroundColor: t.accent },
  optionTitleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  optionLabel: { ...f.t(14.5, 600), color: t.ink, flexShrink: 1 },
  optionHint: { ...f.t(12.5), lineHeight: 17, color: t.muted, marginTop: 3 },

  footer: { backgroundColor: t.page, paddingTop: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: t.line },
  footerRow: { flexDirection: "row", gap: 8 },
  btn: {
    flex: 1,
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  btnSecondary: {
    backgroundColor: t.input,
    borderWidth: 1,
    borderColor: t.isDark ? "rgba(255,255,255,0.12)" : t.lineMid,
  },
  btnText: { ...f.t(14, 600) },
  btnTextPrimary: { ...f.t(15, 700) },
  tertiary: { alignSelf: "center", paddingVertical: 4, marginBottom: 10 },
  tertiaryText: { ...f.t(13.5, 600), color: t.muted, textDecorationLine: "underline" },

  tileRow: { flexDirection: "row", gap: 8 },
  tile: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minHeight: 54,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: t.isDark ? "rgba(255,255,255,0.07)" : t.lineMid,
    backgroundColor: t.raised,
  },
  tileLarge: { minHeight: 64, paddingHorizontal: 14 },
  tileInvalid: { borderColor: t.bad },
  tileNeeds: { borderColor: t.bad, borderStyle: "dashed", borderWidth: 1.5 },
  tileEyebrow: { ...f.t(11), color: t.muted },
  tileValue: { ...f.t(13.5, 600), color: t.ink, marginTop: 2 },
  tileValueLarge: { ...f.t(16, 600) },
  tilePlaceholder: { ...f.t(13.5, 500), color: t.faint },
  tileHint: { ...f.t(12), color: t.muted, marginTop: 8 },

  sheetBackdrop: { flex: 1, backgroundColor: t.scrim, justifyContent: "flex-end" },
  sheet: {
    marginHorizontal: 8,
    backgroundColor: t.input,
    borderWidth: 1,
    borderColor: t.lineMid,
    borderRadius: 38,
    paddingTop: 12,
    paddingHorizontal: 18,
    paddingBottom: 16,
  },
  grabber: { width: 40, height: 5, borderRadius: 3, backgroundColor: t.handle, alignSelf: "center", marginBottom: 8 },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  sheetTitle: { ...f.t(15, 600), color: t.ink },
  sheetCancel: { ...f.t(14.5), color: t.muted },
  sheetDone: { ...f.t(14.5, 600), color: t.accentInk },

  dots: { flexDirection: "row", gap: 6, alignItems: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.track },
  dotDone: { backgroundColor: t.faint },
  dotActive: { width: 22, backgroundColor: t.accent },
}));
