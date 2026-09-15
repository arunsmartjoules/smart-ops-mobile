/**
 * Asset Mapping list — the same chrome as the Tickets and Incidents tabs:
 * rounded thunder header (site title, progress line, refresh / filter tiles,
 * search), underline status tabs on the canvas, the count + sort line, then
 * the card list.
 */
import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import Animated from "react-native-reanimated";
import { ClipboardCheck } from "lucide-react-native";
import { useDs } from "@/hooks/useDs";
import TicketSkeleton from "@/components/TicketSkeleton";
import {
  ListCountLine,
  ListEmptyCard,
  ModuleListHeader,
  useListSlide,
  type StatusChip,
} from "@/components/shared/ListChrome";
import type { MappedAsset } from "@/services/AssetMappingService";
import AssetMappingItem from "./AssetMappingItem";
import { lastActivity, typeMeta, type ListFilter } from "./lib";

const SORTS = ["Name", "Type", "Recent"] as const;
type Sort = (typeof SORTS)[number];

interface Props {
  topInset: number;
  siteName: string;
  onPressSite: () => void;
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
  onPressSite,
  assets,
  loading,
  error,
  offline,
  refreshing,
  onRefresh,
  onOpen,
}: Props) {
  const ds = useDs();
  const [filter, setFilter] = useState<ListFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("Name");
  const [slide, setSlide] = useState({ seq: 0, dir: 1 });
  const slideStyle = useListSlide(slide.seq, slide.dir);

  const counts = useMemo(() => {
    const c = { pending: 0, review: 0, completed: 0, no_access: 0, data_pending: 0 };
    for (const a of assets) {
      c[a.mapping_status] += 1;
      if (a.data_pending) c.data_pending += 1;
    }
    return c;
  }, [assets]);

  const chips = useMemo<StatusChip[]>(() => {
    const list: StatusChip[] = [
      { key: "all", label: "All", count: assets.length || undefined },
      { key: "pending", label: "Pending", count: counts.pending },
      { key: "review", label: "Review", count: counts.review },
      { key: "completed", label: "Completed", count: counts.completed },
      { key: "no_access", label: "No access", count: counts.no_access },
    ];
    if (counts.data_pending > 0) {
      list.push({ key: "data_pending", label: "Data pending", count: counts.data_pending });
    }
    return list;
  }, [assets.length, counts]);

  // The Data pending tab disappears once nothing is pending — fall back to All.
  const activeFilter: ListFilter = chips.some((c) => c.key === filter) ? filter : "all";

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
      if (activeFilter === "data_pending" && !a.data_pending) return false;
      if (activeFilter !== "all" && activeFilter !== "data_pending" && a.mapping_status !== activeFilter) {
        return false;
      }
      if (!q) return true;
      return [a.asset_name, a.asset_id, a.qr_id, a.equipment_type, a.asset_type, a.category, a.criticality, a.floor, a.location]
        .some((v) => (v || "").toLowerCase().includes(q));
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
  }, [assets, activeFilter, search, sort]);

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
        onPressSite={onPressSite}
        onRefresh={onRefresh}
        refreshDisabled={offline}
        onFilter={onPressSite}
        search={search}
        onChangeSearch={setSearch}
        searchPlaceholder="Search asset, ID, type or area"
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

      <Animated.View style={[{ flex: 1 }, slideStyle]}>
        <FlashList
          data={rows}
          renderItem={renderItem}
          keyExtractor={(item) => item.asset_id}
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
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ds.thunder[100]} />
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }}
        />
      </Animated.View>
    </View>
  );
}
