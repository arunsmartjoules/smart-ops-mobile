import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { X } from "lucide-react-native";
import { type Ticket } from "@/services/TicketsService";

interface TicketDetailHeaderProps {
  ticket: Ticket;
  onClose: () => void;
}

const TicketDetailHeader = ({ ticket, onClose }: TicketDetailHeaderProps) => {
  return (
    <>
      <View
        style={{
          alignSelf: "center",
          width: 48,
          height: 5,
          borderRadius: 999,
          backgroundColor: "#e2e8f0",
          marginBottom: 14,
        }}
      />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              backgroundColor: "#fef2f2",
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 999,
              marginRight: 10,
            }}
          >
            <Text
              style={{
                color: "#dc2626",
                fontWeight: "900",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: 1.5,
              }}
            >
              {ticket.ticket_no}
            </Text>
          </View>
          <View
            style={{
              backgroundColor: "#f1f5f9",
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
            }}
          >
            <Text
              style={{
                color: "#475569",
                fontWeight: "800",
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: 1.2,
              }}
            >
              {ticket.status || "Unknown"}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={onClose}
          style={{
            width: 40,
            height: 40,
            backgroundColor: "#f8fafc",
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X size={20} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      <Text
        className="text-slate-900 dark:text-slate-50"
        style={{
          fontSize: 22,
          fontWeight: "900",
          lineHeight: 28,
          marginBottom: 6,
        }}
      >
        {ticket.title}
      </Text>
      <Text
        style={{
          color: "#94a3b8",
          fontSize: 12,
          fontWeight: "700",
          marginBottom: 18,
        }}
      >
        Tap a new status, fill details, then update.
      </Text>
    </>
  );
};

export default TicketDetailHeader;
