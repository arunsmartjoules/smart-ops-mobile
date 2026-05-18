import React from "react";
import { View, Text } from "react-native";
import {
  MapPin,
  User,
  Building2,
  Calendar,
  Layers,
  FileText,
  Phone,
  Clock3,
} from "lucide-react-native";
import { formatIST } from "@/utils/istDate";
import { type Ticket } from "@/services/TicketsService";

const IST_DT_OPTS: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "short",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

interface TicketDetailInfoProps {
  ticket: Ticket;
}

interface Cell {
  icon: any;
  label: string;
  value: string;
  full?: boolean;
}

const InfoCell = ({
  cell,
  rightBorder,
  bottomBorder,
}: {
  cell: Cell;
  rightBorder: boolean;
  bottomBorder: boolean;
}) => {
  const Icon = cell.icon;
  return (
    <View
      className="border-slate-200 dark:border-slate-700/70"
      style={{
        flex: cell.full ? undefined : 1,
        width: cell.full ? "100%" : undefined,
        flexDirection: "row",
        alignItems: "flex-start",
        gap: 8,
        paddingHorizontal: 12,
        paddingVertical: 11,
        borderRightWidth: rightBorder ? 1 : 0,
        borderBottomWidth: bottomBorder ? 1 : 0,
      }}
    >
      <Icon size={14} color="#94a3b8" style={{ marginTop: 1 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          className="text-slate-400 dark:text-slate-500"
          style={{
            fontSize: 9,
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: 1,
            marginBottom: 2,
          }}
        >
          {cell.label}
        </Text>
        <Text
          className="text-slate-800 dark:text-slate-100"
          style={{ fontWeight: "700", fontSize: 12 }}
          numberOfLines={2}
        >
          {cell.value}
        </Text>
      </View>
    </View>
  );
};

const TicketDetailInfo = ({ ticket }: TicketDetailInfoProps) => {
  const formatDateTime = (value?: string) => {
    if (!value) return "N/A";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? "N/A"
      : formatIST(parsed, IST_DT_OPTS);
  };

  const cells: Cell[] = [
    {
      icon: Building2,
      label: "Site",
      value: ticket.site_name || ticket.site_code || "N/A",
    },
    {
      icon: MapPin,
      label: "Location",
      value: ticket.location || "General Area",
    },
    {
      icon: User,
      label: "Created by",
      value: ticket.created_user || "N/A",
    },
    {
      icon: Calendar,
      label: "Created",
      value: ticket.created_at
        ? formatIST(new Date(ticket.created_at), IST_DT_OPTS)
        : "N/A",
    },
  ];

  if (ticket.status === "Resolved") {
    cells.push({
      icon: Clock3,
      label: "Responded at",
      value: formatDateTime(ticket.responded_at),
    });
    cells.push({
      icon: Clock3,
      label: "Resolved at",
      value: formatDateTime(ticket.resolved_at),
    });
  } else if (ticket.status === "Inprogress") {
    cells.push({
      icon: Clock3,
      label: "Responded at",
      value: formatDateTime(ticket.responded_at),
    });
  }

  cells.push({
    icon: Phone,
    label: "Contact",
    value: ticket.contact_number || "N/A",
    full: true,
  });

  // Build rows: full cells take their own row, otherwise pair them up.
  const rows: Cell[][] = [];
  let pending: Cell[] = [];
  for (const cell of cells) {
    if (cell.full) {
      if (pending.length) {
        rows.push(pending);
        pending = [];
      }
      rows.push([cell]);
    } else {
      pending.push(cell);
      if (pending.length === 2) {
        rows.push(pending);
        pending = [];
      }
    }
  }
  if (pending.length) rows.push(pending);

  return (
    <View style={{ marginBottom: 18 }}>
      <View
        className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/70"
        style={{ borderRadius: 14, overflow: "hidden" }}
      >
        {rows.map((row, rIdx) => {
          const isLastRow = rIdx === rows.length - 1;
          return (
            <View key={rIdx} style={{ flexDirection: "row" }}>
              {row.map((cell, cIdx) => (
                <InfoCell
                  key={`${cell.label}-${cIdx}`}
                  cell={cell}
                  rightBorder={!cell.full && row.length === 2 && cIdx === 0}
                  bottomBorder={!isLastRow}
                />
              ))}
              {row.length === 1 && !row[0].full ? (
                <View style={{ flex: 1 }} />
              ) : null}
            </View>
          );
        })}
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
                <Text className="text-amber-600 dark:text-amber-400 font-bold uppercase text-[9px] tracking-widest mb-1">
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
                <Text className="text-indigo-600 dark:text-indigo-400 font-bold uppercase text-[9px] tracking-widest mb-1">
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
