import React from "react";
import { View, Text } from "react-native";
import {
  MapPin,
  Briefcase,
  Layout as LayoutIcon,
  Calendar,
  Layers,
} from "lucide-react-native";
import { format } from "date-fns";
import { type Ticket } from "@/services/TicketsService";

interface TicketDetailInfoProps {
  ticket: Ticket;
}

const InfoRow = ({
  Icon,
  label,
  value,
  iconColor,
  marginBottom = 20,
}: {
  Icon: any;
  label: string;
  value: string;
  iconColor: string;
  marginBottom?: number;
}) => (
  <View style={{ flexDirection: "row", alignItems: "center", marginBottom }}>
    <View
      className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
      style={{
        width: 40,
        height: 40,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 16,
      }}
    >
      <Icon size={18} color={iconColor} />
    </View>
    <View style={{ flex: 1 }}>
      <Text
        className="text-slate-400 dark:text-slate-500"
        style={{
          fontSize: 10,
          fontWeight: "900",
          textTransform: "uppercase",
          letterSpacing: 1.5,
        }}
      >
        {label}
      </Text>
      <Text
        className="text-slate-900 dark:text-slate-50"
        style={{
          fontWeight: "700",
          fontSize: 14,
          marginTop: 2,
        }}
      >
        {value}
      </Text>
    </View>
  </View>
);

const TicketDetailInfo = ({ ticket }: TicketDetailInfoProps) => {
  return (
    <View
      className="bg-slate-50 dark:bg-slate-800"
      style={{
        borderRadius: 22,
        padding: 20,
        marginBottom: 26,
      }}
    >
      <InfoRow
        Icon={LayoutIcon}
        label="Site Name"
        value={ticket.site_name || "N/A"}
        iconColor="#ef4444"
      />
      <InfoRow
        Icon={MapPin}
        label="Location"
        value={ticket.location || "General Area"}
        iconColor="#ef4444"
      />
      <InfoRow
        Icon={Briefcase}
        label="Created By"
        value={ticket.created_user || "N/A"}
        iconColor="#3b82f6"
      />
      <InfoRow
        Icon={LayoutIcon}
        label="Site Code"
        value={ticket.site_code || "N/A"}
        iconColor="#10b981"
      />
      <InfoRow
        Icon={Calendar}
        label="Created Date & Time"
        value={
          ticket.created_at
            ? format(new Date(ticket.created_at), "dd MMM yyyy, HH:mm")
            : "N/A"
        }
        iconColor="#8b5cf6"
        marginBottom={
          ticket.customer_inputs || ticket.internal_remarks ? 20 : 0
        }
      />

      {ticket.customer_inputs && (
        <InfoRow
          Icon={Layers}
          label="Customer Inputs"
          value={ticket.customer_inputs}
          iconColor="#f59e0b"
          marginBottom={ticket.internal_remarks ? 20 : 0}
        />
      )}

      {ticket.internal_remarks && (
        <InfoRow
          Icon={Briefcase}
          label="Internal Remarks"
          value={ticket.internal_remarks}
          iconColor="#6366f1"
          marginBottom={0}
        />
      )}
    </View>
  );
};

export default TicketDetailInfo;
