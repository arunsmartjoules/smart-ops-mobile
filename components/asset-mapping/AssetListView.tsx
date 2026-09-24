/**
 * Asset Mapping list — the same chrome as the Tickets and Incidents tabs:
 * rounded thunder header (site title, progress line, refresh / filter tiles,
 * search), underline status tabs on the canvas, the count + sort line, then
 * the card list.
 *
 * Search works like the PM tab: the header box filters live, the filter tile
 * (and the site title) opens the shared advanced filter sheet — keywords,
 * site, status, and the asset's type / side / criticality / floor — and a
 * "Scan asset" QR button narrows the list to the scanned asset.
 */
import React, { useCallback, useMemo, useRef, useState } from "react";
import { RefreshControl, Text, TouchableOpacity, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import Animated from "react-native-reanimated";
import { ClipboardCheck, QrCode, X } from "lucide-react-native";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import TicketSkeleton from "@/components/TicketSkeleton";
import AdvancedFilterModal, { type ExtraFilterGroup } from "@/components/AdvancedFilterModal";
import QRScannerModal, { type QRScannerRef } from "@/components/QRScannerModal";
import type { Site } from "@/services/SiteResolver";
import {
  ListCountLine,
  ListEmptyCard,
  ModuleListHeader,
  useListSlide,
  type StatusChip,
} from "@/components/shared/ListChrome";
import type { MappedAsset } from "@/services/AssetMappingService";
import AssetMappingItem from "./AssetMappingItem";
import { lastActivity, sideLabel, typeMeta, type ListFilter } from "./lib";

const SORTS = ["Name", "Type", "Recent"] as const;
type Sort = (typeof SORTS)[number];

/** Field filters from the advanced sheet; "all" = not filtered. */
interface FieldFilters {
  type: string;
  side: string;
  criticality: string;
  floor: string;
}
const NO_FIELD_FILTERS: FieldFilters = { type: "all", side: "all", criticality: "all", floor: "all" };

const STATUS_KEYS = ["pending", "review", "completed", "failed", "no_access"];
const STATUS_LABELS: Record<string, string> = {
  pending: "Open",
  review: "Review",
  completed: "Completed",
  failed: "Failed",
  no_access: "No access",
};

const typeOf = (a: MappedAsset) => a.equipment_type || a.asset_type || "";
const keyExtractor = (a: MappedAsset) => a.asset_id;

/** Distinct non-empty values, sorted, as pill options behind an "All". */
function optionsFrom(values: (string | null | undefined)[], format?: (v: string) => string) {
  const unique = [...new Set(values.map((v) => (v ?? "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );
  return [{ value: "all", label: "All" }, ...unique.map((v) => ({ value: v, label: format ? format(v) : v }))];
}

interface Props {
  topInset: number;
  siteName: string;
  sites: Site[];
  siteCode: string;
  onSelectSite: (site: Site) => void;
  user: any;
  assets: MappedAsset[];
  loading: boolean;
  error: string | null;
  offline: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onOpen: (asset: MappedAsset) => void;
}

export default function AssetListView({
  topInset,
  siteName,
  sites,
  siteCode,
  onSelectSite,
  user,
  assets,
  loading,
  error,
  offline,
  refreshing,
  onRefresh,
  onOpen,
}: Props) {
  const ds = useDs();
  const styles = useStyles();
  const [filter, setFilter] = useState<ListFilter>("pending");
  const [search, setSearch] = useState("");
  const [fields, setFields] = useState<FieldFilters>(NO_FIELD_FILTERS);
  const [qrAsset, setQrAsset] = useState<string | null>(null);
  const qrScannerRef = useRef<QRScannerRef>(null);

  // Advanced sheet drafts — applied together on "Apply Filters", like PM.
  const [showFilters, setShowFilters] = useState(false);
  const [tempSearch, setTempSearch] = useState("");
  const [tempStatus, setTempStatus] = useState<string>("pending");
  const [tempFields, setTempFields] = useState<FieldFilters>(NO_FIELD_FILTERS);
  const [sort, setSort] = useState<Sort>("Name");
  const [slide, setSlide] = useState({ seq: 0, dir: 1 });
  const slideStyle = useListSlide(slide.seq, slide.dir);

  const counts = useMemo(() => {
    const c = { pending: 0, review: 0, completed: 0, failed: 0, no_access: 0 };
    for (const a of assets) c[a.mapping_status] += 1;
    return c;
  }, [assets]);

  const chips = useMemo<StatusChip[]>(() => {
    const list: StatusChip[] = [
      { key: "pending", label: "Open", count: counts.pending },
      { key: "review", label: "Review", count: counts.review },
      { key: "completed", label: "Completed", count: counts.completed },
      { key: "failed", label: "Failed", count: counts.failed },
      { key: "no_access", label: "No access", count: counts.no_access },
    ];
    return list;
  }, [assets.length, counts]);

  const activeFilter: ListFilter = filter;

  const selectChip = useCallback(
    (key: string) => {
      if (key === activeFilter) return;
      const order = chips.map((c) => c.key);
      const dir = order.indexOf(key) >= order.indexOf(activeFilter) ? 1 : -1;
      setSlide((prev) => ({ seq: prev.seq + 1, dir }));
      setFilter(key as ListFilter);
    },
    [activeFilter, chips],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = assets.filter((a) => {
      if (activeFilter !== "all" && a.mapping_status !== activeFilter) return false;
      if (qrAsset && a.asset_name !== qrAsset) return false;
      if (fields.type !== "all" && typeOf(a) !== fields.type) return false;
      if (fields.side !== "all" && (a.category ?? "").trim() !== fields.side) return false;
      if (fields.criticality !== "all" && (a.criticality ?? "").trim() !== fields.criticality) return false;
      if (fields.floor !== "all" && (a.floor ?? "").trim() !== fields.floor) return false;
      if (!q) return true;
      // Keyword search covers the asset name and equipment type only; the
      // other fields have their own filters in the advanced sheet.
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
  }, [assets, activeFilter, search, sort, fields, qrAsset]);

  const listKey = [
    activeFilter,
    search.trim().toLowerCase(),
    fields.type,
    fields.side,
    fields.criticality,
    fields.floor,
    qrAsset ?? "",
    sort,
  ].join("|");

  const openFilters = () => {
    setTempSearch(search);
    setTempStatus(activeFilter);
    setTempFields(fields);
    setShowFilters(true);
  };

  const applyFilters = () => {
    setSearch(tempSearch);
    selectChip(chips.some((c) => c.key === tempStatus) ? tempStatus : "pending");
    setFields(tempFields);
    setShowFilters(false);
  };

  const extraFilters = useMemo<ExtraFilterGroup[]>(() => {
    const group = (key: keyof FieldFilters, label: string, options: { value: string; label: string }[]) => ({
      key,
      label,
      options,
      value: tempFields[key],
      onChange: (value: string) => setTempFields((f) => ({ ...f, [key]: value })),
    });
    return [
      group("type", "Equipment type", optionsFrom(assets.map(typeOf))),
      group(
        "side",
        "High side / Low side",
        optionsFrom(assets.map((a) => a.category), (v) => sideLabel({ category: v } as MappedAsset) ?? v),
      ),
      group("criticality", "Criticality", optionsFrom(assets.map((a) => a.criticality))),
      group("floor", "Floor", optionsFrom(assets.map((a) => a.floor))),
    ].filter((g) => g.options.length > 1);
  }, [assets, tempFields]);

  const filterActive =
    !!search.trim() || Object.values(fields).some((v) => v !== "all") || !!qrAsset;

  const onQrFound = useCallback(
    (assetName: string) => {
      setQrAsset(assetName);
      setSearch("");
      // One match — open it straight away, the scan's usual intent. There's
      // no "All" tab, so move to its status tab or the list would hide it.
      const hits = assets.filter((a) => a.asset_name === assetName);
      if (hits.length === 1) {
        selectChip(hits[0]!.mapping_status);
        onOpen(hits[0]!);
      }
    },
    [assets, onOpen, selectChip],
  );

  const renderItem = useCallback(
    ({ item }: { item: MappedAsset }) => <AssetMappingItem item={item} onPress={onOpen} />,
    [onOpen],
  );

  const progressLabel =
    assets.length > 0
      ? `${counts.completed} of ${assets.length} completed · ${counts.review} in review`
      : "Asset Mapping";

  return (
    <View style={{ flex: 1, backgroundColor: ds.pageBg }}>
      <ModuleListHeader
        topInset={topInset}
        siteName={siteName}
        dateLabel={progressLabel}
        subtitleIcon={ClipboardCheck}
        onRefresh={onRefresh}
        refreshDisabled={offline}
        onFilter={openFilters}
        filterActive={filterActive}
        search={search}
        onChangeSearch={setSearch}
        searchPlaceholder="Search asset name or equipment type"
        chips={chips}
        activeChip={activeFilter}
        onSelectChip={selectChip}
        showSiteIcon={false}
        tabPlacement="canvas"
      />

      <ListCountLine
        count={rows.length}
        label={rows.length === 1 ? "asset" : "assets"}
        sortLabel={sort}
        onSort={() => setSort((s) => SORTS[(SORTS.indexOf(s) + 1) % SORTS.length]!)}
      />

      {/* QR scan narrows the list to a single asset — same control as the PM tab. */}
      <View style={styles.qrRow}>
        {qrAsset ? (
          <View style={styles.qrChip}>
            <QrCode size={12} color={ds.flame[100]} />
            <Text style={styles.qrChipText} numberOfLines={1}>
              {qrAsset}
            </Text>
            <TouchableOpacity onPress={() => setQrAsset(null)} hitSlop={8} accessibilityLabel="Clear QR filter">
              <X size={14} color={ds.flame[100]} />
            </TouchableOpacity>
          </View>
        ) : null}
        <TouchableOpacity
          onPress={() => qrScannerRef.current?.open()}
          style={styles.qrScanBtn}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Scan asset QR code"
        >
          <QrCode size={15} color={ds.sky[100]} />
          <Text style={styles.qrScanLabel}>{qrAsset ? "Rescan" : "Scan asset"}</Text>
        </TouchableOpacity>
      </View>

      <Animated.View style={[{ flex: 1 }, slideStyle]}>
        <FlashList
          // FlashList 2.0.2 can keep showing recycled cells from the unfiltered
          // list after the data shrinks (the count updated, the rows didn't).
          // A fresh list per filter state sidesteps it and starts at the top.
          key={listKey}
          data={rows}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          drawDistance={600}
          ListEmptyComponent={
            loading ? (
              <TicketSkeleton />
            ) : (
              <ListEmptyCard
                label={
                  error ??
                  (offline
                    ? "You're offline — asset mapping needs a connection"
                    : assets.length === 0
                      ? "No assets at this site yet"
                      : "No assets match this filter")
                }
              />
            )
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ds.carbon[500]} />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }}
        />
      </Animated.View>

      <AdvancedFilterModal
        visible={showFilters}
        onClose={() => setShowFilters(false)}
        title="Filter Assets"
        showDate={false}
        tempSearch={tempSearch}
        setTempSearch={setTempSearch}
        searchPlaceholder="Asset name or equipment type"
        tempFromDate={null}
        setTempFromDate={() => {}}
        sites={sites}
        selectedSiteCode={siteCode}
        setSelectedSiteCode={(code) => {
          const site = sites.find((x) => x.site_code === code);
          if (site) onSelectSite(site);
        }}
        user={user}
        statusFilter={tempStatus}
        setStatusFilter={setTempStatus}
        statusOptions={STATUS_KEYS}
        statusOptionLabels={STATUS_LABELS}
        extraFilters={extraFilters}
        onReset={() => {
          setTempSearch("");
          setTempStatus("pending");
          setTempFields(NO_FIELD_FILTERS);
        }}
        applyAdvancedFilters={applyFilters}
      />

      <QRScannerModal ref={qrScannerRef} siteCode={siteCode} onClose={() => {}} onAssetFound={onQrFound} />
    </View>
  );
}

const useStyles = makeThemedStyles((ds) => ({
  qrRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  qrChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: ds.flame[1000],
    borderWidth: 1,
    borderColor: ds.flame[800],
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexShrink: 1,
  },
  qrChipText: { color: ds.flame[100], fontSize: 12, fontWeight: "600", flexShrink: 1, maxWidth: 200 },
  qrScanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: ds.carbon[900],
    backgroundColor: ds.white,
  },
  qrScanLabel: { fontSize: 11, fontWeight: "600", color: ds.sky[100] },
}));
