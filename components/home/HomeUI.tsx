/**
 * Home screen building blocks — Claude Design "JouleOps Home Redesign.dc.html".
 *
 * The artboard replaces the old Site Overview identity card with a thunder
 * hero (greeting + two shift/ticket stats + a full-width punch CTA) followed by
 * two summary cards and a richer ticket feed.
 *
 * Geometry and colour are the mock's, verbatim; brand values resolve through
 * the shared `@/constants/ds` token set. The handful of literals below are
 * one-off tints the mock uses that have no token in the design system.
 */
import React from "react";
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ChevronDown, ChevronRight, Clock, MapPin } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { ds } from "@/constants/ds";
import { soShadow } from "@/components/home/SiteOverview";

/** Corner scale read off the artboard. */
export const homeRadius = {
  hero: 26,
  card: 18,
  row: 14,
  cta: 12,
  bar: 6,
  badge: 5,
  pill: 99,
} as const;

/** Mock-only tints (no design-system token exists for these). */
const MOCK = {
  /** Idle weekday bar — a lighter sky wash than sky-900. */
  barIdle: "#EAF4F5",
  /** Zero-hours day (weekend / not worked). */
  barEmpty: "#F0EFEF",
  /** Ticket-count numeral in the hero. */
  heroAccent: "#F5A87F",
  /** "In progress" segment — the design system's `--chart-actual`. */
  inProgress: "#E5A93A",
  divider: "rgba(255,255,255,0.14)",
  headerTile: "rgba(255,255,255,0.10)",
} as const;

/* ── Hero ─────────────────────────────────────────────────────────────────
   Thunder chrome: who/where/when, the two headline numbers, and the punch
   CTA — everything the operator needs before scrolling.                    */

export function HomeHero({
  topInset,
  eyebrow,
  onPressEyebrow,
  greeting,
  avatarInitial,
  avatarUri,
  avatarLabel,
  onAvatar,
  bellIcon: BellIcon,
  bellLabel,
  onBell,
  bellDot,
  shiftValue,
  shiftLabel,
  ticketValue,
  ticketUnit,
  ticketLabel,
  ctaLabel,
  ctaIcon: CtaIcon,
  ctaBg,
  ctaFg,
  ctaBusy,
  onPressCta,
}: {
  topInset: number;
  eyebrow: string;
  onPressEyebrow?: () => void;
  greeting: string;
  avatarInitial: string;
  /** The user's profile photo; the monogram stands in when unset. */
  avatarUri?: string | null;
  avatarLabel: string;
  onAvatar: () => void;
  bellIcon: LucideIcon;
  bellLabel: string;
  onBell: () => void;
  bellDot?: boolean;
  shiftValue: string;
  shiftLabel: string;
  ticketValue: string;
  ticketUnit?: string;
  ticketLabel: string;
  ctaLabel: string;
  ctaIcon: LucideIcon;
  ctaBg: string;
  ctaFg: string;
  ctaBusy?: boolean;
  onPressCta: () => void;
}) {
  return (
    <View style={[styles.hero, { paddingTop: topInset }]}>
      <View style={styles.heroTop}>
        <View style={styles.heroLead}>
          <TouchableOpacity
            onPress={onPressEyebrow}
            disabled={!onPressEyebrow}
            activeOpacity={0.75}
            hitSlop={6}
            style={styles.eyebrowRow}
            accessibilityRole={onPressEyebrow ? "button" : "text"}
            accessibilityLabel={
              onPressEyebrow ? `${eyebrow}. Change site` : eyebrow
            }
          >
            <Text style={styles.eyebrowSky} numberOfLines={1}>
              {eyebrow}
            </Text>
            {onPressEyebrow ? (
              <ChevronDown size={12} color={ds.sky[500]} strokeWidth={2.4} />
            ) : null}
          </TouchableOpacity>
          <Text style={styles.greeting} numberOfLines={2}>
            {greeting}
          </Text>
        </View>

        {/* Not in the artboard, but Notifications / Reports have no other
            entry point on mobile — kept as the old header's tile. */}
        <TouchableOpacity
          onPress={onBell}
          activeOpacity={0.8}
          hitSlop={6}
          style={styles.heroTile}
          accessibilityRole="button"
          accessibilityLabel={bellLabel}
        >
          <BellIcon size={18} color={ds.white} strokeWidth={2} />
          {bellDot ? <View style={styles.heroTileDot} /> : null}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onAvatar}
          activeOpacity={0.8}
          hitSlop={6}
          style={styles.heroAvatar}
          accessibilityRole="button"
          accessibilityLabel={avatarLabel}
        >
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.heroAvatarImage} />
          ) : (
            <Text style={styles.heroAvatarText}>{avatarInitial}</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <View style={styles.statValueRow}>
            <Text style={styles.statValue} numberOfLines={1}>
              {shiftValue}
            </Text>
          </View>
          <Text style={styles.statLabel}>{shiftLabel}</Text>
        </View>

        <View style={styles.statDivider} />

        <View style={styles.stat}>
          <View style={styles.statValueRow}>
            <Text style={[styles.statValue, { color: MOCK.heroAccent }]}>
              {ticketValue}
            </Text>
            {ticketUnit ? (
              <Text style={styles.statUnit}>{ticketUnit}</Text>
            ) : null}
          </View>
          <Text style={styles.statLabel}>{ticketLabel}</Text>
        </View>
      </View>

      <View style={styles.ctaWrap}>
        <TouchableOpacity
          onPress={onPressCta}
          disabled={ctaBusy}
          activeOpacity={0.85}
          style={[styles.cta, { backgroundColor: ctaBg }]}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
        >
          {ctaBusy ? (
            <ActivityIndicator size="small" color={ctaFg} />
          ) : (
            <>
              <CtaIcon size={17} color={ctaFg} strokeWidth={2.2} />
              <Text style={[styles.ctaLabel, { color: ctaFg }]}>
                {ctaLabel}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ── Hours this week ──────────────────────────────────────────────────────
   Seven day columns; today is the sky bar, worked days the pale wash, and
   days with no attendance sit at a 20% stub so the row keeps its rhythm.   */

export interface DayBar {
  /** Single-letter column label (M T W T F S S). */
  label: string;
  minutes: number;
  isToday?: boolean;
}

export function HoursWeekCard({
  title = "Hours this week",
  total,
  days,
  onPress,
}: {
  title?: string;
  total: string;
  days: DayBar[];
  /** Opens the attendance screen; the card is inert when omitted. */
  onPress?: () => void;
}) {
  const peak = Math.max(...days.map((d) => d.minutes), 1);

  // A plain card when there is nowhere to go, so the affordance never lies.
  const Container: React.ComponentType<any> = onPress ? TouchableOpacity : View;

  return (
    <Container
      style={[styles.card, { marginBottom: 14 }]}
      {...(onPress
        ? {
            onPress,
            activeOpacity: 0.85,
            accessibilityRole: "button" as const,
            accessibilityLabel: `${title}, ${total}. Open attendance`,
          }
        : null)}
    >
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{title}</Text>
        <View style={styles.cardHeadEnd}>
          <Text style={styles.cardTotal}>{total}</Text>
          {onPress ? (
            <ChevronRight size={15} color={ds.carbon[700]} strokeWidth={2.2} />
          ) : null}
        </View>
      </View>

      <View style={styles.chart}>
        {days.map((day, i) => {
          const worked = day.minutes > 0;
          // The mock's bars run 42–92% of the plot; empty days sit at 20%.
          const pct = worked
            ? 42 + Math.round((day.minutes / peak) * 50)
            : 20;
          return (
            <View key={`${day.label}-${i}`} style={styles.chartCol}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${pct}%`,
                      backgroundColor: day.isToday
                        ? ds.sky[100]
                        : worked
                          ? MOCK.barIdle
                          : MOCK.barEmpty,
                    },
                  ]}
                />
              </View>
              <Text
                style={[
                  styles.eyebrow,
                  { color: day.isToday ? ds.sky[100] : ds.carbon[700] },
                ]}
              >
                {day.label}
              </Text>
            </View>
          );
        })}
      </View>
    </Container>
  );
}

/* ── Ticket status ────────────────────────────────────────────────────────
   One stacked meter plus its legend — the shape of the queue at a glance.  */

export function TicketStatusCard({
  title = "Ticket status",
  caption,
  open,
  inProgress,
  resolved,
}: {
  title?: string;
  caption: string;
  open: number;
  inProgress: number;
  resolved: number;
}) {
  const total = open + inProgress + resolved;
  const segments = [
    { key: "open", label: "Open", value: open, color: ds.flame[100] },
    {
      key: "inprogress",
      label: "In progress",
      value: inProgress,
      color: MOCK.inProgress,
    },
    { key: "resolved", label: "Resolved", value: resolved, color: ds.sky[100] },
  ];

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={[styles.eyebrow, { color: ds.carbon[700] }]}>
          {caption}
        </Text>
      </View>

      <View style={styles.meter}>
        {total === 0 ? (
          <View style={{ flex: 1, backgroundColor: ds.carbon[1000] }} />
        ) : (
          segments
            .filter((s) => s.value > 0)
            .map((s) => (
              <View
                key={s.key}
                style={{ flex: s.value, backgroundColor: s.color }}
              />
            ))
        )}
      </View>

      <View style={styles.legend}>
        {segments.map((s) => (
          <View key={s.key} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: s.color }]} />
            <Text style={styles.legendText}>
              {s.label} {s.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ── Section heading ──────────────────────────────────────────────────── */

export function HomeSectionHeading({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction} hitSlop={8} activeOpacity={0.7}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

/* ── Ticket card ──────────────────────────────────────────────────────────
   Number + status + priority on the meta line, the fault as the headline,
   then where / how long / who.                                            */

export interface ChipTone {
  bg: string;
  fg: string;
}

/** Status chip tones — Open reads flame, anything in flight reads sky. */
export function statusTone(status: string): ChipTone {
  const s = status.toLowerCase();
  if (s === "open") return { bg: ds.flame[1000], fg: ds.flame[100] };
  if (s === "resolved" || s === "closed")
    return { bg: ds.sky[1000], fg: ds.sky[100] };
  if (s === "cancelled" || s === "hold" || s === "waiting")
    return { bg: ds.carbon[1000], fg: ds.carbon[400] };
  return { bg: ds.sky[1000], fg: ds.sky[100] };
}

/** Priority chip tones — only "Very High" is filled solid. */
export function priorityTone(priority: string): ChipTone {
  const p = priority.toLowerCase();
  if (p.includes("very high")) return { bg: ds.flame[100], fg: ds.pageBg };
  if (p.includes("high")) return { bg: ds.flame[1000], fg: ds.flame[100] };
  return { bg: ds.carbon[1000], fg: ds.carbon[400] };
}

function Chip({ tone, label }: { tone: ChipTone; label: string }) {
  return (
    <View style={[styles.chip, { backgroundColor: tone.bg }]}>
      <Text style={[styles.chipText, { color: tone.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function HomeTicketCard({
  icon: Icon,
  iconTint,
  iconColor,
  ticketNo,
  status,
  priority,
  title,
  location,
  elapsed,
  elapsedUrgent,
  assignee,
  onPress,
}: {
  icon: LucideIcon;
  iconTint: string;
  iconColor: string;
  ticketNo: string;
  status?: string;
  priority?: string;
  title: string;
  location?: string;
  elapsed?: string;
  elapsedUrgent?: boolean;
  assignee?: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.85}
      style={styles.ticket}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${ticketNo}. ${title}`}
    >
      <View style={styles.ticketRow}>
        <View style={[styles.ticketIcon, { backgroundColor: iconTint }]}>
          <Icon size={17} color={iconColor} strokeWidth={2.1} />
        </View>

        <View style={styles.ticketBody}>
          <View style={styles.ticketMeta}>
            <Text style={styles.ticketNo} numberOfLines={1}>
              {ticketNo}
            </Text>
            {status ? <Chip tone={statusTone(status)} label={status} /> : null}
            {priority ? (
              <Chip tone={priorityTone(priority)} label={priority} />
            ) : null}
          </View>

          <Text style={styles.ticketTitle} numberOfLines={2}>
            {title}
          </Text>

          <View style={styles.ticketFoot}>
            {location ? (
              <View style={styles.footItemShrink}>
                <MapPin size={12} color={ds.carbon[600]} strokeWidth={2} />
                <Text style={styles.footText} numberOfLines={1}>
                  {location}
                </Text>
              </View>
            ) : null}
            {elapsed ? (
              <View style={styles.footItem}>
                <Clock size={12} color={ds.carbon[600]} strokeWidth={2} />
                <Text
                  style={[
                    styles.footText,
                    elapsedUrgent && { color: ds.flame[100] },
                  ]}
                >
                  {elapsed}
                </Text>
              </View>
            ) : null}
            <View style={{ flex: 1 }} />
            {assignee ? (
              <View style={styles.assignee}>
                <Text style={styles.assigneeText}>{assignee}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export function HomeEmpty({ label }: { label: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  /* Hero */
  hero: {
    backgroundColor: ds.thunder[100],
    paddingBottom: 20,
    borderBottomLeftRadius: homeRadius.hero,
    borderBottomRightRadius: homeRadius.hero,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 10,
    paddingHorizontal: 22,
    marginBottom: 20,
  },
  heroLead: { flex: 1, minWidth: 0 },
  eyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 4,
  },
  eyebrowSky: {
    flexShrink: 1,
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    color: ds.sky[500],
  },
  greeting: {
    fontSize: 21,
    lineHeight: 24,
    fontWeight: "700",
    color: ds.white,
  },
  heroTile: {
    width: 36,
    height: 36,
    borderRadius: 17,
    backgroundColor: MOCK.headerTile,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTileDot: {
    position: "absolute",
    top: 1,
    right: 1,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: ds.flame[100],
    borderWidth: 2,
    borderColor: ds.thunder[100],
  },
  heroAvatar: {
    width: 42,
    height: 42,
    borderRadius: homeRadius.pill,
    backgroundColor: ds.sky[100],
    alignItems: "center",
    justifyContent: "center",
  },
  heroAvatarText: { fontSize: 16, fontWeight: "700", color: ds.white },
  heroAvatarImage: {
    width: 42,
    height: 42,
    borderRadius: homeRadius.pill,
  },

  statsRow: { flexDirection: "row", gap: 12, paddingHorizontal: 22 },
  stat: { flex: 1, minWidth: 0 },
  statValueRow: { flexDirection: "row", alignItems: "baseline", gap: 5 },
  statValue: {
    fontSize: 30,
    lineHeight: 32,
    fontWeight: "700",
    color: ds.white,
  },
  statUnit: { fontSize: 12, fontWeight: "600", color: ds.sky[500] },
  statLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    color: ds.sky[500],
    marginTop: 5,
  },
  statDivider: { width: 1, backgroundColor: MOCK.divider },

  ctaWrap: { paddingHorizontal: 22, paddingTop: 16 },
  cta: {
    borderRadius: homeRadius.cta,
    paddingVertical: 13,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 46,
  },
  ctaLabel: { fontSize: 14, fontWeight: "700", letterSpacing: 0.14 },

  /* Cards */
  card: {
    backgroundColor: ds.white,
    borderRadius: homeRadius.card,
    padding: 16,
    ...soShadow,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.14,
    color: ds.carbon[100],
  },
  cardHeadEnd: { flexDirection: "row", alignItems: "center", gap: 4 },
  cardTotal: { fontSize: 13, fontWeight: "700", color: ds.sky[100] },
  eyebrow: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
  },

  chart: { flexDirection: "row", alignItems: "stretch", gap: 9, height: 80 },
  chartCol: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
  },
  /** Absorbs whatever the day label leaves, so `bar` can size in percent. */
  barTrack: { flex: 1, width: "100%", justifyContent: "flex-end" },
  bar: { width: "100%", borderRadius: homeRadius.bar },

  meter: {
    flexDirection: "row",
    height: 12,
    borderRadius: homeRadius.pill,
    overflow: "hidden",
    marginBottom: 12,
  },
  legend: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontSize: 11, fontWeight: "500", color: ds.carbon[400] },

  /* Section */
  sectionRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
    marginTop: 16,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.14,
    color: ds.carbon[100],
  },
  sectionAction: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: ds.flame[100],
  },

  /* Ticket card */
  ticket: {
    backgroundColor: ds.white,
    borderRadius: homeRadius.row,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 7,
    ...soShadow,
  },
  ticketRow: { flexDirection: "row", alignItems: "flex-start", gap: 11 },
  ticketIcon: {
    width: 34,
    height: 34,
    borderRadius: homeRadius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  ticketBody: { flex: 1, minWidth: 0 },
  ticketMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 5,
  },
  ticketNo: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.6,
    color: ds.carbon[500],
  },
  chip: {
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: homeRadius.badge,
    flexShrink: 0,
  },
  chipText: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.36,
    textTransform: "uppercase",
  },
  ticketTitle: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "500",
    letterSpacing: 0.135,
    color: ds.carbon[100],
    marginBottom: 7,
  },
  ticketFoot: { flexDirection: "row", alignItems: "center", gap: 10 },
  footItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  footItemShrink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
    minWidth: 0,
  },
  footText: { flexShrink: 1, fontSize: 10.5, color: ds.carbon[400] },
  assignee: {
    width: 24,
    height: 24,
    borderRadius: homeRadius.pill,
    backgroundColor: ds.carbon[1000],
    alignItems: "center",
    justifyContent: "center",
  },
  assigneeText: { fontSize: 9, fontWeight: "600", color: ds.carbon[400] },

  empty: { paddingVertical: 24, alignItems: "center" },
  emptyText: { fontSize: 12, color: ds.carbon[600] },
});
