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
        className={`bg-white dark:bg-slate-900 mb-4 border-slate-200 dark:border-slate-800 ${isCompact ? "rounded-2xl" : "rounded-3xl"}`}
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: isCompact ? 2 : 6 },
          shadowOpacity: isCompact ? 0.03 : 0.04,
          shadowRadius: isCompact ? 8 : 16,
          elevation: isCompact ? 1 : 2,
          borderWidth: 1,
          borderColor: "rgba(226, 232, 240, 0.8)", // slate-200 faint
        }}
      >
        <View className={isCompact ? "p-3.5" : "p-4 sm:p-5"}>
          {/* Header Row: Ticket ID + Site Code & Priority */}
          <View className={`flex-row justify-between items-start ${isCompact ? "mb-2" : "mb-3"}`}>
            {/* Ticket Identity */}
            <View className={`flex-row items-center bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 ${isCompact ? "px-2 py-1" : "px-3 py-1.5"}`}>
              <Text className={`${isCompact ? "text-[10px]" : "text-[11px]"} font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest`}>
                {item.ticket_no}
              </Text>
              <View className={`${isCompact ? "mx-1.5 w-0.5 h-0.5" : "mx-2 w-1 h-1"} rounded-full bg-slate-300 dark:bg-slate-500`} />
              <Text className={`${isCompact ? "text-[10px]" : "text-[11px]"} font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest`}>
                {item.site_code}
              </Text>
            </View>

            {/* Priority Badge */}
            {item.priority && (
              <View className={`${isCompact ? "px-2 py-1" : "px-2.5 py-1.5"} rounded-lg border ${priorityColors.bg} ${priorityColors.border}`}>
                <Text className={`font-bold uppercase tracking-wider ${priorityColors.text} ${isCompact ? "text-[9px]" : "text-[10px]"}`}>
                  {item.priority}
                </Text>
              </View>
            )}
          </View>

          {/* Title & Status - Horizontal if compact, Vertical if full */}
          <View className={isCompact ? "mb-2.5" : "mb-4 mt-1"}>
            <Text
              className={`text-slate-900 dark:text-slate-50 font-bold ${isCompact ? "text-base leading-5 mb-1.5" : "text-lg leading-7 mb-2.5"}`}
              numberOfLines={isCompact ? 1 : 2}
            >
              {item.title}
            </Text>

            {/* Status Pill with Dot */}
            <View className="flex-row items-center self-start">
              <View className={`flex-row items-center rounded-full ${statusColors.bg} ${isCompact ? "px-2 py-1" : "px-3 py-1.5"}`}>
                <View className="rounded-full mr-2 w-1.5 h-1.5" style={{ backgroundColor: statusColors.dot }} />
                <Text className={`font-bold uppercase tracking-widest ${statusColors.text} ${isCompact ? "text-[9px]" : "text-[10px]"}`}>
                  {item.status}
                </Text>
              </View>
            </View>
          </View>

          {/* Footer: Details */}
          {!isCompact ? (
            <View className="flex-row items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800/80">
              {/* Location */}
              <View className="flex-row flex-1 items-center pr-2">
                <MapPin size={12} color="#94a3b8" />
                <Text
                  className="text-slate-500 dark:text-slate-400 text-xs font-semibold ml-1.5 flex-1"
                  numberOfLines={1}
                >
                  {item.area_asset || item.location || "General Area"}
                </Text>
              </View>

              {/* Date */}
              <View className="flex-row items-center pr-3 border-r border-slate-100 dark:border-slate-800">
                <Clock size={12} color="#94a3b8" />
                <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold ml-1.5 mr-3">
                  {format(new Date(item.created_at), "MMM d")}
                </Text>
              </View>

              {/* Assignee */}
              <View className="flex-row items-center bg-slate-50 dark:bg-slate-800 px-2.5 py-1 rounded-md ml-3">
                <Text
                  className="text-slate-600 dark:text-slate-300 text-[10px] font-bold"
                  numberOfLines={1}
                >
                  {item.assigned_to ? item.assigned_to.split(" ")[0] : "Unassigned"}
                </Text>
              </View>
            </View>
          ) : (
             <View className="flex-row items-center pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
                {/* Compact Date only, or minimal info */}
                <Clock size={10} color="#cbd5e1" />
                <Text className="text-slate-400 dark:text-slate-500 text-[10px] font-medium ml-1 flex-1">
                  {format(new Date(item.created_at), "MMM d, yyyy")}
                </Text>
                {/* Compact Location */}
                <Text className="text-slate-400 dark:text-slate-500 text-[10px] font-medium ml-2" numberOfLines={1}>
                   {item.area_asset || item.location || "General Area"}
                </Text>
             </View>
          )}
        </View>
      </TouchableOpacity>
    );
  },
);

export default TicketItem;
