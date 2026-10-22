/**
 * Efficiency — the "Efficiency" sub-tab of Resources. A read-only mobile
 * take on the web /efficiency page (web/src/app/efficiency): High side /
 * Low side tabs, the period's SEC average against the plant target, the
 * consumption and tonnage totals, the daily SEC chart and the day-wise table.
 *
 * Data: GET /api/high-side-efficiency and /api/low-side-efficiency (backend
 * services/sitelogs) for the site in the shared Resources header pill — that
 * header owns site selection; this screen only reads it. The period is one
 * calendar month (the current month runs to today, the web's default "This
 * Month"). Import / add / edit / delete stay on the web (admin features).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useNetInfo } from "@react-native-community/netinfo";
import { ChipTabs } from "@/components/jo/ChipTabs";
import { ResourcesTabs } from "@/components/jo/OpsTabs";
import { useNavInsets } from "@/components/jo/navInsets";
import { Building2, ChevronLeft, ChevronRight, CircleAlert, WifiOff, bxIcon } from "@/components/jo/bxIcons";
import { DateButton, EmptyState, JoPage, JoSheet, SheetOption, Shimmer, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import { RoundButton } from "@/components/sla/parts";
import { addMonths, fmtRange } from "@/components/reports/dates";
import { SIDES, allDates, monthLabel, monthRange, recentMonths, type EffSide } from "@/components/efficiency/lib";
import { Summary } from "@/components/efficiency/Summary";
import { SecChart } from "@/components/efficiency/SecChart";
import { DayTable } from "@/components/efficiency/DayTable";
import { useAuth } from "@/contexts/AuthContext";
import { useSites } from "@/hooks/useSites";
import EfficiencyService, { type EffRow, type Loaded } from "@/services/EfficiencyService";
import { istTodayString } from "@/utils/istDate";
import logger from "@/utils/logger";

const MONTH_OPTIONS = 12;
const SIDE_KEYS: EffSide[] = ["high", "low"];
const EmptyIcon = bxIcon("bx-line-chart");

export default function EfficiencyScreen() {
  const t = useJoTheme();
  const s = useStyles();
  const { clearance } = useNavInsets();
  const { user } = useAuth();
  const userId = user?.user_id || user?.id || "";
  const net = useNetInfo();
  const offline = net.isConnected === false;

  // ── Site: exactly the one in the Resources header pill ────────────────
  const { selectedSite, loading: sitesLoading, refresh: refreshSites } = useSites(userId || undefined);
  const siteCode = selectedSite?.site_code ?? null;
  const siteName = selectedSite?.site_name || siteCode || "";

  const loadSites = useCallback(async () => {
    try {
      await refreshSites();
    } catch (error) {
      logger.warn("Efficiency: site refresh failed", { error });
    }
  }, [refreshSites]);

  // ── Side (High / Low) — `?side=low` deep-links straight to the low side ─
  const params = useLocalSearchParams<{ side?: string }>();
  const [side, setSide] = useState<EffSide>(params.side === "low" ? "low" : "high");
  // A new `side` param (the tab screen stays mounted) wins over the last pick;
  // adjusted during render rather than in an effect.
  const [seenParam, setSeenParam] = useState(params.side);
  if (params.side !== seenParam) {
    setSeenParam(params.side);
    if (params.side === "high" || params.side === "low") setSide(params.side);
  }
  const cfg = SIDES[side];

  // ── Period: one calendar month ─────────────────────────────────────────
  const [today, setToday] = useState(istTodayString);
  const currentMonth = today.slice(0, 7);
  const [pickedMonth, setMonth] = useState<string | null>(null);
  const month = pickedMonth && pickedMonth <= currentMonth ? pickedMonth : currentMonth;
  const range = useMemo(() => monthRange(month, today), [month, today]);
  const dayCount = useMemo(() => allDates(range.from, range.to).length, [range]);
  const monthOptions = useMemo(() => recentMonths(currentMonth, MONTH_OPTIONS), [currentMonth]);
  const [sheet, setSheet] = useState(false);

  const bodyRef = useRef<ScrollView>(null);
  // A new side / month is a new page — start it at the top, not the old offset.
  const toTop = () => bodyRef.current?.scrollTo({ y: 0, animated: false });
  const pickSide = (k: EffSide) => {
    setSide(k);
    toTop();
  };
  const pickMonth = (m: string) => {
    setMonth(m);
    toTop();
  };

  // The IST day can roll over while the app sits in the background.
  useFocusEffect(
    useCallback(() => {
      setToday(istTodayString());
    }, []),
  );

  // ── Rows ───────────────────────────────────────────────────────────────
  const [tick, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const scopeKey = siteCode && userId ? `${side}|${siteCode}|${range.from}|${range.to}` : "";
  // Each result remembers the scope it answers, so a site / side / month
  // switch never shows the previous scope's numbers under the new label.
  const [result, setResult] = useState<{ key: string; loaded: Loaded<EffRow[]> } | null>(null);
  const current = result && result.key === scopeKey ? result.loaded : null;

  useEffect(() => {
    if (!scopeKey || !siteCode) return;
    let cancelled = false;
    const key = scopeKey;
    EfficiencyService.getRows(userId, side, siteCode, range.from, range.to).then((loaded) => {
      if (!cancelled) setResult({ key, loaded });
    });
    return () => {
      cancelled = true;
    };
    // `offline` re-runs the load when the connection comes back.
  }, [scopeKey, userId, side, siteCode, range.from, range.to, tick, offline]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setToday(istTodayString());
    await loadSites();
    setTick((x) => x + 1);
    setRefreshing(false);
  }, [loadSites]);

  const retry = useCallback(() => setTick((x) => x + 1), []);

  // ── Render ─────────────────────────────────────────────────────────────
  const periodLabel = month === currentMonth ? "Month to date" : monthLabel(month);
  const rows = current?.success ? current.data : [];
  const fromCache = current?.success ? !!current.isFromCache : false;

  let body: React.ReactNode;
  if (!selectedSite) {
    body =
      sitesLoading || !userId ? (
        <LoadingBlocks />
      ) : (
        <EmptyState
          icon={Building2}
          title="No sites assigned"
          sub="Ask an admin to add you to a site to see its efficiency."
          action={{ label: "Try again", onPress: () => void onRefresh() }}
        />
      );
  } else if (!current) {
    body = <LoadingBlocks />;
  } else if (!current.success) {
    body = (
      <EmptyState
        icon={offline ? WifiOff : CircleAlert}
        title={offline ? "You're offline" : "Couldn't load efficiency data"}
        sub={offline ? "Connect to load this period's readings." : current.error}
        action={{ label: "Try again", onPress: retry }}
      />
    );
  } else if (rows.length === 0) {
    body = (
      <EmptyState
        icon={EmptyIcon}
        title="No efficiency data for this period"
        sub={`No ${cfg.label.toLowerCase()} readings for ${siteName} in ${fmtRange(range.from, range.to)}.`}
      />
    );
  } else {
    body = (
      <>
        <Summary side={cfg} rows={rows} periodLabel={periodLabel} dayCount={dayCount} />
        <SecChart side={cfg} rows={rows} from={range.from} to={range.to} />
        <DayTable side={cfg} rows={rows} />
      </>
    );
  }

  return (
    <JoPage>
      {/* Resources sub-tabs: SLA · Efficiency · Reports · Client comms (+ the app-wide site pill) */}
      <ResourcesTabs />

      <View style={s.top}>
        {/* Month stepper — SLA's month control with ‹ › for quick steps. */}
        <View style={s.monthRow}>
          <RoundButton icon={ChevronLeft} label="Previous month" onPress={() => pickMonth(addMonths(month, -1))} />
          <DateButton
            label={monthLabel(month)}
            meta={fmtRange(range.from, range.to, false)}
            onPress={() => setSheet(true)}
            height={40}
            style={s.monthBtn}
          />
          <RoundButton
            icon={ChevronRight}
            label="Next month"
            onPress={month < currentMonth ? () => pickMonth(addMonths(month, 1)) : undefined}
            disabled={month >= currentMonth}
          />
        </View>

        {fromCache || offline ? (
          <View style={s.metaRow}>
            <WifiOff size={13} color={t.warn} />
            <Text style={[f.t(11.5), { color: t.warn }]} numberOfLines={1}>
              {fromCache ? "Offline copy — pull to refresh when back online" : "Offline"}
            </Text>
          </View>
        ) : null}

        <ChipTabs
          style={{ marginTop: 12 }}
          items={SIDE_KEYS.map((k) => ({ key: k, label: SIDES[k].label, icon: SIDES[k].icon, color: t.accentInk }))}
          value={side}
          onChange={pickSide}
        />
      </View>

      <View style={{ flex: 1 }}>
        <LinearGradient pointerEvents="none" colors={[t.page, `${t.page}00`]} style={s.fade} />
        <ScrollView
          ref={bodyRef}
          style={{ flex: 1 }}
          contentContainerStyle={[s.body, { paddingBottom: clearance }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.muted} colors={[t.accent]} />
          }
          showsVerticalScrollIndicator={false}
        >
          {body}
        </ScrollView>
      </View>

      <JoSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title="Month"
        subtitle="The current month runs to today"
      >
        <ScrollView style={s.sheetList} contentContainerStyle={{ gap: 8 }}>
          {monthOptions.map((m) => {
            const r = monthRange(m, today);
            return (
              <SheetOption
                key={m}
                label={monthLabel(m)}
                meta={m === currentMonth ? "Month to date" : fmtRange(r.from, r.to, false)}
                selected={m === month}
                onPress={() => {
                  pickMonth(m);
                  setSheet(false);
                }}
              />
            );
          })}
        </ScrollView>
      </JoSheet>
    </JoPage>
  );
}

function LoadingBlocks() {
  return (
    <View style={{ gap: 10 }}>
      <Shimmer height={138} radius={24} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Shimmer height={78} radius={20} style={{ flex: 1 }} />
        <Shimmer height={78} radius={20} style={{ flex: 1 }} />
      </View>
      <Shimmer height={280} radius={22} />
      <Shimmer height={220} radius={22} />
    </View>
  );
}

const useStyles = makeJoStyles(() => ({
  top: { paddingHorizontal: 16 },
  monthRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 12 },
  monthBtn: { flex: 1, minWidth: 0, alignSelf: "auto" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 8, paddingHorizontal: 2 },
  body: { paddingTop: 12, paddingHorizontal: 16 },
  fade: { position: "absolute", top: 0, left: 0, right: 0, height: 14, zIndex: 2 },
  sheetList: { marginTop: 14, maxHeight: 420 },
}));
