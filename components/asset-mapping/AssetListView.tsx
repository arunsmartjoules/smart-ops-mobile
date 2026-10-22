/**
 * Asset Directory — artboard `r_assets`, under the shared Ops header (site
 * picker + sub-tabs; no date range — assets have no date dimension): four
 * count tiles (Total in the accent, then Mapped / Pending / No access), the
 * search field with the QR scan icon, the four-way segmented tabs and the
 * asset cards.
 *
 * Status grouping onto the tabs is documented in ./lib (TAB_OF). Inside a
 * grouped tab, sub-chips isolate one real status (In review / Approved,
 * To do / Read failed) whenever both halves have assets.
 *
 * Kept from the old list: live keyword search (asset name + equipment type),
 * QR scan narrowing the list to one asset (and opening it when it's the only
 * hit), the type / side / criticality / floor filters and the sort (filter
 * icon in the search field → sheet), swipe between tabs, and pull to
 * refresh. The site is picked in the Ops header.
 */
import { OpsTabs } from "@/components/jo/OpsTabs";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Bx } from "@/components/jo/Bx";
import {
  Chip,
  EmptyState,
  JoPage,
  Segmented,
  Shimmer,
  f,
  makeJoStyles,
  useJoTheme,
} from "@/components/jo/ui";
import { useNavInsets } from "@/components/jo/navInsets";
import QRScannerModal, { type QRScannerRef } from "@/components/QRScannerModal";
import type { Site } from "@/services/SiteResolver";
import type { MappedAsset, MappingStatus } from "@/services/AssetMappingService";
import AssetMappingItem from "./AssetMappingItem";
import AssetFilterSheet, {
  NO_FIELD_FILTERS,
  type FieldFilters,
  type FilterGroup,
  type Sort,
} from "./AssetFilterSheet";
import { Notice, SwipeTabs, useListSlide } from "./ui";
import { AM_TABS, SUB_STATUSES, TAB_OF, lastActivity, sideLabel, typeMeta, type AmTab } from "./lib";

const TAB_KEYS = AM_TABS.map((x) => x.key);
const typeOf = (a: MappedAsset) => a.equipment_type || a.asset_type || "";
const keyExtractor = (a: MappedAsset) => a.asset_id;

/** Distinct non-empty values, sorted, as chip options behind an "All". */
function optionsFrom(values: (string | null | undefined)[], format?: (v: string) => string) {
  const unique = [...new Set(values.map((v) => (v ?? "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  return [{ value: "all", label: "All" }, ...unique.map((v) => ({ value: v, label: format ? format(v) : v }))];
}

interface Props {
  sites: Site[];
  siteCode: string;
  assets: MappedAsset[];
  loading: boolean;
  error: string | null;
  offline: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (asset: MappedAsset) => void;
}

export default function AssetListView({
  sites,
  siteCode,
  assets,
  loading,
  error,
  offline,
  refreshing,
  onRefresh,
  onOpen,
}: Props) {
  const t = useJoTheme();
  const s = useStyles();
  const { clearance } = useNavInsets();
  // Opens on Pending — the work still to do — as the old list opened on Open.
  const [tab, setTab] = useState<AmTab>("pending");
  const [sub, setSub] = useState<MappingStatus | null>(null);
  const [search, setSearch] = useState("");
  const [fields, setFields] = useState<FieldFilters>(NO_FIELD_FILTERS);
  const [sort, setSort] = useState<Sort>("Name");
  const [qrAsset, setQrAsset] = useState<string | null>(null);
  const qrScannerRef = useRef<QRScannerRef>(null);

  const [showFilters, setShowFilters] = useState(false);
  const [draft, setDraft] = useState<FieldFilters>(NO_FIELD_FILTERS);
  const [slide, setSlide] = useState({ seq: 0, dir: 1 });
  const slideStyle = useListSlide(slide.seq, slide.dir);

  // Site switched (from the Ops header): a scanned asset and the field
  // filters belong to the old site's list. Reset during render so the new
  // list never paints filtered by them.
  const [filtersSite, setFiltersSite] = useState(siteCode);
  if (filtersSite !== siteCode) {
    setFiltersSite(siteCode);
    setQrAsset(null);
    setFields(NO_FIELD_FILTERS);
  }

  const counts = useMemo(() => {
    const c: Record<MappingStatus, number> = { pending: 0, review: 0, completed: 0, failed: 0, no_access: 0 };
    for (const a of assets) c[a.mapping_status] = (c[a.mapping_status] ?? 0) + 1;
    return c;
  }, [assets]);

  const groupCount = {
    all: assets.length,
    mapped: counts.review + counts.completed,
    pending: counts.pending + counts.failed,
    no_access: counts.no_access,
  };

  const selectTab = useCallback(
    (key: AmTab) => {
      setSub(null);
      if (key === tab) return;
      const dir = TAB_KEYS.indexOf(key) >= TAB_KEYS.indexOf(tab) ? 1 : -1;
      setSlide((prev) => ({ seq: prev.seq + 1, dir }));
      setTab(key);
    },
    [tab],
  );

  // Sub-chips only when the tab really holds two statuses.
  const subChips = (SUB_STATUSES[tab] ?? []).map((x) => ({ ...x, count: counts[x.key] }));
  const showSub = subChips.length > 1 && subChips.every((x) => x.count > 0);
  const activeSub = showSub ? sub : null;

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = assets.filter((a) => {
      if (tab !== "all" && TAB_OF[a.mapping_status] !== tab) return false;
      if (activeSub && a.mapping_status !== activeSub) return false;
      if (qrAsset && a.asset_name !== qrAsset) return false;
      if (fields.type !== "all" && typeOf(a) !== fields.type) return false;
      if (fields.side !== "all" && (a.category ?? "").trim() !== fields.side) return false;
      if (fields.criticality !== "all" && (a.criticality ?? "").trim() !== fields.criticality) return false;
      if (fields.floor !== "all" && (a.floor ?? "").trim() !== fields.floor) return false;
      if (!q) return true;
      // Keyword search covers the asset name and equipment type only; the
      // other fields have their own filters in the sheet.
      return [a.asset_name, a.equipment_type].some((v) => (v || "").toLowerCase().includes(q));
    });
    return [...filtered].sort((x, y) => {
      if (sort === "Recent") {
        return (Date.parse(lastActivity(y) ?? "") || 0) - (Date.parse(lastActivity(x) ?? "") || 0);
      }
      if (sort === "Type") {
        return typeMeta(x).label.localeCompare(typeMeta(y).label) || x.asset_name.localeCompare(y.asset_name);
      }
      return x.asset_name.localeCompare(y.asset_name);
    });
  }, [assets, tab, activeSub, search, sort, fields, qrAsset]);

  const listKey = [
    tab,
    activeSub ?? "",
    search.trim().toLowerCase(),
    fields.type,
    fields.side,
    fields.criticality,
    fields.floor,
    qrAsset ?? "",
    sort,
  ].join("|");

  const filterGroups = useMemo<FilterGroup[]>(
    () =>
      (
        [
          { key: "type", label: "Equipment type", options: optionsFrom(assets.map(typeOf)) },
          {
            key: "side",
            label: "High side / Low side",
            options: optionsFrom(assets.map((a) => a.category), (v) => sideLabel({ category: v } as MappedAsset) ?? v),
          },
          { key: "criticality", label: "Criticality", options: optionsFrom(assets.map((a) => a.criticality)) },
          { key: "floor", label: "Floor", options: optionsFrom(assets.map((a) => a.floor)) },
        ] as FilterGroup[]
      ).filter((g) => g.options.length > 1),
    [assets],
  );

  const fieldCount = Object.values(fields).filter((v) => v !== "all").length;
  const filterDot = fieldCount > 0 || sort !== "Name";

  const onQrFound = useCallback(
    (assetName: string) => {
      setQrAsset(assetName);
      setSearch("");
      // One match — open it straight away, the scan's usual intent, and move
      // to its tab so it's still listed when the detail closes.
      const hits = assets.filter((a) => a.asset_name === assetName);
      if (hits.length === 1) {
        selectTab(TAB_OF[hits[0]!.mapping_status]);
        onOpen(hits[0]!);
      }
    },
    [assets, onOpen, selectTab],
  );

  const renderItem = useCallback(
    ({ item }: { item: MappedAsset }) => <AssetMappingItem item={item} onPress={onOpen} />,
    [onOpen],
  );

  const tiles: { key: string; label: string; value: number; bg: string; fg: string }[] = [
    { key: "all", label: "Total", value: groupCount.all, bg: t.accent, fg: t.onAccent },
    { key: "mapped", label: "Mapped", value: groupCount.mapped, bg: t.card, fg: t.ok },
    { key: "pending", label: "Pending", value: groupCount.pending, bg: t.card, fg: t.warn },
    { key: "no_access", label: "No acc.", value: groupCount.no_access, bg: t.card, fg: t.bad },
  ];

  const hasExtraRow = showSub || !!qrAsset || fieldCount > 0;
  const noSite = !siteCode;

  /* ── body ── */
  let empty: React.ReactNode;
  if (loading) {
    empty = (
      <View style={{ gap: 8 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Shimmer key={i} height={92} radius={22} />
        ))}
      </View>
    );
  } else if (error && assets.length === 0) {
    empty = (
      <EmptyState
        icon="bx-error-circle"
        title="Couldn't load assets"
        sub={error}
        action={offline ? undefined : { label: "Try again", onPress: onRefresh }}
      />
    );
  } else if (offline && assets.length === 0) {
    empty = (
      <EmptyState icon="bx-wifi-off" title="You're offline" sub="Asset mapping needs a connection. Pull to refresh once you're back online." />
    );
  } else if (assets.length === 0) {
    empty = <EmptyState icon="bx-cube" title="No assets at this site yet" sub="Assets added on the web register show here." />;
  } else {
    const filtered = !!search.trim() || !!qrAsset || fieldCount > 0;
    empty = (
      <EmptyState
        icon="bx-search"
        title={filtered ? "No assets match" : "Nothing here"}
        sub={filtered ? "Try a different search or clear the filters." : "No assets at this site are in this tab."}
        action={
          filtered
            ? {
                label: "Clear filters",
                onPress: () => {
                  setSearch("");
                  setQrAsset(null);
                  setFields(NO_FIELD_FILTERS);
                },
              }
            : tab !== "all"
              ? { label: "Show all", onPress: () => selectTab("all") }
              : undefined
        }
      />
    );
  }

  return (
    <JoPage>
      {/* Ops sub-tabs: Tickets · PM · Site Logs · Incidents · Assets */}
      <OpsTabs showDate={false} />
      <View style={s.top}>
        <View style={s.tiles}>
          {tiles.map((c) => (
            <View
              key={c.key}
              style={[s.tile, { backgroundColor: c.bg }]}
              accessible
              accessibilityLabel={`${c.label}: ${loading ? "loading" : c.value}`}
            >
              <Text style={[s.tileValue, { color: c.fg }]} numberOfLines={1}>
                {loading ? "–" : c.value}
              </Text>
              <Text style={[s.tileLabel, { color: c.fg }]} numberOfLines={1}>
                {c.label}
              </Text>
            </View>
          ))}
        </View>

        <View style={s.search}>
          <Bx name="bx-search" size={18} color={t.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search name or equipment type"
            placeholderTextColor={t.faint}
            style={s.searchInput}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search assets"
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={8} accessibilityLabel="Clear search">
              <Bx name="bx-x" size={17} color={t.muted} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => {
              setDraft(fields);
              setShowFilters(true);
            }}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={filterDot ? "Filters, active" : "Filters"}
          >
            <Bx name="bx-filter-alt" size={19} color={filterDot ? t.accentInk : t.ink2} />
            {filterDot ? <View style={s.dot} /> : null}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => qrScannerRef.current?.open()}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Scan asset QR code"
          >
            <Bx name="bx-qr-scan" size={19} color={t.ink2} />
          </TouchableOpacity>
        </View>

        <Segmented items={AM_TABS} value={tab} onChange={selectTab} style={{ marginTop: 10 }} />

        {hasExtraRow ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: 10, marginHorizontal: -16 }}
            contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}
          >
            {showSub
              ? subChips.map((x) => (
                  <Chip
                    key={x.key}
                    label={x.label}
                    count={x.count}
                    height={32}
                    selected={activeSub === x.key}
                    onPress={() => setSub((cur) => (cur === x.key ? null : x.key))}
                  />
                ))
              : null}
            {qrAsset ? (
              <Chip
                label={qrAsset}
                icon="bx-qr-scan"
                iconColor={t.accentInk}
                height={32}
                onPress={() => setQrAsset(null)}
                count="×"
              />
            ) : null}
            {fieldCount > 0 ? (
              <Chip
                label={`${fieldCount} filter${fieldCount === 1 ? "" : "s"}`}
                icon="bx-filter-alt"
                iconColor={t.accentInk}
                height={32}
                onPress={() => setFields(NO_FIELD_FILTERS)}
                count="×"
              />
            ) : null}
          </ScrollView>
        ) : null}

        {offline && assets.length > 0 ? (
          <Notice
            tone="warn"
            icon="bx-wifi-off"
            text="Offline — showing the last loaded list. Documenting assets needs a connection."
            style={{ marginTop: 10 }}
          />
        ) : error && assets.length > 0 ? (
          <Notice tone="bad" icon="bx-error-circle" text={`Couldn't refresh: ${error}`} style={{ marginTop: 10 }} />
        ) : null}
      </View>

      {noSite && !loading ? (
        <View style={{ padding: 16 }}>
          <EmptyState
            icon="bx-buildings"
            title={sites.length ? "Pick a site" : "No site assigned"}
            sub={
              sites.length
                ? "Choose the site to walk from the header above."
                : "Ask an admin to add you to a site to map its assets."
            }
          />
        </View>
      ) : (
        <SwipeTabs keys={TAB_KEYS} active={tab} onSelect={selectTab} style={[{ flex: 1 }, slideStyle]}>
          <FlashList
            // FlashList 2.0.2 can keep showing recycled cells from the unfiltered
            // list after the data shrinks (the count updated, the rows didn't).
            // A fresh list per filter state sidesteps it and starts at the top.
            key={listKey}
            data={loading ? [] : rows}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            drawDistance={600}
            ListEmptyComponent={<View>{empty}</View>}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.muted} colors={[t.accent]} />
            }
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: clearance }}
          />
        </SwipeTabs>
      )}

      <AssetFilterSheet
        visible={showFilters}
        onClose={() => setShowFilters(false)}
        groups={filterGroups}
        draft={draft}
        onChangeDraft={setDraft}
        sort={sort}
        onChangeSort={setSort}
        onReset={() => {
          setDraft(NO_FIELD_FILTERS);
          setSort("Name");
        }}
        onApply={() => {
          setFields(draft);
          setShowFilters(false);
        }}
      />

      <QRScannerModal ref={qrScannerRef} siteCode={siteCode} onClose={() => {}} onAssetFound={onQrFound} />
    </JoPage>
  );
}

const useStyles = makeJoStyles((t) => ({
  top: { paddingHorizontal: 16 },
  tiles: { flexDirection: "row", gap: 6, marginTop: 12 },
  tile: {
    flex: 1,
    minWidth: 0,
    borderRadius: 18,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: t.cardBorder,
  },
  tileValue: { ...f.d(22, -0.03) },
  tileLabel: { ...f.t(11), marginTop: 5, opacity: 0.75 },
  search: {
    height: 44,
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: t.input,
    borderWidth: 1,
    borderColor: t.lineMid,
  },
  searchInput: { ...f.t(13.5), flex: 1, color: t.ink, paddingVertical: 0 },
  dot: {
    position: "absolute",
    top: -1,
    right: -2,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: t.accent,
  },
}));
