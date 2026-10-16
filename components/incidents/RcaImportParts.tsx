/**
 * Building blocks shared by the "Upload RCA report" screens: big option cards
 * with a Recommended badge, a date + time tile pair (no future times), the
 * footer button row and the small notice/error lines.
 *
 * Built on the same DS tokens as the incident detail screen (TicketDetailUI),
 * so light and dark both follow the navy/red theme.
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
import { CalendarDays, Check, CircleAlert, Clock, Sparkles } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import { soRadius, soShadow } from "@/components/tickets/TicketDetailUI";
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
  const styles = useStyles();
  const ds = useDs();
  return (
    <View style={styles.pill}>
      <Sparkles size={11} color={ds.flame[100]} strokeWidth={2.4} />
      <Text style={styles.pillText}>{label}</Text>
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
  const styles = useStyles();
  const ds = useDs();
  return (
    <TouchableOpacity
      onPress={() => {
        tap();
        onPress();
      }}
      activeOpacity={0.85}
      style={[styles.option, selected && styles.optionOn]}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${label}${recommended ? ", recommended" : ""}${hint ? `. ${hint}` : ""}`}
    >
      <View style={[styles.radio, selected && styles.radioOn]}>
        {selected ? <Check size={14} color={ds.onControl} strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.optionTitleRow}>
          <Text style={styles.optionLabel}>{label}</Text>
          {badge ? (
            <View style={[styles.pill, { backgroundColor: ds.carbon[1000] }]}>
              <Text style={[styles.pillText, { color: ds.carbon[400] }]}>{badge}</Text>
            </View>
          ) : recommended ? (
            <RecommendedPill />
          ) : null}
        </View>
        {hint ? <Text style={styles.optionHint}>{hint}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

/* ── Notice + error lines ────────────────────────────────────────────────── */

export function InlineError({ text, style }: { text?: string | null; style?: ViewStyle }) {
  const styles = useStyles();
  const ds = useDs();
  if (!text) return null;
  return (
    <View style={[styles.errorRow, style]} accessibilityLiveRegion="polite">
      <CircleAlert size={14} color={ds.flame[100]} strokeWidth={2.2} style={{ marginTop: 1 }} />
      <Text style={styles.errorText}>{text}</Text>
    </View>
  );
}

export function Notice({
  icon: Icon,
  children,
  tone = "info",
  style,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
  tone?: "info" | "warn";
  style?: ViewStyle;
}) {
  const styles = useStyles();
  const ds = useDs();
  const warn = tone === "warn";
  return (
    <View
      style={[
        styles.notice,
        { backgroundColor: warn ? ds.flame[1000] : ds.sky[1000] },
        style,
      ]}
    >
      <Icon size={16} color={warn ? ds.flame[100] : ds.sky[100]} strokeWidth={2.1} />
      <Text style={[styles.noticeText, { color: ds.carbon[200] }]}>{children}</Text>
    </View>
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
  const styles = useStyles();
  const ds = useDs();
  const off = primaryDisabled || busy;
  return (
    <View style={[styles.footer, { paddingBottom: Math.max(bottomInset, 16) }]}>
      {note ? <InlineError text={note} style={{ marginBottom: 10 }} /> : null}
      {tertiaryLabel && onTertiary ? (
        <TouchableOpacity
          onPress={onTertiary}
          hitSlop={8}
          style={styles.tertiary}
          accessibilityRole="button"
          accessibilityLabel={tertiaryLabel}
        >
          <Text style={styles.tertiaryText}>{tertiaryLabel}</Text>
        </TouchableOpacity>
      ) : null}
      <View style={styles.footerRow}>
        {secondaryLabel && onSecondary ? (
          <TouchableOpacity
            onPress={onSecondary}
            activeOpacity={0.85}
            disabled={busy}
            style={[styles.btn, styles.btnSecondary]}
            accessibilityRole="button"
            accessibilityLabel={secondaryLabel}
          >
            <Text style={[styles.btnText, { color: ds.carbon[200] }]}>{secondaryLabel}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={onPrimary}
          activeOpacity={0.85}
          disabled={off}
          style={[
            styles.btn,
            quiet
              ? styles.btnSecondary
              : { backgroundColor: off && !busy ? ds.carbon[900] : ds.controlOn },
            { flex: secondaryLabel ? 1.6 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
          accessibilityState={{ disabled: !!off, busy: !!busy }}
        >
          {busy ? (
            <ActivityIndicator size="small" color={ds.onControl} />
          ) : (
            <Text
              style={[
                styles.btnText,
                { color: quiet ? ds.carbon[200] : off ? ds.carbon[500] : ds.onControl },
              ]}
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
  const styles = useStyles();
  const ds = useDs();
  const insets = useSafeAreaInsets();
  const [draftDate, setDraftDate] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [iosSheet, setIosSheet] = useState<{ mode: "date" | "time"; temp: Date } | null>(null);

  const full = parseLocal(value);
  const day = full ?? parseLocalDate(draftDate) ?? parseLocalDate(fallbackDate);
  const needsTime = !!day && !full;

  const combine = (d: Date, t: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), t.getHours(), t.getMinutes(), 0, 0);

  const applyTime = (t: Date, onDay: Date | null = day) => {
    const next = combine(onDay ?? new Date(), t);
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
        onChange: (evt, t) => {
          if (evt.type !== "set" || !t) return;
          applyTime(t, onDay);
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

  const tileStyle = [styles.tile, large && styles.tileLarge];
  return (
    <View>
      <View style={styles.tileRow}>
        <TouchableOpacity
          onPress={openDate}
          activeOpacity={0.85}
          style={[...tileStyle, invalid && !day && styles.tileInvalid]}
          accessibilityRole="button"
          accessibilityLabel={day ? `Date: ${formatDay(day)}. Tap to change` : "Choose date"}
        >
          <CalendarDays size={large ? 20 : 16} color={ds.carbon[400]} strokeWidth={2} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.tileEyebrow}>Date</Text>
            <Text
              style={[styles.tileValue, large && styles.tileValueLarge, !day && styles.tilePlaceholder]}
              numberOfLines={1}
            >
              {day ? formatDay(day) : "Choose date"}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => openTime()}
          activeOpacity={0.85}
          style={[...tileStyle, (needsTime || (invalid && !full)) && styles.tileNeeds]}
          accessibilityRole="button"
          accessibilityLabel={full ? `Time: ${formatClock(full)}. Tap to change` : "Choose time"}
        >
          <Clock
            size={large ? 20 : 16}
            color={needsTime ? ds.flame[100] : ds.carbon[400]}
            strokeWidth={2}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.tileEyebrow}>Time</Text>
            <Text
              style={[
                styles.tileValue,
                large && styles.tileValueLarge,
                !full && styles.tilePlaceholder,
                needsTime && { color: ds.flame[100] },
              ]}
              numberOfLines={1}
            >
              {full ? formatClock(full) : "Choose time"}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
      {needsTime && !pickError ? (
        <Text style={styles.tileHint}>Pick the time to continue.</Text>
      ) : null}
      <InlineError text={pickError} style={{ marginTop: 8 }} />

      {Platform.OS !== "android" ? (
        <Modal
          visible={!!iosSheet}
          transparent
          animationType="fade"
          onRequestClose={() => setIosSheet(null)}
          statusBarTranslucent
        >
          <Pressable style={styles.sheetBackdrop} onPress={() => setIosSheet(null)}>
            <Pressable
              onPress={() => {}}
              style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}
            >
              <View style={styles.sheetHead}>
                <TouchableOpacity onPress={() => setIosSheet(null)} hitSlop={10}>
                  <Text style={styles.sheetCancel}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.sheetTitle}>
                  {iosSheet?.mode === "time" ? "Choose time" : "Choose date"}
                </Text>
                <TouchableOpacity onPress={confirmIos} hitSlop={10}>
                  <Text style={styles.sheetDone}>Done</Text>
                </TouchableOpacity>
              </View>
              {iosSheet ? (
                <DateTimePicker
                  value={iosSheet.temp}
                  mode={iosSheet.mode}
                  display="spinner"
                  themeVariant={ds.isDark ? "dark" : "light"}
                  maximumDate={iosSheet.mode === "date" ? new Date() : undefined}
                  onChange={(_e, d) => {
                    if (d) setIosSheet((s) => (s ? { ...s, temp: d } : s));
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
  const styles = useStyles();
  return (
    <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={[styles.dot, i < index && styles.dotDone, i === index && styles.dotActive]}
        />
      ))}
    </View>
  );
}

const useStyles = makeThemedStyles((ds) => ({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: soRadius.pill,
    backgroundColor: ds.flame[1000],
  },
  pillText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    color: ds.flame[100],
  },

  option: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    minHeight: 60,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderRadius: soRadius.card,
    borderWidth: 1.5,
    borderColor: ds.isDark ? ds.cardBorder : ds.carbon[900],
    backgroundColor: ds.white,
    ...soShadow,
  },
  optionOn: {
    borderColor: ds.controlOn,
    backgroundColor: ds.sky[1000],
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: ds.carbon[800],
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  radioOn: { borderColor: ds.controlOn, backgroundColor: ds.controlOn },
  optionTitleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  optionLabel: { fontSize: 15, fontWeight: "600", color: ds.carbon[100], flexShrink: 1 },
  optionHint: { fontSize: 12.5, lineHeight: 17, color: ds.carbon[500], marginTop: 3 },

  errorRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  errorText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: "500", color: ds.flame[100] },

  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: soRadius.sm,
  },
  noticeText: { flex: 1, fontSize: 12.5, lineHeight: 18 },

  footer: {
    backgroundColor: ds.white,
    borderTopWidth: 1,
    borderTopColor: ds.isDark ? ds.cardBorder : ds.carbon[900],
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  footerRow: { flexDirection: "row", gap: 10 },
  btn: {
    flex: 1,
    minHeight: 50,
    borderRadius: soRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  btnSecondary: {
    backgroundColor: ds.white,
    borderWidth: 1,
    borderColor: ds.isDark ? ds.fieldBorder : ds.carbon[900],
  },
  btnText: { fontSize: 15, fontWeight: "600", letterSpacing: 0.15 },
  tertiary: { alignSelf: "center", paddingVertical: 4, marginBottom: 10 },
  tertiaryText: {
    fontSize: 13.5,
    fontWeight: "600",
    color: ds.carbon[400],
    textDecorationLine: "underline",
  },

  tileRow: { flexDirection: "row", gap: 10 },
  tile: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minHeight: 52,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: soRadius.sm,
    borderWidth: 1,
    borderColor: ds.fieldBorder,
    backgroundColor: ds.field,
  },
  tileLarge: { minHeight: 64, paddingHorizontal: 14 },
  tileInvalid: { borderColor: ds.flame[100] },
  tileNeeds: { borderColor: ds.flame[100], borderStyle: "dashed", borderWidth: 1.5 },
  tileEyebrow: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    color: ds.carbon[500],
  },
  tileValue: { fontSize: 13.5, fontWeight: "600", color: ds.carbon[100], marginTop: 2 },
  tileValueLarge: { fontSize: 16 },
  tilePlaceholder: { color: ds.carbon[600], fontWeight: "500" },
  tileHint: { fontSize: 12, color: ds.carbon[500], marginTop: 8 },

  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: ds.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 6,
    paddingHorizontal: 16,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: ds.carbon[1000],
  },
  sheetTitle: { fontSize: 15, fontWeight: "700", color: ds.carbon[100] },
  sheetCancel: { fontSize: 15, color: ds.carbon[500] },
  sheetDone: { fontSize: 15, fontWeight: "700", color: ds.sky[100] },

  dots: { flexDirection: "row", gap: 6, alignItems: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: ds.carbon[900] },
  dotDone: { backgroundColor: ds.carbon[600] },
  dotActive: { width: 22, backgroundColor: ds.flame[100] },
}));
