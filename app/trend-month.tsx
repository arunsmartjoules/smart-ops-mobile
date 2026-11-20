/**
 * Trend Sheet › Month (artboard "8 Month").
 *
 * The site's Electricity saving for a month and a calendar of its days. One
 * deliberate difference from the artboard: at a site with a billing cycle day
 * the month is the site's BILLING month (for example 8 Nov to 7 Dec, named
 * November), so the figure here matches the dashboard. The previous and next
 * buttons step by billing month, and a line under the title gives the dates
 * whenever they are not a plain calendar month.
 *
 * This screen needs a connection: the month is not kept on the phone.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Bx } from "@/components/jo/Bx";
import { Card, EmptyState, IconButton, JoPage, Shimmer, f, useJoTheme } from "@/components/jo/ui";
import {
  MissingSite,
  SavingBar,
  backToHub,
  goTrend,
  toneColor,
  useTrendParams,
} from "@/components/trend/TrendKit";
import TrendSheetService from "@/services/TrendSheetService";
import { istTodayString } from "@/utils/istDate";
import {
  addDaysYmd,
  addMonthsYm,
  dayMonthLabel,
  formatIndian,
  formatPct,
  formatTargetPct,
  monthLabel,
  toneOf,
  weekdayOfYmd,
  type TrendDayList,
  type TrendDayListItem,
} from "@/utils/trendSheet";

type Status = "loading" | "ready" | "offline" | "error";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * A seventh of the row, rounded DOWN. An exact 100/7 % adds up to a hair over
 * the row on some screens, and the seventh day then wraps to the next line,
 * which puts every date under the wrong weekday.
 */
const CELL_WIDTH = "14.28%";

const isMonth = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}$/.test(v);

export default function TrendMonth() {
  const t = useJoTheme();
  const params = useTrendParams("/trend-month");
  const siteCode = params.siteCode ?? null;
  const today = istTodayString();
  const thisMonth = today.slice(0, 7);
  const [month, setMonth] = useState(() => (isMonth(params.month) ? params.month : thisMonth));
  // What was loaded, and for which month: until it matches, the month on screen is loading.
  const [loaded, setLoaded] = useState<{
    month: string;
    data: TrendDayList | null;
    status: Exclude<Status, "loading">;
    error: string | null;
  } | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!siteCode) return;
    // A quick tap through several months: only the last answer may land.
    const mine = ++seq.current;
    const result = await TrendSheetService.listDays(siteCode, { month });
    if (mine !== seq.current) return;
    setLoaded(
      result.ok
        ? { month, data: result.data, status: "ready", error: null }
        : { month, data: null, status: result.status === null ? "offline" : "error", error: result.error },
    );
  }, [siteCode, month]);

  const current = loaded && loaded.month === month ? loaded : null;
  const status: Status = current ? current.status : "loading";
  const data = current?.data ?? null;
  const error = current?.error ?? null;
  const retry = () => {
    setLoaded(null);
    void load();
  };

  useEffect(() => {
    void load();
  }, [load]);

  if (!siteCode) return <MissingSite title="Month" />;

  // A billing month can run one name ahead of the calendar (an end day cycle), never further.
  const canGoNext = month < addMonthsYm(thisMonth, 1);

  return (
    <JoPage glow={false}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 8, paddingHorizontal: 16, paddingBottom: 12 }}>
        <IconButton icon="bx-chevron-left" iconSize={24} label="Back to trend sheet" onPress={backToHub} />
        <View style={{ flex: 1, minWidth: 0, marginLeft: 6 }}>
          <Text accessibilityRole="header" style={[f.d(20, -0.02, 1.25), { color: t.ink }]} numberOfLines={1}>
            {monthLabel(month)}
          </Text>
          {data && !isCalendarMonth(data, month) ? (
            <Text style={[f.t(12), { color: t.muted, marginTop: 2 }]} numberOfLines={1}>
              {dayMonthLabel(data.from)} to {dayMonthLabel(data.to)}
            </Text>
          ) : null}
        </View>
        <IconButton icon="bx-chevron-left" label="Previous month" onPress={() => setMonth((m) => addMonthsYm(m, -1))} />
        <View style={{ opacity: canGoNext ? 1 : 0.4 }}>
          <IconButton
            icon="bx-chevron-right"
            label={canGoNext ? "Next month" : "Next month, not started yet"}
            onPress={canGoNext ? () => setMonth((m) => addMonthsYm(m, 1)) : undefined}
          />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {status === "loading" ? (
          <View style={{ gap: 12 }} accessibilityLabel="Loading the month">
            <Shimmer height={170} radius={28} />
            <Shimmer height={360} radius={28} />
          </View>
        ) : status === "offline" ? (
          <EmptyState
            icon="bx-wifi-off"
            title="The month view needs a connection"
            sub="Daily entry still works with no network. Come back here once you are online."
            action={{ label: "Try again", onPress: retry }}
          />
        ) : status === "error" || !data ? (
          <EmptyState
            icon="bx-error-circle"
            title="This month could not be loaded"
            sub={error || "Something went wrong while loading the month."}
            action={{ label: "Try again", onPress: retry }}
          />
        ) : (
          <MonthBody data={data} today={today} siteCode={siteCode} />
        )}
      </ScrollView>
    </JoPage>
  );
}

/** True when the dates returned are the calendar month of that name, first day to last. */
function isCalendarMonth(data: TrendDayList, month: string): boolean {
  const lastDay = addDaysYmd(`${addMonthsYm(month, 1)}-01`, -1);
  return data.from === `${month}-01` && data.to === lastDay;
}

function MonthBody({ data, today, siteCode }: { data: TrendDayList; today: string; siteCode: string }) {
  const t = useJoTheme();
  const { summary } = data;
  const tone = toneOf(summary.saving, summary.saving_pct, summary.target_pct);
  const color = toneColor(t, tone);
  const missed = Math.max(0, summary.days_expected - summary.days_entered);
  const started = data.from <= today;
  const lead = weekdayOfYmd(data.from);
  const mark = summary.target_pct != null && summary.target_pct > 0 && summary.target_pct <= 100 ? summary.target_pct : null;
  const targetText = summary.target_pct != null ? formatTargetPct(summary.target_pct) : null;

  return (
    <>
      <Card radius={28} style={{ paddingTop: 18, paddingHorizontal: 20, paddingBottom: 20, gap: 14 }}>
        <Text style={[f.t(13), { color: t.muted }]}>Electricity saved this month</Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <Text style={[f.d(36, -0.02), { color: summary.saving != null ? color : t.ink }]}>
            {summary.saving == null ? "—" : formatPct(summary.saving_pct)}
          </Text>
          <Text style={[f.t(16, 500), { color: t.ink, flexShrink: 1 }]} numberOfLines={1}>
            {summary.saving != null ? `${formatIndian(summary.saving)} kWh` : ""}
          </Text>
        </View>
        <SavingBar
          pct={summary.saving_pct ?? 0}
          markPct={mark}
          color={color}
          label={
            summary.saving_pct != null
              ? `Saved ${formatPct(summary.saving_pct)} of the baseline so far this month.${targetText ? ` Target is ${targetText}.` : ""}`
              : "No saving recorded for this month yet"
          }
        />
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
          <Text style={[f.t(12), { color: t.muted, flexShrink: 1 }]} numberOfLines={1}>
            {started ? `${summary.days_entered} of ${summary.days_expected} days entered` : "This month has not started"}
          </Text>
          <Text style={[f.t(12), { color: t.muted }]}>{targetText ? `Target ${targetText}` : "No target set"}</Text>
        </View>
      </Card>

      {/* Each day shows its Electricity saving. Tap a day to open it. */}
      <Card radius={28} style={{ paddingVertical: 16, paddingHorizontal: 12, gap: 8 }}>
        <View style={{ flexDirection: "row" }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {WEEKDAYS.map((w) => (
            <Text key={w} style={[f.t(11), { color: t.muted, width: CELL_WIDTH, textAlign: "center" }]}>
              {w}
            </Text>
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {Array.from({ length: lead }, (_, i) => (
            <View key={`lead-${i}`} style={{ width: CELL_WIDTH, height: 58 }} />
          ))}
          {data.days.map((d) => (
            <DayCell
              key={d.date}
              d={d}
              today={today}
              onPress={() => goTrend("/trend-summary", { siteCode, date: d.date })}
            />
          ))}
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, paddingTop: 6, paddingHorizontal: 8 }}>
          <Legend label="On target" swatch={{ backgroundColor: t.ok, borderColor: t.ok, borderRadius: 4 }} />
          <Legend
            label={targetText ? `Below ${targetText}` : "Below target"}
            swatch={{ backgroundColor: "transparent", borderColor: t.warn, borderRadius: 3 }}
          />
          <Legend label="Not entered" swatch={{ backgroundColor: "transparent", borderColor: t.bad, borderRadius: 4, borderStyle: "dashed" }} />
        </View>
      </Card>

      {started ? (
        <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 }}>
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: missed === 0 ? t.okTint : t.warnTint,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Bx name={missed === 0 ? "bx-check" : "bx-error-circle"} size={14} color={missed === 0 ? t.ok : t.warn} />
          </View>
          <Text style={[f.t(14, 500), { color: missed === 0 ? t.ok : t.ink }]}>
            {missed === 0 ? "No days missed" : `${missed} day${missed === 1 ? "" : "s"} not fully entered`}
          </Text>
        </View>
      ) : null}
    </>
  );
}

function Legend({ label, swatch }: { label: string; swatch: object }) {
  const t = useJoTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={[{ width: 9, height: 9, borderWidth: 1.5 }, swatch]} />
      <Text style={[f.t(12), { color: t.muted }]}>{label}</Text>
    </View>
  );
}

function DayCell({ d, today, onPress }: { d: TrendDayListItem; today: string; onPress: () => void }) {
  const t = useJoTheme();
  const n = Number(d.date.slice(8, 10));
  const upcoming = d.date > today;
  if (upcoming) {
    return (
      <View style={{ width: CELL_WIDTH, height: 58, alignItems: "center", justifyContent: "center" }}>
        <Text style={[f.t(14), { color: t.faint }]}>{n}</Text>
      </View>
    );
  }

  const isToday = d.date === today;
  const pct = d.electricity_saving_pct;
  const target = d.electricity_target_pct;
  const missing = d.status === "missing";
  // On target when the saved % is at or above the target %, negative targets included.
  const below = pct != null && (pct < 0 || (target != null && pct < target));
  const fg = isToday ? t.selFg : t.ink;
  const pctColor = isToday ? t.selFg : below ? t.warn : t.ok;
  const words = missing
    ? "not entered"
    : pct != null
      ? `saved ${formatPct(pct)}, ${below ? "below target" : "on target"}`
      : d.status === "partial"
        ? "partly entered"
        : "entered";

  return (
    <View style={{ width: CELL_WIDTH, height: 58, padding: 1 }}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`${dayMonthLabel(d.date)}, ${words}${d.has_mismatch ? ", opening reading does not match the day before" : ""}${isToday ? ", today" : ""}`}
        style={{
          flex: 1,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          backgroundColor: isToday ? t.selBg : t.raised,
          borderWidth: 1,
          borderStyle: missing && !isToday ? "dashed" : "solid",
          borderColor: isToday ? t.selBg : missing ? t.bad : below ? t.warn : t.raised,
        }}
      >
        <Text style={[f.t(14, 600), { color: fg }]}>{n}</Text>
        <Text style={[f.t(11, 500), { color: missing ? (isToday ? t.selFg : t.muted) : pctColor }]} numberOfLines={1}>
          {missing ? "—" : pct != null ? `${pct.toFixed(1)}%` : d.status === "partial" ? "Part" : "Done"}
        </Text>
        {d.has_mismatch ? (
          <View style={{ position: "absolute", top: 5, right: 6, width: 6, height: 6, borderRadius: 3, backgroundColor: t.warn }} />
        ) : null}
      </TouchableOpacity>
    </View>
  );
}
