import React, { useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { MapPin, Clock } from "lucide-react-native";
import { format } from "date-fns";
import { type Ticket } from "@/services/TicketsService";

interface TicketItemProps {
  item: Ticket;
  onPress: (item: Ticket) => void;
  onLongPress: (item: Ticket) => void;
  isCompact?: boolean;
}

const getPriorityColor = (priority?: string) => {
  const p = (priority || "").toLowerCase();
  if (p === "very high")
    return {
      bg: "bg-pink-50 dark:bg-pink-900/20",
      text: "text-pink-600 dark:text-pink-400",
      border: "border-pink-200 dark:border-pink-800/50",
    };
  if (p === "high")
    return {
      bg: "bg-red-50 dark:bg-red-900/20",
      text: "text-red-600 dark:text-red-400",
      border: "border-red-200 dark:border-red-800/50",
    };
  if (p === "medium")
    return {
      bg: "bg-orange-50 dark:bg-orange-900/20",
      text: "text-orange-600 dark:text-orange-400",
      border: "border-orange-200 dark:border-orange-800/50",
    };
  return {
    bg: "bg-slate-50 dark:bg-slate-800/50",
    text: "text-slate-500 dark:text-slate-400",
    border: "border-slate-200 dark:border-slate-700",
  };
};

const getStatusColor = (status?: string) => {
  if (status === "Open") return { bg: "bg-red-50 dark:bg-red-900/20", text: "text-red-600", dot: "#dc2626" };
  if (status === "Inprogress") return { bg: "bg-blue-50 dark:bg-blue-900/20", text: "text-blue-600", dot: "#2563eb" };
  return { bg: "bg-green-50 dark:bg-green-900/20", text: "text-green-600", dot: "#16a34a" };
};

const TicketItem = React.memo(
  ({ item, onPress, onLongPress, isCompact = false }: TicketItemProps) => {
    const handlePress = useCallback(() => {
      onPress(item);
    }, [item, onPress]);

    const handleLongPress = useCallback(() => {
      onLongPress(item);
    }, [item, onLongPress]);

    const priorityColors = getPriorityColor(item.priority);
    const statusColors = getStatusColor(item.status);

    return (
      <TouchableOpacity
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={500}
        activeOpacity={0.7}
        className={`bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 ${isCompact ? "mb-3 rounded-2xl" : "mb-4 rounded-3xl"}`}
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: isCompact ? 2 : 6 },
          shadowOpacity: isCompact ? 0.03 : 0.04,
          shadowRadius: isCompact ? 8 : 16,
          elevation: isCompact ? 1 : 2,
          borderWidth: 1,
        }}
      >
        <View className={isCompact ? "p-4" : "p-4 sm:p-5"}>
          {/* Title (hero) + Status pill */}
          <View className="flex-row items-start justify-between">
            {/* Title wrapper — bounded so a long title can wrap freely
                without ever pushing or resizing the status pill. */}
            <View className="flex-1 mr-3">
              <Text
                className={`text-slate-900 dark:text-slate-50 font-bold ${isCompact ? "text-[15px] leading-5" : "text-lg leading-7"}`}
                numberOfLines={2}
              >
                {item.title}
              </Text>
            </View>

            <View
              className={`flex-row items-center rounded-full flex-shrink-0 ${statusColors.bg} ${isCompact ? "px-2.5 py-1" : "px-3 py-1.5"}`}
            >
              <View
                className="rounded-full mr-1.5 w-1.5 h-1.5"
                style={{ backgroundColor: statusColors.dot }}
              />
              <Text
                className={`font-bold uppercase tracking-wide ${statusColors.text} ${isCompact ? "text-[9px]" : "text-[10px]"}`}
              >
                {item.status}
              </Text>
            </View>
          </View>

          {/* Quiet meta line: #ID · SITE · PRIORITY */}
          <View className="flex-row items-center mt-1.5">
            <Text
              className={`font-bold text-slate-500 dark:text-slate-400 flex-shrink-0 ${isCompact ? "text-[11px]" : "text-xs"}`}
              numberOfLines={1}
            >
              #{item.ticket_no}
            </Text>

            <View className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mx-2" />

            <Text
              className={`font-medium text-slate-400 dark:text-slate-500 flex-shrink ${isCompact ? "text-[11px]" : "text-xs"}`}
              numberOfLines={1}
            >
              {item.site_code}
            </Text>

            {item.priority ? (
              <>
                <View className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mx-2" />
                <Text
                  className={`font-bold uppercase tracking-wide flex-shrink-0 ${priorityColors.text} ${isCompact ? "text-[10px]" : "text-[11px]"}`}
                  numberOfLines={1}
                >
                  {item.priority}
                </Text>
              </>
            ) : null}
          </View>

          {/* Footer: created date + time · location (single line) */}
          <View
            className={`flex-row items-center border-t border-slate-100 dark:border-slate-800/80 ${isCompact ? "mt-3 pt-2.5" : "mt-3 pt-3"}`}
          >
            <Clock size={12} color="#94a3b8" />
            <Text
              className={`text-slate-500 dark:text-slate-400 font-medium ml-1.5 flex-shrink-0 ${isCompact ? "text-[11px]" : "text-xs"}`}
              numberOfLines={1}
            >
              {format(new Date(item.created_at), "MMM d, yyyy • h:mm a")}
            </Text>

            <View className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mx-2 flex-shrink-0" />

            <MapPin size={12} color="#94a3b8" />
            <Text
              className={`text-slate-500 dark:text-slate-400 font-medium ml-1.5 flex-1 ${isCompact ? "text-[11px]" : "text-xs"}`}
              numberOfLines={1}
            >
              {item.area_asset || item.location || "General Area"}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  },
);

TicketItem.displayName = "TicketItem";

export default TicketItem;
