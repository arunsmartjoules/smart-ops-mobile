/**
 * Site Overview building blocks — Claude Design "JouleOps Site Overview.dc.html"
 * (artboard 2a: identity card with the shift toggle, then open tickets;
 * Profile lives in the header avatar).
 *
 * Geometry comes from the mock's `cornerRadius = 12` / `surfaceStyle = Soft`
 * defaults; colours resolve through the shared `@/constants/ds` token set.
 */
import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Bell, ChevronDown, ChevronRight, Mail, MapPin } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { ds } from "@/constants/ds";

/** r = 12, rSm = round(r * 0.7), rTile = round(r * 1.4). */
export const soRadius = { card: 12, sm: 8, tile: 17, pill: 99 } as const;

/** surfaceStyle "Soft" → 0 1px 3px rgba(25,19,18,.08). */
export const soShadow = {
  shadowColor: ds.carbon[100],
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.08,
  shadowRadius: 3,
  elevation: 2,
} as const;

export type BadgeTone =
  | "Very high"
  | "High"
  | "Medium"
  | "Overdue"
  | "Due"
  | "Running";

/** The mock's BADGE map, verbatim. */
export const BADGE: Record<BadgeTone, { bg: string; fg: string }> = {
  "Very high": { bg: ds.flame[100], fg: ds.pageBg },
  High: { bg: ds.flame[1000], fg: ds.flame[100] },
  Medium: { bg: ds.carbon[1000], fg: ds.carbon[400] },
  Overdue: { bg: ds.flame[100], fg: ds.pageBg },
  Due: { bg: ds.flame[1000], fg: ds.flame[100] },
  Running: { bg: ds.sky[1000], fg: ds.sky[100] },
};

/** The three icon treatments the mock uses on list rows. */
export const TINT = {
  flame: { tint: ds.flame[1000], icon: ds.flame[100] },
  sky: { tint: ds.sky[1000], icon: ds.sky[100] },
  carbon: { tint: ds.carbon[1000], icon: ds.carbon[400] },
} as const;

export type TintKey = keyof typeof TINT;

/* ── Header ──────────────────────────────────────────────────────────────
   Thunder chrome: date eyebrow, site name with the switcher chevron, a bell
   and the avatar that now carries Profile.                                */

export function OverviewHeader({
  topInset,
  dateLabel,
  siteName,
  canSwitchSite,
  onSwitchSite,
  bellLabel,
  onBell,
  avatarInitial,
  avatarLabel,
  avatarDot,
  onAvatar,
}: {
  topInset: number;
  dateLabel: string;
  siteName: string;
  canSwitchSite?: boolean;
  onSwitchSite?: () => void;
  bellLabel: string;
  onBell: () => void;
  avatarInitial: string;
  avatarLabel: string;
  avatarDot?: boolean;
  onAvatar: () => void;
}) {
  return (
    <View style={[styles.header, { paddingTop: topInset }]}>
      <View style={styles.headerRow}>
        <View style={styles.headerLead}>
          <Text style={styles.eyebrowMuted}>{dateLabel}</Text>
          <TouchableOpacity
            onPress={onSwitchSite}
            disabled={!canSwitchSite}
            activeOpacity={0.75}
            style={styles.siteRow}
            accessibilityRole={canSwitchSite ? "button" : "header"}
            accessibilityLabel={
              canSwitchSite ? `Site ${siteName}. Change site` : siteName
            }
          >
            <Text style={styles.siteName} numberOfLines={1}>
              {siteName}
            </Text>
            {canSwitchSite ? (
              <ChevronDown size={18} color={ds.thunder[700]} strokeWidth={2} />
            ) : null}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={onBell}
          activeOpacity={0.8}
          hitSlop={6}
          style={styles.headerTile}
          accessibilityRole="button"
          accessibilityLabel={bellLabel}
        >
          <Bell size={19} color={ds.white} strokeWidth={2} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onAvatar}
          activeOpacity={0.8}
          hitSlop={6}
          style={styles.avatar}
          accessibilityRole="button"
          accessibilityLabel={avatarLabel}
        >
          <Text style={styles.avatarText}>{avatarInitial}</Text>
          {avatarDot ? <View style={styles.avatarDot} /> : null}
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ── Identity ────────────────────────────────────────────────────────────
   Who is on shift, where, and the punch toggle — leads the page.         */

export function IdentityCard({
  avatarInitial,
  name,
  subline,
  email,
  pillLabel,
  pillBg,
  pillFg,
  pillDot,
  onPressPill,
  ctaLabel,
  ctaIcon: CtaIcon,
  ctaBg,
  ctaBusy,
  onPressCta,
}: {
  avatarInitial: string;
  name: string;
  subline: string;
  email: string;
  pillLabel: string;
  pillBg: string;
  pillFg: string;
  pillDot: string;
  onPressPill?: () => void;
  ctaLabel: string;
  ctaIcon: LucideIcon;
  ctaBg: string;
  ctaBusy?: boolean;
  onPressCta: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.identityRow}>
        <View style={styles.identityAvatar}>
          <Text style={styles.identityAvatarText}>{avatarInitial}</Text>
        </View>

        <View style={styles.identityBody}>
          <Text style={styles.identityName} numberOfLines={1}>
            {name}
          </Text>
          {subline ? (
            <View style={styles.identityMetaRow}>
              <MapPin size={13} color={ds.carbon[500]} strokeWidth={2} />
              <Text style={styles.identityMeta} numberOfLines={1}>
                {subline}
              </Text>
            </View>
          ) : null}
          {email ? (
            <View style={[styles.identityMetaRow, { marginTop: 3 }]}>
              <Mail size={13} color={ds.carbon[500]} strokeWidth={2} />
              <Text style={styles.identityMeta} numberOfLines={1}>
                {email}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.identityFooter}>
        <TouchableOpacity
          onPress={onPressPill}
          disabled={!onPressPill}
          activeOpacity={0.75}
          style={[styles.pill, { backgroundColor: pillBg }]}
          accessibilityRole={onPressPill ? "button" : "text"}
          accessibilityLabel={pillLabel}
        >
          <View style={[styles.pillDot, { backgroundColor: pillDot }]} />
          <Text style={[styles.eyebrow, { color: pillFg }]}>{pillLabel}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onPressCta}
          disabled={ctaBusy}
          activeOpacity={0.85}
          style={[styles.punch, { backgroundColor: ctaBg }]}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
        >
          {ctaBusy ? (
            <ActivityIndicator size="small" color={ds.white} />
          ) : (
            <>
              <CtaIcon size={15} color={ds.white} strokeWidth={2.2} />
              <Text style={styles.punchLabel}>{ctaLabel}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ── List ────────────────────────────────────────────────────────────────── */

export function SectionHeading({
  title,
  count,
  actionLabel,
  onAction,
}: {
  title: string;
  count?: number;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {/* The count sits beside the title and absorbs the slack, so the
          action stays pinned right. */}
      <Text style={styles.sectionCount}>{count ?? ""}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} hitSlop={8} activeOpacity={0.7}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function OverviewRow({
  icon: Icon,
  tint,
  title,
  sub,
  badge,
  onPress,
}: {
  icon: LucideIcon;
  tint: TintKey;
  title: string;
  sub: string;
  badge?: BadgeTone;
  onPress?: () => void;
}) {
  const tone = TINT[tint];
  const badgeTone = badge ? BADGE[badge] : null;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.85}
      style={styles.row}
    >
      <View style={[styles.rowIcon, { backgroundColor: tone.tint }]}>
        <Icon size={17} color={tone.icon} strokeWidth={2.1} />
      </View>

      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {title}
        </Text>
        <View style={styles.rowMetaRow}>
          <Text style={styles.rowSub} numberOfLines={1}>
            {sub}
          </Text>
          {badgeTone ? (
            <View style={[styles.badge, { backgroundColor: badgeTone.bg }]}>
              <Text style={[styles.badgeText, { color: badgeTone.fg }]}>
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <ChevronRight size={18} color={ds.carbon[800]} strokeWidth={2} />
    </TouchableOpacity>
  );
}

export function OverviewEmpty({ label }: { label: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{label}</Text>
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
  siteRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  siteName: {
    flexShrink: 1,
    fontSize: 19,
    lineHeight: 22,
    fontWeight: "700",
    letterSpacing: 0.38,
    color: ds.white,
  },
  headerTile: {
    width: 36,
    height: 36,
    borderRadius: soRadius.tile,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: soRadius.pill,
    backgroundColor: ds.sky[100],
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 14, fontWeight: "700", color: ds.white },
  avatarDot: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: ds.flame[100],
    borderWidth: 2,
    borderColor: ds.thunder[100],
  },

  eyebrow: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
  },
  eyebrowMuted: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    color: ds.thunder[700],
    marginBottom: 4,
  },

  card: {
    backgroundColor: ds.white,
    borderRadius: soRadius.card,
    padding: 16,
    marginBottom: 12,
    ...soShadow,
  },
  identityRow: { flexDirection: "row", alignItems: "flex-start", gap: 13 },
  identityAvatar: {
    width: 46,
    height: 46,
    borderRadius: soRadius.pill,
    backgroundColor: ds.sky[100],
    alignItems: "center",
    justifyContent: "center",
  },
  identityAvatarText: { fontSize: 18, fontWeight: "700", color: ds.white },
  identityBody: { flex: 1, minWidth: 0 },
  identityName: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600",
    letterSpacing: 0.16,
    color: ds.carbon[100],
  },
  identityMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
  },
  identityMeta: { flexShrink: 1, fontSize: 12, color: ds.carbon[400] },
  identityFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: ds.carbon[1000],
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: soRadius.pill,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  punch: {
    borderRadius: soRadius.sm,
    paddingVertical: 9,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  punchLabel: {
    fontSize: 12.5,
    fontWeight: "600",
    letterSpacing: 0.13,
    color: ds.white,
  },

  sectionRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.15,
    color: ds.carbon[100],
  },
  sectionCount: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: ds.flame[100],
  },
  sectionAction: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: ds.flame[100],
  },

  row: {
    backgroundColor: ds.white,
    borderRadius: soRadius.card,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    ...soShadow,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: soRadius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTitle: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "500",
    letterSpacing: 0.13,
    color: ds.carbon[100],
    marginBottom: 4,
  },
  rowMetaRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  rowSub: { flexShrink: 1, fontSize: 10.5, color: ds.carbon[600] },
  badge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: soRadius.sm,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.72,
    textTransform: "uppercase",
  },

  empty: { paddingVertical: 24, alignItems: "center" },
  emptyText: { fontSize: 12, color: ds.carbon[600] },
});
