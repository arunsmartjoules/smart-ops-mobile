/**
 * Ticket detail primitives — Claude Design "JouleOps Tickets.dc.html" (detail
 * artboard: status first, then only the fields that status requires).
 *
 * Shares the shape scale used by Site Overview and the tickets list.
 */
import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { ArrowLeft, Check, CircleAlert, MoreVertical } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { ds } from "@/constants/ds";
import { soRadius, soShadow } from "@/components/home/SiteOverview";

export { soRadius, soShadow };

/* ── Header ──────────────────────────────────────────────────────────────── */

export function DetailHeader({
  topInset,
  title,
  subtitle,
  onBack,
  onMore,
}: {
  topInset: number;
  title: string;
  subtitle?: string;
  onBack: () => void;
  onMore?: () => void;
}) {
  return (
    <View style={[styles.header, { paddingTop: topInset }]}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={onBack}
          activeOpacity={0.8}
          hitSlop={8}
          style={[styles.tile, { marginLeft: -4 }]}
          accessibilityRole="button"
          accessibilityLabel="Close ticket"
        >
          <ArrowLeft size={20} color={ds.white} strokeWidth={2} />
        </TouchableOpacity>

        <View style={styles.headerLead}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={styles.headerSub} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {onMore ? (
          <TouchableOpacity
            onPress={onMore}
            activeOpacity={0.8}
            hitSlop={8}
            style={styles.tile}
            accessibilityRole="button"
            accessibilityLabel="More actions"
          >
            <MoreVertical size={19} color={ds.white} strokeWidth={2} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

/* ── Small parts ─────────────────────────────────────────────────────────── */

export function Badge({
  label,
  bg,
  fg,
}: {
  label: string;
  bg: string;
  fg: string;
}) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function DetailCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionTitle({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <Text style={[styles.sectionTitle, style as never]}>{children}</Text>;
}

export function MetaBlock({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaBlock}>
      <Text style={styles.eyebrow}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

/** Card head: an eyebrow on the left, a required/optional hint on the right. */
export function CardHead({
  label,
  hint,
  hintTone,
  style,
}: {
  label: string;
  hint?: string;
  hintTone?: "muted" | "error";
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.cardHead, style]}>
      <Text style={styles.eyebrow}>{label}</Text>
      {hint ? (
        <Text
          style={[
            styles.hint,
            { color: hintTone === "error" ? ds.flame[100] : ds.carbon[500] },
          ]}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/* ── Status chip ─────────────────────────────────────────────────────────── */

export function StatusChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      hitSlop={{ top: 6, bottom: 6 }}
      style={[
        styles.statusChip,
        {
          backgroundColor: active ? ds.thunder[100] : ds.white,
          borderColor: active ? ds.thunder[100] : ds.carbon[900],
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      {active ? <Check size={14} color={ds.white} strokeWidth={2.6} /> : null}
      <Text
        style={[
          styles.statusChipText,
          {
            fontWeight: active ? "600" : "400",
            color: active ? ds.white : ds.carbon[100],
          },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/** One-line explanation of what the selected status will require. */
export function StatusHint({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.statusHint}>
      <Icon size={14} color={ds.carbon[400]} strokeWidth={2} />
      <Text style={styles.statusHintText}>{children}</Text>
    </View>
  );
}

/* ── Inputs ──────────────────────────────────────────────────────────────── */

interface FieldProps extends Omit<TextInputProps, "style"> {
  label?: string;
  /** Paints the box's border flame when the value is required and missing. */
  invalid?: boolean;
  /** Trailing unit, e.g. "°C". */
  unit?: string;
  large?: boolean;
  minHeight?: number;
  containerStyle?: ViewStyle;
}

export function Field({
  label,
  invalid,
  unit,
  large,
  minHeight,
  containerStyle,
  ...input
}: FieldProps) {
  return (
    <View style={containerStyle}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <View
        style={[
          styles.fieldBox,
          { borderColor: invalid ? ds.flame[100] : ds.carbon[900] },
          minHeight ? { minHeight, alignItems: "flex-start" } : null,
        ]}
      >
        <TextInput
          {...input}
          placeholderTextColor={ds.carbon[700]}
          style={[styles.fieldInput, large && styles.fieldInputLarge]}
        />
        {unit ? <Text style={styles.fieldUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

/** Camera / Gallery pair under the remarks box. */
export function AttachButton({
  icon: Icon,
  label,
  active,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const fg = active ? ds.sky[100] : ds.carbon[400];
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        styles.attach,
        {
          backgroundColor: active ? ds.sky[1000] : ds.carbon[1000],
          borderColor: active ? ds.sky[100] : ds.carbon[900],
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon size={17} color={fg} strokeWidth={2} />
      <Text style={[styles.attachLabel, { color: fg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

/* ── Toggle row ──────────────────────────────────────────────────────────── */

export function ToggleRow({
  icon: Icon,
  title,
  subtitle,
  value,
  onToggle,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  value: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.85}
      style={[styles.card, styles.toggleRow]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={title}
    >
      <View style={styles.toggleIcon}>
        <Icon size={17} color={ds.flame[100]} strokeWidth={2.1} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleSub}>{subtitle}</Text>
      </View>
      <View
        style={[
          styles.track,
          {
            backgroundColor: value ? ds.sky[100] : ds.carbon[900],
            justifyContent: value ? "flex-end" : "flex-start",
          },
        ]}
      >
        <View style={styles.thumb}>
          <Check
            size={13}
            color={value ? ds.sky[100] : ds.carbon[900]}
            strokeWidth={3}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
}

/* ── Activity ────────────────────────────────────────────────────────────── */

export function ActivityRow({
  title,
  meta,
  dot,
  line,
}: {
  title: string;
  meta: string;
  dot: string;
  line: boolean;
}) {
  return (
    <View style={styles.activityRow}>
      <View style={styles.rail}>
        <View style={[styles.dot, { backgroundColor: dot }]} />
        {line ? <View style={styles.railLine} /> : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.activityTitle}>{title}</Text>
        <Text style={styles.activityMeta}>{meta}</Text>
      </View>
    </View>
  );
}

/* ── Sticky submit bar ───────────────────────────────────────────────────── */

export function SubmitBar({
  label,
  blocked,
  ready,
  done,
  busy,
  bottomInset,
  onPress,
}: {
  label: string;
  /** Reason the action can't run yet — shown above the button. */
  blocked?: string | null;
  ready: boolean;
  done?: boolean;
  busy?: boolean;
  bottomInset: number;
  onPress: () => void;
}) {
  const bg = done ? ds.sky[100] : ready ? ds.thunder[100] : ds.carbon[900];
  const fg = done || ready ? ds.white : ds.carbon[500];

  return (
    <View
      style={[styles.submitBar, { paddingBottom: Math.max(bottomInset, 16) }]}
    >
      {blocked ? (
        <View style={styles.blockedRow}>
          <CircleAlert size={14} color={ds.flame[100]} strokeWidth={2.2} />
          <Text style={styles.blockedText}>{blocked}</Text>
        </View>
      ) : null}
      <TouchableOpacity
        onPress={onPress}
        disabled={busy}
        activeOpacity={0.85}
        style={[styles.submit, { backgroundColor: bg }]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        {busy ? (
          <ActivityIndicator size="small" color={ds.white} />
        ) : (
          <Text style={[styles.submitLabel, { color: fg }]}>{label}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: ds.thunder[100] },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 10,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerLead: { flex: 1, minWidth: 0 },
  headerTitle: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "700",
    letterSpacing: 0.34,
    color: ds.white,
  },
  headerSub: { fontSize: 11.5, color: ds.thunder[700], marginTop: 2 },
  tile: {
    width: 34,
    height: 34,
    borderRadius: soRadius.tile,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },

  badge: { paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4 },
  badgeText: {
    fontSize: 8.5,
    fontWeight: "600",
    letterSpacing: 0.68,
    textTransform: "uppercase",
  },

  card: {
    backgroundColor: ds.white,
    borderRadius: soRadius.card,
    padding: 14,
    marginBottom: 10,
    ...soShadow,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  hint: { fontSize: 10.5 },

  eyebrow: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    color: ds.carbon[500],
  },
  metaBlock: { marginRight: 16, marginBottom: 4 },
  metaDivider: {
    borderTopWidth: 1,
    borderTopColor: ds.carbon[1000],
    paddingTop: 13,
  },
  metaValue: { fontSize: 12.5, color: ds.carbon[100], marginTop: 3 },

  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.13,
    color: ds.carbon[100],
    marginBottom: 9,
  },

  statusChip: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: soRadius.pill,
    borderWidth: 1,
  },
  statusChipText: { fontSize: 12, letterSpacing: 0.12 },
  statusHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 12,
  },
  statusHintText: { fontSize: 11, color: ds.carbon[400] },

  fieldLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    color: ds.carbon[500],
    marginBottom: 7,
  },
  fieldBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: ds.pageBg,
    borderWidth: 1,
    borderRadius: soRadius.sm,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  fieldInput: { flex: 1, padding: 0, fontSize: 13, color: ds.carbon[100] },
  fieldInputLarge: { fontSize: 16, fontWeight: "600" },
  fieldUnit: { fontSize: 12, fontWeight: "600", color: ds.carbon[400] },

  attach: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: soRadius.sm,
    borderWidth: 1,
  },
  attachLabel: { fontSize: 12, fontWeight: "500" },

  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  toggleIcon: {
    width: 34,
    height: 34,
    borderRadius: soRadius.pill,
    backgroundColor: ds.flame[1000],
    alignItems: "center",
    justifyContent: "center",
  },
  toggleTitle: { fontSize: 13, fontWeight: "500", color: ds.carbon[100] },
  toggleSub: { fontSize: 10.5, color: ds.carbon[400], marginTop: 1 },
  track: {
    width: 42,
    height: 24,
    borderRadius: soRadius.pill,
    padding: 2,
    flexDirection: "row",
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: soRadius.pill,
    backgroundColor: ds.white,
    alignItems: "center",
    justifyContent: "center",
  },

  activityRow: { flexDirection: "row", gap: 11, paddingBottom: 14 },
  rail: { width: 24, alignItems: "center" },
  dot: { width: 9, height: 9, borderRadius: 99, marginTop: 4 },
  railLine: {
    flex: 1,
    width: 1,
    backgroundColor: ds.carbon[900],
    marginTop: 4,
  },
  activityTitle: { fontSize: 12.5, fontWeight: "500", color: ds.carbon[100] },
  activityMeta: { fontSize: 10.5, color: ds.carbon[400], marginTop: 2 },

  submitBar: {
    backgroundColor: ds.white,
    borderTopWidth: 1,
    borderTopColor: ds.carbon[900],
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  blockedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  blockedText: { fontSize: 11, fontWeight: "500", color: ds.flame[100] },
  submit: {
    borderRadius: soRadius.sm,
    padding: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  submitLabel: { fontSize: 15, fontWeight: "600", letterSpacing: 0.15 },
});
