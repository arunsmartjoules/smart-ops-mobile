/**
 * Asset Mapping — module-local building blocks in the "JouleOps App"
 * artboard language (detail header with a round back button, radius-26
 * cards, radius-18 info tiles, tinted pills, dashed photo slots, the
 * gradient CTA bar). Only presentation lives here; the screens own the logic.
 *
 * The tab swipe + slide helpers mirror the old shared list chrome's
 * behaviour so the list keeps its swipe-between-tabs gesture without
 * depending on that (old-styled) module.
 */
import React, { useEffect, useMemo } from "react";
import {
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { Bx, type BxName } from "@/components/jo/Bx";
import { Card, IconButton, f, useJoTheme } from "@/components/jo/ui";
import { toneBg, toneFg, type JoTone } from "@/constants/jo";

/* ── Detail chrome ─────────────────────────────────────────────────────── */

/** Artboard detail header: 44 round back button · 15/600 title over an 11.5 sub · optional right slot. */
export function DetailTop({
  topInset,
  title,
  subtitle,
  onBack,
  backIcon = "bx-chevron-left",
  backLabel = "Back",
  right,
}: {
  topInset: number;
  title: string;
  subtitle?: string;
  onBack: () => void;
  backIcon?: BxName;
  backLabel?: string;
  right?: React.ReactNode;
}) {
  const t = useJoTheme();
  return (
    <View
      style={{
        paddingTop: topInset + 8,
        paddingHorizontal: 16,
        paddingBottom: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
      }}
    >
      <IconButton icon={backIcon} iconSize={24} label={backLabel} onPress={onBack} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[f.t(15, 600), { color: t.ink }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[f.t(11.5), { color: t.muted, marginTop: 2 }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/** Fixed bottom CTA area: page-coloured fade, then the button(s). */
export function BottomBar({
  bottomInset,
  children,
}: {
  bottomInset: number;
  children: React.ReactNode;
}) {
  const t = useJoTheme();
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingTop: 14,
        paddingHorizontal: 16,
        paddingBottom: Math.max(bottomInset, 12) + 14,
      }}
    >
      <LinearGradient
        pointerEvents="none"
        colors={[t.page + "00", t.page, t.page]}
        locations={[0, 0.34, 1]}
        style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
      />
      {children}
    </View>
  );
}

/** Height the BottomBar takes, so scroll content can clear it. */
export const bottomBarSpace = (bottomInset: number, extra = 0) =>
  14 + 54 + Math.max(bottomInset, 12) + 14 + 16 + extra;

/* ── Cards ─────────────────────────────────────────────────────────────── */

/** Radius-26 card with a 15/600 title and an optional grey (or tinted) meta on the right. */
export function SectionCard({
  title,
  meta,
  metaTone,
  children,
  style,
}: {
  title?: string;
  meta?: string;
  metaTone?: JoTone;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  return (
    <Card style={[{ padding: 16, marginTop: 10 }, style]}>
      {title ? (
        <View
          style={{
            flexDirection: "row",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 10,
            marginBottom: 12,
          }}
        >
          <Text style={[f.t(15, 600), { color: t.ink, flexShrink: 1 }]} numberOfLines={1}>
            {title}
          </Text>
          {meta ? (
            <Text
              style={[f.t(11.5, metaTone ? 600 : 400), { color: metaTone ? toneFg(t, metaTone) : t.muted }]}
              numberOfLines={1}
            >
              {meta}
            </Text>
          ) : null}
        </View>
      ) : null}
      {children}
    </Card>
  );
}

/** Radius-18 info tile: 11 grey label over a 13/600 value. */
export function InfoTile({ label, value }: { label: string; value: string }) {
  const t = useJoTheme();
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        borderRadius: 18,
        backgroundColor: t.card,
        borderWidth: 1,
        borderColor: t.cardBorder,
        paddingVertical: 11,
        paddingHorizontal: 12,
      }}
    >
      <Text style={[f.t(11), { color: t.muted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[f.t(13, 600), { color: t.ink, marginTop: 4 }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

/** Info tiles three to a row (the artboard's repeat(3, minmax(0,1fr)) grid). */
export function InfoGrid({ items }: { items: { label: string; value: string }[] }) {
  const rows: { label: string; value: string }[][] = [];
  for (let i = 0; i < items.length; i += 3) rows.push(items.slice(i, i + 3));
  return (
    <View style={{ gap: 6, marginTop: 14 }}>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 6 }}>
          {row.map((it) => (
            <InfoTile key={it.label} label={it.label} value={it.value} />
          ))}
          {/* Keep the last row's tiles the same width as the full rows. */}
          {Array.from({ length: 3 - row.length }).map((_, k) => (
            <View key={`pad-${k}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Grey info line with an icon (the artboard's "bx-info-circle" hints). */
export function HintRow({
  icon = "bx-info-circle",
  tone,
  children,
  style,
}: {
  icon?: BxName;
  tone?: JoTone;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  const color = tone ? toneFg(t, tone) : t.muted;
  return (
    <View style={[{ flexDirection: "row", alignItems: "flex-start", gap: 6 }, style]}>
      <Bx name={icon} size={15} color={color} style={{ marginTop: 1 }} />
      <Text style={[f.t(12), { color: tone ? color : t.muted, lineHeight: 17, flex: 1 }]}>{children}</Text>
    </View>
  );
}

/** Tinted banner (offline / couldn't refresh / required proof). */
export function Notice({
  tone,
  icon,
  text,
  style,
}: {
  tone: JoTone;
  icon: BxName;
  text: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          borderRadius: 18,
          paddingVertical: 11,
          paddingHorizontal: 14,
          backgroundColor: toneBg(t, tone),
        },
        style,
      ]}
    >
      <Bx name={icon} size={17} color={toneFg(t, tone)} />
      <Text style={[f.t(12, 500), { color: t.ink2, flex: 1, lineHeight: 17 }]}>{text}</Text>
    </View>
  );
}

/* ── Buttons ───────────────────────────────────────────────────────────── */

/**
 * Compact pill action inside a card (height 40). `accent` = filled accent,
 * `outline` = raised surface, `dashed` = the artboard's dashed photo button.
 */
export function ActionPill({
  icon,
  label,
  onPress,
  variant = "outline",
  tone,
  disabled,
  style,
  accessibilityLabel,
}: {
  icon?: BxName;
  label: string;
  onPress?: () => void;
  variant?: "accent" | "outline" | "dashed";
  /** Colours the outline variant's icon + label (e.g. bad for Remove). */
  tone?: JoTone;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const t = useJoTheme();
  const accent = variant === "accent";
  const fg = accent ? t.onAccent : tone ? toneFg(t, tone) : t.ink;
  const iconColor = accent ? t.onAccent : tone ? toneFg(t, tone) : variant === "dashed" ? t.accentInk : t.ink2;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || !onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      style={[
        {
          height: 40,
          paddingHorizontal: 14,
          borderRadius: 20,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          opacity: disabled ? 0.5 : 1,
        },
        accent
          ? { backgroundColor: t.accent }
          : variant === "dashed"
            ? { borderWidth: 1, borderStyle: "dashed", borderColor: t.lineStrong }
            : { backgroundColor: t.raised, borderWidth: 1, borderColor: t.lineMid },
        style,
      ]}
    >
      {icon ? <Bx name={icon} size={17} color={iconColor} /> : null}
      <Text style={[f.t(13, 600), { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/** 40 round icon-only button on the raised surface (gallery upload, etc.). */
export function RoundAction({
  icon,
  onPress,
  label,
  size = 40,
}: {
  icon: BxName;
  onPress: () => void;
  label: string;
  size?: number;
}) {
  const t = useJoTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: t.raised,
        borderWidth: 1,
        borderColor: t.lineMid,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Bx name={icon} size={18} color={t.ink2} />
    </TouchableOpacity>
  );
}

/** The artboard's dashed photo slot (height 76, radius 20). */
export function PhotoSlot({
  icon = "bx-camera",
  label,
  onPress,
  primary,
  style,
}: {
  icon?: BxName;
  label: string;
  onPress: () => void;
  /** Accent icon (the main slot); otherwise grey. */
  primary?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        {
          flex: 1,
          height: 76,
          borderRadius: 20,
          backgroundColor: t.card,
          borderWidth: 1,
          borderStyle: "dashed",
          borderColor: t.lineStrong,
          alignItems: "center",
          justifyContent: "center",
          gap: 5,
        },
        style,
      ]}
    >
      <Bx name={icon} size={20} color={primary ? t.accentInk : t.muted} />
      <Text style={[f.t(12.5, 600), { color: t.ink }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/* ── Activity ──────────────────────────────────────────────────────────── */

export function Timeline({ items }: { items: { key: string; title: string; meta: string; dot: string }[] }) {
  const t = useJoTheme();
  return (
    <View>
      {items.map((a, i) => (
        <View key={a.key} style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ width: 12, alignItems: "center" }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 4, backgroundColor: a.dot }} />
            {i < items.length - 1 ? (
              <View style={{ flex: 1, width: 1.5, backgroundColor: t.lineMid, marginVertical: 4 }} />
            ) : null}
          </View>
          <View style={{ flex: 1, minWidth: 0, paddingBottom: i < items.length - 1 ? 14 : 0 }}>
            <Text style={[f.t(13, 500), { color: t.ink }]}>{a.title}</Text>
            <Text style={[f.t(11.5), { color: t.muted, marginTop: 2 }]}>{a.meta}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/* ── Nameplate specs ───────────────────────────────────────────────────── */

export function SpecGrid({ specs }: { specs: { label: string; value: string }[] }) {
  const t = useJoTheme();
  const rows: { label: string; value: string }[][] = [];
  for (let i = 0; i < specs.length; i += 2) rows.push(specs.slice(i, i + 2));
  return (
    <View style={{ gap: 14 }}>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: "row", gap: 12 }}>
          {row.map((s, k) => (
            <View key={`${s.label}-${k}`} style={{ flex: 1, minWidth: 0 }}>
              <Text style={[f.t(11), { color: t.muted }]} numberOfLines={2}>
                {s.label}
              </Text>
              <Text style={[f.t(13, 500), { color: t.ink, marginTop: 3 }]} selectable>
                {s.value}
              </Text>
            </View>
          ))}
          {row.length < 2 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

/* ── List tab motion (swipe between tabs + slide-in) ───────────────────── */

const MOTION = { duration: 260, easing: Easing.bezier(0.4, 0, 0.2, 1) };
const SLIDE_DISTANCE = 26;

/** Slide + fade the list in from the side of the newly picked tab. */
export function useListSlide(seq: number, direction: number) {
  const offset = useSharedValue(0);
  useEffect(() => {
    if (seq === 0) return;
    offset.value = direction >= 0 ? SLIDE_DISTANCE : -SLIDE_DISTANCE;
    offset.value = withTiming(0, MOTION);
  }, [seq, direction, offset]);
  return useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
    opacity: 1 - Math.min(Math.abs(offset.value) / SLIDE_DISTANCE, 1),
  }));
}

const SWIPE_ACTIVATE_X = 24;
const SWIPE_FAIL_Y = 14;
const SWIPE_COMMIT_X = 60;
const SWIPE_COMMIT_VX = 500;

/**
 * Horizontal swipe moves to the next / previous tab. Vertical-first drags
 * fail the pan, so scrolling and pull-to-refresh are untouched.
 */
export function SwipeTabs<K extends string>({
  keys,
  active,
  onSelect,
  style,
  children,
}: {
  keys: K[];
  active: K;
  onSelect: (key: K) => void;
  style?: React.ComponentProps<typeof Animated.View>["style"];
  children: React.ReactNode;
}) {
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-SWIPE_ACTIVATE_X, SWIPE_ACTIVATE_X])
        .failOffsetY([-SWIPE_FAIL_Y, SWIPE_FAIL_Y])
        .onEnd((e) => {
          const committed =
            Math.abs(e.translationX) >= SWIPE_COMMIT_X || Math.abs(e.velocityX) >= SWIPE_COMMIT_VX;
          if (!committed || Math.abs(e.translationX) < Math.abs(e.translationY)) return;
          const idx = keys.indexOf(active);
          if (idx < 0) return;
          const next = keys[idx + (e.translationX < 0 ? 1 : -1)];
          if (!next) return;
          Haptics.selectionAsync().catch(() => {});
          onSelect(next);
        }),
    [keys, active, onSelect],
  );
  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={style} collapsable={false}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
