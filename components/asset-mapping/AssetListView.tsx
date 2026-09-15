/**
 * Asset Mapping — screen 1, the Equipment Register.
 *
 * Header with the site picker, four live counters, search, filter pills (a
 * "⚠ Data Pending" pill appears only when some nameplate couldn't be read),
 * then one row per asset.
 */
import React, { useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  MapPin,
  Search,
  SearchX,
  WifiOff,
  X,
} from "lucide-react-native";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import { soShadow } from "@/components/shared/ListChrome";
import type { MappedAsset } from "@/services/AssetMappingService";
import { amPalette, statusChip, tint, typeMeta, type ListFilter } from "./lib";
import { Chip, Eyebrow, TypeBadge, usePalette } from "./ui";

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
  search: string;
  onSearch: (v: string) => void;
  filter: ListFilter;
  onFilter: (f: ListFilter) => void;
  onOpen: (asset: MappedAsset) => void;
}

export default function AssetListView(props: Props) {
  const styles = useStyles();
  const p = usePalette();
  const ds = useDs();
  const { assets, filter, search } = props;

  const counts = useMemo(
    () => ({
      total: assets.length,
      mapped: assets.filter((a) => a.mapping_status === "mapped").length,
      pending: assets.filter((a) => a.mapping_status === "pending").length,
      noAccess: assets.filter((a) => a.mapping_status === "no_access").length,
      dataPending: assets.filter((a) => a.data_pending).length,
    }),
    [assets],
  );

  const filters: ListFilter[] = ["All", "Pending", "Mapped", "No Access"];
  if (counts.dataPending > 0) filters.push("Data Pending");
  // The pill disappears once nothing is pending — don't strand the filter.
  const activeFilter = filters.includes(filter) ? filter : "All";

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((a) => {
      if (activeFilter === "Pending" && a.mapping_status !== "pending") return false;
      if (activeFilter === "Mapped" && a.mapping_status !== "mapped") return false;
      if (activeFilter === "No Access" && a.mapping_status !== "no_access") return false;
      if (activeFilter === "Data Pending" && !a.data_pending) return false;
      if (!q) return true;
      return [a.asset_name, a.asset_id, a.qr_id, a.equipment_type, a.asset_type]
        .some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [assets, activeFilter, search]);

  const header = (
    <View>
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Eyebrow style={{ marginBottom: 5 }}>Asset Directory</Eyebrow>
          <Text style={styles.title}>Equipment Register</Text>
        </View>
        <TouchableOpacity
          onPress={props.onPressSite}
          activeOpacity={0.8}
          style={styles.sitePicker}
          accessibilityRole="button"
          accessibilityLabel={`Site ${props.siteName}. Switch site`}
        >
          <Building2 size={14} color={p.sub} strokeWidth={2} />
          <Text style={styles.siteText} numberOfLines={1}>
            {props.siteName}
          </Text>
          <ChevronDown size={14} color={p.sub} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <View style={styles.stats}>
        <Stat value={counts.total} label="Total" color={p.info} />
        <Stat value={counts.mapped} label="Mapped" color={p.success} />
        <Stat value={counts.pending} label="Pending" color={p.muted} />
        <Stat value={counts.noAccess} label="No acc." color={p.warning} />
      </View>

      <View style={styles.search}>
        <Search size={16} color={p.sub} strokeWidth={2} />
        <TextInput
          value={search}
          onChangeText={props.onSearch}
          placeholder="Search name, ID or type"
          placeholderTextColor={p.muted}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {search ? (
          <TouchableOpacity onPress={() => props.onSearch("")} hitSlop={10} accessibilityLabel="Clear search">
            <X size={16} color={p.sub} strokeWidth={2} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        style={{ marginHorizontal: -20, marginBottom: 14 }}
      >
        {filters.map((f) => {
          const on = f === activeFilter;
          return (
            <TouchableOpacity
              key={f}
              onPress={() => props.onFilter(f)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[
                styles.filterPill,
                on
                  ? { backgroundColor: p.accent, borderColor: p.accent }
                  : { backgroundColor: p.card, borderColor: p.border },
              ]}
            >
              <Text style={[styles.filterText, { color: on ? p.onAccent : p.sub }]}>
                {f === "Data Pending" ? "⚠ Data Pending" : f}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {props.offline ? (
        <View style={[styles.offline, { backgroundColor: tint(p.warning, 0.1) }]}>
          <WifiOff size={14} color={p.warning} strokeWidth={2.2} />
          <Text style={[styles.offlineText, { color: p.warning }]}>
            You&apos;re offline. Asset mapping needs an internet connection.
          </Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: p.screen }}
      contentContainerStyle={[styles.content, { paddingTop: props.topInset + 10 }]}
      data={rows}
      keyExtractor={(a) => a.asset_id}
      ListHeaderComponent={header}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={props.refreshing} onRefresh={props.onRefresh} tintColor={ds.sky[100]} />
      }
      ListEmptyComponent={
        props.loading ? (
          <ActivityIndicator color={p.info} style={{ marginTop: 32 }} />
        ) : (
          <View style={styles.empty}>
            {props.error ? (
              <WifiOff size={24} color={p.muted} strokeWidth={1.9} />
            ) : (
              <SearchX size={24} color={p.muted} strokeWidth={1.9} />
            )}
            <Text style={styles.emptyText}>
              {props.error ??
                (assets.length === 0 ? "No assets at this site yet" : "Nothing matches this filter")}
            </Text>
          </View>
        )
      }
      renderItem={({ item }) => <AssetRow asset={item} onPress={() => props.onOpen(item)} />}
    />
  );
}

function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Eyebrow size={8.5} style={{ marginTop: 5, marginBottom: 9 }}>
        {label}
      </Eyebrow>
      <View style={[styles.statBar, { backgroundColor: color }]} />
    </View>
  );
}

function AssetRow({ asset, onPress }: { asset: MappedAsset; onPress: () => void }) {
  const styles = useStyles();
  const p = usePalette();
  const meta = typeMeta(asset, p.sub);
  const status = statusChip(asset, p);
  const place = [asset.floor, asset.location].filter(Boolean).join(" · ");
  const border =
    asset.mapping_status === "mapped"
      ? tint(p.success, 0.28)
      : asset.mapping_status === "no_access"
        ? tint(p.warning, 0.28)
        : p.border;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.row, { borderColor: border }]}
      accessibilityRole="button"
      accessibilityLabel={`${asset.asset_name}, ${status.label}`}
    >
      <TypeBadge abbr={meta.abbr} color={meta.color} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowName}>{asset.asset_name}</Text>
        <View style={styles.rowPlace}>
          <MapPin size={12} color={p.muted} strokeWidth={2} />
          <Text style={styles.rowPlaceText} numberOfLines={1}>
            {place || asset.asset_id}
          </Text>
        </View>
        <View style={styles.rowChips}>
          <Chip label={meta.label} color={meta.color} />
          <Chip label={status.label} color={status.color} />
          {asset.data_pending ? <Chip label="Data pending" color={p.warning} /> : null}
        </View>
      </View>
      <ChevronRight size={20} color={p.muted} strokeWidth={2} />
    </TouchableOpacity>
  );
}

const useStyles = makeThemedStyles((ds) => {
  const p = amPalette(ds);
  const card = {
    backgroundColor: p.card,
    borderWidth: 1,
    borderColor: p.border,
    ...(ds.isDark ? {} : soShadow),
  };
  return {
    content: { paddingHorizontal: 20, paddingBottom: 24 },
    titleRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 18 },
    title: { fontSize: 19, lineHeight: 23, fontWeight: "700", color: p.text },
    sitePicker: {
      ...card,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderRadius: 11,
      paddingVertical: 8,
      paddingHorizontal: 10,
      maxWidth: 150,
    },
    siteText: { flexShrink: 1, fontSize: 11, fontWeight: "600", color: p.text },
    stats: { flexDirection: "row", gap: 8, marginBottom: 14 },
    stat: {
      ...card,
      flex: 1,
      borderRadius: 12,
      paddingTop: 11,
      paddingHorizontal: 9,
      overflow: "hidden",
    },
    statValue: { fontSize: 22, lineHeight: 24, fontWeight: "700", color: p.text },
    statBar: { height: 3, marginHorizontal: -9 },
    search: {
      ...card,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      borderRadius: 12,
      paddingVertical: 11,
      paddingHorizontal: 13,
      marginBottom: 12,
    },
    searchInput: { flex: 1, padding: 0, fontSize: 13, fontWeight: "500", color: p.text },
    filters: { gap: 7, paddingHorizontal: 20 },
    filterPill: { paddingVertical: 8, paddingHorizontal: 13, borderRadius: 99, borderWidth: 1 },
    filterText: { fontSize: 11.5, fontWeight: "600" },
    offline: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      borderRadius: 11,
      paddingVertical: 9,
      paddingHorizontal: 12,
      marginBottom: 12,
    },
    offlineText: { flex: 1, fontSize: 11.5, fontWeight: "500" },
    row: {
      ...card,
      borderRadius: 14,
      padding: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 11,
    },
    rowName: { fontSize: 13.5, lineHeight: 17.5, fontWeight: "600", color: p.text, marginBottom: 4 },
    rowPlace: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 7 },
    rowPlaceText: { flex: 1, fontSize: 10.5, color: p.sub },
    rowChips: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
    empty: {
      ...card,
      borderRadius: 14,
      padding: 28,
      alignItems: "center",
      gap: 9,
    },
    emptyText: { fontSize: 12.5, color: p.sub, textAlign: "center" },
  };
});
