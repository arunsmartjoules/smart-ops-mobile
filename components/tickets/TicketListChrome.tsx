/**
 * Tickets list chrome — artboard "tickets" (lines 364–402): site pill over a
 * 28px "Tickets" title with a refresh button, search + date button, the
 * horizontally scrolling status chips with counts, and the "N tickets ·
 * Newest" line. Also the swipe-between-tabs wrapper and the loading
 * skeleton. Local to Tickets (it used to share components/shared/ListChrome).
 */
import React, { useEffect, useMemo } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { Bx } from "@/components/jo/Bx";
import { Chip, IconButton, SearchField, Shimmer, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";

export interface TicketStatusChip {
  key: string;
  label: string;
  count?: number;
}

/* ── Motion ─────────────────────────────────────────────────────────────── */

const MOTION = { duration: 220, easing: Easing.bezier(0.4, 0, 0.2, 1) };
const SLIDE_DISTANCE = 26;

/**
 * Slides the list in from the right when moving to a later tab and from the
 * left when moving back. Runs on the UI thread against the list container,
 * so rows never re-render.
 */
export function useTicketListSlide(seq: number, direction: number) {
  const offset = useSharedValue(0);

  useEffect(() => {
    if (seq === 0) return;
    offset.value = direction >= 0 ? SLIDE_DISTANCE : -SLIDE_DISTANCE;
    offset.value = withTiming(0, MOTION);
  }, [seq, direction, offset]);

  return useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
    opacity: 1 - Math.min(Math.abs(offset.value) / SLIDE_DISTANCE, 1),
  }));
}

/** Horizontal travel (px) before a drag counts as a swipe rather than a scroll. */
const SWIPE_ACTIVATE_X = 24;
/** Vertical travel (px) that hands the touch back to the list's own scroll. */
const SWIPE_FAIL_Y = 14;
/** Distance or flick speed that commits the swipe on release. */
const SWIPE_COMMIT_X = 60;
const SWIPE_COMMIT_VX = 500;

/**
 * A horizontal swipe on the list moves to the next / previous status chip
 * (left = next). Vertical-first drags fail the pan, so scrolling and
 * pull-to-refresh are untouched; it stops at the ends rather than wrapping.
 */
export function TicketSwipeTabs({
  chips,
  activeChip,
  onSelectChip,
  style,
  children,
}: {
  chips: TicketStatusChip[];
  activeChip: string;
  onSelectChip: (key: string) => void;
  style?: React.ComponentProps<typeof Animated.View>["style"];
  children: React.ReactNode;
}) {
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-SWIPE_ACTIVATE_X, SWIPE_ACTIVATE_X])
        .failOffsetY([-SWIPE_FAIL_Y, SWIPE_FAIL_Y])
        .onEnd((e) => {
          const committed =
            Math.abs(e.translationX) >= SWIPE_COMMIT_X ||
            Math.abs(e.velocityX) >= SWIPE_COMMIT_VX;
          if (!committed || Math.abs(e.translationX) < Math.abs(e.translationY)) {
            return;
          }
          const idx = chips.findIndex((c) => c.key === activeChip);
          if (idx < 0) return;
          const next = chips[idx + (e.translationX < 0 ? 1 : -1)];
          if (!next) return;
          Haptics.selectionAsync().catch(() => {});
          onSelectChip(next.key);
        }),
    [chips, activeChip, onSelectChip],
  );

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={style} collapsable={false}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

/* ── Header ─────────────────────────────────────────────────────────────── */

export function TicketListHeader({
  siteName,
  onPickSite,
  onRefresh,
  search,
  onChangeSearch,
  dateLabel,
  filterNote,
  onOpenFilters,
  chips,
  activeChip,
  onSelectChip,
  count,
  countLabel,
  sortLabel,
  onSort,
  notice,
}: {
  siteName: string;
  /** Undefined when there is nothing to switch to. */
  onPickSite?: () => void;
  /** Undefined while offline / without a site — the button greys out. */
  onRefresh?: () => void;
  search: string;
  onChangeSearch: (v: string) => void;
  dateLabel: string;
  /** Extra active filter shown after the dates (e.g. a priority). */
  filterNote?: string;
  onOpenFilters: () => void;
  chips: TicketStatusChip[];
  activeChip: string;
  onSelectChip: (key: string) => void;
  count: number | null;
  countLabel: string;
  sortLabel: string;
  onSort: () => void;
  /** One-line notice under the search row (view-only mode). */
  notice?: string;
}) {
  const t = useJoTheme();
  const s = useStyles();
  const chipScroll = React.useRef<ScrollView>(null);
  const chipX = React.useRef<Record<string, number>>({});

  // Keep the active chip in view when it changes by swipe.
  useEffect(() => {
    const x = chipX.current[activeChip];
    if (x != null) chipScroll.current?.scrollTo({ x: Math.max(0, x - 16), animated: true });
  }, [activeChip]);

  return (
    <View style={s.wrap}>
      <View style={s.head}>
        <View style={s.headLead}>
          <TouchableOpacity
            onPress={onPickSite}
            disabled={!onPickSite}
            activeOpacity={0.8}
            style={s.site}
            accessibilityRole="button"
            accessibilityLabel={`Site: ${siteName}${onPickSite ? ", change" : ""}`}
          >
            <Bx name="bx-buildings" size={14} color={t.accentInk} />
            <Text style={s.siteText} numberOfLines={1}>
              {siteName}
            </Text>
            {onPickSite ? <Bx name="bx-chevron-down" size={15} color={t.muted} /> : null}
          </TouchableOpacity>
          <Text style={s.title} accessibilityRole="header">
            Tickets
          </Text>
        </View>
        <View style={[s.headRight, !onRefresh && { opacity: 0.45 }]}>
          <IconButton icon="bx-refresh" iconSize={21} label="Refresh tickets" onPress={onRefresh} />
        </View>
      </View>

      <View style={s.searchRow}>
        <SearchField
          value={search}
          onChangeText={onChangeSearch}
          placeholder="Search ID, area or category"
          style={{ flex: 1, minWidth: 0 }}
        />
        <TouchableOpacity
          onPress={onOpenFilters}
          activeOpacity={0.8}
          style={s.dateBtn}
          accessibilityRole="button"
          accessibilityLabel={`Filters: ${dateLabel}${filterNote ? `, ${filterNote}` : ""}`}
        >
          <Bx name="bx-calendar" size={15} color={t.accentInk} />
          <Text style={s.dateText} numberOfLines={1}>
            {dateLabel}
          </Text>
          {filterNote ? <View style={s.dot} /> : null}
        </TouchableOpacity>
      </View>

      {notice ? (
        <View style={s.notice}>
          <Bx name="bx-lock-alt" size={14} color={t.muted} />
          <Text style={s.noticeText} numberOfLines={2}>
            {notice}
          </Text>
        </View>
      ) : null}

      <ScrollView
        ref={chipScroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.chipScroll}
        contentContainerStyle={s.chips}
      >
        {chips.map((c) => (
          <View
            key={c.key}
            onLayout={(e) => {
              chipX.current[c.key] = e.nativeEvent.layout.x;
            }}
          >
            <Chip
              label={c.label}
              count={c.count}
              selected={c.key === activeChip}
              onPress={() => onSelectChip(c.key)}
            />
          </View>
        ))}
      </ScrollView>

      <View style={s.countRow}>
        <Text style={s.countText} numberOfLines={1}>
          <Text style={s.countNum}>{count ?? "–"}</Text> {countLabel}
          {filterNote ? <Text style={s.countText}>{` · ${filterNote}`}</Text> : null}
        </Text>
        <TouchableOpacity
          onPress={onSort}
          hitSlop={10}
          activeOpacity={0.7}
          style={s.sort}
          accessibilityRole="button"
          accessibilityLabel={`Sort: ${sortLabel}. Change sort`}
        >
          <Bx name="bx-sort-down" size={16} color={t.muted} />
          <Text style={s.sortText}>{sortLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ── Skeleton ───────────────────────────────────────────────────────────── */

/** Row-shaped placeholders (same footprint as a ticket card). */
export function TicketListSkeleton({ rows = 5 }: { rows?: number }) {
  const s = useStyles();
  return (
    <View accessibilityLabel="Loading tickets" accessibilityRole="progressbar">
      {Array.from({ length: rows }, (_, i) => (
        <TicketRowSkeleton key={i} />
      ))}
      <View style={s.skelSpacer} />
    </View>
  );
}

export function TicketRowSkeleton() {
  const s = useStyles();
  return (
    <View style={s.skelCard}>
      <Shimmer height={40} radius={20} style={{ width: 40 }} />
      <View style={{ flex: 1, gap: 8 }}>
        <Shimmer height={14} radius={7} style={{ width: "55%" }} />
        <Shimmer height={16} radius={8} style={{ width: "90%" }} />
        <Shimmer height={12} radius={6} style={{ width: "40%" }} />
      </View>
      <Shimmer height={30} radius={15} style={{ width: 30 }} />
    </View>
  );
}

const useStyles = makeJoStyles((t) => ({
  wrap: { paddingHorizontal: 16 },
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 12,
    paddingHorizontal: 4,
  },
  headLead: { flexShrink: 1, minWidth: 0 },
  headRight: { marginTop: 4, flexShrink: 0 },
  site: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 28,
    paddingLeft: 8,
    paddingRight: 9,
    borderRadius: 14,
    backgroundColor: t.input,
    borderWidth: 1,
    borderColor: t.isDark ? "rgba(255,255,255,0.09)" : t.lineMid,
    maxWidth: 260,
  },
  siteText: { ...f.t(12.5, 500), color: t.ink2, flexShrink: 1 },
  title: { ...f.d(28, -0.025), color: t.ink, marginTop: 4 },
  searchRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  dateBtn: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 13,
    borderRadius: 22,
    backgroundColor: t.input,
    borderWidth: 1,
    borderColor: t.isDark ? "rgba(255,255,255,0.07)" : t.lineMid,
    maxWidth: 170,
  },
  dateText: { ...f.t(12.5, 500), color: t.ink, flexShrink: 1 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: t.accent },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: t.raised,
  },
  noticeText: { ...f.t(12, 500), color: t.ink3, flex: 1 },
  chipScroll: { marginTop: 12, marginHorizontal: -16, flexGrow: 0 },
  chips: { gap: 6, paddingHorizontal: 16 },
  countRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingTop: 14,
    paddingBottom: 10,
    paddingHorizontal: 4,
  },
  countText: { ...f.t(13), color: t.muted, flexShrink: 1 },
  countNum: { ...f.t(13, 600), color: t.ink },
  sort: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 0 },
  sortText: { ...f.t(12.5), color: t.muted },
  skelCard: {
    borderRadius: 22,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.cardBorder,
    padding: 14,
    flexDirection: "row",
    gap: 12,
    marginBottom: 8,
  },
  skelSpacer: { height: 8 },
}));
