import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Image,
} from "react-native";
import {
  MessageSquare,
  Image as ImageIcon,
  Video,
  MessageCircle,
} from "lucide-react-native";
import TicketsService from "../services/TicketsService";
import { format } from "date-fns";

interface LineItem {
  ticket_id: string;
  image_url?: string;
  video_url?: string;
  message_text?: string;
  message_id?: string;
  created_at: string;
}

interface TicketLineItemsProps {
  ticketId: string;
}

const TicketLineItems = ({ ticketId }: TicketLineItemsProps) => {
  const [items, setItems] = useState<LineItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ticketId) {
      fetchItems();
    }
  }, [ticketId]);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const res = await TicketsService.getLineItems(ticketId);
      if (res.success) {
        setItems(res.data || []);
      }
    } catch (error) {
      console.error("Failed to fetch line items:", error);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = (item: LineItem, index: number) => {
    const isLast = index === items.length - 1;
    const isImage = !!item.image_url;
    const isVideo = !!item.video_url;

    return (
      <View key={index} style={{ flexDirection: "row" }}>
        {/* Timeline connector */}
        <View style={{ width: 28, alignItems: "center" }}>
          {/* Dot */}
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: isImage
                ? "#3b82f6"
                : isVideo
                  ? "#8b5cf6"
                  : "#dc2626",
              marginTop: 4,
            }}
          />
          {/* Line */}
          {!isLast && (
            <View
              className="bg-slate-200 dark:bg-slate-700"
              style={{
                width: 2,
                flex: 1,
                marginTop: 4,
              }}
            />
          )}
        </View>

        {/* Content */}
        <View
          style={{
            flex: 1,
            marginLeft: 8,
            marginBottom: 16,
            borderRadius: 12,
            padding: 12,
            borderWidth: 1,
          }}
          className="bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700"
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom:
                item.message_text || item.image_url || item.video_url ? 6 : 0,
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              {isImage ? (
                <ImageIcon size={12} color="#3b82f6" />
              ) : isVideo ? (
                <Video size={12} color="#8b5cf6" />
              ) : (
                <MessageSquare size={12} color="#dc2626" />
              )}
              <Text
                className="text-slate-400 dark:text-slate-500"
                style={{ fontSize: 10, fontWeight: "700" }}
              >
                {isImage ? "Image" : isVideo ? "Video" : "Comment"}
              </Text>
            </View>
            <Text
              className="text-slate-300 dark:text-slate-600"
              style={{ fontSize: 10, fontWeight: "600" }}
            >
              {format(new Date(item.created_at), "dd MMM, HH:mm")}
            </Text>
          </View>

          {item.message_text ? (
            <Text
              className="text-slate-700 dark:text-slate-200"
              style={{ fontSize: 13, lineHeight: 19, fontWeight: "500" }}
            >
              {item.message_text}
            </Text>
          ) : null}

          {item.image_url ? (
            <Image
              source={{ uri: item.image_url }}
              style={{
                width: "100%",
                height: 160,
                borderRadius: 10,
                marginTop: 6,
              }}
              resizeMode="cover"
            />
          ) : null}

          {item.video_url ? (
            <View
              className="bg-slate-900 dark:bg-slate-950"
              style={{
                width: "100%",
                height: 120,
                borderRadius: 10,
                marginTop: 6,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Video size={28} color="#fff" />
              <Text
                className="text-slate-400 dark:text-slate-500"
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  fontWeight: "600",
                }}
              >
                Video Attachment
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={{ marginTop: 4 }}>
      {/* Section Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 16,
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
          Activity
        </Text>
        <View
          className="bg-slate-200 dark:bg-slate-700"
          style={{ flex: 1, height: 1 }}
        />
        {items.length > 0 && (
          <View
            style={{
              backgroundColor: "#fef2f2",
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 8,
            }}
            className="bg-red-50 dark:bg-red-900/30"
          >
            <Text style={{ fontSize: 10, fontWeight: "800", color: "#dc2626" }} className="dark:text-red-400">
              {items.length}
            </Text>
          </View>
        )}
      </View>

      {/* Timeline List */}
      <View>
        {loading ? (
          <View style={{ paddingVertical: 24 }}>
            <ActivityIndicator color="#dc2626" />
          </View>
        ) : items.length === 0 ? (
          <View
            style={{
              alignItems: "center",
              paddingVertical: 28,
              borderRadius: 14,
              borderWidth: 1,
              borderStyle: "dashed",
            }}
            className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
          >
            <MessageCircle size={28} color="#cbd5e1" />
            <Text
              className="text-slate-400 dark:text-slate-500"
              style={{
                marginTop: 8,
                fontWeight: "600",
                fontSize: 12,
              }}
            >
              No activity yet
            </Text>
            <Text
              className="text-slate-300 dark:text-slate-600"
              style={{
                marginTop: 2,
                fontSize: 11,
              }}
            >
              Activity updates will appear here
            </Text>
          </View>
        ) : (
          items.map(renderItem)
        )}
      </View>
    </View>
  );
};

export default TicketLineItems;
