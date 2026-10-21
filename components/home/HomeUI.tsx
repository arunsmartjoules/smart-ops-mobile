/**
 * Home blocks from the Claude Design "JouleOps App" artboard (manager home
 * `r_home_mgr` and technician home `r_home_tech`). Presentational only —
 * app/(tabs)/dashboard.tsx owns the data and passes view values in.
 */
import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Bx } from "@/components/jo/Bx";
import {
  Avatar,
  Card,
  HeroCard,
  HeroTag,
  IconButton,
  ProgressBar,
  type JoIcon,
  Ring,
  capsStyle,
  f,
} from "@/components/jo/ui";
import { avatarColor, initials, type JoTone } from "@/constants/jo";
import { makeJoStyles, useJoTheme, type JoTheme } from "@/hooks/useJoTheme";

export function toneColor(t: JoTheme, tone: JoTone | "ink"): string {
  return tone === "ink" ? t.ink : t[tone];
}

/* ── Header ────────────────────────────────────────────────────────────── */

export function HomeHeader({
  greeting,
  siteName,
  onSitePress,
  bellDot,
  onBell,
  bellLabel = "Notifications",
  bellIcon = "bx-bell",
  userName,
  onAvatar,
  avatarLabel = "Profile",
}: {
  greeting: string;
  siteName: string;
  onSitePress?: () => void;
  bellDot?: boolean;
  onBell?: () => void;
  bellLabel?: string;
  bellIcon?: JoIcon;
  userName: string;
  onAvatar?: () => void;
  avatarLabel?: string;
}) {
  const t = useJoTheme();
  const s = useStyles();
  const title = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Text style={[f.d(28, -0.025), { color: t.ink, flexShrink: 1 }]} numberOfLines={1}>
        {siteName}
      </Text>
      {onSitePress ? <Bx name="bx-chevron-down" size={22} color={t.muted} /> : null}
    </View>
  );
  return (
    <View style={s.header}>
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <Text style={[f.t(13), { color: t.muted }]} numberOfLines={1}>
          {greeting}
        </Text>
        <View style={{ marginTop: 4 }}>
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
          <Avatar name={userName} size={44} color={t.avatarSelf} ring={t.accent} display textSize={15} />
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
}: {
  count: number | null;
  rows: TeamRow[];
  hasMore: boolean;
  expanded: boolean;
  onToggle: () => void;
  loading?: boolean;
  note?: string | null;
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
                <ProgressBar pct={p.pct} color={t.accent} style={{ width: 64, flexShrink: 0 }} />
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
  ringPct,
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
  ringPct: number;
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

      <View style={{ flexDirection: "row", alignItems: "center", gap: 18, marginTop: 16 }}>
        <Ring size={116} stroke={12} radius={48} pct={ringPct} color={color}>
          {loading ? (
            <ActivityIndicator color={t.muted} />
          ) : (
            <>
              <Text style={[f.d(30, -0.03, 1.05), { color: t.ink }]}>{score}</Text>
              <Text style={[f.t(11), { color: t.muted, marginTop: 2 }]}>out of 5</Text>
            </>
          )}
        </Ring>
        <View style={{ flex: 1, minWidth: 0 }}>
          {status ? (
            <View style={[s.statusChip, { backgroundColor: statusBg }]}>
              <Text style={[f.t(12, 600), { color }]}>{status}</Text>
            </View>
          ) : null}
          <Text style={[f.d(26, -0.03, 1.05), { color: t.ink, marginTop: status ? 10 : 0 }]}>{pctText}</Text>
          <Text style={[f.t(12), { color: t.muted, marginTop: 4 }]}>
            {emptyNote ?? "of contract commitment"}
          </Text>
        </View>
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
              <ProgressBar pct={k.pct} color={k.color} style={{ marginTop: 9 }} />
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

/* ── Manager: planned vs completed ─────────────────────────────────────── */

export interface PlannedBar {
  label: string;
  icon: "pm" | "tickets";
  done: number;
  total: number;
  pct: number;
  color: string;
}

export function PlannedCards({ bars, onPress }: { bars: PlannedBar[]; onPress?: (b: PlannedBar) => void }) {
  const t = useJoTheme();
  return (
    <View style={{ flexDirection: "row", gap: 10 }}>
      {bars.map((b) => {
        return (
          <Card
            key={b.label}
            onPress={onPress ? () => onPress(b) : undefined}
            accessibilityLabel={`${b.label}: ${b.pct}%`}
            style={{ flex: 1, padding: 16 }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: t.raised,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Bx name={b.icon === "pm" ? "bx-wrench" : "bx-check-double"} size={17} color={b.color} />
              </View>
              <Text style={[f.t(11.5), { color: t.muted }]}>
                {b.done}/{b.total}
              </Text>
            </View>
            <Text style={[f.d(36, -0.04, 1.05), { color: b.color, marginTop: 16 }]}>{b.pct}%</Text>
            <Text style={[f.t(12.5), { color: t.ink2, marginTop: 5 }]} numberOfLines={1}>
              {b.label}
            </Text>
            <ProgressBar pct={b.pct} color={b.color} height={6} style={{ marginTop: 12 }} />
          </Card>
        );
      })}
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

export function EfficiencyCard({ items, note }: { items: EffItem[]; note?: string | null }) {
  const t = useJoTheme();
  return (
    <Card style={{ marginTop: 10, paddingVertical: 16, paddingHorizontal: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <Text style={[f.t(15, 600), { color: t.ink }]}>Plant efficiency</Text>
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

export function ShiftHero({
  label,
  big,
  sub,
  slaTag,
  slaTagColor,
  onSla,
  cta,
}: {
  label: string;
  big: string;
  sub: string;
  slaTag: string | null;
  slaTagColor: string;
  onSla?: () => void;
  cta: { label: string; icon: "in" | "out" | "done"; onPress: () => void; busy?: boolean } | null;
}) {
  const t = useJoTheme();
  const ctaIcon = cta?.icon === "out" ? "bx-log-out-circle" : cta?.icon === "in" ? "bx-log-in-circle" : "bx-check-double";
  return (
    <HeroCard rings={1} style={{ marginTop: 14, padding: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Text style={[capsStyle(12), { color: t.onAccent, opacity: 0.7, flexShrink: 1 }]} numberOfLines={1}>
          {label}
        </Text>
        {slaTag ? (
          <TouchableOpacity onPress={onSla} disabled={!onSla} accessibilityRole="button" accessibilityLabel={`SLA ${slaTag}`}>
            <HeroTag label={slaTag} color={slaTagColor} />
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 10, marginTop: 8 }}>
        <View style={{ flexShrink: 1 }}>
          <Text style={[f.d(40, -0.045, 1), { color: t.onAccent }]}>{big}</Text>
          <Text style={[f.t(12), { color: t.onAccent, opacity: 0.68, marginTop: 5 }]} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        {cta ? (
          <TouchableOpacity
            onPress={cta.onPress}
            disabled={cta.busy}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={cta.label}
            style={{
              height: 44,
              paddingHorizontal: 16,
              borderRadius: 22,
              backgroundColor: "#0A0A0C",
              flexDirection: "row",
              alignItems: "center",
              gap: 7,
              flexShrink: 0,
            }}
          >
            {cta.busy ? (
              <ActivityIndicator color="#F4F4F6" size="small" />
            ) : (
              <Bx name={ctaIcon} size={18} color="#F4F4F6" />
            )}
            <Text style={[f.t(13.5, 600), { color: "#F4F4F6" }]}>{cta.label}</Text>
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

export function ProgressCard({
  meta,
  bars,
}: {
  meta: string;
  bars: { label: string; done: number; total: number; pct: number; color: string }[];
}) {
  const t = useJoTheme();
  return (
    <Card style={{ marginTop: 12, padding: 18 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
        <Text style={[f.t(15, 600), { color: t.ink }]}>Progress</Text>
        <Text style={[f.t(12), { color: t.muted }]}>{meta}</Text>
      </View>
      <View style={{ gap: 16, marginTop: 14 }}>
        {bars.map((b) => (
          <View key={b.label}>
            <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
              <View>
                <Text style={[f.t(13, 500), { color: t.ink }]}>{b.label}</Text>
                <Text style={[f.t(11.5), { color: t.muted, marginTop: 2 }]}>
                  {b.done} of {b.total} done
                </Text>
              </View>
              <Text style={[f.d(24, -0.03, 1.05), { color: b.color }]}>{b.pct}%</Text>
            </View>
            <ProgressBar pct={b.pct} color={b.color} height={6} style={{ marginTop: 9 }} />
          </View>
        ))}
      </View>
    </Card>
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
  kpi: {
    width: "48.5%",
    flexGrow: 1,
    borderRadius: 18,
    backgroundColor: t.raised,
    paddingVertical: 12,
    paddingHorizontal: 13,
  },
}));
