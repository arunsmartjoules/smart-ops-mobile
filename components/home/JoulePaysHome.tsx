/**
 * Home at a JoulePays site. The JouleCool Home (tickets, SLA, plant
 * efficiency) does not apply there: a JoulePays site is paid from what it
 * saves against its baseline over the billing month, so this Home answers
 * two questions, the same ones the web Trend Sheet overview answers for all
 * sites:
 *
 * 1. Are we beating the target this billing month? The hero card draws the
 *    billing month as a strip, one bar per day of Electricity saving against
 *    the target line, and opens the month screen.
 * 2. Is today's round entered? One row per category, the next one carries
 *    the accent and opens its entry screen.
 *
 * Roles that can see the savings dashboard (`trend_sheet_dashboard`) also get
 * the contract figures: all energy saved and revenue against target, up to
 * yesterday. Entry-only roles never see rupees, as on the web.
 *
 * Design record: design-system/jouleops-mobile/pages/home-joulepays.md.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Bx } from "@/components/jo/Bx";
import { Card, EmptyState, Shimmer, f, useJoTheme } from "@/components/jo/ui";
import {
  categoryIcon,
  goTrend,
  nextToEnter,
  num,
  openCategory,
  toneColor,
  useTrendDay,
} from "@/components/trend/TrendKit";
import { usePermissions } from "@/contexts/PermissionsContext";
import { isModuleOnFor } from "@/services/ProjectTypePages";
import JoulePaysHomeService, { type HomeLoaded } from "@/services/JoulePaysHomeService";
import TrendSheetService from "@/services/TrendSheetService";
import { useTrendSites } from "@/services/TrendSheetSites";
import {
  cycleBars,
  cycleProgress,
  datesInWords,
  formatLakh,
  formatLakhSigned,
  missedDates,
  shareOfTarget,
  stripScale,
  stripSummary,
  targetGapWords,
  type CycleBar,
  type JoulePaysContract,
} from "@/utils/joulePaysHome";
import {
  categorySubtitle,
  dayMonthLabel,
  formatIndian,
  formatPct,
  formatTargetPct,
  monthLabel,
  toneOf,
  type TrendDayList,
  type TrendDayView,
  type TrendViewCategory,
} from "@/utils/trendSheet";

const STRIP_HEIGHT = 64;

export function JoulePaysHome({
  userId,
  siteCode,
  today,
  refreshTick,
  locked,
}: {
  userId: string;
  siteCode: string;
  /** IST "YYYY-MM-DD". */
  today: string;
  /** Bumped by Home's pull to refresh. */
  refreshTick: number;
  /** A technician who has not started the day: figures show, nothing opens. */
  locked: boolean;
}) {
  const t = useJoTheme();
  const { canView, projectTypePages } = usePermissions();
  // Settings › Pages by Project Type can hide a part of the trend sheet at JoulePays sites.
  const entryOk = canView("trend_sheet_entry") && isModuleOnFor(projectTypePages, "joulepays", "trend_sheet_entry");
  const contractOk =
    canView("trend_sheet_dashboard") && isModuleOnFor(projectTypePages, "joulepays", "trend_sheet_dashboard");

  const { sites, loaded: sitesLoaded } = useTrendSites(userId);
  const site = useMemo(() => sites.find((s) => s.site_code === siteCode) ?? null, [sites, siteCode]);
  const setUp = !!site && site.categories.length > 0;

  // Today's round, from the phone first (works offline once pulled).
  const day = useTrendDay(entryOk && setUp ? siteCode : null, entryOk && setUp ? today : null);
  const reloadDay = day.reload;
  // Pull to refresh reads today again; the first render already loads it.
  const shownTick = React.useRef(refreshTick);
  useEffect(() => {
    if (refreshTick === shownTick.current) return;
    shownTick.current = refreshTick;
    void reloadDay();
  }, [refreshTick, reloadDay]);

  // The billing month that holds today, by name. Until today's day is known,
  // the calendar month: right for every site whose month starts on the 1st.
  const month = day.view?.cycle_month ?? today.slice(0, 7);

  const monthState = useLoaded(
    entryOk && setUp ? `${userId}|${siteCode}|${month}|${refreshTick}` : null,
    () => JoulePaysHomeService.getMonth(userId, siteCode, month),
  );
  const contractState = useLoaded(
    contractOk ? `${userId}|${siteCode}|${month}|${refreshTick}` : null,
    () => JoulePaysHomeService.getContract(userId, siteCode, month),
  );

  if (!entryOk && !contractOk) {
    return (
      <EmptyState
        icon="bx-line-chart"
        title="Nothing to show for this site yet"
        sub="Home at a JoulePays site shows the trend sheet, and your role can't open it. Ask an admin for Trend Sheet access."
      />
    );
  }
  if (entryOk && !sitesLoaded) return <HomeSkeleton />;
  if (entryOk && !setUp && !contractOk) {
    return (
      <EmptyState
        icon="bx-line-chart"
        title="Trend sheet is not set up for this site"
        sub="An admin needs to set this site up in Baseline before readings and savings show here."
      />
    );
  }

  const monthData = monthState?.ok ? monthState.data : null;
  const contract = contractState?.ok ? contractState.data : null;
  const fromCache = (monthState?.ok && monthState.isFromCache) || (contractState?.ok && contractState.isFromCache);
  const canOpen = !locked && entryOk && setUp;

  return (
    <View style={{ gap: 14, marginTop: 14 }}>
      {fromCache || day.stale ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 4 }}>
          <Bx name="bx-wifi-off" size={15} color={t.muted} />
          <Text style={[f.t(12.5), { color: t.muted, flex: 1 }]}>
            No connection. Showing the last figures on this phone.
          </Text>
        </View>
      ) : null}

      {entryOk && setUp ? (
        monthData ? (
          <CycleCard
            list={monthData}
            month={month}
            today={today}
            onPress={canOpen ? () => goTrend("/trend-month", { siteCode, month }) : undefined}
          />
        ) : monthState == null ? (
          <Shimmer height={250} radius={28} />
        ) : !monthState.ok && monthState.offline ? (
          <LoadProblem
            title="The month is not on this phone yet"
            sub="Connect once to load this billing month. After that the last figures stay on the phone."
          />
        ) : (
          <LoadProblem title="The month could not be loaded" sub={monthState.ok ? "" : monthState.error} />
        )
      ) : contract ? (
        // A dashboard-only role: the month's Electricity figure without the daily strip.
        <ContractHero contract={contract} month={month} />
      ) : null}

      {contractOk ? (
        contract ? (
          <ContractLedger contract={contract} />
        ) : contractState == null ? (
          <Shimmer height={170} radius={24} />
        ) : !contractState.ok && !contractState.offline ? (
          <LoadProblem title="The contract figures could not be loaded" sub={contractState.error} />
        ) : null
      ) : null}

      {entryOk && setUp ? (
        day.view ? (
          <TodayRound view={day.view} siteCode={siteCode} today={today} locked={locked} />
        ) : day.status === "loading" ? (
          <Shimmer height={180} radius={24} />
        ) : (
          <LoadProblem
            title={day.status === "offline" ? "Today is not on this phone yet" : "Today could not be opened"}
            sub={
              day.status === "offline"
                ? "Connect once so today's openings and baseline can be loaded."
                : day.error || "Something went wrong while loading today."
            }
          />
        )
      ) : null}
    </View>
  );
}

/**
 * The latest answer for `key`, null while it loads. An answer for an older
 * key (the site or month changed meanwhile) is never shown.
 */
function useLoaded<T>(key: string | null, run: () => Promise<HomeLoaded<T>>): HomeLoaded<T> | null {
  const [state, setState] = useState<{ key: string; value: HomeLoaded<T> } | null>(null);
  const runRef = React.useRef(run);
  useEffect(() => {
    runRef.current = run;
  });
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    void runRef.current().then((value) => {
      if (!cancelled) setState({ key, value });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  // A refresh keeps the previous figures on screen until the new ones land.
  if (!key || !state) return null;
  const sameScope = state.key.split("|").slice(0, 3).join("|") === key.split("|").slice(0, 3).join("|");
  return sameScope ? state.value : null;
}

/* ── The billing month ─────────────────────────────────────────────────── */

/**
 * The hero: Electricity saved this billing month, the gap to target in words,
 * and the month drawn as a strip of days. Tapping it opens the month screen.
 */
function CycleCard({
  list,
  month,
  today,
  onPress,
}: {
  list: TrendDayList;
  month: string;
  today: string;
  onPress?: () => void;
}) {
  const t = useJoTheme();
  const { summary } = list;
  const bars = useMemo(() => cycleBars(list, today), [list, today]);
  const missed = useMemo(() => missedDates(bars), [bars]);
  const { day, of } = cycleProgress(list, today);
  const started = list.from <= today;
  const tone = toneOf(summary.saving, summary.saving_pct, summary.target_pct);
  const color = toneColor(t, tone);
  const gap = targetGapWords(summary.saving_pct, summary.target_pct);
  const loss = summary.saving != null && summary.saving < 0;

  const heading = "Electricity saved this billing month";
  const figureWords =
    summary.saving == null
      ? "Nothing saved yet"
      : loss
        ? `${formatIndian(Math.abs(summary.saving), 0, 0)} kWh over the baseline`
        : `${formatPct(summary.saving_pct)}, ${formatIndian(summary.saving, 0, 0)} kWh`;
  const entryWords = !started
    ? "This billing month has not started"
    : missed.length === 0
      ? `${summary.days_entered} of ${summary.days_expected} days entered`
      : `${missed.length} day${missed.length === 1 ? "" : "s"} not entered: ${datesInWords(missed)}`;

  return (
    <Card
      radius={28}
      onPress={onPress}
      accessibilityLabel={`${heading}, ${monthLabel(month)}, day ${day} of ${of}. ${figureWords}. ${gap ?? "No target set"}. ${stripSummary(bars)}. ${entryWords}.${onPress ? " Opens the month." : ""}`}
      style={{ paddingTop: 18, paddingHorizontal: 20, paddingBottom: 16, gap: 14 }}
    >
      <Text style={[f.t(13), { color: t.muted }]}>{heading}</Text>

      <View style={{ gap: 4 }}>
        {summary.saving == null ? (
          <Text style={[f.d(28, -0.02, 1.15), { color: t.ink3 }]}>Nothing saved yet</Text>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <Text style={[f.d(44, -0.03, 1.05), num, { color }]}>{formatPct(summary.saving_pct)}</Text>
            <Text style={[f.t(15, 500), num, { color: t.ink, flexShrink: 1, textAlign: "right" }]} numberOfLines={1}>
              {`${formatIndian(summary.saving, 0, 0)} kWh`}
            </Text>
          </View>
        )}
        <Text style={[f.t(13.5), num, { color: loss ? t.bad : t.ink3 }]}>
          {/* A planned negative target makes a loss expected: the distance to the target is the useful fact. */}
          {gap ?? (loss ? "Used more than the baseline so far" : summary.saving == null ? "" : "No target set for this month")}
        </Text>
      </View>

      <CycleStrip bars={bars} monthTarget={summary.target_pct} today={today} />
      <StripLegend bars={bars} />

      {/* The billing month's ends, and where today sits between them. */}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <Text style={[f.t(12.5), num, { color: t.muted }]}>{dayMonthLabel(list.from)}</Text>
        {started && of > 0 ? (
          <Text style={[f.t(12.5, 600), num, { color: t.ink2 }]}>
            Day {day} of {of}
          </Text>
        ) : null}
        <Text style={[f.t(12.5), num, { color: t.muted }]}>{dayMonthLabel(list.to)}</Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          borderTopWidth: 1,
          borderTopColor: t.line,
          paddingTop: 12,
          minHeight: 44,
        }}
      >
        <Bx
          name={!started || missed.length === 0 ? "bx-check-circle" : "bx-error-circle"}
          size={17}
          color={!started ? t.muted : missed.length === 0 ? t.ok : t.warn}
        />
        <Text style={[f.t(13.5, 500), num, { color: t.ink, flex: 1 }]} numberOfLines={2}>
          {entryWords}
        </Text>
        {onPress ? <Bx name="bx-chevron-right" size={20} color={t.muted} /> : null}
      </View>
    </Card>
  );
}

/**
 * One bar per day of the billing month, height = the day's saving, with the
 * month's target as a line. Above the line is on target, whatever the
 * colour, so the tones are never the only signal. A day not entered is a
 * hollow box, today a ring under its bar, days to come a faint stub.
 */
function CycleStrip({ bars, monthTarget, today }: { bars: CycleBar[]; monthTarget: number | null; today: string }) {
  const t = useJoTheme();
  const scale = stripScale(bars, monthTarget);
  const h = (pct: number) => Math.max(3, Math.min(STRIP_HEIGHT, (pct / scale) * STRIP_HEIGHT));
  const targetAt = monthTarget != null && monthTarget > 0 ? Math.min(STRIP_HEIGHT, (monthTarget / scale) * STRIP_HEIGHT) : null;

  return (
    // One spoken summary for the whole strip; inside a tappable card the card's label already carries it.
    <View accessible accessibilityRole="image" accessibilityLabel={`Each day this billing month: ${stripSummary(bars)}`} style={{ gap: 6 }}>
      <View style={{ height: STRIP_HEIGHT + 16 }}>
        {/* The scale's top and the target, as words, so the line explains itself. */}
        <View style={{ height: 16, flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={[f.t(12), num, { color: t.muted }]}>{scale}%</Text>
          {targetAt != null ? (
            <Text style={[f.t(12, 600), num, { color: t.ink2 }]}>Target {formatTargetPct(monthTarget)}</Text>
          ) : null}
        </View>
        <View style={{ height: STRIP_HEIGHT, flexDirection: "row", alignItems: "flex-end", gap: 2 }}>
          {/* The scale's top, under its label, so "5%" reads as a mark on the scale. */}
          <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, backgroundColor: t.line }} />
          {bars.map((b) => (
            <View key={b.date} style={{ flex: 1, height: STRIP_HEIGHT, justifyContent: "flex-end" }}>
              {b.state === "on_target" || b.state === "below" ? (
                <View
                  style={{
                    height: h(b.pct ?? 0),
                    borderTopLeftRadius: 2,
                    borderTopRightRadius: 2,
                    backgroundColor: b.state === "on_target" ? t.ok : t.warn,
                  }}
                />
              ) : b.state === "not_entered" ? (
                <View style={{ height: 14, borderWidth: 1.5, borderColor: t.bad, borderRadius: 2 }} />
              ) : b.state === "today" ? (
                <View style={{ height: 14, borderWidth: 1.5, borderColor: t.accent, borderRadius: 2 }} />
              ) : (
                // A past day with no saving is a solid stub; a day to come is only a faint dot.
                <View
                  style={
                    b.state === "upcoming"
                      ? { height: 3, width: 3, borderRadius: 1.5, alignSelf: "center", backgroundColor: t.faint }
                      : { height: 3, borderRadius: 1.5, backgroundColor: t.muted }
                  }
                />
              )}
            </View>
          ))}
          {targetAt != null ? (
            <View
              pointerEvents="none"
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: targetAt - 0.5,
                height: 1,
                backgroundColor: t.ink2,
                opacity: 0.55,
              }}
            />
          ) : null}
        </View>
      </View>
      {/* Today's place in the month. */}
      <View style={{ height: 6, flexDirection: "row", gap: 2 }}>
        {bars.map((b) => (
          <View key={b.date} style={{ flex: 1, alignItems: "center" }}>
            {b.date === today ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: t.accent }} /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

/** A key for the strip, naming only the kinds of day it shows. */
function StripLegend({ bars }: { bars: CycleBar[] }) {
  const t = useJoTheme();
  const has = (...states: CycleBar["state"][]) => bars.some((b) => states.includes(b.state));
  const items: { label: string; swatch: object }[] = [];
  if (has("on_target")) items.push({ label: "On target", swatch: { backgroundColor: t.ok, borderColor: t.ok } });
  if (has("below")) items.push({ label: "Below target", swatch: { backgroundColor: t.warn, borderColor: t.warn } });
  if (has("no_saving", "pending"))
    items.push({ label: "No saving", swatch: { height: 3, backgroundColor: t.muted, borderColor: t.muted } });
  if (has("not_entered")) items.push({ label: "Not entered", swatch: { backgroundColor: "transparent", borderColor: t.bad } });
  if (has("today")) items.push({ label: "Today, to enter", swatch: { backgroundColor: "transparent", borderColor: t.accent } });
  if (items.length < 2) return null;
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 6 }}
    >
      {items.map((i) => (
        <View key={i.label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View style={[{ width: 10, height: 10, borderRadius: 2, borderWidth: 1.5 }, i.swatch]} />
          <Text style={[f.t(12), { color: t.muted }]}>{i.label}</Text>
        </View>
      ))}
    </View>
  );
}

/** A dashboard-only role: the month's Electricity figure, no strip (the day list is an entry route). */
function ContractHero({ contract, month }: { contract: JoulePaysContract; month: string }) {
  const t = useJoTheme();
  const s = contract.site;
  const pct = s.electricity_saving_pct;
  const tone = pct == null ? "idle" : pct < 0 ? "bad" : s.electricity_target_pct != null && pct < s.electricity_target_pct ? "warn" : "ok";
  const gap = targetGapWords(pct, s.electricity_target_pct);
  return (
    <Card radius={28} style={{ paddingTop: 18, paddingHorizontal: 20, paddingBottom: 18, gap: 8 }}>
      <Text style={[f.t(13), { color: t.muted }]}>{`Electricity saved, ${monthLabel(month).split(" ")[0]} billing month`}</Text>
      <Text style={[f.d(44, -0.03, 1.05), num, { color: toneColor(t, tone) }]}>{pct == null ? "—" : formatPct(pct)}</Text>
      <Text style={[f.t(13.5), num, { color: t.ink3 }]}>{gap ?? "No target set for this month"}</Text>
      {s.from && s.to ? (
        <Text style={[f.t(12.5), num, { color: t.muted }]}>
          {dayMonthLabel(s.from)} to {dayMonthLabel(s.to)}
        </Text>
      ) : null}
    </Card>
  );
}

/* ── Today's round ─────────────────────────────────────────────────────── */

function TodayRound({
  view,
  siteCode,
  today,
  locked,
}: {
  view: TrendDayView;
  siteCode: string;
  today: string;
  locked: boolean;
}) {
  const t = useJoTheme();
  const total = view.categories.length;
  const done = view.categories.filter((c) => c.entered && c.sync !== "failed").length;
  const next = nextToEnter(view);
  if (total === 0) return null;
  return (
    <Card radius={24} style={{ paddingTop: 16, paddingHorizontal: 18, paddingBottom: 4, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <Text accessibilityRole="header" style={[f.t(15, 600), { color: t.ink }]}>
          Today’s round
        </Text>
        <Text style={[f.t(13), num, { color: done === total ? t.ok : t.muted }]}>
          {done === total ? "All entered" : `${done} of ${total} entered`}
        </Text>
      </View>
      {locked ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: -4 }}>
          <Bx name="bx-lock-alt" size={15} color={t.muted} />
          <Text style={[f.t(13), { color: t.muted, flex: 1 }]}>Start your day to enter readings.</Text>
        </View>
      ) : null}
      <View>
        {view.categories.map((c, i) => (
          <RoundRow
            key={c.category}
            c={c}
            index={i + 1}
            first={i === 0}
            isNext={next?.category === c.category}
            onPress={
              locked
                ? undefined
                : () => {
                    if (c.sync === "replaced") void TrendSheetService.acknowledgeReplaced(siteCode, today);
                    openCategory(siteCode, today, c);
                  }
            }
          />
        ))}
      </View>
    </Card>
  );
}

function RoundRow({
  c,
  index,
  first,
  isNext,
  onPress,
}: {
  c: TrendViewCategory;
  index: number;
  first: boolean;
  isNext: boolean;
  onPress?: () => void;
}) {
  const t = useJoTheme();
  const failed = c.sync === "failed";
  const done = c.entered && !failed;
  const sub = failed ? `Needs attention: ${c.sync_error || "the server refused this entry"}` : categorySubtitle(c);
  const state = failed ? "needs attention" : done ? (c.sync === "pending" ? "entered, not sent yet" : "entered") : "not entered";
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${c.label}, ${state}. ${sub}`}
      style={{
        minHeight: 60,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: t.line,
      }}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          borderWidth: 1.5,
          borderColor: failed ? t.badTint : done ? t.okTint : isNext ? t.accent : t.lineStrong,
          backgroundColor: failed ? t.badTint : done ? t.okTint : isNext ? t.accent : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {failed ? (
          <Bx name="bx-error" size={15} color={t.bad} />
        ) : done ? (
          <Bx name="bx-check" size={17} color={t.ok} />
        ) : (
          <Text style={[f.t(13, 600), num, { color: isNext ? t.onAccent : t.muted }]}>{index}</Text>
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
          <Bx name={categoryIcon(c.category)} size={15} color={t.muted} />
          <Text style={[f.t(15, 600), { color: t.ink, flexShrink: 1 }]} numberOfLines={1}>
            {c.label}
          </Text>
        </View>
        <Text style={[f.t(13), num, { color: failed ? t.bad : t.muted }]} numberOfLines={2}>
          {c.sync === "pending" ? `${sub}, not sent yet` : sub}
        </Text>
      </View>
      {isNext && !done && !failed && onPress ? (
        <View style={{ height: 34, paddingHorizontal: 15, borderRadius: 17, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" }}>
          <Text style={[f.t(14, 600), { color: t.onAccent }]}>Enter</Text>
        </View>
      ) : onPress ? (
        <Bx name="bx-chevron-right" size={20} color={t.muted} />
      ) : null}
    </TouchableOpacity>
  );
}

/* ── Contract figures (savings dashboard roles) ────────────────────────── */

/**
 * The figures the contract is paid on, up to yesterday: all energy saved
 * (Mcal, every category) and revenue, each against its target, then the
 * day-level notes the web dashboard flags.
 */
function ContractLedger({ contract }: { contract: JoulePaysContract }) {
  const t = useJoTheme();
  const s = contract.site;
  if (!s.started) {
    return (
      <Card radius={24} style={{ padding: 18 }}>
        <Text style={[f.t(15, 600), { color: t.ink }]}>Month so far</Text>
        <Text style={[f.t(13.5), { color: t.muted, marginTop: 6 }]}>This billing month has not started yet.</Text>
      </Card>
    );
  }
  const energyTone =
    s.energy_saving_pct == null ? "idle" : s.energy_target_pct != null && s.energy_saving_pct < s.energy_target_pct ? "warn" : "ok";
  const revenueTone =
    s.revenue == null ? "idle" : s.revenue_deviation != null && s.revenue_deviation < 0 ? "warn" : "ok";
  const notes = [
    s.provisional_days > 0
      ? `${s.provisional_days} day${s.provisional_days === 1 ? "" : "s"} provisional, waiting for DG, solar or wind`
      : null,
    s.incomplete_days > 0
      ? `${s.incomplete_days} day${s.incomplete_days === 1 ? "" : "s"} missing a target, rate or baseline`
      : null,
  ].filter((n): n is string => !!n);

  return (
    <Card radius={24} style={{ paddingTop: 16, paddingHorizontal: 18, paddingBottom: 16, gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <Text accessibilityRole="header" style={[f.t(15, 600), { color: t.ink }]}>
          Month so far
        </Text>
        {contract.yesterday ? (
          <Text style={[f.t(12.5), num, { color: t.muted }]}>Up to {dayMonthLabel(contract.yesterday)}</Text>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <Figure
          label="All energy saved"
          value={formatPct(s.energy_saving_pct)}
          color={toneColor(t, energyTone)}
          share={shareOfTarget(s.energy_saving_pct, s.energy_target_pct)}
          under={s.energy_target_pct != null ? `Target ${formatTargetPct(s.energy_target_pct)}` : "No target set"}
          words={targetGapWords(s.energy_saving_pct, s.energy_target_pct, true)}
        />
        <View style={{ width: 1, backgroundColor: t.line }} />
        <Figure
          label="Revenue"
          value={formatLakh(s.revenue)}
          color={toneColor(t, revenueTone)}
          share={shareOfTarget(s.revenue, s.target_revenue)}
          under={s.target_revenue != null ? `Target ${formatLakh(s.target_revenue)}` : "No target set"}
          words={s.revenue_deviation != null ? `${formatLakhSigned(s.revenue_deviation)} against target` : null}
        />
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: t.line, paddingTop: 12, gap: 8 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
          <Text style={[f.t(13.5), { color: t.ink3 }]}>Electricity yesterday</Text>
          <Text style={[f.t(13.5, 600), num, { color: t.ink }]}>{formatPct(s.electricity_yesterday_pct)}</Text>
        </View>
        {s.saving_mcal != null ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
            <Text style={[f.t(13.5), { color: t.ink3 }]}>All energy saved, in Mcal</Text>
            <Text style={[f.t(13.5, 600), num, { color: t.ink }]}>{`${formatIndian(s.saving_mcal, 0, 0)} Mcal`}</Text>
          </View>
        ) : null}
        {notes.map((n) => (
          <View key={n} style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
            <Bx name="bx-info-circle" size={15} color={t.warn} />
            <Text style={[f.t(13), { color: t.ink3, flex: 1, lineHeight: 18 }]}>{n}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function Figure({
  label,
  value,
  color,
  share,
  under,
  words,
}: {
  label: string;
  value: string;
  color: string;
  share: number | null;
  under: string;
  words: string | null;
}) {
  const t = useJoTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label} ${value}. ${under}.${words ? ` ${words}.` : ""}`}
      style={{ flex: 1, minWidth: 0, gap: 6 }}
    >
      <Text style={[f.t(13), { color: t.muted }]}>{label}</Text>
      <Text style={[f.d(26, -0.02, 1.1), num, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: t.track, overflow: "hidden" }}>
        {share != null ? <View style={{ width: `${share}%`, height: "100%", borderRadius: 3, backgroundColor: color }} /> : null}
      </View>
      <Text style={[f.t(12.5), num, { color: t.muted }]} numberOfLines={1}>
        {under}
      </Text>
      {words ? (
        <Text style={[f.t(12.5), num, { color: t.ink3 }]} numberOfLines={2}>
          {words}
        </Text>
      ) : null}
    </View>
  );
}

/* ── States ────────────────────────────────────────────────────────────── */

function LoadProblem({ title, sub }: { title: string; sub: string }) {
  const t = useJoTheme();
  return (
    <Card radius={24} style={{ padding: 18, gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Bx name="bx-error-circle" size={17} color={t.warn} />
        <Text style={[f.t(15, 600), { color: t.ink, flex: 1 }]}>{title}</Text>
      </View>
      <Text style={[f.t(13.5), { color: t.muted, lineHeight: 19 }]}>{sub} Pull down to try again.</Text>
    </Card>
  );
}

function HomeSkeleton() {
  return (
    <View style={{ gap: 14, marginTop: 14 }} accessibilityLabel="Loading the site…">
      <Shimmer height={250} radius={28} />
      <Shimmer height={180} radius={24} />
    </View>
  );
}
