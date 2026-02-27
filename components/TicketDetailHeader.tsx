import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { X, User } from "lucide-react-native";
import { type Ticket } from "@/services/TicketsService";

const STATUS_THEME: Record<string, { bg: string; text: string }> = {
  Open: { bg: "#fef2f2", text: "#dc2626" },
  Inprogress: { bg: "#eff6ff", text: "#2563eb" },
  Hold: { bg: "#fffbeb", text: "#d97706" },
  Waiting: { bg: "#f5f3ff", text: "#7c3aed" },
  Resolved: { bg: "#f0fdf4", text: "#16a34a" },
  Cancelled: { bg: "#f1f5f9", text: "#64748b" },
};

interface TicketDetailHeaderProps {
  ticket: Ticket;
  onClose: () => void;
}

const TicketDetailHeader = ({ ticket, onClose }: TicketDetailHeaderProps) => {
  const statusColors = STATUS_THEME[ticket.status] || STATUS_THEME.Open;

  return (
    <>
      {/* Drag Handle */}
      <View
        style={{
          alignSelf: "center",
          width: 40,
          height: 4,
          borderRadius: 999,
          backgroundColor: "#e2e8f0",
          marginBottom: 16,
        }}
      />

      {/* Header Row: Ticket No + Status + Close */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{
              backgroundColor: "#fef2f2",
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 8,
            }}
          >
            <Text
              style={{
                color: "#dc2626",
                fontWeight: "800",
                fontSize: 11,
                letterSpacing: 0.5,
              }}
            >
              {ticket.ticket_no}
            </Text>
          </View>
          <View
            style={{
              backgroundColor: statusColors.bg,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: 8,
            }}
          >
            <Text
              style={{
                color: statusColors.text,
                fontWeight: "800",
                fontSize: 11,
                letterSpacing: 0.5,
              }}
            >
              {ticket.status || "Unknown"}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={onClose}
          style={{
            width: 36,
            height: 36,
            backgroundColor: "#f1f5f9",
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X size={18} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {/* Title */}
      <Text
        className="text-slate-900 dark:text-slate-50"
        style={{
          fontSize: 20,
          fontWeight: "800",
          lineHeight: 26,
          marginBottom: 4,
        }}
        numberOfLines={2}
      >
        {ticket.title}
      </Text>

      {/* Assigned To */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 16,
          gap: 6,
        }}
      >
        <User size={12} color="#94a3b8" />
        <Text style={{ color: "#94a3b8", fontSize: 12, fontWeight: "600" }}>
          {ticket.assigned_to || "Unassigned"}
        </Text>
      </View>
    </>
  );
};

export default TicketDetailHeader;
