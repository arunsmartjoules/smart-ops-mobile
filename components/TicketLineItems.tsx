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
        fetchItems(); // refresh list
      }
    } catch (error) {
      console.error("Failed to add message:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const pickImage = async () => {
    // Basic implementation for picking image
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      // In a real app, upload this to S3, get URL, then save.
      // Assuming naive direct push for now or URL generation.
      // Here we might just send the local URI or base64.
      // Need a backend route to accept uploads if actual files. We'll simulate with an alert or basic text for now.
      alert(
        "Image attachment requires an upload server. Implement upload to get URL, then save line item.",
      );
    }
  };

  const renderItem = (item: LineItem, index: number) => {
    return (
      <View
        key={index}
        style={{
          backgroundColor: "#f8fafc",
          borderRadius: 16,
          padding: 16,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: "#e2e8f0",
        }}
        className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {item.image_url ? (
              <ImageIcon size={14} color="#3b82f6" style={{ marginRight: 6 }} />
            ) : item.video_url ? (
              <Video size={14} color="#8b5cf6" style={{ marginRight: 6 }} />
            ) : (
              <MessageSquare
                size={14}
                color="#10b981"
                style={{ marginRight: 6 }}
              />
            )}
            <Text
              style={{ fontSize: 12, fontWeight: "700", color: "#64748b" }}
              className="text-slate-500"
            >
              Update
            </Text>
          </View>
          <Text
            style={{ fontSize: 10, color: "#94a3b8" }}
            className="text-slate-400"
          >
            {format(new Date(item.created_at), "MMM d, HH:mm")}
          </Text>
        </View>

        {item.message_text ? (
          <Text
            style={{ fontSize: 14, color: "#334155", lineHeight: 20 }}
            className="text-slate-300"
          >
            {item.message_text}
          </Text>
        ) : null}

        {item.image_url ? (
          <Image
            source={{ uri: item.image_url }}
            style={{
              width: "100%",
              height: 200,
              borderRadius: 12,
              marginTop: 8,
            }}
            resizeMode="cover"
          />
        ) : null}

        {item.video_url ? (
          <View
            style={{
              width: "100%",
              height: 200,
              backgroundColor: "#000",
              borderRadius: 12,
              marginTop: 8,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Video size={32} color="#fff" />
            <Text style={{ color: "#fff", marginTop: 8, fontSize: 12 }}>
              Video Attachment
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={{ marginTop: 24 }}>
      <Text
        style={{
          color: "#0f172a",
          fontWeight: "900",
          fontSize: 14,
          textTransform: "uppercase",
          letterSpacing: 1.5,
          marginBottom: 16,
          marginLeft: 4,
        }}
        className="text-slate-900 dark:text-slate-50"
      >
        Activity & Attachments
      </Text>

      {/* Timeline List */}
      <View style={{ marginBottom: 16 }}>
        {loading ? (
          <ActivityIndicator color="#dc2626" />
        ) : items.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 20 }}>
            <MessageSquare size={32} color="#cbd5e1" />
            <Text
              style={{
                color: "#94a3b8",
                marginTop: 8,
                fontWeight: "600",
                fontSize: 12,
              }}
            >
              No messages or attachments yet.
            </Text>
          </View>
        ) : (
          items.map(renderItem)
        )}
      </View>

      {/* Input Area */}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
        <TouchableOpacity
          onPress={pickImage}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: "#f1f5f9",
            justifyContent: "center",
            alignItems: "center",
            borderWidth: 1,
            borderColor: "#e2e8f0",
          }}
          className="bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
        >
          <ImageIcon size={20} color="#64748b" />
        </TouchableOpacity>

        <View
          style={{
            flex: 1,
            backgroundColor: "#f8fafc",
            borderRadius: 24,
            borderWidth: 1,
            borderColor: "#e2e8f0",
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
          }}
          className="bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
        >
          <TextInput
            style={{
              flex: 1,
              minHeight: 48,
              maxHeight: 120,
              paddingVertical: 12,
              color: "#334155",
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
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: message.trim() ? "#dc2626" : "#cbd5e1",
              justifyContent: "center",
              alignItems: "center",
              marginLeft: 8,
            }}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Send
                size={16}
                color="#ffffff"
                style={{ marginLeft: -2, marginTop: 2 }}
              />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default TicketLineItems;
