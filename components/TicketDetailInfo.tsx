import React from "react";
import { View, Text } from "react-native";
import {
  MapPin,
  User,
  Building2,
  Calendar,
  Layers,
  FileText,
} from "lucide-react-native";
import { format } from "date-fns";
import { type Ticket } from "@/services/TicketsService";

interface TicketDetailInfoProps {
  ticket: Ticket;
}

const InfoCell = ({
  icon: Icon,
  label,
  value,
  iconColor,
}: {
  icon: any;
  label: string;
  value: string;
  iconColor: string;
}) => (
  <View
    style={{
      flex: 1,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      paddingVertical: 10,
    }}
  >
    <View
      style={{
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: `${iconColor}12`,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon size={15} color={iconColor} />
    </View>
    <View style={{ flex: 1 }}>
      <Text
        className="text-slate-400 dark:text-slate-500"
        style={{
          fontSize: 9,
          fontWeight: "700",
          textTransform: "uppercase",
          letterSpacing: 1.2,
          marginBottom: 2,
        }}
      >
        {label}
      </Text>
      <Text
        className="text-slate-800 dark:text-slate-100"
        style={{
          fontWeight: "700",
          fontSize: 13,
        }}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  </View>
);

const TicketDetailInfo = ({ ticket }: TicketDetailInfoProps) => {
  return (
    <View style={{ marginBottom: 20 }}>
      {/* 2-Column Grid */}
      <View
        className="bg-slate-50 dark:bg-slate-800/50"
        style={{
          borderRadius: 16,
          paddingHorizontal: 14,
          paddingVertical: 6,
        }}
      >
        {/* Row 1: Site + Location */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <InfoCell
            icon={Building2}
            label="Site"
            value={ticket.site_name || ticket.site_code || "N/A"}
            iconColor="#dc2626"
          />
          <InfoCell
            icon={MapPin}
            label="Location"
            value={ticket.location || "General Area"}
            iconColor="#f59e0b"
          />
        </View>

        {/* Divider */}
        <View
          className="bg-slate-200 dark:bg-slate-700"
          style={{ height: 1, marginHorizontal: 4 }}
        />

        {/* Row 2: Created By + Date */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <InfoCell
            icon={User}
            label="Created By"
            value={ticket.created_user || "N/A"}
            iconColor="#3b82f6"
          />
          <InfoCell
            icon={Calendar}
            label="Created"
            value={
              ticket.created_at
                ? format(new Date(ticket.created_at), "dd MMM yy, HH:mm")
                : "N/A"
            }
            iconColor="#8b5cf6"
          />
        </View>
      </View>

      {/* Conditional Cards: Customer Inputs / Internal Remarks */}
      {(ticket.customer_inputs || ticket.internal_remarks) && (
        <View style={{ marginTop: 12, gap: 10 }}>
          {ticket.customer_inputs && (
            <View
              className="bg-amber-50 dark:bg-amber-900/20"
              style={{
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                flexDirection: "row",
                gap: 10,
                borderLeftWidth: 3,
                borderLeftColor: "#f59e0b",
              }}
            >
              <Layers size={14} color="#f59e0b" style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 9,
                    fontWeight: "700",
                    textTransform: "uppercase",
                    letterSpacing: 1.2,
                    color: "#d97706",
                    marginBottom: 3,
                  }}
                >
                  Customer Inputs
                </Text>
                <Text
                  className="text-slate-700 dark:text-slate-200"
                  style={{ fontSize: 13, fontWeight: "600", lineHeight: 18 }}
                >
                  {ticket.customer_inputs}
                </Text>
              </View>
            </View>
          )}

          {ticket.internal_remarks && (
            <View
              className="bg-indigo-50 dark:bg-indigo-900/20"
              style={{
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
                flexDirection: "row",
                gap: 10,
                borderLeftWidth: 3,
                borderLeftColor: "#6366f1",
              }}
            >
              <FileText size={14} color="#6366f1" style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 9,
                    fontWeight: "700",
                    textTransform: "uppercase",
                    letterSpacing: 1.2,
                    color: "#6366f1",
                    marginBottom: 3,
                  }}
                >
                  Internal Remarks
                </Text>
                <Text
                  className="text-slate-700 dark:text-slate-200"
                  style={{ fontSize: 13, fontWeight: "600", lineHeight: 18 }}
                >
                  {ticket.internal_remarks}
                </Text>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

export default TicketDetailInfo;
