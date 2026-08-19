import React, { useCallback } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Clock, MapPin, TriangleAlert } from "lucide-react-native";
import { getInitials } from "@/utils/ticketVisuals";
import { ds } from "@/constants/ds";
import { soRadius, soShadow } from "@/components/home/SiteOverview";
import {
  getIncidentRca,
  getIncidentStatus,
  getIncidentTint,
} from "@/components/incidents/IncidentsUI";

export interface IncidentRow {
  id: string;
  incident_id: string;
  site_code: string;
  asset_location?: string | null;
  fault_symptom: string;
  status: string;
  rca_status: string;
  incident_created_time?: string | number | null;
  assigned_to?: string[] | string | null;
}

/** "1h 29m" / "2d 8h" / "5d" — same compact age format the ticket rows use. */
const formatAge = (value?: string | number | null) => {
  if (value == null) return "—";
  const started =
    typeof value === "number" ? value : Date.parse(String(value));
  if (Number.isNaN(started)) return "—";
  const mins = Math.max(0, Math.floor((Date.now() - started) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${String(mins % 60).padStart(2, "0")}m`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  if (days >= 3 || restHours === 0) return `${days}d`;
  return `${days}d ${restHours}h`;
};

interface IncidentItemProps {
  item: IncidentRow;
  assignee: string;
  onPress: (item: IncidentRow) => void;
}

const IncidentItem = React.memo(
  ({ item, assignee, onPress }: IncidentItemProps) => {
    const handlePress = useCallback(() => onPress(item), [item, onPress]);

    const status = getIncidentStatus(item.status);
    const rca = getIncidentRca(item.rca_status);
    const tone = getIncidentTint(item.status);
    const area = item.asset_location || item.site_code || "—";
    // An incident that isn't closed and has no RCA filed yet reads as urgent.
    const overdue = item.status !== "Resolved" && item.rca_status === "Open";

    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.85}
        style={styles.card}
      >
        <View style={styles.row}>
          <View style={[styles.iconWell, { backgroundColor: tone.tint }]}>
            <TriangleAlert size={17} color={tone.icon} strokeWidth={2.1} />
          </View>

          <View style={styles.body}>
            <View style={styles.badgeRow}>
              <Text style={styles.incidentNo}>
                {item.incident_id || "INCIDENT"}
              </Text>
              <View style={[styles.badge, { backgroundColor: status.bg }]}>
                <Text style={[styles.badgeText, { color: status.fg }]}>
                  {status.label}
                </Text>
              </View>
              {rca ? (
                <View style={[styles.badge, { backgroundColor: rca.bg }]}>
                  <Text style={[styles.badgeText, { color: rca.fg }]}>
                    {rca.label}
                  </Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.title} numberOfLines={2}>
              {item.fault_symptom}
            </Text>

            <View style={styles.metaRow}>
              <View style={styles.metaArea}>
                <MapPin size={12} color={ds.carbon[600]} strokeWidth={2} />
                <Text style={styles.metaText} numberOfLines={1}>
                  {area}
                </Text>
              </View>

              <View style={styles.metaAge}>
                <Clock size={12} color={ds.carbon[600]} strokeWidth={2} />
                <Text
                  style={[
                    styles.metaText,
                    overdue && { color: ds.flame[100], fontWeight: "600" },
                  ]}
                >
                  {formatAge(item.incident_created_time)}
                </Text>
              </View>

              <View style={{ flex: 1 }} />

              <View style={styles.assignee}>
                <Text style={styles.assigneeText}>
                  {assignee ? getInitials(assignee) : "—"}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  },
);

IncidentItem.displayName = "IncidentItem";

const styles = StyleSheet.create({
  card: {
    backgroundColor: ds.white,
    borderRadius: soRadius.card,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 7,
    marginHorizontal: 4,
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
  body: { flex: 1, minWidth: 0 },

  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 5,
  },
  incidentNo: {
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
  metaArea: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
    minWidth: 0,
  },
  metaAge: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { flexShrink: 1, fontSize: 10.5, color: ds.carbon[400] },
  assignee: {
    width: 24,
    height: 24,
    borderRadius: soRadius.pill,
    backgroundColor: ds.carbon[1000],
    alignItems: "center",
    justifyContent: "center",
  },
  assigneeText: { fontSize: 9, fontWeight: "600", color: ds.carbon[400] },
});

export default IncidentItem;
