/**
 * Asset Mapping — small building blocks shared by every screen in the flow:
 * status chips, type badges, eyebrow labels, back headers and buttons, all
 * sized to the "JouleOps Asset Mapping" artboard.
 */
import React from "react";
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { ChevronLeft } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import { amPalette, tint } from "./lib";

export function usePalette() {
  return amPalette(useDs());
}

export function Eyebrow({
  children,
  color,
  size = 9.5,
  style,
}: {
  children: React.ReactNode;
  color?: string;
  size?: number;
  style?: object;
}) {
  const p = usePalette();
  return (
    <Text
      style={[
        {
          fontSize: size,
          fontWeight: "600",
          letterSpacing: size * 0.13,
          textTransform: "uppercase",
          color: color ?? p.sub,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** Pill with a small coloured dot + label. */
export function Chip({ label, color, dot = true }: { label: string; color: string; dot?: boolean }) {
  const styles = useStyles();
  return (
    <View style={[styles.chip, { backgroundColor: tint(color, 0.14) }]}>
      {dot ? <View style={[styles.chipDot, { backgroundColor: color }]} /> : null}
      <Text style={[styles.chipText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Square tile with the type abbreviation, tinted per type. */
export function TypeBadge({ abbr, color, size = 38 }: { abbr: string; color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.27,
        backgroundColor: tint(color, 0.15),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: size * 0.29, fontWeight: "700", letterSpacing: 0.3, color }}>
        {abbr}
      </Text>
    </View>
  );
}

export function BackHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  right?: React.ReactNode;
}) {
  const styles = useStyles();
  const p = usePalette();
  return (
    <View style={styles.backHeader}>
      <TouchableOpacity
        onPress={onBack}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <ChevronLeft size={24} color={p.text} strokeWidth={2.2} />
      </TouchableOpacity>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.backTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.backSubtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

type ButtonTone = "primary" | "secondary" | "info" | "warning" | "infoOutline";

export function Button({
  label,
  icon: Icon,
  onPress,
  tone = "primary",
  disabled,
  loading,
  style,
}: {
  label: string;
  icon?: LucideIcon;
  onPress: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const p = usePalette();
  const off = disabled || loading;

  const look: Record<ButtonTone, { bg: string; fg: string; border?: string }> = {
    primary: { bg: p.accent, fg: p.onAccent },
    secondary: { bg: p.card, fg: p.text, border: p.borderStrong },
    info: { bg: p.info, fg: p.onAccent },
    infoOutline: { bg: p.card, fg: p.info, border: tint(p.info, 0.4) },
    warning: { bg: p.warning, fg: p.onAccent },
  };
  const t = off ? { bg: p.raised, fg: p.muted, border: undefined } : look[tone];

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={off}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off }}
      style={[
        styles.button,
        { backgroundColor: t.bg },
        t.border ? { borderWidth: 1, borderColor: t.border } : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.sub} />
      ) : (
        <>
          {Icon ? <Icon size={17} color={t.fg} strokeWidth={2.2} /> : null}
          <Text style={[styles.buttonText, { color: t.fg }]}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

/** Tinted notice box (amber warning, purple AI, …). */
export function Notice({
  color,
  icon: Icon,
  title,
  children,
  style,
}: {
  color: string;
  icon: LucideIcon;
  title?: string;
  children?: React.ReactNode;
  style?: object;
}) {
  const styles = useStyles();
  const p = usePalette();
  return (
    <View
      style={[
        styles.notice,
        { backgroundColor: tint(color, 0.1), borderColor: tint(color, 0.3) },
        style,
      ]}
    >
      <Icon size={17} color={color} strokeWidth={2.2} />
      <View style={{ flex: 1 }}>
        {title ? <Text style={[styles.noticeTitle, { color }]}>{title}</Text> : null}
        {typeof children === "string" ? (
          <Text style={[styles.noticeBody, { color: p.text }]}>{children}</Text>
        ) : (
          children
        )}
      </View>
    </View>
  );
}

export const useStyles = makeThemedStyles((ds) => {
  const p = amPalette(ds);
  return {
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 99,
      alignSelf: "flex-start",
    },
    chipDot: { width: 5, height: 5, borderRadius: 99 },
    chipText: { fontSize: 10, fontWeight: "600" },
    backHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 20,
      paddingTop: 6,
      paddingBottom: 16,
    },
    backTitle: { fontSize: 16, fontWeight: "700", color: p.text },
    backSubtitle: { fontSize: 11, fontWeight: "500", color: p.sub, marginTop: 2 },
    button: {
      minHeight: 48,
      borderRadius: 13,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    buttonText: { fontSize: 13.5, fontWeight: "600" },
    notice: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 9,
      borderWidth: 1,
      borderRadius: 13,
      padding: 12,
    },
    noticeTitle: { fontSize: 12, fontWeight: "700", marginBottom: 4 },
    noticeBody: { fontSize: 11.5, lineHeight: 17.5, fontWeight: "500" },
  };
});
