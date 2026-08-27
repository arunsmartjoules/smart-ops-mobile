import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Calendar, ChevronRight } from "lucide-react-native";
import { getInitials } from "@/utils/ticketVisuals";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import { soRadius, soShadow } from "@/components/home/SiteOverview";
import {
  formatPmDue,
  getPmFrequency,
  getPmStatus,
  parsePmProgress,
} from "@/components/pm/PMUI";

export interface PMRow {
  id: string;
  title: string;
  asset_id?: string | null;
  location?: string | null;
  frequency?: string | null;
  status: string;
  progress?: string | null;
  assigned_to_name?: string | null;
  start_due_date?: number | null;
  completed_on?: number | null;
}

interface PMItemProps {
  instance: PMRow;
  onPress: () => void;
  /** Show the completed date instead of the due date. */
  showCompletedDate?: boolean;
}

const PMItem = React.memo(
  ({ instance, onPress, showCompletedDate }: PMItemProps) => {
    const styles = useStyles();
    const ds = useDs();
    const status = getPmStatus(instance.status, ds);
    const frequency = getPmFrequency(instance.frequency, ds);
    const due = formatPmDue(
      instance.start_due_date,
      instance.completed_on,
      showCompletedDate || status.label === "Completed",
    );
    const percent =
      status.label === "In progress" ? parsePmProgress(instance.progress) : null;
    const person = (instance.assigned_to_name || "").trim();

    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        style={styles.card}
      >
        <View style={styles.body}>
          <View style={styles.badgeRow}>
            <Text style={styles.asset} numberOfLines={1}>
              {instance.asset_id || "ASSET"}
            </Text>
            <View style={[styles.badge, { backgroundColor: status.bg }]}>
              <Text style={[styles.badgeText, { color: status.fg }]}>
                {status.label}
              </Text>
            </View>
            {frequency ? (
              <View style={[styles.badge, { backgroundColor: frequency.bg }]}>
                <Text style={[styles.badgeText, { color: frequency.fg }]}>
                  {frequency.label}
                </Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.title} numberOfLines={1}>
            {instance.title || "PM task"}
          </Text>

          <View style={styles.dueRow}>
            <Calendar size={12} color={ds.carbon[600]} strokeWidth={2} />
            <Text
              style={[
                styles.due,
                due.late && { color: ds.flame[100], fontWeight: "600" },
              ]}
              numberOfLines={1}
            >
              {due.label}
            </Text>

            <View style={styles.person}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {person ? getInitials(person) : "—"}
                </Text>
              </View>
              <Text style={styles.personName} numberOfLines={1}>
                {person || "Unassigned"}
              </Text>
            </View>
          </View>

          {percent != null ? (
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${percent}%` }]} />
              </View>
              <Text style={styles.progressLabel}>{percent}%</Text>
            </View>
          ) : null}
        </View>

        <ChevronRight size={21} color={ds.carbon[800]} strokeWidth={2} />
      </TouchableOpacity>
    );
  },
  (prev, next) =>
    prev.instance.id === next.instance.id &&
    prev.instance.status === next.instance.status &&
    prev.instance.progress === next.instance.progress &&
    prev.instance.assigned_to_name === next.instance.assigned_to_name &&
    prev.showCompletedDate === next.showCompletedDate,
);

PMItem.displayName = "PMItem";

const useStyles = makeThemedStyles((ds) => ({
  card: {
    backgroundColor: ds.white,
    borderRadius: soRadius.card,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 7,
    marginHorizontal: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    ...soShadow,
  },
  body: { flex: 1, minWidth: 0 },

  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 4,
  },
  asset: {
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
    marginBottom: 6,
  },


  dueRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  due: { fontSize: 10.5, color: ds.carbon[400] },
  person: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginLeft: "auto",
    minWidth: 0,
    flexShrink: 1,
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: soRadius.pill,
    backgroundColor: ds.carbon[1000],
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 8, fontWeight: "600", color: ds.carbon[400] },
  personName: { flexShrink: 1, fontSize: 10.5, color: ds.carbon[400] },

  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 9,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: soRadius.pill,
    backgroundColor: ds.carbon[1000],
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: soRadius.pill,
    backgroundColor: ds.sky[100],
  },
  progressLabel: { fontSize: 9.5, fontWeight: "600", color: ds.carbon[400] },
}));

export default PMItem;
