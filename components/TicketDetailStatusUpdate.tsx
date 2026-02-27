import React from "react";
import { View, Text, TouchableOpacity, TextInput } from "react-native";
import SearchableSelect, { type SelectOption } from "./SearchableSelect";
import { type Ticket } from "@/services/TicketsService";

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

  return (
    <>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <Text
          style={{
            color: "#0f172a",
            fontWeight: "900",
            fontSize: 14,
            textTransform: "uppercase",
            letterSpacing: 1.5,
            marginLeft: 4,
          }}
        >
          Update Status
        </Text>
        <Text style={{ color: "#94a3b8", fontSize: 11, fontWeight: "700" }}>
          Current: {ticket.status || "N/A"}
        </Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 24,
        }}
      >
        {filteredStatuses.map((s) => (
          <TouchableOpacity
            key={s}
            onPress={() => {
              setUpdateStatus(s);
              if (["Hold", "Cancelled", "Waiting", "Resolved"].includes(s)) {
                setUpdateRemarks("");
              }
            }}
            style={{
              paddingHorizontal: 18,
              paddingVertical: 10,
              borderRadius: 16,
              borderWidth: 1,
              backgroundColor: updateStatus === s ? "#dc2626" : "#ffffff",
              borderColor: updateStatus === s ? "#dc2626" : "#e2e8f0",
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: "700",
                color: updateStatus === s ? "#ffffff" : "#475569",
              }}
            >
              {s === "Open" ? "Reopen" : s}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {updateStatus === "Inprogress" && (
        <View style={{ marginBottom: 24 }}>
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

      {["Hold", "Cancelled", "Waiting", "Resolved"].includes(updateStatus) && (
        <View style={{ marginBottom: 24 }}>
          <Text
            className="text-slate-400 dark:text-slate-500"
            style={{
              fontSize: 10,
              fontWeight: "900",
              textTransform: "uppercase",
              letterSpacing: 1.5,
              marginBottom: 12,
              marginLeft: 4,
            }}
          >
            Mandatory Remarks
          </Text>
          <TextInput
            style={{
              backgroundColor: "#f8fafc",
              borderWidth: 1,
              borderColor: "#e2e8f0",
              borderRadius: 20,
              padding: 16,
              height: 120,
              fontWeight: "700",
              textAlignVertical: "top",
            }}
            className="bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-50 border-slate-200 dark:border-slate-700"
            placeholder={
              updateStatus === "Resolved"
                ? "Provide resolution details (mandatory)..."
                : "Provide reason (mandatory)..."
            }
            multiline
            value={updateRemarks}
            onChangeText={setUpdateRemarks}
          />
        </View>
      )}
    </>
  );
};

export default TicketDetailStatusUpdate;
