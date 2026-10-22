import React, { useCallback } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { type Ticket } from "@/services/TicketsService";
import { Bx } from "@/components/jo/Bx";
import { GlossFill, Avatar, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import {
  formatTicketAge,
  formatTicketCreated,
  isTicketLate,
  ticketCategoryIcon,
  ticketPriorityColors,
  ticketStatusColors,
} from "@/components/tickets/TicketsUI";
import { isSlaBreached } from "@/utils/ticketSla";

interface TicketItemProps {
  item: Ticket;
  onPress: (item: Ticket) => void;
  onLongPress: (item: Ticket) => void;
  isCompact?: boolean;
}

/**
 * Ticket row — artboard "tickets" list card (radius 22, padding 14): status-
 * tinted category well · id + status + priority pills · title · area and age ·
 * assignee initials. Long-press still opens the quick-cancel flow for Open
 * tickets (handled by the screen).
 */
const TicketItem = React.memo(
  ({ item, onPress, onLongPress }: TicketItemProps) => {
    const handlePress = useCallback(() => onPress(item), [item, onPress]);
    const handleLongPress = useCallback(() => onLongPress(item), [item, onLongPress]);

    const t = useJoTheme();
    const s = useStyles();
    const status = ticketStatusColors(t, item.status);
    const priority = ticketPriorityColors(t, item.priority);
    // No site-name fallback: the list is already scoped to one site, so it
    // would only repeat the header. No area → the pin is simply dropped.
    const area = item.area_asset || item.location || "";
    const late = isTicketLate(item);
    const slaBreached = isSlaBreached(item);
    const assignee = (item.assigned_to || "").trim();
    // Open tickets show when they were raised as well as how long ago;
    // everything else keeps the compact age.
    const createdLabel = item.status === "Open" ? formatTicketCreated(item.created_at) : "";
    const age = formatTicketAge(item.created_at);
    const timeLabel = createdLabel ? `${createdLabel} · ${age} ago` : age;

    return (
      <TouchableOpacity
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={500}
        activeOpacity={0.85}
        style={s.card}
        accessibilityRole="button"
        accessibilityLabel={`${item.ticket_no}, ${status.label}${priority ? `, ${priority.label} priority` : ""}. ${item.title}`}
        accessibilityHint={item.status === "Open" ? "Long press to cancel" : undefined}
      >
        <View style={[s.well, { backgroundColor: status.bg }]}>
          <Bx name={ticketCategoryIcon(item.category)} size={19} color={status.fg} />
        </View>

        <View style={s.body}>
          <View style={s.pills}>
            <Text style={s.id} numberOfLines={1}>
              {item.ticket_no}
            </Text>
            <View style={[s.pill, { backgroundColor: status.bg }]}>
              <Text style={[s.pillText, { color: status.fg }]}>{status.label}</Text>
            </View>
            {priority ? (
              <View style={[s.pill, { backgroundColor: priority.bg }]}>
                {/* Only the solid "Very high" fill glosses; the tints are translucent and render nothing. */}
                <GlossFill color={priority.bg} fg={priority.fg} radius={10} />
                <Text style={[s.pillText, { color: priority.fg }]}>{priority.label}</Text>
              </View>
            ) : null}
            {slaBreached ? (
              <View style={[s.pill, s.slaPill, { backgroundColor: t.bad }]}>
                <GlossFill color={t.bad} fg={t.onAccent} radius={10} />
                <Bx name="bx-error" size={11} color={t.onAccent} />
                <Text style={[s.pillText, { color: t.onAccent }]}>SLA breached</Text>
              </View>
            ) : null}
          </View>

          <Text style={s.title} numberOfLines={2}>
            {item.title}
          </Text>

          <View style={s.meta}>
            {area ? (
              <View style={s.metaItem}>
                <Bx name="bx-map" size={13} color={t.muted} />
                <Text style={s.metaText} numberOfLines={1}>
                  {area}
                </Text>
              </View>
            ) : null}
            <View style={[s.metaItem, { flexShrink: 0 }]}>
              <Bx name="bx-time-five" size={13} color={late ? t.bad : t.muted} />
              <Text style={[s.metaText, late && { color: t.bad }]} numberOfLines={1}>
                {timeLabel}
              </Text>
            </View>
          </View>
        </View>

        {assignee ? (
          <Avatar name={assignee} size={30} textSize={10.5} />
        ) : (
          <View style={s.unassigned} accessibilityLabel="Unassigned">
            <Bx name="bx-user" size={15} color={t.faint} />
          </View>
        )}
      </TouchableOpacity>
    );
  },
);

TicketItem.displayName = "TicketItem";

const useStyles = makeJoStyles((t) => ({
  card: {
    borderRadius: 22,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.cardBorder,
    padding: 14,
    flexDirection: "row",
    gap: 12,
    marginBottom: 8,
  },
  well: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  body: { flex: 1, minWidth: 0 },
  pills: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  id: { ...f.t(11.5, 500), color: t.muted },
  pill: {
    height: 20,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  slaPill: { flexDirection: "row", gap: 3 },
  pillText: { ...f.t(10.5, 600) },
  title: { ...f.t(14, 600), lineHeight: 18, color: t.ink, marginTop: 6 },
  meta: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: 12,
    rowGap: 4,
    marginTop: 7,
  },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0, flexShrink: 1 },
  metaText: { ...f.t(11.5), color: t.muted, flexShrink: 1 },
  unassigned: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: t.raised,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
}));

export default TicketItem;
