import React from "react";
import { View, Text } from "react-native";
import { User, Clock } from "lucide-react-native";
import { formatIST } from "@/utils/istDate";
import { type Ticket } from "@/services/TicketsService";
import { useAuth } from "@/contexts/AuthContext";
import { getInitials } from "@/utils/ticketVisuals";

interface TicketAssigneeProps {
  ticket: Ticket;
}

/**
 * Read-only assignee summary shown at the top of the ticket detail sheet.
 * Mirrors the assignment the operator's status update will set
 * (Inprogress/Cancelled stamp `assigned_to`); it does not itself mutate
 * assignment.
 */
const TicketAssignee = ({ ticket }: TicketAssigneeProps) => {
  const { user } = useAuth();
  const assignee = (ticket.assigned_to || "").trim();
  const currentName = (user?.full_name || user?.name || "").trim();
  const isMe =
    !!assignee &&
    !!currentName &&
    assignee.toLowerCase() === currentName.toLowerCase();

  const pickedUpAt = ticket.responded_at
    ? (() => {
        const d = new Date(ticket.responded_at as string);
        if (Number.isNaN(d.getTime())) return "";
        return `${formatIST(d, { hour: "2-digit", minute: "2-digit", hour12: false })} · ${formatIST(d, { day: "numeric", month: "short" })}`;
      })()
    : "";

  return (
    <View
      className="flex-row items-center bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700"
      style={{
        borderRadius: 14,
        paddingHorizontal: 12,
        paddingVertical: 11,
        gap: 11,
        marginBottom: 14,
      }}
    >
      {assignee ? (
        <View
          className="items-center justify-center"
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: "#16a34a26",
          }}
        >
          <Text style={{ color: "#16a34a", fontWeight: "700", fontSize: 13 }}>
            {getInitials(assignee)}
          </Text>
        </View>
      ) : (
        <View
          className="items-center justify-center border border-dashed border-slate-300 dark:border-slate-600"
          style={{ width: 36, height: 36, borderRadius: 18 }}
        >
          <User size={16} color="#94a3b8" />
        </View>
      )}

      <View style={{ flex: 1, minWidth: 0 }}>
        <View className="flex-row items-center" style={{ gap: 6 }}>
          <Text className="text-slate-400 dark:text-slate-500 text-[9px] font-bold uppercase tracking-widest">
            Assigned to
          </Text>
          {isMe ? (
            <View
              className="px-1.5 rounded"
              style={{ backgroundColor: "#16a34a26" }}
            >
              <Text
                style={{ color: "#16a34a", fontSize: 8.5, fontWeight: "700" }}
              >
                YOU
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          className={
            assignee
              ? "text-slate-900 dark:text-slate-50 font-semibold text-[13px] mt-0.5"
              : "text-slate-500 dark:text-slate-400 text-[13px] mt-0.5"
          }
          numberOfLines={1}
        >
          {assignee || "No technician yet"}
        </Text>
        {assignee && pickedUpAt ? (
          <View className="flex-row items-center mt-0.5">
            <Clock size={11} color="#94a3b8" />
            <Text className="text-slate-400 dark:text-slate-500 text-[10.5px] ml-1">
              Picked up {pickedUpAt}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
};

export default TicketAssignee;
