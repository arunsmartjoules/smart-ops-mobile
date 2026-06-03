import React, { useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Clock, Flag, UserCircle } from "lucide-react-native";
import { formatIST } from "@/utils/istDate";
import { type Ticket } from "@/services/TicketsService";
import {
  getCategoryVisual,
  getStatusVisual,
  getPriorityVisual,
  getInitials,
} from "@/utils/ticketVisuals";

interface TicketItemProps {
  item: Ticket;
  onPress: (item: Ticket) => void;
  onLongPress: (item: Ticket) => void;
  isCompact?: boolean;
}

const safeDate = (value?: string) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return `${formatIST(d, { day: "numeric", month: "short" })} · ${formatIST(
    d,
    { hour: "numeric", minute: "2-digit", hour12: true },
    "en-US",
  )}`;
};

const TicketItem = React.memo(
  ({ item, onPress, onLongPress, isCompact = false }: TicketItemProps) => {
    const handlePress = useCallback(() => {
      onPress(item);
    }, [item, onPress]);

    const handleLongPress = useCallback(() => {
      onLongPress(item);
    }, [item, onLongPress]);

    const cat = getCategoryVisual(item.category);
    const status = getStatusVisual(item.status);
    const priority = getPriorityVisual(item.priority);
    const assignee = (item.assigned_to || "").trim();
    const CatIcon = cat.Icon;

    return (
      <TouchableOpacity
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={500}
        activeOpacity={0.7}
        className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 mb-2.5 rounded-2xl"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.03,
          shadowRadius: 8,
          elevation: 1,
          borderWidth: 1,
        }}
      >
        <View className="p-3">
          {/* Top: category icon · title + id/site · priority */}
          <View className="flex-row items-start">
            <View
              className="w-9 h-9 rounded-[10px] items-center justify-center mr-2.5"
              style={{ backgroundColor: cat.tint }}
            >
              <CatIcon size={16} color={cat.color} />
            </View>

            <View className="flex-1 min-w-0 mr-2">
              <Text
                className="text-slate-900 dark:text-slate-50 font-semibold text-[14px] leading-5"
                numberOfLines={isCompact ? 1 : 2}
                ellipsizeMode="tail"
              >
                {item.title}
              </Text>
              <View className="flex-row items-center mt-1">
                <Text
                  className="text-slate-500 dark:text-slate-400 text-[11px] font-medium flex-shrink-0"
                  numberOfLines={1}
                >
                  #{item.ticket_no}
                </Text>
                <View className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600 mx-2" />
                <Text
                  className="text-slate-400 dark:text-slate-500 text-[11px] flex-shrink"
                  numberOfLines={1}
                >
                  {item.site_code}
                </Text>
              </View>
            </View>

            {priority ? (
              <View
                className="flex-row items-center rounded-md px-2 py-0.5 flex-shrink-0"
                style={{ backgroundColor: priority.tint }}
              >
                <Flag size={9} color={priority.color} />
                <Text
                  className="ml-1 text-[9px] font-bold uppercase tracking-wide"
                  style={{ color: priority.color }}
                >
                  {priority.label}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Foot: time · assignee — status chip */}
          <View className="flex-row items-center justify-between mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
            <View className="flex-row items-center flex-1 mr-2" style={{ gap: 10 }}>
              <View className="flex-row items-center flex-shrink-0">
                <Clock size={12} color="#94a3b8" />
                <Text className="text-slate-500 dark:text-slate-400 text-[10.5px] font-medium ml-1">
                  {safeDate(item.created_at)}
                </Text>
              </View>
              <View className="flex-row items-center flex-shrink min-w-0">
                {assignee ? (
                  <>
                    <View
                      className="w-[18px] h-[18px] rounded-full items-center justify-center mr-1.5"
                      style={{ backgroundColor: status.tint }}
                    >
                      <Text
                        className="text-[8px] font-bold"
                        style={{ color: status.color }}
                      >
                        {getInitials(assignee)}
                      </Text>
                    </View>
                    <Text
                      className="text-slate-500 dark:text-slate-400 text-[10.5px] font-medium flex-shrink"
                      numberOfLines={1}
                    >
                      {assignee}
                    </Text>
                  </>
                ) : (
                  <>
                    <UserCircle size={13} color="#94a3b8" />
                    <Text className="text-slate-400 dark:text-slate-500 text-[10.5px] font-medium ml-1">
                      Unassigned
                    </Text>
                  </>
                )}
              </View>
            </View>

            <View
              className="flex-row items-center rounded-md px-2 py-1 flex-shrink-0"
              style={{ backgroundColor: status.tint }}
            >
              <View
                className="w-1.5 h-1.5 rounded-full mr-1.5"
                style={{ backgroundColor: status.color }}
              />
              <Text
                className="text-[9px] font-bold uppercase tracking-wide"
                style={{ color: status.color }}
              >
                {status.label}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  },
);

TicketItem.displayName = "TicketItem";

export default TicketItem;
