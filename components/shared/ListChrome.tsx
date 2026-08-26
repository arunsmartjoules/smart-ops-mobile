/**
 * Shared list chrome for the module tabs (Tickets, Incidents, …), built from
 * the Claude Design list artboard: a thunder header carrying the site title,
 * date range, actions and search, underline status tabs with a sliding
 * indicator, then a count line above the rows.
 *
 * One implementation, used by every module list — the per-module colour maps
 * live next to their screens.
 */
import React, { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import {
  ArrowUpDown,
  Calendar,
  ChevronDown,
  Filter,
  MapPin,
  RefreshCw,
  Search,
  SearchX,
  X,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { ds } from "@/constants/ds";
import { soRadius, soShadow } from "@/components/home/SiteOverview";

export { soRadius, soShadow };

export interface StatusChip {
  key: string;
  label: string;
  count?: number;
}

/** The mock's cubic-bezier(.4, 0, .2, 1) over 260ms. */
const MOTION = { duration: 260, easing: Easing.bezier(0.4, 0, 0.2, 1) };
const SLIDE_DISTANCE = 26;

/**
 * Slides the list in from the right when moving to a later tab and from the
 * left when moving back, matching the mock's slideFromRight/slideFromLeft.
 * Runs on the UI thread against the list container, so rows never re-render.
 */
export function useListSlide(seq: number, direction: number) {
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

/* ── Status tabs ─────────────────────────────────────────────────────────
   Text tabs on a hairline rule with a flame underline that slides between
   them — replaces the old pill chips.                                     */

export interface UnderlineTabTone {
  /** Label colour when selected. */
  active: string;
  /** Label colour when not selected. */
  inactive: string;
  /** Count colour when selected. */
  countActive: string;
  /** Count colour when not selected. */
  countInactive: string;
  /** The hairline the tabs sit on. */
  rule: string;
  /** The sliding bar. */
  indicator: string;
}

/** Thunder header: white on dark. */
export const TAB_TONE_DARK: UnderlineTabTone = {
  active: ds.white,
  inactive: ds.thunder[700],
  countActive: "#E9B7A8",
  countInactive: ds.thunder[700],
  rule: "rgba(255,255,255,0.24)",
  indicator: ds.flame[100],
};

/**
 * The hairline under the tab strip when it sits on the page canvas. Not a
 * design-system token — the artboard uses this one value for that rule.
 */
const CANVAS_RULE = "#E2E1E0";

/**
 * Page canvas, below a rounded thunder header. The rule is drawn by the strip
 * wrapper so it spans the full screen width rather than only the tab content,
 * so the tone itself carries none.
 */
export const TAB_TONE_CANVAS: UnderlineTabTone = {
  active: ds.carbon[100],
  inactive: ds.carbon[500],
  countActive: ds.flame[100],
  countInactive: ds.carbon[700],
  rule: "transparent",
  indicator: ds.flame[100],
};

/** White surfaces (cards, sheets): carbon on light. */
export const TAB_TONE_LIGHT: UnderlineTabTone = {
  active: ds.carbon[100],
  inactive: ds.carbon[500],
  countActive: ds.flame[100],
  countInactive: ds.carbon[600],
  rule: ds.carbon[900],
  indicator: ds.flame[100],
};

/**
 * Text tabs on a hairline with an indicator that slides between them. Shared by
 * the module list headers and the log-entry shift picker, so the motion and
 * geometry stay identical on dark and light surfaces.
 */
export function UnderlineTabs({
  chips,
  activeChip,
  onSelectChip,
  tone = TAB_TONE_DARK,
  gap = 20,
  minHeight = 36,
  contentContainerStyle,
}: {
  chips: StatusChip[];
  activeChip: string;
  onSelectChip: (key: string) => void;
  tone?: UnderlineTabTone;
  gap?: number;
  /** Tab row height; the list strip uses the artboard's 44px touch target. */
  minHeight?: number;
  contentContainerStyle?: object;
}) {
  const [layouts, setLayouts] = useState<Record<string, { x: number; w: number }>>(
    {},
  );
  const left = useSharedValue(0);
  const width = useSharedValue(0);

  useEffect(() => {
    const target = layouts[activeChip];
    if (!target) return;
    if (width.value === 0) {
      // First measurement — place the bar without sliding in from zero.
      left.value = target.x;
      width.value = target.w;
      return;
    }
    left.value = withTiming(target.x, MOTION);
    width.value = withTiming(target.w, MOTION);
  }, [activeChip, layouts, left, width]);

  const barStyle = useAnimatedStyle(() => ({
    left: left.value,
    width: width.value,
  }));

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.tabScroll, contentContainerStyle]}
    >
      <View>
        <View
          style={[styles.tabRow, { gap, borderBottomColor: tone.rule }]}
        >
          {chips.map((c) => {
            const on = c.key === activeChip;
            return (
              <TouchableOpacity
                key={c.key}
                onPress={() => onSelectChip(c.key)}
                activeOpacity={0.75}
                hitSlop={{ top: 6, bottom: 6 }}
                onLayout={(e) => {
                  const { x, width: w } = e.nativeEvent.layout;
                  setLayouts((prev) =>
                    prev[c.key]?.x === x && prev[c.key]?.w === w
                      ? prev
                      : { ...prev, [c.key]: { x, w } },
                  );
                }}
                style={[styles.tab, { minHeight }]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Text
                  style={[
                    styles.tabLabel,
                    {
                      fontWeight: on ? "600" : "400",
                      color: on ? tone.active : tone.inactive,
                    },
                  ]}
                >
                  {c.label}
                </Text>
                {c.count != null ? (
                  <Text
                    style={[
                      styles.tabCount,
                      { color: on ? tone.countActive : tone.countInactive },
                    ]}
                  >
                    {c.count}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
        <Animated.View
          style={[styles.tabBar, { backgroundColor: tone.indicator }, barStyle]}
        />
      </View>
    </ScrollView>
  );
}

const StatusTabs = UnderlineTabs;

/* ── Header ──────────────────────────────────────────────────────────────
   Thunder chrome carrying the title, site line, actions, search and the
   status chips — the list below it starts on the page canvas.            */

export function ModuleListHeader({
  topInset,
  siteName,
  dateLabel,
  onPressSite,
  onRefresh,
  refreshDisabled,
  onFilter,
  filterActive,
  search,
  onChangeSearch,
  searchPlaceholder = "Search ID, area or category",
  chips,
  activeChip,
  onSelectChip,
  showSiteIcon = true,
  tabPlacement = "header",
}: {
  topInset: number;
  siteName: string;
  dateLabel: string;
  onPressSite: () => void;
  onRefresh: () => void;
  refreshDisabled?: boolean;
  onFilter: () => void;
  filterActive?: boolean;
  /** Omit both to render the header without a search field. */
  search?: string;
  onChangeSearch?: (v: string) => void;
  searchPlaceholder?: string;
  chips: StatusChip[];
  activeChip: string;
  onSelectChip: (key: string) => void;
  /** The artboard drops the pin when the title IS the site name. */
  showSiteIcon?: boolean;
  /**
   * "header" keeps the tabs inside the thunder block; "canvas" is the
   * artboard's layout — a rounded header, then the tabs on the page below it.
   */
  tabPlacement?: "header" | "canvas";
}) {
  const onCanvas = tabPlacement === "canvas";
  const tabs = (
    <StatusTabs
      chips={chips}
      activeChip={activeChip}
      onSelectChip={onSelectChip}
      tone={onCanvas ? TAB_TONE_CANVAS : TAB_TONE_DARK}
      minHeight={onCanvas ? 44 : 36}
      contentContainerStyle={onCanvas ? styles.tabScrollCanvas : undefined}
    />
  );

  const header = (
    <View
      style={[
        styles.header,
        onCanvas && styles.headerRounded,
        onCanvas && !onChangeSearch && styles.headerRoundedNoSearch,
        { paddingTop: topInset },
      ]}
    >
      <View style={styles.titleRow}>
        <View style={styles.titleLead}>
          <TouchableOpacity
            onPress={onPressSite}
            activeOpacity={0.75}
            style={styles.siteRow}
            accessibilityRole="button"
            accessibilityLabel={`Site ${siteName}. Change filters`}
          >
            {showSiteIcon ? (
              <MapPin size={16} color={ds.sky[500]} strokeWidth={2.2} />
            ) : null}
            <Text style={styles.title} numberOfLines={1}>
              {siteName}
            </Text>
            <ChevronDown size={18} color={ds.sky[500]} strokeWidth={2} />
          </TouchableOpacity>
          <View style={styles.dateRow}>
            <Calendar size={12} color={ds.sky[500]} strokeWidth={2} />
            <Text style={styles.dateLabel} numberOfLines={1}>
              {dateLabel}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={onRefresh}
          disabled={refreshDisabled}
          activeOpacity={0.8}
          hitSlop={6}
          style={[styles.tile, refreshDisabled && { opacity: 0.4 }]}
          accessibilityRole="button"
          accessibilityLabel="Refresh"
        >
          <RefreshCw size={18} color={ds.white} strokeWidth={2} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onFilter}
          activeOpacity={0.8}
          hitSlop={6}
          style={[
            styles.tile,
            filterActive && { backgroundColor: ds.flame[100] },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Filters"
        >
          <Filter size={18} color={ds.white} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {onChangeSearch ? (
      <View style={[styles.searchWrap, onCanvas && styles.searchWrapCanvas]}>
        <View style={styles.search}>
          <Search size={16} color={ds.sky[500]} strokeWidth={2} />
          <TextInput
            value={search ?? ""}
            onChangeText={onChangeSearch}
            placeholder={searchPlaceholder}
            placeholderTextColor={ds.sky[500]}
            style={styles.searchInput}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {(search ?? "").length > 0 ? (
            <TouchableOpacity
              onPress={() => onChangeSearch?.("")}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <X size={17} color={ds.sky[500]} strokeWidth={2} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      ) : null}

      {onCanvas ? null : tabs}
    </View>
  );

  if (!onCanvas) return header;

  return (
    <>
      {header}
      <View style={styles.tabStrip}>{tabs}</View>
    </>
  );
}

/* ── Count line ──────────────────────────────────────────────────────────── */

export function ListCountLine({
  count,
  label,
  sortLabel,
  onSort,
}: {
  count: number;
  label: string;
  sortLabel: string;
  onSort: () => void;
}) {
  return (
    <View style={styles.countRow}>
      <Text style={styles.countValue}>{count}</Text>
      <Text style={styles.countLabel}>{label}</Text>
      <View style={{ flex: 1 }} />
      <TouchableOpacity
        onPress={onSort}
        hitSlop={8}
        activeOpacity={0.7}
        style={styles.sortRow}
        accessibilityRole="button"
        accessibilityLabel={`Sort: ${sortLabel}. Change`}
      >
        <ArrowUpDown size={14} color={ds.carbon[400]} strokeWidth={2} />
        <Text style={styles.sort}>{sortLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

/* ── Empty ───────────────────────────────────────────────────────────────── */

export function ListEmptyCard({
  label = "Nothing matches this filter",
  icon: Icon = SearchX,
}: {
  label?: string;
  icon?: LucideIcon;
}) {
  return (
    <View style={styles.empty}>
      <Icon size={26} color={ds.carbon[800]} strokeWidth={1.9} />
      <Text style={styles.emptyText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: ds.thunder[100] },
  /** The artboard's `border-radius: 0 0 26px 26px` on the thunder block. */
  headerRounded: {
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  headerRoundedNoSearch: { paddingBottom: 6 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 10,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  titleLead: { flex: 1, minWidth: 0 },
  siteRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: {
    flexShrink: 1,
    fontSize: 19,
    lineHeight: 22,
    fontWeight: "700",
    letterSpacing: 0.38,
    color: ds.white,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
  },
  dateLabel: { flexShrink: 1, fontSize: 11.5, color: ds.sky[500] },
  tile: {
    width: 36,
    height: 36,
    borderRadius: soRadius.tile,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },

  searchWrap: { paddingHorizontal: 20, paddingBottom: 12 },
  searchWrapCanvas: { paddingBottom: 20 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: soRadius.pill,
    paddingVertical: 11,
    paddingHorizontal: 14,
  },
  searchInput: {
    flex: 1,
    padding: 0,
    fontSize: 13.5,
    color: ds.white,
    letterSpacing: 0.13,
  },

  tabScroll: { paddingHorizontal: 20, paddingBottom: 6 },
  tabScrollCanvas: { paddingHorizontal: 20, paddingBottom: 0 },
  tabStrip: {
    backgroundColor: ds.pageBg,
    borderBottomWidth: 1,
    borderBottomColor: CANVAS_RULE,
  },
  tabRow: { flexDirection: "row", borderBottomWidth: 1 },
  tab: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tabLabel: { fontSize: 13, letterSpacing: 0.13 },
  tabCount: { fontSize: 10, fontWeight: "600" },
  tabBar: {
    position: "absolute",
    bottom: 0,
    height: 2.5,
    borderRadius: soRadius.pill,
  },

  countRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 7,
    paddingTop: 13,
    paddingHorizontal: 20,
    paddingBottom: 9,
  },
  countValue: { fontSize: 12.5, fontWeight: "600", color: ds.carbon[100] },
  countLabel: { fontSize: 12.5, color: ds.carbon[500] },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 4,
  },
  sort: { fontSize: 11, fontWeight: "600", color: ds.carbon[400] },

  empty: {
    backgroundColor: ds.white,
    borderRadius: soRadius.card,
    padding: 30,
    alignItems: "center",
    gap: 9,
    marginHorizontal: 4,
    ...soShadow,
  },
  emptyText: { fontSize: 12.5, color: ds.carbon[400] },
});
