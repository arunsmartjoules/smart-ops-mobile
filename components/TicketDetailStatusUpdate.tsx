import React from "react";
import { View, Text, TouchableOpacity, TextInput } from "react-native";
import SearchableSelect, { type SelectOption } from "./SearchableSelect";
import { type Ticket } from "@/services/TicketsService";

const STATUS_THEME: Record<
  string,
  { bg: string; activeBg: string; text: string; activeText: string }
> = {
  Open: {
    bg: "#fef2f2",
    activeBg: "#dc2626",
    text: "#dc2626",
    activeText: "#ffffff",
  },
  Inprogress: {
    bg: "#eff6ff",
    activeBg: "#2563eb",
    text: "#2563eb",
    activeText: "#ffffff",
  },
  Hold: {
    bg: "#fffbeb",
    activeBg: "#d97706",
    text: "#d97706",
    activeText: "#ffffff",
  },
  Waiting: {
    bg: "#f5f3ff",
    activeBg: "#7c3aed",
    text: "#7c3aed",
    activeText: "#ffffff",
  },
  Resolved: {
    bg: "#f0fdf4",
    activeBg: "#16a34a",
    text: "#16a34a",
    activeText: "#ffffff",
  },
  Cancelled: {
    bg: "#f1f5f9",
    activeBg: "#475569",
    text: "#475569",
    activeText: "#ffffff",
  },
};

interface TicketDetailStatusUpdateProps {
  ticket: Ticket;
  updateStatus: string;
  setUpdateStatus: (s: string) => void;
  updateRemarks: string;
  setUpdateRemarks: (s: string) => void;
  updateArea: string;
  setUpdateArea: (s: string) => void;
  updateCategory: string;
  setUpdateCategory: (s: string) => void;
  areaOptions: SelectOption[];
  categoryOptions: SelectOption[];
  areasLoading?: boolean;
}

const TicketDetailStatusUpdate = ({
  ticket,
  updateStatus,
  setUpdateStatus,
  updateRemarks,
  setUpdateRemarks,
  updateArea,
  setUpdateArea,
  updateCategory,
  setUpdateCategory,
  areaOptions,
  categoryOptions,
  areasLoading,
}: TicketDetailStatusUpdateProps) => {
  const statuses = [
    "Inprogress",
    "Hold",
    "Waiting",
    "Resolved",
    "Cancelled",
    "Open",
  ];

  const filteredStatuses = statuses.filter((s) => {
    if (ticket.status === "Resolved") return s === "Open";
    if (s === "Resolved" && ticket.status !== "Inprogress") return false;
    if (s === "Open") return false;
    if (s === ticket.status) return false;
    return true;
  });

  const needsRemarks = ["Hold", "Cancelled", "Waiting", "Resolved"].includes(
    updateStatus,
  );

  return (
    <View style={{ marginBottom: 20 }}>
      {/* Section Label */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 14,
          gap: 8,
        }}
      >
        <Text
          className="text-slate-800 dark:text-slate-100"
          style={{
            fontWeight: "800",
            fontSize: 13,
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Change Status
        </Text>
        <View
          className="bg-slate-200 dark:bg-slate-700"
          style={{ flex: 1, height: 1 }}
        />
        <Text style={{ color: "#94a3b8", fontSize: 11, fontWeight: "600" }}>
          {ticket.status}
        </Text>
      </View>

      {/* Status Chips */}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: needsRemarks || updateStatus === "Inprogress" ? 16 : 0,
        }}
      >
        {filteredStatuses.map((s) => {
          const isActive = updateStatus === s;
          const theme = STATUS_THEME[s] || STATUS_THEME.Open;
          return (
            <TouchableOpacity
              key={s}
              onPress={() => {
                setUpdateStatus(s);
                if (["Hold", "Cancelled", "Waiting", "Resolved"].includes(s)) {
                  setUpdateRemarks("");
                }
              }}
              activeOpacity={0.7}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 9,
                borderRadius: 10,
                backgroundColor: isActive ? theme.activeBg : theme.bg,
                shadowColor: isActive ? theme.activeBg : "transparent",
                shadowOffset: { width: 0, height: isActive ? 4 : 0 },
                shadowOpacity: isActive ? 0.3 : 0,
                shadowRadius: isActive ? 8 : 0,
                elevation: isActive ? 4 : 0,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "700",
                  color: isActive ? theme.activeText : theme.text,
                }}
              >
                {s === "Open" ? "Reopen" : s}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Area & Category (for Inprogress) */}
      {updateStatus === "Inprogress" && (
        <View style={{ marginBottom: 8 }}>
          <SearchableSelect
            label="Select Area"
            placeholder="Choose an area..."
            value={updateArea}
            options={areaOptions}
            onChange={setUpdateArea}
            loading={areasLoading}
            searchPlaceholder="Search areas..."
            emptyMessage="No areas found"
          />
          <SearchableSelect
            label="Select Category"
            placeholder="Choose a category..."
            value={updateCategory}
            options={categoryOptions}
            onChange={setUpdateCategory}
            searchPlaceholder="Search categories..."
            emptyMessage="No categories found"
          />
        </View>
      )}

      {/* Remarks (for Hold, Cancelled, Waiting, Resolved) */}
      {needsRemarks && (
        <View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <Text
              className="text-slate-500 dark:text-slate-400"
              style={{
                fontSize: 10,
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 1.2,
                marginLeft: 2,
              }}
            >
              Remarks <Text style={{ color: "#dc2626" }}>*</Text>
            </Text>
            <Text
              style={{
                fontSize: 10,
                fontWeight: "600",
                color: updateRemarks.length > 200 ? "#dc2626" : "#94a3b8",
              }}
            >
              {updateRemarks.length}/300
            </Text>
          </View>
          <TextInput
            style={{
              backgroundColor: "#f8fafc",
              borderWidth: 1,
              borderColor: "#e2e8f0",
              borderRadius: 14,
              padding: 14,
              height: 100,
              fontWeight: "600",
              fontSize: 13,
              textAlignVertical: "top",
              lineHeight: 20,
            }}
            className="bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-50 border-slate-200 dark:border-slate-700"
            placeholder={
              updateStatus === "Resolved"
                ? "Describe the resolution..."
                : "Provide reason..."
            }
            placeholderTextColor="#94a3b8"
            multiline
            maxLength={300}
            value={updateRemarks}
            onChangeText={setUpdateRemarks}
          />
        </View>
      )}
    </View>
  );
};

export default TicketDetailStatusUpdate;
