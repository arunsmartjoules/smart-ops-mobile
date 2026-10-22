/**
 * Shared building blocks for screens built on the Claude Design
 * "JouleOps App" artboard — carbon canvas, #141418 cards, one user accent,
 * Bricolage Grotesque numbers over Geist text.
 *
 * Measurements are the artboard's CSS values (px → dp 1:1). Letter-spacing
 * in em is converted to dp (em × font size). Colours come from the theme
 * (hooks/useJoTheme) — never hard-code a hex in a screen.
 */
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { LucideIcon } from "lucide-react-native";
import { Bx, type BxName } from "@/components/jo/Bx";
import { JF, avatarColor, initials, toneBg, toneFg, type JoTone } from "@/constants/jo";
import { makeJoStyles, useJoTheme, type JoTheme } from "@/hooks/useJoTheme";
import { useNavInsets } from "@/components/jo/navInsets";

/* ── Type ──────────────────────────────────────────────────────────────── */

type Weight = 400 | 500 | 600 | 700;
const GEIST: Record<Weight, string> = {
  400: JF.regular,
  500: JF.medium,
  600: JF.semibold,
  700: JF.bold,
};
const MONO: Record<Weight, string> = {
  400: JF.mono,
  500: JF.monoM,
  600: JF.monoSB,
  700: JF.monoSB,
};

/**
 * Font helpers. `d` = Bricolage display (numbers, titles); `t` = Geist text;
 * `m` = Geist Mono. `ls` is the artboard's letter-spacing in em.
 */
export const f = {
  d: (size: number, ls = -0.025, lh?: number): TextStyle => ({
    fontFamily: JF.display,
    fontSize: size,
    letterSpacing: ls * size,
    // CSS line-heights of .9–1 clip Bricolage's ascenders in RN; 1.08 is the
    // tightest that renders whole glyphs on both platforms.
    lineHeight: Math.round(size * (lh ?? 1.08)),
    includeFontPadding: false,
  }),
  t: (size: number, w: Weight = 400, ls = 0): TextStyle => ({
    fontFamily: GEIST[w],
    fontSize: size,
    ...(ls ? { letterSpacing: ls * size } : null),
  }),
  m: (size: number, w: Weight = 400): TextStyle => ({
    fontFamily: MONO[w],
    fontSize: size,
  }),
};

/** Uppercase kicker: 12px / 600 / .04em — section captions, hero labels. */
export const capsStyle = (size = 12, ls = 0.04): TextStyle => ({
  ...f.t(size, 600, ls),
  textTransform: "uppercase",
});

/* ── Icons ─────────────────────────────────────────────────────────────── */

/**
 * An icon prop: a Boxicons class name (the artboards' set — prefer this) or a
 * lucide component (older call sites).
 */
export type JoIcon = BxName | LucideIcon | React.ComponentType<{ size?: number; color?: string }>;

export function JoIconView({ icon, size, color }: { icon: JoIcon; size: number; color: string }) {
  if (typeof icon === "string") return <Bx name={icon} size={size} color={color} />;
  const Icon = icon as React.ComponentType<{ size?: number; color?: string }>;
  return <Icon size={size} color={color} />;
}

/* ── Page chrome ───────────────────────────────────────────────────────── */

/** "rgba(r,g,b,a)" / "#rrggbb" → SVG stop colour + opacity (react-native-svg ignores rgba alpha). */
function splitAlpha(c: string): { color: string; opacity: number } {
  const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(c.trim());
  if (!m) return { color: c, opacity: 1 };
  return { color: `rgb(${m[1]},${m[2]},${m[3]})`, opacity: m[4] != null ? Number(m[4]) : 1 };
}

/**
 * The artboard's top-right accent glow: a 320 circle at top −120 / right −90
 * filled with `radial-gradient(circle, glow 0%, transparent 68%)`. CSS sizes a
 * `circle` gradient to the FARTHEST CORNER of its box (r = ½·size·√2), so the
 * 68% stop lands just inside the circle's edge — a long, soft falloff.
 */
export function PageGlow({
  color,
  size = 320,
  top = -120,
  right = -90,
  left,
}: {
  color?: string;
  size?: number;
  top?: number;
  right?: number;
  left?: number;
}) {
  const t = useJoTheme();
  const { color: stop, opacity } = splitAlpha(color ?? t.accentGlow);
  const half = size / 2;
  const r = half * Math.SQRT2;
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top,
        ...(left != null ? { left } : { right }),
        width: size,
        height: size,
      }}
    >
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="joGlow" cx={half} cy={half} r={r} fx={half} fy={half} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={stop} stopOpacity={opacity} />
            <Stop offset="0.68" stopColor={stop} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={half} cy={half} r={half} fill="url(#joGlow)" />
      </Svg>
    </View>
  );
}

/** Full-screen page: canvas colour, safe top inset, optional glow. */
export function JoPage({
  children,
  glow = true,
  style,
}: {
  children: React.ReactNode;
  glow?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[{ flex: 1, backgroundColor: t.page, paddingTop: insets.top }, style]}>
      {glow ? <PageGlow /> : null}
      {children}
    </View>
  );
}

/**
 * Screen title block (padding 12 4 0): small grey kicker over a 28px
 * Bricolage title, optional chevron (site picker) and a right-hand slot.
 */
export function ScreenTitle({
  kicker,
  title,
  onTitlePress,
  right,
  style,
}: {
  kicker?: string;
  title: string;
  onTitlePress?: () => void;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  const titleRow = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Text style={[f.d(28, -0.025), { color: t.ink, flexShrink: 1 }]} numberOfLines={1}>
        {title}
      </Text>
      {onTitlePress ? <Bx name="bx-chevron-down" size={22} color={t.muted} /> : null}
    </View>
  );
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          paddingTop: 12,
          paddingHorizontal: 4,
        },
        style,
      ]}
    >
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        {kicker ? <Text style={[f.t(13), { color: t.muted }]} numberOfLines={1}>{kicker}</Text> : null}
        <View style={{ marginTop: kicker ? 4 : 0 }}>
          {onTitlePress ? (
            <TouchableOpacity
              onPress={onTitlePress}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${title}, change`}
            >
              {titleRow}
            </TouchableOpacity>
          ) : (
            titleRow
          )}
        </View>
      </View>
      {right ? <View style={{ flexDirection: "row", gap: 8, marginTop: 4, flexShrink: 0 }}>{right}</View> : null}
    </View>
  );
}

/** 44px round header button (bell, back, filter). */
export function IconButton({
  icon: Icon,
  onPress,
  dot,
  label,
  size = 44,
  iconSize = 20,
}: {
  icon: JoIcon;
  onPress?: () => void;
  dot?: boolean;
  label: string;
  size?: number;
  iconSize?: number;
}) {
  const t = useJoTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: t.input,
        borderWidth: 1,
        borderColor: t.isDark ? "rgba(255,255,255,0.07)" : t.lineMid,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <JoIconView icon={Icon} size={iconSize} color={t.ink} />
      {dot ? (
        <View
          style={{
            position: "absolute",
            top: 11,
            right: 12,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: t.bad,
            borderWidth: 2,
            borderColor: t.input,
          }}
        />
      ) : null}
    </TouchableOpacity>
  );
}

/** Initials avatar; `ring` draws the artboard's double ring (page gap + accent). */
export function Avatar({
  name,
  size = 40,
  color,
  ring,
  ringGap,
  textSize,
  display = false,
  photoUrl,
}: {
  name: string;
  size?: number;
  color?: string;
  ring?: string;
  ringGap?: string;
  textSize?: number;
  display?: boolean;
  /** Profile photo; the initials show while it's missing or if it fails to load. */
  photoUrl?: string | null;
}) {
  const t = useJoTheme();
  const bg = color ?? avatarColor(t, name);
  // Remember a URL that failed so a dead link doesn't leave an empty circle.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showPhoto = !!photoUrl && photoUrl !== failedUrl;
  const inner = showPhoto ? (
    <Image
      source={{ uri: photoUrl }}
      onError={() => setFailedUrl(photoUrl)}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg }}
      accessibilityIgnoresInvertColors
    />
  ) : (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={[
          display ? f.d(textSize ?? Math.round(size * 0.34), 0, 1) : f.t(textSize ?? Math.round(size * 0.325), 700),
          { color: "#0A0A0C" },
        ]}
      >
        {initials(name)}
      </Text>
    </View>
  );
  if (!ring) return inner;
  // box-shadow: 0 0 0 2px <gap>, 0 0 0 3.5px <ring>
  return (
    <View
      style={{
        padding: 1.5,
        borderRadius: size,
        backgroundColor: ring,
      }}
    >
      <View style={{ padding: 2, borderRadius: size, backgroundColor: ringGap ?? t.page }}>{inner}</View>
    </View>
  );
}

/* ── Surfaces ──────────────────────────────────────────────────────────── */

/** #141418 card with the artboard's hairline. */
export function Card({
  children,
  style,
  radius = 26,
  onPress,
  accessibilityLabel,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const t = useJoTheme();
  const base: ViewStyle = {
    borderRadius: radius,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.cardBorder,
  };
  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[base, style]}
      >
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}

/**
 * The accent "hero" card: accent fill under a white radial highlight from the
 * top-right corner (radial-gradient(120% 90% at 100% 0%, rgba(255,255,255,.5)
 * 0%, transparent 55%)), with one or two faint rings bottom-right.
 */
export function HeroCard({
  children,
  style,
  radius = 24,
  rings = 2,
  onPress,
  accessibilityLabel,
  color,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  rings?: 0 | 1 | 2;
  onPress?: () => void;
  accessibilityLabel?: string;
  color?: string;
}) {
  const t = useJoTheme();
  const fill = color ?? t.accent;
  const body = (
    <>
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%">
          <Defs>
            <RadialGradient id="joHero" cx="100%" cy="0%" rx="120%" ry="90%" fx="100%" fy="0%">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.5} />
              <Stop offset="0.55" stopColor="#FFFFFF" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#joHero)" />
        </Svg>
      </View>
      {rings >= 1 ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            right: -40,
            bottom: -56,
            width: 150,
            height: 150,
            borderRadius: 75,
            borderWidth: 1.5,
            borderColor: t.heroRing,
          }}
        />
      ) : null}
      {rings >= 2 ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            right: -14,
            bottom: -30,
            width: 100,
            height: 100,
            borderRadius: 50,
            borderWidth: 1.5,
            borderColor: t.heroRing,
          }}
        />
      ) : null}
      {children}
    </>
  );
  const base: ViewStyle = { borderRadius: radius, backgroundColor: fill, overflow: "hidden" };
  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[base, style]}
      >
        {body}
      </TouchableOpacity>
    );
  }
  return <View style={[base, style]}>{body}</View>;
}

/** Black pill used ON the hero card (status / breach label). */
export function HeroTag({
  label,
  color,
  icon: Icon,
  dot,
}: {
  label: string;
  color: string;
  icon?: JoIcon;
  dot?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        height: 26,
        paddingHorizontal: 10,
        borderRadius: 13,
        backgroundColor: "#0A0A0C",
        alignSelf: "flex-start",
      }}
    >
      <GlossFill color="#0A0A0C" fg={color} radius={13} />
      {dot ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} /> : null}
      {Icon ? <JoIconView icon={Icon} size={14} color={color} /> : null}
      <Text style={[f.t(11.5, 600), { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/* ── Controls ──────────────────────────────────────────────────────────── */

/**
 * Filter chip (height 34–36, radius ½h). Selected = bright ink fill; the
 * optional count sits in its own little pill.
 */
export function Chip({
  label,
  count,
  selected,
  onPress,
  icon: Icon,
  iconColor,
  height = 34,
}: {
  label: string;
  count?: number | string;
  selected?: boolean;
  onPress?: () => void;
  icon?: JoIcon;
  iconColor?: string;
  height?: number;
}) {
  const t = useJoTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={{
        height,
        paddingLeft: Icon ? 11 : 13,
        paddingRight: 13,
        borderRadius: height / 2,
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        backgroundColor: selected ? t.selBg : t.raised,
        borderWidth: 1,
        borderColor: selected ? t.selBg : t.lineMid,
      }}
    >
      {selected ? <GlossFill color={t.selBg} fg={t.selFg} radius={height / 2} bleed={1} /> : null}
      {Icon ? <JoIconView icon={Icon} size={15} color={selected ? t.selFg : iconColor ?? t.ink2} /> : null}
      <Text style={[f.t(12.5, 600), { color: selected ? t.selFg : t.ink2 }]} numberOfLines={1}>
        {label}
      </Text>
      {count != null ? (
        <View
          style={{
            minWidth: 20,
            height: 20,
            paddingHorizontal: 6,
            borderRadius: 10,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: selected ? t.selFg : t.track,
          }}
        >
          <Text style={[f.t(11, 600), { color: selected ? t.selBg : t.muted }]}>{count}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

/**
 * Segmented control: a card-coloured track (radius 22, padding 4) holding
 * equal-width pills; the selected pill takes the bright ink fill.
 */
export function Segmented<K extends string>({
  items,
  value,
  onChange,
  style,
  height = 34,
}: {
  items: { key: K; label: string; count?: number }[];
  value: K;
  onChange: (key: K) => void;
  style?: StyleProp<ViewStyle>;
  height?: number;
}) {
  const t = useJoTheme();
  return (
    <View
      style={[
        {
          flexDirection: "row",
          gap: 4,
          padding: 4,
          borderRadius: (height + 8) / 2,
          backgroundColor: t.card,
          borderWidth: 1,
          borderColor: t.cardBorder,
        },
        style,
      ]}
    >
      {items.map((it) => {
        const on = it.key === value;
        return (
          <TouchableOpacity
            key={it.key}
            onPress={() => onChange(it.key)}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={{
              flex: 1,
              height,
              borderRadius: height / 2,
              backgroundColor: on ? t.selBg : "transparent",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {on ? <GlossFill color={t.selBg} fg={t.selFg} radius={height / 2} /> : null}
            <Text style={[f.t(12.5, 600), { color: on ? t.selFg : t.muted }]} numberOfLines={1}>
              {it.label}
            </Text>
            {it.count != null ? (
              <View
                style={{
                  minWidth: 20,
                  height: 20,
                  paddingHorizontal: 6,
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: on ? t.selFg : t.track,
                }}
              >
                <Text style={[f.t(11, 600), { color: on ? t.selBg : t.muted }]}>{it.count}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/** Tinted status pill (height 22, radius 11, 11px/600). */
/** Small "NEW" pill in the accent — flags a recently added screen or setting. */
export function NewBadge({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useJoTheme();
  return (
    <View
      style={[
        { height: 13, paddingHorizontal: 4, borderRadius: 7, backgroundColor: t.accent, justifyContent: "center" },
        style,
      ]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      <GlossFill color={t.accent} fg={t.onAccent} radius={7} />
      <Text style={[f.t(7.5, 700), { color: t.onAccent, lineHeight: 10 }]}>NEW</Text>
    </View>
  );
}

export function StatusPill({
  label,
  tone,
  dot,
  solid,
  height = 22,
}: {
  label: string;
  tone: JoTone;
  dot?: boolean;
  /** Solid fill with dark text — the artboard's "Very high" / "Critical". */
  solid?: boolean;
  height?: number;
}) {
  const t = useJoTheme();
  const fg = toneFg(t, tone);
  return (
    <View
      style={{
        height,
        paddingHorizontal: 9,
        borderRadius: height / 2,
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        alignSelf: "flex-start",
        backgroundColor: solid ? fg : toneBg(t, tone),
      }}
    >
      {solid ? <GlossFill color={fg} fg="#0A0A0C" radius={height / 2} /> : null}
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: solid ? "#0A0A0C" : fg }} /> : null}
      <Text style={[f.t(11, 600), { color: solid ? "#0A0A0C" : fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/* ── Gloss ("HD" fill) ─────────────────────────────────────────────────── */

type Rgb = [number, number, number];

/** `#RGB`, `#RRGGBB`, `rgb()` or opaque `rgba()` → channels; null for anything else (incl. translucent). */
function parseRgb(c: string): Rgb | null {
  const s = c.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(s);
  if (short) return [parseInt(short[1]! + short[1]!, 16), parseInt(short[2]! + short[2]!, 16), parseInt(short[3]! + short[3]!, 16)];
  const long = /^#([0-9a-f]{6})$/i.exec(s);
  if (long) {
    const n = parseInt(long[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const fn = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s);
  if (fn && (fn[4] == null || Number(fn[4]) >= 1)) return [Number(fn[1]), Number(fn[2]), Number(fn[3])];
  return null;
}

const toHex = ([r, g, b]: Rgb) =>
  `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;

/** Blend toward `to` by `k` (0–1). */
const mixRgb = (c: Rgb, to: number, k: number): Rgb => [c[0] + (to - c[0]) * k, c[1] + (to - c[1]) * k, c[2] + (to - c[2]) * k];

/** WCAG relative luminance. */
function luminance([r, g, b]: Rgb): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Colour blended toward white by `k` (0–1), as `#RRGGBB`. Unparseable / translucent colours pass through. */
export function lighten(color: string, k: number): string {
  const rgb = parseRgb(color);
  return rgb ? toHex(mixRgb(rgb, 255, k)) : color;
}

interface GlossStops {
  from: string;
  to: string;
  /** White highlight alpha at the top edge and where (0–1 of the height) it fades out. */
  hi: number;
  hiEnd: number;
  glow: string;
}

const GLOSS_CACHE = new Map<string, GlossStops | null>();

/**
 * Gradient stops for a glossy fill of `color` carrying a label in `fg`.
 *
 * No label (bars), or a dark label on a light fill (every accent, the
 * dark-mode ink chip, solid status pills): the Home bars' recipe — a 35%
 * lighter left edge into the colour, which only RAISES the label's contrast.
 *
 * Light label on a dark fill (the light-mode ink chip, red alert buttons):
 * lightening costs contrast, so the left edge takes at most a 20% tint and
 * backs off until the label still clears WCAG AA (or its current contrast,
 * if the flat colour was already below AA); the right edge deepens a touch so
 * the gradient still reads. The top highlight is gentler and ends above the
 * label's midline.
 */
function glossStops(color: string, fg?: string): GlossStops | null {
  const key = `${color}|${fg ?? ""}`;
  const hit = GLOSS_CACHE.get(key);
  if (hit !== undefined) return hit;
  const base = parseRgb(color);
  let out: GlossStops | null = null;
  if (base) {
    const label = fg ? parseRgb(fg) : null;
    const glow = `rgba(${base.map(Math.round).join(",")},0.33)`;
    if (!label || luminance(label) <= luminance(base)) {
      out = { from: toHex(mixRgb(base, 255, 0.35)), to: toHex(base), hi: 0.38, hiEnd: 0.6, glow };
    } else {
      // Worst spot = the left edge at the top of the label (~20% down a
      // pill), where the tint and the highlight stack. Back the tint off
      // first, then the highlight, until the label clears the floor there.
      const floor = Math.min(4.5, contrast(label, base));
      const hiEnd = 0.45;
      const worst = (k: number, hi: number) => contrast(label, mixRgb(mixRgb(base, 255, k), 255, hi * (1 - 0.2 / hiEnd)));
      let k = 0.2;
      let hi = 0.2;
      while (k > 0 && worst(k, hi) < floor) k = Math.max(0, k - 0.02);
      while (hi > 0 && worst(k, hi) < floor) hi = Math.max(0, hi - 0.02);
      out = {
        from: toHex(mixRgb(base, 255, k)),
        to: toHex(mixRgb(base, 0, 0.14)),
        hi,
        hiEnd,
        glow,
      };
    }
  }
  GLOSS_CACHE.set(key, out);
  return out;
}

export type GlossCorners = {
  topLeft?: number;
  topRight?: number;
  bottomRight?: number;
  bottomLeft?: number;
};

/**
 * The "HD" gloss layer (Home's bars, now every coloured control): a
 * left-to-right gradient from a lighter tint into `color`, a white highlight
 * along the top edge and, with `glow` in dark mode, a soft halo in the fill's
 * own colour.
 *
 * Drop it in as the FIRST child of a filled control — it absolutely fills the
 * parent and draws under the label. Give it the parent's corner radius (it
 * clips itself, so the parent needs no `overflow: hidden`), and `bleed` = the
 * parent's border width when the border is the same colour as the fill, so
 * the gloss covers the border too. Keep the parent's `backgroundColor`: it is
 * the fallback for colours the gradient can't parse (translucent tints render
 * nothing — those surfaces stay flat by design).
 */
export function GlossFill({
  color,
  fg,
  radius = 999,
  bleed = 0,
  direction = "horizontal",
  glow,
}: {
  /** The fill colour (hex or opaque rgb). */
  color: string;
  /**
   * Label / icon colour drawn over the fill. Pass it whenever the fill carries
   * text: a light label makes the gradient back off so it never drops below AA.
   */
  fg?: string;
  /** Corner radius of the parent, or per-corner radii. */
  radius?: number | GlossCorners;
  /** Extend over the parent's border (its border width). */
  bleed?: number;
  /** Gradient axis: light edge on the left (default) or on the top. */
  direction?: "horizontal" | "vertical";
  /** Dark-mode halo blur in px (omit for none). */
  glow?: number;
}) {
  const t = useJoTheme();
  const stops = glossStops(color, fg);
  if (!stops) return null;
  const corners: ViewStyle =
    typeof radius === "number"
      ? { borderRadius: radius }
      : {
          borderTopLeftRadius: radius.topLeft ?? 0,
          borderTopRightRadius: radius.topRight ?? 0,
          borderBottomRightRadius: radius.bottomRight ?? 0,
          borderBottomLeftRadius: radius.bottomLeft ?? 0,
        };
  const vertical = direction === "vertical";
  return (
    <View
      pointerEvents="none"
      style={[
        { position: "absolute", top: -bleed, left: -bleed, right: -bleed, bottom: -bleed },
        corners,
        glow && t.isDark ? { boxShadow: `0 0 ${glow}px ${stops.glow}` } : null,
      ]}
    >
      <LinearGradient
        colors={[stops.from, stops.to]}
        start={vertical ? { x: 0.5, y: 0 } : { x: 0, y: 0.5 }}
        end={vertical ? { x: 0.5, y: 1 } : { x: 1, y: 0.5 }}
        style={[{ flex: 1, overflow: "hidden" }, corners]}
      >
        <LinearGradient
          colors={[`rgba(255,255,255,${stops.hi})`, "rgba(255,255,255,0)"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: stops.hiEnd }}
          style={StyleSheet.absoluteFill}
        />
      </LinearGradient>
    </View>
  );
}

export function ProgressBar({
  pct,
  color,
  height = 4,
  style,
  gloss = true,
}: {
  pct: number;
  color: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
  /**
   * "HD" fill (default): a left-to-right gradient from a lighter tint into the
   * colour, a soft highlight along the top edge and, in dark mode, a faint
   * glow in the bar's own colour. `false` = the plain flat bar.
   */
  gloss?: boolean;
}) {
  const t = useJoTheme();
  const w = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  const radius = height / 2;
  if (!gloss) {
    return (
      <View style={[{ height, borderRadius: radius, backgroundColor: t.track, overflow: "hidden" }, style]}>
        <View style={{ width: `${w}%`, height: "100%", borderRadius: radius, backgroundColor: color }} />
      </View>
    );
  }
  return (
    <View
      style={[
        {
          height,
          borderRadius: radius,
          backgroundColor: t.track,
          // A hairline inner edge makes the empty track read as a channel.
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: t.isDark ? "rgba(255,255,255,0.06)" : "rgba(10,10,12,0.06)",
        },
        style,
      ]}
    >
      {w > 0 ? (
        <View style={{ width: `${w}%`, height: "100%", borderRadius: radius }}>
          {/* Fallback flat fill under the gradient for colours it can't parse. */}
          <View style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: color }]} />
          <GlossFill color={color} radius={radius} glow={Math.max(4, height)} />
        </View>
      ) : null}
    </View>
  );
}

/** Progress ring (SVG, starts at 12 o'clock). */
export function Ring({
  size,
  stroke,
  pct,
  color,
  radius,
  children,
}: {
  size: number;
  stroke: number;
  pct: number;
  color: string;
  /** Circle radius; defaults to filling the box. */
  radius?: number;
  children?: React.ReactNode;
}) {
  const t = useJoTheme();
  const r = radius ?? (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, Number.isFinite(pct) ? pct : 0));
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={t.track} strokeWidth={stroke} />
        {p > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={c * (1 - p)}
          />
        ) : null}
      </Svg>
      {children ? (
        <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

/** Uppercase grey section caption (padding 20 6 8). */
export function SectionCaption({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const t = useJoTheme();
  return (
    <Text style={[capsStyle(12), { color: t.muted, paddingTop: 20, paddingHorizontal: 6, paddingBottom: 8 }, style]}>
      {children}
    </Text>
  );
}

/** "Planned vs completed" style heading row: 15/600 title + 12 grey meta. */
export function SectionHead({
  title,
  meta,
  style,
}: {
  title: string;
  meta?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "baseline",
          justifyContent: "space-between",
          paddingTop: 22,
          paddingHorizontal: 6,
          paddingBottom: 10,
          gap: 10,
        },
        style,
      ]}
    >
      <Text style={[f.t(15, 600), { color: t.ink }]}>{title}</Text>
      {meta ? <Text style={[f.t(12), { color: t.muted }]} numberOfLines={1}>{meta}</Text> : null}
    </View>
  );
}

/** Accent CTA — 54 high, full-round, 15/700 near-black label. */
export function PrimaryButton({
  label,
  icon: Icon,
  onPress,
  busy,
  disabled,
  height = 54,
  style,
}: {
  label: string;
  icon?: JoIcon;
  onPress?: () => void;
  busy?: boolean;
  disabled?: boolean;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  const off = disabled || busy;
  // A caller's style may reshape the button; the gloss follows its corners.
  const flat = StyleSheet.flatten(style);
  const radius = typeof flat?.borderRadius === "number" ? flat.borderRadius : (typeof flat?.height === "number" ? flat.height : height) / 2;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={off}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      style={[
        {
          height,
          borderRadius: height / 2,
          backgroundColor: t.accent,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <GlossFill color={t.accent} fg={t.onAccent} radius={radius} glow={12} />
      {busy ? (
        <ActivityIndicator color={t.onAccent} />
      ) : (
        <>
          {Icon ? <JoIconView icon={Icon} size={19} color={t.onAccent} /> : null}
          <Text style={[f.t(15, 700), { color: t.onAccent }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

/** Outline / raised secondary button. `tone="bad"` = the Sign Out button. */
export function SecondaryButton({
  label,
  icon: Icon,
  onPress,
  tone,
  height = 52,
  style,
  busy,
}: {
  label: string;
  icon?: JoIcon;
  onPress?: () => void;
  tone?: "bad";
  height?: number;
  style?: StyleProp<ViewStyle>;
  busy?: boolean;
}) {
  const t = useJoTheme();
  const bad = tone === "bad";
  const fg = bad ? t.bad : t.ink;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={busy}
      activeOpacity={0.8}
      accessibilityRole="button"
      style={[
        {
          height,
          borderRadius: height / 2,
          borderWidth: 1,
          borderColor: bad ? (t.isDark ? "rgba(255,107,87,0.35)" : t.badBorder) : t.isDark ? "rgba(255,255,255,0.12)" : t.lineMid,
          backgroundColor: bad ? (t.isDark ? "rgba(255,107,87,0.08)" : t.badWash) : t.input,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {Icon ? <JoIconView icon={Icon} size={18} color={fg} /> : null}
          <Text style={[f.t(14.5, 600), { color: fg }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

/** Floating accent action ("Raise", "Log") — sits bottom-right above the bar. */
export function Fab({
  label,
  icon: Icon,
  onPress,
  bottom: bottomProp,
}: {
  label: string;
  icon: JoIcon;
  onPress: () => void;
  /** Defaults to 12 above the floating tab bar (artboard bottom: 96). */
  bottom?: number;
}) {
  const t = useJoTheme();
  const { fabBottom } = useNavInsets();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        position: "absolute",
        right: 20,
        bottom: bottomProp ?? fabBottom,
        height: 52,
        paddingLeft: 16,
        paddingRight: 20,
        borderRadius: 26,
        backgroundColor: t.accent,
        flexDirection: "row",
        alignItems: "center",
        gap: 7,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 14 },
        shadowOpacity: 0.5,
        shadowRadius: 15,
        elevation: 8,
        zIndex: 6,
      }}
    >
      <GlossFill color={t.accent} fg={t.onAccent} radius={26} glow={12} />
      <JoIconView icon={Icon} size={20} color={t.onAccent} />
      <Text style={[f.t(14, 700), { color: t.onAccent }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Period / month button: calendar icon in accent · label · grey meta · chevron. */
export function DateButton({
  label,
  meta,
  onPress,
  style,
  height = 36,
}: {
  label: string;
  meta?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  height?: number;
}) {
  const t = useJoTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`Period: ${label}${meta ? `, ${meta}` : ""}`}
      style={[
        {
          height,
          alignSelf: "flex-start",
          flexDirection: "row",
          alignItems: "center",
          gap: 7,
          paddingLeft: 13,
          paddingRight: 12,
          borderRadius: height / 2,
          borderWidth: 1,
          borderColor: t.isDark ? "rgba(255,255,255,0.09)" : t.lineMid,
          backgroundColor: t.input,
        },
        style,
      ]}
    >
      <Bx name="bx-calendar" size={15} color={t.accentInk} />
      <Text style={[f.t(13, 500), { color: t.ink }]} numberOfLines={1}>
        {label}
      </Text>
      {meta ? (
        <>
          <Text style={[f.t(13), { color: t.faint }]}>·</Text>
          <Text style={[f.t(13), { color: t.muted }]} numberOfLines={1}>
            {meta}
          </Text>
        </>
      ) : null}
      <Bx name="bx-chevron-down" size={17} color={t.muted} />
    </TouchableOpacity>
  );
}

/** Rounded search field (height 44). */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  right,
  style,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useJoTheme();
  return (
    <View
      style={[
        {
          height: 44,
          flexDirection: "row",
          alignItems: "center",
          gap: 9,
          paddingHorizontal: 14,
          borderRadius: 22,
          backgroundColor: t.input,
          borderWidth: 1,
          borderColor: t.isDark ? "rgba(255,255,255,0.07)" : t.lineMid,
        },
        style,
      ]}
    >
      <Bx name="bx-search" size={18} color={t.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.faint}
        style={[f.t(13.5), { flex: 1, color: t.ink, paddingVertical: 0 }]}
        returnKeyType="search"
        autoCorrect={false}
      />
      {value ? (
        <TouchableOpacity onPress={() => onChangeText("")} hitSlop={8} accessibilityLabel="Clear search">
          <Bx name="bx-x" size={17} color={t.muted} />
        </TouchableOpacity>
      ) : (
        right ?? null
      )}
    </View>
  );
}

/**
 * Settings-style row inside a Card (padding 12 0, hairline between rows):
 * 36 round icon well · label (+ sub) · optional badge / value · chevron.
 */
export function ListRow({
  icon: Icon,
  iconColor,
  label,
  sub,
  value,
  badge,
  badgeTone,
  chevron = true,
  divider,
  onPress,
}: {
  icon: JoIcon;
  iconColor?: string;
  label: string;
  sub?: string;
  value?: string;
  badge?: string;
  /** "accent" = filled accent badge (New); otherwise warn tint (3 pending). */
  badgeTone?: "accent" | "warn";
  chevron?: boolean;
  divider?: boolean;
  onPress?: () => void;
}) {
  const t = useJoTheme();
  const content = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
        borderTopWidth: divider ? 1 : 0,
        borderTopColor: t.line,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: t.raised,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <JoIconView icon={Icon} size={18} color={iconColor ?? t.ink2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[f.t(14, 500), { color: t.ink }]} numberOfLines={1}>
          {label}
        </Text>
        {sub ? (
          <Text style={[f.t(11.5), { color: t.muted, marginTop: 2 }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {badge ? (
        <View
          style={{
            height: 22,
            paddingHorizontal: 9,
            borderRadius: 11,
            justifyContent: "center",
            backgroundColor: badgeTone === "accent" ? t.accent : t.warnTint,
          }}
        >
          {badgeTone === "accent" ? <GlossFill color={t.accent} fg={t.onAccent} radius={11} /> : null}
          <Text style={[f.t(11, badgeTone === "accent" ? 700 : 600), { color: badgeTone === "accent" ? t.onAccent : t.warn }]}>
            {badge}
          </Text>
        </View>
      ) : null}
      {value ? (
        <Text style={[f.t(12.5), { color: t.muted }]} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {chevron ? <Bx name="bx-chevron-right" size={20} color={t.faint} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={label}>
      {content}
    </TouchableOpacity>
  );
}

/* ── Sheets ────────────────────────────────────────────────────────────── */

/**
 * Bottom sheet: dimmed scrim, #17171C panel inset 8 from the edges with a 38
 * radius and a grabber, Bricolage 22 title + grey subtitle.
 */
export function JoSheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  right,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children?: React.ReactNode;
  right?: React.ReactNode;
}) {
  const t = useJoTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(180)} style={[StyleSheet.absoluteFill, { backgroundColor: t.scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>
      <View style={{ flex: 1, justifyContent: "flex-end" }} pointerEvents="box-none">
        <Animated.View
          entering={SlideInDown.duration(260)}
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
            paddingBottom: 22,
          }}
        >
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: t.handle, alignSelf: "center", marginBottom: 18 }} />
          {title ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <Text style={[f.d(22, -0.02), { color: t.ink, flexShrink: 1 }]}>{title}</Text>
              {right}
            </View>
          ) : null}
          {subtitle ? <Text style={[f.t(12.5), { color: t.muted, marginTop: 4 }]}>{subtitle}</Text> : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

/**
 * Option row inside a JoSheet: label · meta · radio dot. Selected = a lifted
 * #202028 row with a brighter hairline and an accent dot holding a tick.
 */
export function SheetOption({
  label,
  meta,
  metaStyle,
  selected,
  onPress,
}: {
  label: string;
  meta?: string;
  metaStyle?: StyleProp<TextStyle>;
  selected?: boolean;
  onPress: () => void;
}) {
  const t = useJoTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected }}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        height: 56,
        paddingHorizontal: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: selected
          ? t.isDark ? "rgba(255,255,255,0.14)" : t.lineStrong
          : t.line,
        backgroundColor: selected ? (t.isDark ? "#202028" : t.raised) : "transparent",
      }}
    >
      <Text style={[f.t(14.5, 600), { color: t.ink, flex: 1 }]} numberOfLines={1}>
        {label}
      </Text>
      {meta ? (
        <Text style={[f.t(12.5), { color: t.muted }, metaStyle]} numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
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
        {selected ? <GlossFill color={t.accent} fg={t.onAccent} radius={11} bleed={1.5} /> : null}
        {selected ? <Bx name="bx-check" size={15} color={t.onAccent} /> : null}
      </View>
    </TouchableOpacity>
  );
}

/* ── States ────────────────────────────────────────────────────────────── */

export function EmptyState({
  icon: Icon,
  title,
  sub,
  action,
}: {
  icon: JoIcon;
  title: string;
  sub?: string;
  action?: { label: string; onPress: () => void };
}) {
  const t = useJoTheme();
  return (
    <Card style={{ padding: 24, alignItems: "center", gap: 8 }}>
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: t.raised,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <JoIconView icon={Icon} size={22} color={t.muted} />
      </View>
      <Text style={[f.t(14.5, 600), { color: t.ink, textAlign: "center", marginTop: 4 }]}>{title}</Text>
      {sub ? <Text style={[f.t(12.5), { color: t.muted, textAlign: "center", lineHeight: 18 }]}>{sub}</Text> : null}
      {action ? (
        <TouchableOpacity onPress={action.onPress} style={{ marginTop: 6 }} accessibilityRole="button">
          <Text style={[f.t(13, 600), { color: t.accentInk }]}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </Card>
  );
}

/** Grey placeholder block for loading states. */
export function Shimmer({ height, radius = 18, style }: { height: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const t = useJoTheme();
  return <View style={[{ height, borderRadius: radius, backgroundColor: t.raised, opacity: 0.7 }, style]} />;
}

/** Small transient message at the bottom of a screen. */
export function Toast({
  message,
  onHide,
  bottom: bottomProp,
}: {
  message: string;
  onHide: () => void;
  /** Defaults to just above the floating tab bar. */
  bottom?: number;
}) {
  const t = useJoTheme();
  const { fabBottom } = useNavInsets();
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(onHide, 1800);
    return () => clearTimeout(id);
  }, [message, onHide]);
  if (!message) return null;
  return (
    <Animated.View
      entering={FadeIn.duration(150)}
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 24,
        right: 24,
        bottom: bottomProp ?? fabBottom,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 18,
        backgroundColor: t.selBg,
        zIndex: 20,
      }}
    >
      <GlossFill color={t.selBg} fg={t.selFg} radius={18} />
      <Text style={[f.t(13, 600), { color: t.selFg, textAlign: "center" }]}>{message}</Text>
    </Animated.View>
  );
}

export { makeJoStyles, useJoTheme };
export type { JoTheme };
