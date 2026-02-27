import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from "react-native";
import {
  MessageSquare,
  Image as ImageIcon,
  Video,
  Send,
  MessageCircle,
} from "lucide-react-native";
import TicketsService from "../services/TicketsService";
import { format } from "date-fns";
import * as ImagePicker from "expo-image-picker";

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
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

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

  const handleSendText = async () => {
    if (!message.trim()) return;

    setSubmitting(true);
    try {
      const res = await TicketsService.addLineItem(ticketId, {
        message_text: message.trim(),
      });
      if (res.success) {
        setMessage("");
        fetchItems();
      }
    } catch (error) {
      console.error("Failed to add message:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      alert(
        "Image attachment requires an upload server. Implement upload to get URL, then save line item.",
      );
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
              style={{
                width: 2,
                flex: 1,
                backgroundColor: "#e2e8f0",
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
            backgroundColor: "#f8fafc",
            borderRadius: 12,
            padding: 12,
            borderWidth: 1,
            borderColor: "#f1f5f9",
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
                style={{ fontSize: 10, fontWeight: "700", color: "#94a3b8" }}
              >
                {isImage ? "Image" : isVideo ? "Video" : "Comment"}
              </Text>
            </View>
            <Text style={{ fontSize: 10, color: "#cbd5e1", fontWeight: "600" }}>
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
              style={{
                width: "100%",
                height: 120,
                backgroundColor: "#0f172a",
                borderRadius: 10,
                marginTop: 6,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Video size={28} color="#fff" />
              <Text
                style={{
                  color: "#94a3b8",
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
          >
            <Text style={{ fontSize: 10, fontWeight: "800", color: "#dc2626" }}>
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
              backgroundColor: "#f8fafc",
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "#f1f5f9",
              borderStyle: "dashed",
            }}
          >
            <MessageCircle size={28} color="#cbd5e1" />
            <Text
              style={{
                color: "#94a3b8",
                marginTop: 8,
                fontWeight: "600",
                fontSize: 12,
              }}
            >
              No activity yet
            </Text>
            <Text
              style={{
                color: "#cbd5e1",
                marginTop: 2,
                fontSize: 11,
              }}
            >
              Send a message to start
            </Text>
          </View>
        ) : (
          items.map(renderItem)
        )}
      </View>

      {/* Input Area */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-end",
          gap: 8,
          marginTop: 12,
        }}
      >
        <TouchableOpacity
          onPress={pickImage}
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: "#f1f5f9",
            justifyContent: "center",
            alignItems: "center",
            borderWidth: 1,
            borderColor: "#e2e8f0",
          }}
          className="bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
        >
          <ImageIcon size={18} color="#64748b" />
        </TouchableOpacity>

        <View
          style={{
            flex: 1,
            backgroundColor: "#f8fafc",
            borderRadius: 14,
            borderWidth: 1,
            borderColor: "#e2e8f0",
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 14,
          }}
          className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
        >
          <TextInput
            style={{
              flex: 1,
              minHeight: 40,
              maxHeight: 100,
              paddingVertical: 10,
              color: "#334155",
              fontSize: 13,
            }}
            className="text-slate-900 dark:text-slate-100"
            placeholder="Type a message..."
            placeholderTextColor="#94a3b8"
            multiline
            value={message}
            onChangeText={setMessage}
          />
          <TouchableOpacity
            onPress={handleSendText}
            disabled={submitting || !message.trim()}
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              backgroundColor: message.trim() ? "#dc2626" : "#e2e8f0",
              justifyContent: "center",
              alignItems: "center",
              marginLeft: 8,
            }}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Send
                size={14}
                color={message.trim() ? "#ffffff" : "#94a3b8"}
                style={{ marginLeft: -1, marginTop: 1 }}
              />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default TicketLineItems;
