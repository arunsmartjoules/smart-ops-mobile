/**
 * One asset row in the Asset Mapping list — the same card as the ticket and
 * incident rows: status-tinted icon well, ID + badges, title, and a meta
 * line with the equipment / asset type + high / low side, time since last
 * activity and area. Criticality rides in the badge row.
 */
import React, { useCallback } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Box, Clock } from "lucide-react-native";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import { soRadius, soShadow } from "@/components/home/SiteOverview";
import type { MappedAsset } from "@/services/AssetMappingService";
import {
  criticalityTone,
  processingTone,
  formatAge,
  getMappingStatus,
  lastActivity,
  sideLabel,
  typeMeta,
} from "./lib";

const AssetMappingItem = React.memo(
  ({ item, onPress }: { item: MappedAsset; onPress: (item: MappedAsset) => void }) => {
    const handlePress = useCallback(() => onPress(item), [item, onPress]);
    const styles = useStyles();
    const ds = useDs();
    const status = getMappingStatus(item, ds);
    const meta = typeMeta(item);
    const pending = item.nameplate_processing ? processingTone(ds) : null;
    const critical = criticalityTone(item, ds);
    const typeLine = [item.equipment_type || item.asset_type || "Type not set", sideLabel(item)]
      .filter(Boolean)
      .join(" · ");
    const updated = lastActivity(item);

    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.85}
        style={styles.card}
        accessibilityRole="button"
        accessibilityLabel={`${item.asset_name}, ${status.label}`}
      >
        <View style={styles.row}>
          <View style={[styles.iconWell, { backgroundColor: status.bg }]}>
            <Text style={[styles.abbr, { color: status.fg }]}>{meta.abbr}</Text>
          </View>

          <View style={styles.body}>
            <View style={styles.badgeRow}>
              <Text style={styles.assetNo} numberOfLines={1}>
                {item.asset_id}
              </Text>
              <View style={[styles.badge, { backgroundColor: status.bg }]}>
                <Text style={[styles.badgeText, { color: status.fg }]}>{status.label}</Text>
              </View>
              {critical ? (
                <View style={[styles.badge, { backgroundColor: critical.bg }]}>
                  <Text style={[styles.badgeText, { color: critical.fg }]}>{critical.label}</Text>
                </View>
              ) : null}
              {pending ? (
                <View style={[styles.badge, { backgroundColor: pending.bg }]}>
                  <Text style={[styles.badgeText, { color: pending.fg }]}>{pending.label}</Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.title} numberOfLines={2}>
              {item.asset_name}
            </Text>

            <View style={styles.metaRow}>
              <View style={styles.metaArea}>
                <Box size={12} color={ds.carbon[600]} strokeWidth={2} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {typeLine}
                </Text>
              </View>
              {updated ? (
                <View style={styles.metaAge}>
                  <Clock size={12} color={ds.carbon[600]} strokeWidth={2} />
                  <Text style={styles.metaText}>{formatAge(updated)}</Text>
                </View>
              ) : null}
              <View style={{ flex: 1 }} />
              {item.location ? (
                <Text style={styles.areaText} numberOfLines={1}>
                  {item.location}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  },
);

AssetMappingItem.displayName = "AssetMappingItem";

export default AssetMappingItem;

const useStyles = makeThemedStyles((ds) => ({
  card: {
    backgroundColor: ds.white,
    borderRadius: soRadius.card,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 7,
    marginHorizontal: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ds.cardBorder,
    ...soShadow,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 11 },
  iconWell: {
    width: 34,
    height: 34,
    borderRadius: soRadius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  abbr: { fontSize: 9.5, fontWeight: "700", letterSpacing: 0.3 },
  body: { flex: 1, minWidth: 0 },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 7,
    rowGap: 4,
    marginBottom: 5,
  },
  assetNo: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.6,
    color: ds.carbon[500],
  },
  badge: { paddingVertical: 2, paddingHorizontal: 6, borderRadius: 4 },
  badgeText: {
    fontSize: 8.5,
    fontWeight: "600",
    letterSpacing: 0.68,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "500",
    letterSpacing: 0.13,
    color: ds.carbon[100],
    marginBottom: 7,
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  metaArea: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1, minWidth: 0 },
  metaAge: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { flexShrink: 1, fontSize: 10.5, color: ds.carbon[400] },
  areaText: { maxWidth: 110, fontSize: 10, fontWeight: "600", color: ds.carbon[500] },
}));
