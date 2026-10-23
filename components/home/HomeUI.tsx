/**
 * Home blocks from the Claude Design "JouleOps App" artboard (manager home
 * `r_home_mgr` and technician home `r_home_tech`). Presentational only —
 * app/(tabs)/dashboard.tsx owns the data and passes view values in.
 */
import React, { useState } from "react";
import { ActivityIndicator, Image, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Circle, G } from "react-native-svg";
import { Bx } from "@/components/jo/Bx";
import {
  GlossFill,
  Avatar,
  Card,
  HeroCard,
  HeroTag,
  IconButton,
  ProgressBar,
  Shimmer,
  type JoIcon,
  capsStyle,
  f,
} from "@/components/jo/ui";
import { ACCENTS, avatarColor, initials, type JoTone } from "@/constants/jo";
import { makeJoStyles, useJoTheme, type JoTheme } from "@/hooks/useJoTheme";

export function toneColor(t: JoTheme, tone: JoTone | "ink"): string {
  return tone === "ink" ? t.ink : t[tone];
}

/* ── Header ────────────────────────────────────────────────────────────── */

/** web/public Jouleops-logo(-light).png, trimmed to the ink; 360×96. */
const WORDMARK = {
  onDark: require("@/assets/images/jouleops-wordmark-on-dark.png"),
  onLight: require("@/assets/images/jouleops-wordmark-on-light.png"),
};
const WORDMARK_HEIGHT = 20;
const WORDMARK_WIDTH = (WORDMARK_HEIGHT * 360) / 96;

export function HomeHeader({
  siteName,
  onSitePress,
  bellDot,
  onBell,
  bellLabel = "Notifications",
  bellIcon = "bx-bell",
  userName,
  userPhotoUrl,
  onAvatar,
  avatarLabel = "Profile",
}: {
  siteName: string;
  onSitePress?: () => void;
  bellDot?: boolean;
  onBell?: () => void;
  bellLabel?: string;
  bellIcon?: JoIcon;
  userName: string;
  /** users.profile_photo_url — initials when absent. */
  userPhotoUrl?: string | null;
  onAvatar?: () => void;
  avatarLabel?: string;
}) {
  const t = useJoTheme();
  const s = useStyles();
  const title = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      {/* Long site names ("KIMS, Mumbai – Andheri") wrap to a second line instead of truncating. */}
      <Text style={[f.d(21, -0.02, 1.15), { color: t.ink, flexShrink: 1 }]} numberOfLines={2}>
        {siteName}
      </Text>
      {onSitePress ? <Bx name="bx-chevron-down" size={22} color={t.muted} /> : null}
    </View>
  );
  return (
    <View style={s.header}>
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <Image
          source={t.isDark ? WORDMARK.onDark : WORDMARK.onLight}
          style={{ width: WORDMARK_WIDTH, height: WORDMARK_HEIGHT }}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel="JouleOps"
        />
        <View style={{ marginTop: 8 }}>
          {onSitePress ? (
            <TouchableOpacity
              onPress={onSitePress}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Site ${siteName}. Change site`}
            >
              {title}
            </TouchableOpacity>
          ) : (
            title
          )}
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8, flexShrink: 0, marginTop: 4 }}>
        <IconButton icon={bellIcon} label={bellLabel} onPress={onBell} dot={bellDot} />
        <TouchableOpacity
          onPress={onAvatar}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={avatarLabel}
        >
          <Avatar
            name={userName}
            photoUrl={userPhotoUrl}
            size={44}
            color={t.avatarSelf}
            ring={t.accent}
            display
            textSize={15}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ── Manager: operational status hero ──────────────────────────────────── */

export function OpsHero({
  openTickets,
  breachLabel,
  stats,
  onPress,
}: {
  openTickets: string;
  breachLabel: string | null;
  stats: { label: string; value: string }[];
  onPress?: () => void;
}) {
  const t = useJoTheme();
  return (
    <HeroCard
      onPress={onPress}
      accessibilityLabel={`Operational status. ${openTickets} open tickets. Open tickets`}
      style={{ marginTop: 14, paddingTop: 12, paddingHorizontal: 14, paddingBottom: 13 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Text style={[capsStyle(12), { color: t.onAccent, opacity: 0.7 }]}>Operational status</Text>
        {breachLabel ? <HeroTag label={breachLabel} color="#FF8A7A" icon="bxs-error-circle" /> : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 10 }}>
        <View style={{ flex: 1.25, paddingRight: 10 }}>
          <Text style={[f.d(34, -0.045, 1), { color: t.onAccent }]}>{openTickets}</Text>
          <Text style={[f.t(11, 600), { color: t.onAccent, marginTop: 4 }]} numberOfLines={1}>
            Open tickets
          </Text>
        </View>
        {stats.map((st) => (
          <View
            key={st.label}
            style={{ flex: 1, paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: t.heroDivider }}
          >
            <Text style={[f.d(21, -0.03, 1.05), { color: t.onAccent }]}>{st.value}</Text>
            <Text style={[f.t(11, 500), { color: t.onAccent, opacity: 0.68, marginTop: 4 }]} numberOfLines={1}>
              {st.label}
            </Text>
          </View>
        ))}
      </View>
    </HeroCard>
  );
}

/* ── Manager: team on site ─────────────────────────────────────────────── */

export interface TeamRow {
  key: string;
  name: string;
  sub: string;
  inAt: string;
  dur: string;
  pct: number;
}

function LiveDot() {
  const t = useJoTheme();
  const pulse = useSharedValue(0);
  React.useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) }), -1, false);
  }, [pulse]);
  // box-shadow 0 → 7px ring fading out (joPulse)
  const ring = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 1.75 }],
    opacity: 0.55 * (1 - pulse.value),
  }));
  return (
    <View style={{ width: 8, height: 8 }}>
      <Animated.View
        style={[
          { position: "absolute", width: 8, height: 8, borderRadius: 4, backgroundColor: t.ok },
          ring,
        ]}
      />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.ok }} />
    </View>
  );
}

export function TeamCard({
  count,
  rows,
  hasMore,
  expanded,
  onToggle,
  loading,
  note,
  periodLink,
}: {
  count: number | null;
  rows: TeamRow[];
  hasMore: boolean;
  expanded: boolean;
  onToggle: () => void;
  loading?: boolean;
  note?: string | null;
  /**
   * Shown when Home is filtered to more than today: the card itself stays
   * live (today), and this opens the attendance log for the chosen period.
   */
  periodLink?: { label: string; onPress: () => void } | null;
}) {
  const t = useJoTheme();
  const s = useStyles();
  const stack = rows.length > 0 ? rows : [];
  const total = count ?? 0;
  return (
    <Card radius={30} style={{ marginTop: 12, paddingTop: 20, paddingHorizontal: 18, paddingBottom: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Text style={[f.t(15, 600), { color: t.ink }]}>Team on site</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          <LiveDot />
          <Text style={[f.t(12, 500), { color: t.ok }]}>Live</Text>
        </View>
      </View>
      {periodLink ? (
        <TouchableOpacity
          onPress={periodLink.onPress}
          activeOpacity={0.7}
          hitSlop={8}
          accessibilityRole="link"
          accessibilityLabel={`View attendance for ${periodLink.label}`}
          style={{ flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 2, marginTop: 4 }}
        >
          <Text style={[f.t(12, 600), { color: t.accentInk }]}>View attendance · {periodLink.label}</Text>
          <Bx name="bx-chevron-right" size={16} color={t.accentInk} />
        </TouchableOpacity>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, minWidth: 0 }}>
          {loading && count == null ? (
            <ActivityIndicator color={t.muted} style={{ height: 52 }} />
          ) : (
            <Text style={[f.d(52, -0.04, 1), { color: t.ink }]}>{count ?? "—"}</Text>
          )}
          <Text style={[f.t(13), { color: t.muted, lineHeight: 17, marginBottom: 4 }]}>
            {total === 1 ? "technician" : "technicians"}
            {"\n"}punched in
          </Text>
        </View>
        <View style={{ flexDirection: "row", flexShrink: 0, paddingLeft: 10 }}>
          {stack.slice(0, 4).map((r) => (
            <View key={r.key} style={[s.stackAv, { backgroundColor: avatarColor(t, r.name) }]}>
              <Text style={[f.t(11.5, 700), { color: "#0A0A0C" }]}>{initials(r.name)}</Text>
            </View>
          ))}
          {total > 4 ? (
            <View style={[s.stackAv, { backgroundColor: t.track }]}>
              <Text style={[f.t(11.5, 600), { color: t.ink }]}>+{total - 4}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={{ marginTop: 12 }}>
        {rows.map((p) => (
          <View key={p.key} style={s.teamRow}>
            <Avatar name={p.name} size={40} textSize={13} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                <Text style={[f.t(14, 600), { color: t.ink, flexShrink: 1 }]} numberOfLines={1}>
                  {p.name}
                </Text>
                <Text style={[f.t(13, 600), { color: t.ink, flexShrink: 0 }]}>{p.inAt}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 }}>
                <Text style={[f.t(11.5), { color: t.muted, flex: 1, minWidth: 0 }]} numberOfLines={1}>
                  {p.sub}
                </Text>
                <ProgressBar pct={p.pct} color={t.accent} height={5} gloss style={{ width: 64, flexShrink: 0 }} />
                <Text style={[f.t(11.5), { color: t.muted, width: 44, textAlign: "right", flexShrink: 0 }]}>
                  {p.dur}
                </Text>
              </View>
            </View>
          </View>
        ))}
        {!loading && rows.length === 0 ? (
          <View style={[s.teamRow, { justifyContent: "center", paddingVertical: 16 }]}>
            <Text style={[f.t(12.5), { color: t.muted }]}>{note || "Nobody is punched in right now."}</Text>
          </View>
        ) : null}
      </View>

      {hasMore ? (
        <TouchableOpacity
          onPress={onToggle}
          activeOpacity={0.8}
          accessibilityRole="button"
          style={s.moreBtn}
        >
          <Text style={[f.t(13, 600), { color: t.ink }]}>{expanded ? "Show less" : `View all ${total}`}</Text>
          <Bx name={expanded ? "bx-chevron-up" : "bx-chevron-down"} size={18} color={t.ink} />
        </TouchableOpacity>
      ) : (
        <View style={{ height: 10 }} />
      )}
    </Card>
  );
}

/* ── Manager: SLA score ────────────────────────────────────────────────── */

export interface SlaKpiView {
  label: string;
  text: string;
  pct: number;
  color: string;
  weak: boolean;
}

export function SlaScoreCard({
  monthLabel,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onMonth,
  onTitle,
  score,
  color,
  status,
  statusBg,
  pctText,
  scoreFrac,
  kpis,
  loading,
  emptyNote,
}: {
  monthLabel: string;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onMonth: () => void;
  onTitle?: () => void;
  score: string;
  color: string;
  status: string | null;
  statusBg: string;
  pctText: string;
  /** Score as a fraction of 5 (0–1). */
  scoreFrac: number;
  kpis: SlaKpiView[];
  loading?: boolean;
  emptyNote?: string | null;
}) {
  const t = useJoTheme();
  const s = useStyles();
  return (
    <Card
      radius={30}
      onPress={onTitle}
      accessibilityLabel={`SLA score ${score} for ${monthLabel}. Open SLA`}
      style={{ marginTop: 12, paddingTop: 20, paddingHorizontal: 18, paddingBottom: 18 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <TouchableOpacity
          onPress={onTitle}
          disabled={!onTitle}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="SLA score. Open SLA"
          style={{ flexDirection: "row", alignItems: "center", gap: 3 }}
        >
          <Text style={[f.t(15, 600), { color: t.ink }]}>SLA score</Text>
          {onTitle ? <Bx name="bx-chevron-right" size={19} color={t.muted} /> : null}
        </TouchableOpacity>
        <View style={s.stepper}>
          <TouchableOpacity
            onPress={onPrev}
            disabled={!canPrev}
            style={s.stepBtn}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
          >
            <Bx name="bx-chevron-left" size={19} color={canPrev ? t.ink : t.disabled} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onMonth} accessibilityRole="button" accessibilityLabel={`SLA month ${monthLabel}. Change`}>
            <Text style={[f.t(12.5, 600), { color: t.ink }]} numberOfLines={1}>
              {monthLabel}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onNext}
            disabled={!canNext}
            style={s.stepBtn}
            accessibilityRole="button"
            accessibilityLabel="Next month"
          >
            <Bx name="bx-chevron-right" size={19} color={canNext ? t.ink : t.disabled} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Score and contract % side by side, then a five-step meter — one
          segment per point of the 0–5 score — instead of a ring, so the only
          round chart on Home is the ticket-category donut. */}
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, marginTop: 16 }}>
        <View style={{ minWidth: 0 }}>
          {loading ? (
            <ActivityIndicator color={t.muted} style={{ height: 48, alignSelf: "flex-start" }} />
          ) : (
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
              <Text style={[f.d(46, -0.04, 1), { color: t.ink }]}>{score}</Text>
              <Text style={[f.t(14, 500), { color: t.muted }]}>/ 5</Text>
            </View>
          )}
          {status ? (
            <View style={[s.statusChip, { backgroundColor: statusBg, marginTop: 8 }]}>
              <Text style={[f.t(12, 600), { color }]}>{status}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end", flexShrink: 1, minWidth: 0 }}>
          <Text style={[f.d(24, -0.03, 1.05), { color: t.ink }]}>{pctText}</Text>
          <Text style={[f.t(12), { color: t.muted, marginTop: 4, textAlign: "right" }]}>
            {emptyNote ?? "of contract commitment"}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 5, marginTop: 16 }} accessibilityLabel={`Score ${score} out of 5`}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={{ flex: 1 }}>
            <ProgressBar pct={Math.max(0, Math.min(1, scoreFrac * 5 - i)) * 100} color={color} height={10} gloss />
            <Text style={[f.m(10), { color: t.faint, marginTop: 5, textAlign: "right" }]}>{i + 1}</Text>
          </View>
        ))}
      </View>

      {kpis.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
          {kpis.map((k) => (
            <View key={k.label} style={s.kpi}>
              <Text style={[f.t(11.5), { color: t.muted }]} numberOfLines={1}>
                {k.label}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
                <Text style={[f.d(20, -0.02, 1.05), { color: k.color }]}>{k.text}</Text>
                {k.weak ? <Bx name="bxs-error" size={14} color={t.warn} /> : null}
              </View>
              <ProgressBar pct={k.pct} color={k.color} height={6} gloss style={{ marginTop: 9 }} />
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

/* ── Tickets by category (both roles) ─────────────────────────────────── */

/** Slice order; "Other" (the server's folded tail) is always grey. */
const CATEGORY_ACCENTS = ["violet", "mint", "flame", "sky", "amber", "rose", "lime"] as const;

function categoryColor(t: JoTheme, name: string, i: number): string {
  if (name === "Other") return t.isDark ? "#5A5A66" : "#A3A3AD";
  const a = ACCENTS.find((x) => x.key === CATEGORY_ACCENTS[i % CATEGORY_ACCENTS.length])!;
  // The pastel accents wash out on white; light mode uses their deeper ink.
  return t.isDark ? a.color : a.ink;
}

type CategoryChart = "pie" | "bar";

/** Survives the Home screen remounting (tab switches) for this app session. */
let lastCategoryChart: CategoryChart = "pie";
function rememberCategoryChart(c: CategoryChart) {
  lastCategoryChart = c;
}

export function TicketCategoryCard({
  categories,
  periodLabel,
  onPress,
  loading = false,
}: {
  /** Biggest first; the server folds the tail into "Other". */
  categories: { category: string; count: number }[];
  periodLabel: string;
  onPress?: () => void;
  /**
   * The period's numbers are on their way: keep the card's footprint (a
   * placeholder) so the page doesn't shrink and yank the scroll position.
   */
  loading?: boolean;
}) {
  const t = useJoTheme();
  const s = useStyles();
  const [chart, setChart] = useState<CategoryChart>(lastCategoryChart);
  const pick = (c: CategoryChart) => {
    rememberCategoryChart(c);
    setChart(c);
  };
  const rows = categories
    .filter((c) => c.count > 0)
    .map((c, i) => ({ ...c, color: categoryColor(t, c.category, i) }));
  const total = rows.reduce((n, r) => n + r.count, 0);
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`Tickets by category, ${total} raised. Open tickets`}
      style={{ marginTop: 12, paddingTop: 18, paddingHorizontal: 18, paddingBottom: 18 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text style={[f.t(15, 600), { color: t.ink }]} numberOfLines={1}>
            Tickets by category
          </Text>
          <Text style={[f.t(11.5), { color: t.muted, marginTop: 3 }]} numberOfLines={1}>
            {loading ? periodLabel : `${total} raised · ${periodLabel}`}
          </Text>
        </View>
        {!loading && total > 0 ? (
          <View style={s.chartToggle} accessibilityRole="tablist">
            {(["pie", "bar"] as const).map((c) => {
              const on = chart === c;
              return (
                <TouchableOpacity
                  key={c}
                  onPress={() => pick(c)}
                  activeOpacity={0.8}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={c === "pie" ? "Pie chart" : "Bar chart"}
                  style={[s.chartToggleBtn, on && { backgroundColor: t.selBg }]}
                >
                  {on ? <GlossFill color={t.selBg} fg={t.selFg} radius={13} /> : null}
                  <Bx
                    name={c === "pie" ? (on ? "bxs-pie-chart-alt-2" : "bx-pie-chart-alt-2") : on ? "bxs-bar-chart-alt-2" : "bx-bar-chart-alt-2"}
                    size={16}
                    color={on ? t.selFg : t.muted}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </View>

      {loading ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16, marginTop: 16 }}>
          <Shimmer height={120} radius={60} style={{ width: 120 }} />
          <View style={{ flex: 1, gap: 12 }}>
            <Shimmer height={12} radius={6} />
            <Shimmer height={12} radius={6} style={{ width: "80%" }} />
            <Shimmer height={12} radius={6} style={{ width: "60%" }} />
          </View>
        </View>
      ) : total === 0 ? (
        <Text style={[f.t(12.5), { color: t.muted, marginTop: 16, textAlign: "center", paddingVertical: 12 }]}>
          No tickets raised in this period.
        </Text>
      ) : chart === "pie" ? (
        <Animated.View key="pie" entering={FadeIn.duration(200)} style={{ flexDirection: "row", alignItems: "center", gap: 16, marginTop: 16 }}>
          <CategoryDonut rows={rows} total={total} />
          <View style={{ flex: 1, minWidth: 0, gap: 9 }}>
            {rows.map((r) => (
              <View key={r.category} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: r.color }} />
                <Text style={[f.t(12.5), { color: t.ink2, flex: 1, minWidth: 0 }]} numberOfLines={1}>
                  {r.category}
                </Text>
                <Text style={[f.m(12, 600), { color: t.ink }]}>{r.count}</Text>
                <Text style={[f.m(11), { color: t.muted, width: 34, textAlign: "right" }]}>{pct(r.count)}%</Text>
              </View>
            ))}
          </View>
        </Animated.View>
      ) : (
        <Animated.View key="bar" entering={FadeIn.duration(200)} style={{ gap: 12, marginTop: 16 }}>
          {rows.map((r) => (
            <View key={r.category}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                <Text style={[f.t(12.5), { color: t.ink2, flex: 1, minWidth: 0 }]} numberOfLines={1}>
                  {r.category}
                </Text>
                <Text style={[f.m(12, 600), { color: t.ink }]}>{r.count}</Text>
                <Text style={[f.m(11), { color: t.muted, width: 34, textAlign: "right" }]}>{pct(r.count)}%</Text>
              </View>
              {/* Scaled to the biggest category so the bars use the full width. */}
              <ProgressBar pct={max ? (r.count / max) * 100 : 0} color={r.color} height={9} gloss style={{ marginTop: 6 }} />
            </View>
          ))}
        </Animated.View>
      )}
    </Card>
  );
}

const DONUT = 120;
const DONUT_STROKE = 18;

/** Donut with the total in the middle; slices clockwise from 12 o'clock. */
function CategoryDonut({ rows, total }: { rows: { category: string; count: number; color: string }[]; total: number }) {
  const t = useJoTheme();
  const r = (DONUT - DONUT_STROKE) / 2;
  const circ = 2 * Math.PI * r;
  // A hairline gap between slices; none when one category is the whole ring.
  const gap = rows.length > 1 ? 2 : 0;
  const lens = rows.map((row) => (row.count / total) * circ);
  const starts = lens.map((_, i) => lens.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <View style={{ width: DONUT, height: DONUT, alignItems: "center", justifyContent: "center" }}>
      <Svg width={DONUT} height={DONUT} style={{ position: "absolute" }}>
        <G rotation={-90} origin={`${DONUT / 2}, ${DONUT / 2}`}>
          {rows.map((row, i) => {
            const dash = Math.max(0.5, (lens[i] ?? 0) - gap);
            return (
              <Circle
                key={row.category}
                cx={DONUT / 2}
                cy={DONUT / 2}
                r={r}
                fill="none"
                stroke={row.color}
                strokeWidth={DONUT_STROKE}
                strokeDasharray={`${dash} ${circ}`}
                strokeDashoffset={-(starts[i] ?? 0)}
              />
            );
          })}
        </G>
      </Svg>
      <Text style={[f.d(24, -0.03, 1.05), { color: t.ink }]}>{total}</Text>
      <Text style={[f.t(10.5), { color: t.muted, marginTop: 1 }]}>tickets</Text>
    </View>
  );
}

/* ── Plant efficiency (both roles) ─────────────────────────────────────── */

export interface EffItem {
  label: string;
  value: string;
  color: string;
  /** Direction vs the previous reading; down = better (kW/TR). */
  trend: "down" | "up" | null;
}

export function EfficiencyCard({
  items,
  note,
  onPress,
}: {
  items: EffItem[];
  note?: string | null;
  /** Opens Resources › Efficiency (manager roles). */
  onPress?: () => void;
}) {
  const t = useJoTheme();
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={onPress ? "Plant efficiency. Open Efficiency" : undefined}
      style={{ marginTop: 12, paddingVertical: 16, paddingHorizontal: 18 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <Text style={[f.t(15, 600), { color: t.ink }]}>Plant efficiency</Text>
          {onPress ? <Bx name="bx-chevron-right" size={19} color={t.muted} /> : null}
        </View>
        <Text style={[f.t(11.5), { color: t.muted }]}>kW/TR · lower is better</Text>
      </View>
      <View style={{ flexDirection: "row", marginTop: 14 }}>
        {items.map((it, i) => (
          <View
            key={it.label}
            style={
              i === 0
                ? { flex: 1, paddingRight: 14 }
                : { flex: 1, paddingLeft: 16, borderLeftWidth: 1, borderLeftColor: t.isDark ? "rgba(255,255,255,0.07)" : t.line }
            }
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
              <Text style={[f.d(32, -0.04, 1.05), { color: it.color }]}>{it.value}</Text>
              {it.trend ? (
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: it.trend === "down" ? t.okTint : t.badTint,
                  }}
                  accessibilityLabel={it.trend === "down" ? "Improved" : "Worse"}
                >
                  <Bx name={it.trend === "down" ? "bx-down-arrow-alt" : "bx-up-arrow-alt"} size={15} color={it.trend === "down" ? t.ok : t.bad} />
                </View>
              ) : null}
            </View>
            <Text style={[f.t(12), { color: t.muted, marginTop: 6 }]}>{it.label}</Text>
          </View>
        ))}
      </View>
      {note ? <Text style={[f.t(11), { color: t.faint, marginTop: 12 }]}>{note}</Text> : null}
    </Card>
  );
}

/* ── Technician: shift hero ────────────────────────────────────────────── */

/**
 * Compact attendance card: status line on top, the shift duration beside the
 * date underneath, and the Start / End Day button on the right.
 */
export function ShiftHero({
  label,
  big,
  sub,
  slaTag,
  slaTagColor,
  onSla,
  cta,
  onPress,
}: {
  label: string;
  big: string;
  sub: string;
  slaTag: string | null;
  slaTagColor: string;
  onSla?: () => void;
  /** Tapping the card (outside the SLA tag / CTA) opens the attendance history. */
  onPress?: () => void;
  cta: { label: string; icon: "in" | "out" | "done"; onPress: () => void; busy?: boolean } | null;
}) {
  const t = useJoTheme();
  const ctaIcon = cta?.icon === "out" ? "bx-log-out-circle" : cta?.icon === "in" ? "bx-log-in-circle" : "bx-check-double";
  return (
    <HeroCard
      rings={1}
      style={{ marginTop: 14, paddingVertical: 11, paddingHorizontal: 14 }}
      onPress={onPress}
      accessibilityLabel={onPress ? `${label}, ${big}. Opens attendance history` : undefined}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={[capsStyle(10.5), { color: t.onAccent, opacity: 0.7, flexShrink: 1 }]} numberOfLines={1}>
              {label}
            </Text>
            {slaTag ? (
              <TouchableOpacity onPress={onSla} disabled={!onSla} accessibilityRole="button" accessibilityLabel={`SLA ${slaTag}`}>
                <HeroTag label={slaTag} color={slaTagColor} />
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 4 }}>
            <Text style={[f.d(22, -0.03, 1.1), { color: t.onAccent }]}>{big}</Text>
            <Text style={[f.t(11.5), { color: t.onAccent, opacity: 0.68, flexShrink: 1 }]} numberOfLines={1}>
              {sub}
            </Text>
          </View>
        </View>
        {cta ? (
          <TouchableOpacity
            onPress={cta.onPress}
            disabled={cta.busy}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={cta.label}
            style={{
              height: 38,
              paddingHorizontal: 13,
              borderRadius: 19,
              backgroundColor: "#0A0A0C",
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
            }}
          >
            <GlossFill color="#0A0A0C" fg="#F4F4F6" radius={19} />
            {cta.busy ? (
              <ActivityIndicator color="#F4F4F6" size="small" />
            ) : (
              <Bx name={ctaIcon} size={17} color="#F4F4F6" />
            )}
            <Text style={[f.t(13, 600), { color: "#F4F4F6" }]}>{cta.label}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </HeroCard>
  );
}

/** Red breach banner (technician home). */
export function BreachBanner({ title, subtitle, onPress }: { title: string; subtitle: string; onPress?: () => void }) {
  const t = useJoTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginTop: 12,
        borderRadius: 22,
        paddingVertical: 12,
        paddingHorizontal: 14,
        backgroundColor: t.badWash,
        borderWidth: 1,
        borderColor: t.badBorder,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: t.isDark ? "rgba(255,107,87,0.16)" : t.badTint,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Bx name="bxs-error-circle" size={19} color={t.bad} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[f.t(13.5, 600), { color: t.ink }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[f.t(11.5), { color: t.badSoft, marginTop: 2 }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Bx name="bx-chevron-right" size={20} color={t.bad} />
    </TouchableOpacity>
  );
}

export interface TechTile {
  label: string;
  value: string;
  color: string;
  onPress?: () => void;
}

export function TechTiles({ tiles }: { tiles: TechTile[] }) {
  const t = useJoTheme();
  return (
    <View style={{ flexDirection: "row", gap: 6, marginTop: 12 }}>
      {tiles.map((tile) => (
        <Card
          key={tile.label}
          radius={18}
          onPress={tile.onPress}
          accessibilityLabel={`${tile.label}: ${tile.value}`}
          style={{ flex: 1, minWidth: 0, paddingVertical: 12, paddingHorizontal: 10 }}
        >
          <Text style={[f.d(22, -0.03, 1.05), { color: tile.color }]} numberOfLines={1} adjustsFontSizeToFit>
            {tile.value}
          </Text>
          <Text style={[f.t(11), { color: t.ink3, marginTop: 6 }]} numberOfLines={1}>
            {tile.label}
          </Text>
        </Card>
      ))}
    </View>
  );
}

const useStyles = makeJoStyles((t) => ({
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 12,
    paddingHorizontal: 4,
  },
  stackAv: {
    width: 36,
    height: 36,
    marginLeft: -10,
    borderRadius: 18,
    borderWidth: 2.5,
    borderColor: t.card,
    alignItems: "center",
    justifyContent: "center",
  },
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: t.line,
  },
  moreBtn: {
    height: 46,
    marginTop: 2,
    marginBottom: 10,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: t.lineMid,
    backgroundColor: t.raised,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    height: 34,
    borderRadius: 17,
    backgroundColor: t.raised,
    borderWidth: 1,
    borderColor: t.lineMid,
  },
  stepBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  statusChip: {
    alignSelf: "flex-start",
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 13,
    justifyContent: "center",
  },
  chartToggle: {
    flexDirection: "row",
    gap: 2,
    padding: 3,
    borderRadius: 17,
    backgroundColor: t.raised,
    borderWidth: 1,
    borderColor: t.lineMid,
    flexShrink: 0,
  },
  chartToggleBtn: {
    width: 34,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  kpi: {
    width: "48.5%",
    flexGrow: 1,
    borderRadius: 18,
    backgroundColor: t.raised,
    paddingVertical: 12,
    paddingHorizontal: 13,
  },
}));
