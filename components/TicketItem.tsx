import React, { useCallback } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { MapPin, Clock, ChevronRight } from "lucide-react-native";
import { format } from "date-fns";
import { type Ticket } from "@/services/TicketsService";

interface TicketItemProps {
  item: Ticket;
  onPress: (item: Ticket) => void;
  onLongPress: (item: Ticket) => void;
}

const TicketItem = React.memo(
  ({ item, onPress, onLongPress }: TicketItemProps) => {
    const handlePress = useCallback(() => {
      onPress(item);
    }, [item, onPress]);

    const handleLongPress = useCallback(() => {
      onLongPress(item);
    }, [item, onLongPress]);

    return (
      <TouchableOpacity
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={500}
        activeOpacity={0.7}
        className="bg-white dark:bg-slate-900 rounded-2xl p-5 mb-4"
        style={{
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 12,
          elevation: 3,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 12,
          }}
        >
          <View style={{ flex: 1, marginRight: 16 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 6,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "900",
                  color: "#dc2626",
                  textTransform: "uppercase",
                  letterSpacing: 1.5,
                }}
              >
                {item.ticket_no}
              </Text>
              <View
                style={{
                  marginHorizontal: 8,
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: "#e2e8f0",
                }}
              />
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "900",
                  color: "#94a3b8",
                  textTransform: "uppercase",
                  letterSpacing: 1.5,
                }}
              >
                {item.site_code}
              </Text>
            </View>
            <Text
              className="text-slate-900 dark:text-slate-50"
              style={{
                fontWeight: "700",
                fontSize: 18,
                lineHeight: 28,
              }}
              numberOfLines={2}
            >
              {item.title}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderRadius: 999,
                backgroundColor:
                  item.status === "Open"
                    ? "#fef2f2"
                    : item.status === "Inprogress"
                      ? "#eff6ff"
                      : "#f0fdf4",
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: "900",
                  textTransform: "uppercase",
                  color:
                    item.status === "Open"
                      ? "#dc2626"
                      : item.status === "Inprogress"
                        ? "#2563eb"
                        : "#16a34a",
                }}
              >
                {item.status}
              </Text>
            </View>
            <View style={{ marginLeft: 8 }}>
              <ChevronRight size={16} color="#94a3b8" />
            </View>
          </View>
        </View>

        <View
          className="border-t border-slate-100 dark:border-slate-800"
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            paddingTop: 16,
            marginTop: 8,
          }}
        >
          <View
            style={{ width: "50%", flexDirection: "row", alignItems: "center" }}
          >
            <MapPin size={12} color="#94a3b8" style={{ marginRight: 6 }} />
            <Text
              className="text-slate-600 dark:text-slate-400"
              style={{ fontSize: 11, fontWeight: "500" }}
              numberOfLines={1}
            >
              {item.area_asset || item.location || "N/A"}
            </Text>
          </View>
          <View
            style={{ width: "50%", flexDirection: "row", alignItems: "center" }}
          >
            <Clock size={12} color="#94a3b8" style={{ marginRight: 6 }} />
            <Text
              className="text-slate-600 dark:text-slate-400"
              style={{ fontSize: 11, fontWeight: "500" }}
            >
              {format(new Date(item.created_at), "dd MMM, yy")}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  },
);

export default TicketItem;
