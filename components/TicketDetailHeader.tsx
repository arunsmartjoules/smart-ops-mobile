import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { X, Flag } from "lucide-react-native";
import { type Ticket } from "@/services/TicketsService";
import {
  getCategoryVisual,
  getStatusVisual,
  getPriorityVisual,
} from "@/utils/ticketVisuals";

interface TicketDetailHeaderProps {
  ticket: Ticket;
  onClose: () => void;
}

const TicketDetailHeader = ({ ticket, onClose }: TicketDetailHeaderProps) => {
  const status = getStatusVisual(ticket.status);
  const priority = getPriorityVisual(ticket.priority);
  const cat = getCategoryVisual(ticket.category);
  const CatIcon = cat.Icon;

  return (
    <>
      {/* Drag Handle */}
      <View
        className="bg-slate-200 dark:bg-slate-700"
        style={{
          alignSelf: "center",
          width: 40,
          height: 4,
          borderRadius: 999,
          marginBottom: 14,
        }}
      />

      {/* Header Row: ID + Status + Priority · Close */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            <View className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">
              <Text className="text-slate-600 dark:text-slate-300 font-bold text-[11px]">
                {ticket.ticket_no}
              </Text>
            </View>
            <View
              className="flex-row items-center px-2 py-1 rounded-md"
              style={{ backgroundColor: status.tint }}
            >
              <View
                className="w-1.5 h-1.5 rounded-full mr-1.5"
                style={{ backgroundColor: status.color }}
              />
              <Text
                className="text-[10px] font-bold uppercase tracking-wide"
                style={{ color: status.color }}
              >
                {status.label}
              </Text>
            </View>
            {priority ? (
              <View
                className="flex-row items-center px-2 py-1 rounded-md"
                style={{ backgroundColor: priority.tint }}
              >
                <Flag size={9} color={priority.color} />
                <Text
                  className="ml-1 text-[10px] font-bold uppercase tracking-wide"
                  style={{ color: priority.color }}
                >
                  {priority.label}
                </Text>
              </View>
            ) : null}
          </View>

          <Text
            className="text-slate-900 dark:text-slate-50"
            style={{
              fontSize: 18,
              fontWeight: "800",
              lineHeight: 24,
              marginTop: 8,
              marginBottom: 6,
            }}
            numberOfLines={3}
          >
            {ticket.title}
          </Text>

          {ticket.category ? (
            <View
              className="flex-row items-center self-start px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800"
              style={{ maxWidth: "100%" }}
            >
              <CatIcon size={12} color={cat.color} />
              <Text
                className="ml-1.5 text-slate-500 dark:text-slate-400 text-[11px] font-semibold"
                numberOfLines={1}
              >
                {ticket.category}
              </Text>
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          onPress={onClose}
          className="w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded-lg items-center justify-center"
          style={{ marginTop: 2 }}
        >
          <X size={16} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      <View style={{ height: 14 }} />
    </>
  );
};

export default TicketDetailHeader;
