/**
 * Ops › Trend Sheet: the day hub of the Consumption Trend Sheet (artboard
 * "1 Day hub"). One site and one day: how much electricity is saved so far,
 * and a row per category set up for the site in Baseline, each opening its
 * entry screen.
 *
 * The tab only shows at JoulePays sites the user enters readings for
 * (components/jo/modules `visible`). Reached any other way (the site was
 * switched while the tab was open, a deep link) it says so plainly.
 *
 * Works with no network: the day comes from the phone first (the last pull,
 * plus this phone's unsent entries), the server's copy follows when it can.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { OpsTabs } from "@/components/jo/OpsTabs";
import { Bx } from "@/components/jo/Bx";
import { Card, EmptyState, IconButton, JoPage, Shimmer, f, useJoTheme } from "@/components/jo/ui";
import { useNavInsets } from "@/components/jo/navInsets";
import {
  SavingBar,
  TrendPill,
  UpdateBlock,
  baselineLabel,
  categoryIcon,
  goTrend,
  nextToEnter,
  openCategory,
  provisionalReason,
  savingBarLabel,
  toneColor,
  useTrendDay,
  useTrendOutdated,
} from "@/components/trend/TrendKit";
import { useAuth } from "@/contexts/AuthContext";
import { useSites } from "@/hooks/useSites";
import TrendSheetService, { subscribeTrendSheet } from "@/services/TrendSheetService";
import { refreshTrendSites, useTrendSites } from "@/services/TrendSheetSites";
import { istTodayString } from "@/utils/istDate";
import {
  categorySubtitle,
  dateLabel,
  dayMonthLabel,
  formatIndian,
  formatPct,
  formatTargetPct,
  inSentence,
  lastSevenDays,
  savingSummary,
  weekdayShort,
  type TrendDayListItem,
  type TrendDayStatus,
  type TrendDayView,
  type TrendLocalEntry,
  type TrendViewCategory,
} from "@/utils/trendSheet";

type CellState = TrendDayStatus | "unknown";

const NO_DAYS: Record<string, TrendDayListItem> = {};
const NO_ENTRIES: TrendLocalEntry[] = [];

const CELL_WORDS: Record<CellState, string> = {
  complete: "all entered",
  partial: "partly entered",
  missing: "not entered",
  unknown: "not loaded",
};

export default function TrendSheetHub() {
  const t = useJoTheme();
  const { clearance } = useNavInsets();
  const { user } = useAuth();
  const userId = user?.user_id || user?.id;
  const { selectedSite } = useSites(userId);
  const siteCode = selectedSite?.site_code ?? null;
  const { sites, loaded: sitesLoaded } = useTrendSites(userId);
  const site = useMemo(() => sites.find((s) => s.site_code === siteCode) ?? null, [sites, siteCode]);
  const enabled = !!site && site.categories.length > 0;

  const [today, setToday] = useState(() => istTodayString());
  const [date, setDate] = useState(today);
  const week = useMemo(() => lastSevenDays(today), [today]);

  // A new site, or a new day since the tab was last looked at: back to today.
  const [shownFor, setShownFor] = useState({ siteCode, today });
  if (shownFor.siteCode !== siteCode || shownFor.today !== today) {
    setShownFor({ siteCode, today });
    if (date !== today) setDate(today);
  }

  const day = useTrendDay(enabled ? siteCode : null, enabled ? date : null);
  const outdated = useTrendOutdated(day.view);

  // Week strip: the server's statuses, with this phone's unsent entries on top.
  // Both are kept with the site and week they belong to, so another site's
  // marks are never shown while the new ones load.
  const weekKey = `${siteCode ?? ""}|${week[0]}`;
  const [listedFor, setListedFor] = useState<{ key: string; days: Record<string, TrendDayListItem> }>({
    key: "",
    days: {},
  });
  const [unsentFor, setUnsentFor] = useState<{ key: string; entries: TrendLocalEntry[] }>({ key: "", entries: [] });
  const listed = listedFor.key === weekKey ? listedFor.days : NO_DAYS;
  const unsent = unsentFor.key === weekKey ? unsentFor.entries : NO_ENTRIES;
  const weekSeq = useRef(0);

  const loadUnsent = useCallback(async () => {
    if (!enabled || !siteCode) return;
    const mine = weekSeq.current;
    const entries = await TrendSheetService.unsentEntries(siteCode).catch(() => []);
    if (mine === weekSeq.current) setUnsentFor({ key: weekKey, entries });
  }, [enabled, siteCode, weekKey]);

  const loadWeek = useCallback(async () => {
    if (!enabled || !siteCode) return;
    const mine = ++weekSeq.current;
    const entries = await TrendSheetService.unsentEntries(siteCode).catch(() => []);
    if (mine !== weekSeq.current) return;
    setUnsentFor({ key: weekKey, entries });
    const result = await TrendSheetService.listDays(siteCode, { from: week[0], to: week[6] });
    if (mine !== weekSeq.current || !result.ok) return;
    setListedFor({ key: weekKey, days: Object.fromEntries(result.data.days.map((d) => [d.date, d])) });
  }, [enabled, siteCode, week, weekKey]);

  useEffect(() => {
    void loadWeek();
  }, [loadWeek]);

  // A save or a sync answer: the unsent marks change without a new request.
  useEffect(() => subscribeTrendSheet(() => void loadUnsent()), [loadUnsent]);

  const reloadDay = day.reload;
  // The focus refresh reads the latest loaders through a ref, so it runs once
  // per focus and not again each time the site or the day changes (the day
  // and the week already reload themselves then).
  const loaders = useRef({ reloadDay, loadWeek });
  useEffect(() => {
    loaders.current = { reloadDay, loadWeek };
  }, [reloadDay, loadWeek]);
  useFocusEffect(
    useCallback(() => {
      const now = istTodayString();
      setToday((prev) => (prev === now ? prev : now));
      if (userId) void refreshTrendSites(userId);
      void loaders.current.reloadDay();
      void loaders.current.loadWeek();
    }, [userId]),
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([userId ? refreshTrendSites(userId) : null, reloadDay(), loadWeek()]);
    setRefreshing(false);
  }, [userId, reloadDay, loadWeek]);

  const cellState = useCallback(
    (d: string): CellState => {
      if (d === date && day.view) return day.view.status;
      const mine = unsent.some((e) => e.entry_date === d && e.sync_status === "pending");
      const server = listed[d]?.status;
      if (server === "complete") return "complete";
      if (mine) return "partial";
      return server ?? "unknown";
    },
    [date, day.view, unsent, listed],
  );

  const pickDay = (d: string) => {
    if (!siteCode) return;
    // A finished earlier day opens its summary (as drawn); any other day is entered here.
    if (d !== today && d !== date && cellState(d) === "complete") {
      goTrend("/trend-summary", { siteCode, date: d });
      return;
    }
    setDate(d);
  };

  const view = day.view;

  return (
    <JoPage>
      <OpsTabs showDate={false} />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: clearance, gap: 16 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.muted} colors={[t.accent]} />
        }
      >
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 14, paddingHorizontal: 4 }}>
          <Text accessibilityRole="header" style={[f.d(24, -0.02, 1.2), { color: t.ink, flexShrink: 1 }]}>
            Consumption trend sheet
          </Text>
          {enabled && siteCode ? (
            <IconButton
              icon="bx-calendar"
              label="Open month view"
              onPress={() =>
                goTrend("/trend-month", { siteCode, ...(view ? { month: view.cycle_month } : {}) })
              }
            />
          ) : null}
        </View>

        {!siteCode ? (
          <EmptyState icon="bx-buildings" title="Select a site" sub="Pick a site above to see its trend sheet." />
        ) : !sitesLoaded ? (
          <HubSkeleton />
        ) : !enabled ? (
          <EmptyState
            icon="bx-line-chart"
            title="Trend sheet is not set up for this site"
            sub="It is used at JoulePays sites you are assigned to. Pick another site above, or ask an admin to set this one up in Baseline."
          />
        ) : (
          <>
            <View accessibilityRole="tablist" accessibilityLabel="Pick a day" style={{ flexDirection: "row", gap: 6 }}>
              {week.map((d) => (
                <DayCell
                  key={d}
                  date={d}
                  today={d === today}
                  selected={d === date}
                  state={cellState(d)}
                  onPress={() => pickDay(d)}
                />
              ))}
            </View>

            {outdated ? (
              <Card style={{ padding: 16 }}>
                <UpdateBlock />
              </Card>
            ) : null}

            {!view ? (
              day.status === "loading" ? (
                <HubSkeleton />
              ) : day.status === "offline" ? (
                <EmptyState
                  icon="bx-wifi-off"
                  title={`${dateLabel(date)} is not on the phone yet`}
                  sub="Connect once so the opening readings and the baseline can be loaded. After that it works with no network."
                  action={{ label: "Try again", onPress: () => void reloadDay() }}
                />
              ) : (
                <EmptyState
                  icon="bx-error-circle"
                  title="This day could not be opened"
                  sub={day.error || "Something went wrong while loading the day."}
                  action={{ label: "Try again", onPress: () => void reloadDay() }}
                />
              )
            ) : (
              <>
                {day.stale ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 4 }}>
                    <Bx name="bx-wifi-off" size={15} color={t.muted} />
                    <Text style={[f.t(12.5), { color: t.muted, flex: 1 }]}>
                      No connection. Showing what is on this phone.
                    </Text>
                  </View>
                ) : null}
                {site && !site.ready && date === today ? (
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6, paddingHorizontal: 4 }}>
                    <Bx name="bx-info-circle" size={15} color={t.warn} />
                    <Text style={[f.t(12.5), { color: t.ink3, flex: 1, lineHeight: 18 }]}>
                      This site is missing a block or this month’s baseline. You can still enter readings; an
                      admin needs to complete Baseline for the savings to show.
                    </Text>
                  </View>
                ) : null}
                <DayCard view={view} />
                <Readings view={view} siteCode={siteCode} date={date} today={today} />
              </>
            )}
          </>
        )}
      </ScrollView>
    </JoPage>
  );
}

/* ── Week strip ────────────────────────────────────────────────────────── */

function DayCell({
  date,
  today,
  selected,
  state,
  onPress,
}: {
  date: string;
  today: boolean;
  selected: boolean;
  state: CellState;
  onPress: () => void;
}) {
  const t = useJoTheme();
  const fg = selected ? t.selFg : t.ink;
  const sub = selected ? t.selFg : t.muted;
  // Filled = all entered, ring = partly, hollow line = nothing yet: shape, not colour alone.
  const mark =
    state === "complete"
      ? { backgroundColor: t.ok, borderColor: t.ok }
      : state === "partial"
        ? { backgroundColor: "transparent", borderColor: t.warn }
        : { backgroundColor: "transparent", borderColor: state === "missing" ? (selected ? t.selFg : t.faint) : "transparent" };
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={`${today ? "Today, " : ""}${weekdayShort(date)} ${dayMonthLabel(date)}, ${CELL_WORDS[state]}`}
      style={{
        flex: 1,
        height: 68,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        gap: 3,
        backgroundColor: selected ? t.selBg : t.card,
        borderWidth: 1,
        borderColor: selected ? t.selBg : today ? t.lineStrong : t.cardBorder,
      }}
    >
      <Text style={[f.t(11), { color: sub }]}>{weekdayShort(date)}</Text>
      <Text style={[f.t(16, 600), { color: fg }]}>{Number(date.slice(8, 10))}</Text>
      <View style={[{ width: 7, height: 7, borderRadius: 4, borderWidth: 1.5 }, mark]} />
    </TouchableOpacity>
  );
}

/* ── The day so far ────────────────────────────────────────────────────── */

/** Electricity when the site has it, else its first category with a baseline. */
function headlineOf(view: TrendDayView): TrendViewCategory | null {
  return (
    view.categories.find((c) => c.category === "electricity") ??
    view.categories.find((c) => c.kind === "fuel") ??
    null
  );
}

function DayCard({ view }: { view: TrendDayView }) {
  const t = useJoTheme();
  const c = headlineOf(view);
  if (!c) return null;
  const summary = savingSummary(c, { missing: c.entered ? 0 : 1, noun: "reading" });
  const color = toneColor(t, summary.tone);
  const shown = c.entered && summary.saving != null;
  return (
    <Card radius={28} style={{ paddingTop: 18, paddingHorizontal: 20, paddingBottom: 20, gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Text style={[f.t(13), { color: t.muted, flexShrink: 1 }]}>{c.label} saved so far</Text>
        <TrendPill label={baselineLabel(c)} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <Text style={[f.d(36, -0.02), { color: shown ? color : t.ink }]}>
          {shown ? formatPct(summary.saving_pct) : "—"}
        </Text>
        <Text style={[f.t(16, 500), { color: t.ink, flexShrink: 1 }]} numberOfLines={1}>
          {shown ? `${formatIndian(summary.saving as number)} ${c.unit}` : ""}
        </Text>
      </View>
      <SavingBar
        pct={shown ? summary.bar_pct : 0}
        markPct={summary.target_mark_pct}
        color={color}
        label={shown ? savingBarLabel(summary, `the ${formatIndian(c.baseline ?? 0)} ${c.unit} baseline`) : "Not entered yet"}
      />
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
        <Text style={[f.t(12), { color: t.muted, flexShrink: 1 }]} numberOfLines={1}>
          {c.baseline != null ? `Baseline ${formatIndian(c.baseline)} ${c.unit}` : "No baseline yet"}
        </Text>
        <Text style={[f.t(12), { color: t.muted }]}>
          {c.target_pct != null ? `Target ${formatTargetPct(c.target_pct)}` : "No target set"}
        </Text>
      </View>
      {!c.entered ? (
        <Text style={[f.t(12.5), { color: t.ink3 }]}>Enter {inSentence(c.label)} to see the saving.</Text>
      ) : c.provisional ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <TrendPill label="Provisional" tone="warn" />
          <Text style={[f.t(12.5), { color: t.ink3, flexShrink: 1 }]}>{provisionalReason(view)}</Text>
        </View>
      ) : null}
    </Card>
  );
}

/* ── Readings ──────────────────────────────────────────────────────────── */

function Readings({
  view,
  siteCode,
  date,
  today,
}: {
  view: TrendDayView;
  siteCode: string;
  date: string;
  today: string;
}) {
  const t = useJoTheme();
  const next = nextToEnter(view);
  const total = view.categories.length;
  const done = view.categories.filter((c) => c.entered && c.sync !== "failed").length;
  const complete = total > 0 && done === total;

  if (total === 0) {
    return (
      <EmptyState
        icon="bx-info-circle"
        title="No categories for this day"
        sub="Nothing is enabled for this site in Baseline on this date."
      />
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: 4 }}>
        <Text accessibilityRole="header" style={[f.t(15, 600), { color: t.ink }]}>
          Readings{date === today ? "" : `, ${dayMonthLabel(date)}`}
        </Text>
        <Text style={[f.t(13), { color: t.muted }]}>
          {done} of {total} entered
        </Text>
      </View>

      {view.categories.map((c) => (
        <CategoryRow
          key={c.category}
          c={c}
          isNext={next?.category === c.category}
          onPress={() => {
            // The notice has been seen once the row is opened.
            if (c.sync === "replaced") void TrendSheetService.acknowledgeReplaced(siteCode, date);
            openCategory(siteCode, date, c);
          }}
        />
      ))}

      {complete ? (
        <TouchableOpacity
          onPress={() => goTrend("/trend-summary", { siteCode, date })}
          accessibilityRole="button"
          style={{ minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}
        >
          <Text style={[f.t(14, 600), { color: t.accentInk }]}>View day summary</Text>
          <Bx name="bx-chevron-right" size={18} color={t.accentInk} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function CategoryRow({ c, isNext, onPress }: { c: TrendViewCategory; isNext: boolean; onPress: () => void }) {
  const t = useJoTheme();
  const failed = c.sync === "failed";
  const done = c.entered && !failed;
  const sub = failed
    ? `Needs attention: ${c.sync_error || "the server refused this entry"}`
    : c.sync === "replaced"
      ? c.sync_error || "Replaced by a newer save"
      : categorySubtitle(c);
  const state = failed ? "needs attention" : done ? (c.sync === "pending" ? "entered, not sent yet" : "entered") : "not entered";
  return (
    <Card
      radius={22}
      onPress={onPress}
      accessibilityLabel={`${c.label}, ${state}. ${sub}`}
      style={{ minHeight: 72, paddingVertical: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 12 }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: t.raised,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Bx name={categoryIcon(c.category)} size={20} color={t.ink} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={[f.t(16, 600), { color: t.ink }]} numberOfLines={1}>
          {c.label}
        </Text>
        <Text style={[f.t(13), { color: failed ? t.bad : t.muted }]} numberOfLines={2}>
          {sub}
        </Text>
        {c.sync === "pending" ? (
          <View style={{ marginTop: 4 }}>
            <TrendPill label="Not sent yet" tone="mute" icon="bx-cloud-upload" />
          </View>
        ) : null}
      </View>
      {failed ? (
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: t.badTint, alignItems: "center", justifyContent: "center" }}>
          <Bx name="bx-error-circle" size={17} color={t.bad} />
        </View>
      ) : done ? (
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: t.okTint, alignItems: "center", justifyContent: "center" }}>
          <Bx name="bx-check" size={18} color={t.ok} />
        </View>
      ) : isNext ? (
        <View style={{ height: 36, paddingHorizontal: 16, borderRadius: 18, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" }}>
          <Text style={[f.t(14, 600), { color: t.onAccent }]}>Enter</Text>
        </View>
      ) : (
        <Bx name="bx-chevron-right" size={20} color={t.muted} />
      )}
    </Card>
  );
}

function HubSkeleton() {
  return (
    <View style={{ gap: 12 }} accessibilityLabel="Loading the trend sheet">
      <Shimmer height={68} radius={18} />
      <Shimmer height={170} radius={28} />
      <Shimmer height={72} radius={22} />
      <Shimmer height={72} radius={22} />
    </View>
  );
}
