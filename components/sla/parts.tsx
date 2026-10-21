/**
 * Small SLA-only primitives that the shared jo/ui kit doesn't have: the
 * coloured round header button, the tinted mini pill, the sub-view header,
 * the frozen-first-column table and the artboard's icon/sub/meta sheet row.
 */
import React from "react";
import { ScrollView, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from "react-native";
import { Check, ChevronLeft, type LucideIcon } from "lucide-react-native";
import { f, useJoTheme } from "@/components/jo/ui";

/** Round raised button (artboard 40/44 px) whose icon colour can be dimmed. */
export function RoundButton({
  icon: Icon,
  onPress,
  label,
  size = 40,
  iconSize = 21,
  color,
  disabled,
}: {
  icon: LucideIcon;
  onPress?: () => void;
  label: string;
  size?: number;
  iconSize?: number;
  color?: string;
  disabled?: boolean;
}) {
  const t = useJoTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || !onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
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
      <Icon size={iconSize} color={disabled ? t.disabled : (color ?? t.ink)} />
    </TouchableOpacity>
  );
}

/** Tinted pill (height 22–24, radius ½h) with optional leading icon. */
export function TintPill({
  label,
  fg,
  bg,
  icon: Icon,
  height = 22,
  size = 11,
  weight = 600,
  style,
}: {
  label: string;
  fg: string;
  bg: string;
  icon?: LucideIcon;
  height?: number;
  size?: number;
  weight?: 600 | 700;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          height,
          paddingHorizontal: height >= 24 ? 10 : 9,
          borderRadius: height / 2,
          backgroundColor: bg,
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          alignSelf: "flex-start",
          flexShrink: 0,
        },
        style,
      ]}
    >
      {Icon ? <Icon size={13} color={fg} /> : null}
      <Text style={[f.t(size, weight), { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Drill / rating header: 44 back button · title + sub · optional right slot. */
export function SubHeader({
  title,
  sub,
  onBack,
  right,
}: {
  title: string;
  sub: string;
  onBack: () => void;
  right?: React.ReactNode;
}) {
  const t = useJoTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 6, paddingHorizontal: 16, paddingBottom: 10 }}>
      <RoundButton icon={ChevronLeft} onPress={onBack} label="Back" size={44} iconSize={24} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[f.t(15, 600), { color: t.ink }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[f.t(11.5), { color: t.muted, marginTop: 2 }]} numberOfLines={1}>
          {sub}
        </Text>
      </View>
      {right}
    </View>
  );
}

export interface FrozenRow {
  key: string;
  left: React.ReactNode;
  /** Cells in the scrolling part, laid out left → right. */
  right: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}

/**
 * Wide table with a frozen first column (the artboard's `position:sticky;
 * left:0`). RN has no sticky columns, so the first column is rendered outside
 * the horizontal ScrollView and every row has a fixed height to stay aligned.
 */
export function FrozenTable({
  leftWidth,
  headerHeight,
  rowHeight,
  headerLeft,
  headerRight,
  rows,
  headerBg,
  bodyBg,
  rowBorder,
}: {
  leftWidth: number;
  headerHeight: number;
  rowHeight: number;
  headerLeft: React.ReactNode;
  headerRight: React.ReactNode;
  rows: FrozenRow[];
  headerBg: string;
  bodyBg: string;
  rowBorder: string;
}) {
  const t = useJoTheme();
  const rowBase: ViewStyle = { height: rowHeight, borderTopWidth: 1, borderTopColor: rowBorder, flexDirection: "row" };
  const wrap = (r: FrozenRow, child: React.ReactNode, style: ViewStyle) =>
    r.onPress ? (
      <TouchableOpacity
        key={r.key}
        onPress={r.onPress}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={r.accessibilityLabel}
        style={style}
      >
        {child}
      </TouchableOpacity>
    ) : (
      <View key={r.key} style={style}>
        {child}
      </View>
    );
  return (
    <View style={{ flexDirection: "row" }}>
      <View
        style={{
          width: leftWidth,
          backgroundColor: bodyBg,
          borderRightWidth: 1,
          borderRightColor: t.line,
          zIndex: 2,
        }}
      >
        <View style={{ height: headerHeight, backgroundColor: headerBg, justifyContent: "center" }}>{headerLeft}</View>
        {/* Column direction so a long label wraps inside the frozen width. */}
        {rows.map((r) => wrap(r, r.left, { ...rowBase, flexDirection: "column", justifyContent: "center" }))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} nestedScrollEnabled>
        <View>
          <View style={{ height: headerHeight, backgroundColor: headerBg, flexDirection: "row" }}>{headerRight}</View>
          {rows.map((r) => wrap(r, r.right, rowBase))}
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Sheet row from the artboard: optional 36 icon well · label + sub · coloured
 * meta · 22 radio dot (or a custom trailing icon for action rows).
 */
export function SheetRow({
  label,
  sub,
  meta,
  metaColor,
  icon: Icon,
  selected,
  trailingIcon: Trailing,
  onPress,
}: {
  label: string;
  sub?: string;
  meta?: string;
  metaColor?: string;
  icon?: LucideIcon;
  selected?: boolean;
  trailingIcon?: LucideIcon;
  onPress: () => void;
}) {
  const t = useJoTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole={Trailing ? "button" : "radio"}
      accessibilityState={Trailing ? undefined : { selected: !!selected }}
      accessibilityLabel={sub ? `${label}, ${sub}` : label}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 56,
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: selected ? t.accent : t.lineMid,
        backgroundColor: selected ? t.accentTint : t.raised,
      }}
    >
      {Icon ? (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: t.track,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={18} color={t.accentInk} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[f.t(14.5, 600), { color: t.ink }]} numberOfLines={1}>
          {label}
        </Text>
        {sub ? (
          <Text style={[f.t(11.5), { color: t.muted, marginTop: 2 }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {meta ? <Text style={[f.t(13, 700), { color: metaColor ?? t.muted }]}>{meta}</Text> : null}
      {Trailing ? (
        <Trailing size={18} color={t.muted} />
      ) : (
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
          {selected ? <Check size={15} color={t.onAccent} /> : null}
        </View>
      )}
    </TouchableOpacity>
  );
}
