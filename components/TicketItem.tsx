import React, { useCallback } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Clock, MapPin } from "lucide-react-native";
import { type Ticket } from "@/services/TicketsService";
import { getCategoryVisual, getInitials } from "@/utils/ticketVisuals";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import {
  getTicketPriority,
  getTicketStatus,
  getTicketTint,
  soRadius,
  soShadow,
} from "@/components/tickets/TicketsUI";

interface TicketItemProps {
  item: Ticket;
  onPress: (item: Ticket) => void;
  onLongPress: (item: Ticket) => void;
  isCompact?: boolean;
}

/** "1h 29m" / "2d 8h" / "5d" — the mock's compact age format. */
const formatAge = (createdAt?: string) => {
  if (!createdAt) return "—";
  const started = Date.parse(createdAt);
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

const CLOSED = new Set(["Resolved", "Cancelled"]);

/**
 * A ticket only reads as late when the backend actually gave it a due date and
 * that date has passed while the ticket is still open — we don't infer an SLA
 * from age alone.
 */
const isLate = (item: Ticket) => {
  if (CLOSED.has(item.status)) return false;
  if (!item.due_date) return false;
  const due = Date.parse(item.due_date);
  return !Number.isNaN(due) && due < Date.now();
};

const TicketItem = React.memo(
  ({ item, onPress, onLongPress }: TicketItemProps) => {
    const handlePress = useCallback(() => onPress(item), [item, onPress]);
    const handleLongPress = useCallback(
      () => onLongPress(item),
      [item, onLongPress],
    );

    const styles = useStyles();
    const ds = useDs();
    const status = getTicketStatus(item.status, ds);
    const priority = getTicketPriority(item.priority, ds);
    const tone = getTicketTint(item.status, ds);
    const CatIcon = getCategoryVisual(item.category).Icon;
    const area = item.area_asset || item.location || item.site_name || "—";
    const late = isLate(item);
    const assignee = (item.assigned_to || "").trim();

    return (
      <TouchableOpacity
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={500}
        activeOpacity={0.85}
        style={styles.card}
      >
        <View style={styles.row}>
          <View style={[styles.iconWell, { backgroundColor: tone.tint }]}>
            <CatIcon size={17} color={tone.icon} strokeWidth={2.1} />
          </View>

          <View style={styles.body}>
            <View style={styles.badgeRow}>
              <Text style={styles.ticketNo}>{item.ticket_no}</Text>
              <View style={[styles.badge, { backgroundColor: status.bg }]}>
                <Text style={[styles.badgeText, { color: status.fg }]}>
                  {status.label}
                </Text>
              </View>
              {priority ? (
                <View style={[styles.badge, { backgroundColor: priority.bg }]}>
                  <Text style={[styles.badgeText, { color: priority.fg }]}>
                    {priority.label}
                  </Text>
                </View>
              ) : null}
            </View>

            <Text style={styles.title} numberOfLines={2}>
              {item.title}
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
                    late && { color: ds.flame[100], fontWeight: "600" },
                  ]}
                >
                  {formatAge(item.created_at)}
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

TicketItem.displayName = "TicketItem";

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
  body: { flex: 1, minWidth: 0 },

  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 5,
  },
  ticketNo: {
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
}));

export default TicketItem;
