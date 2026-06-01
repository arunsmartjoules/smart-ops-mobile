import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import {
  ArrowLeft,
  Bug,
  AlertTriangle,
  Zap,
  RefreshCw,
  Layout,
  Sparkles,
  HelpCircle,
  CheckCircle,
  Camera,
  Image as ImageIcon,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { router } from "expo-router";

import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL } from "@/constants/api";
import { APP_VERSION } from "@/constants/version";
import { StorageService } from "@/services/StorageService";
import logger from "@/utils/logger";

const MAX_ATTACHMENTS = 5;

type Category = "bug" | "crash" | "ui" | "performance" | "sync" | "feature" | "other";
type Severity = "low" | "medium" | "high" | "critical";

const CATEGORIES: { value: Category; label: string; icon: LucideIcon; color: string }[] = [
  { value: "bug", label: "Bug", icon: Bug, color: "#ef4444" },
  { value: "crash", label: "Crash", icon: AlertTriangle, color: "#dc2626" },
  { value: "performance", label: "Slow / Lag", icon: Zap, color: "#f59e0b" },
  { value: "sync", label: "Sync", icon: RefreshCw, color: "#3b82f6" },
  { value: "ui", label: "UI / Layout", icon: Layout, color: "#8b5cf6" },
  { value: "feature", label: "Suggestion", icon: Sparkles, color: "#22c55e" },
  { value: "other", label: "Other", icon: HelpCircle, color: "#64748b" },
];

const SEVERITIES: { value: Severity; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "#64748b" },
  { value: "medium", label: "Medium", color: "#f59e0b" },
  { value: "high", label: "High", color: "#ef4444" },
  { value: "critical", label: "Critical", color: "#dc2626" },
];

export default function ReportIssue() {
  const { user, token } = useAuth();

  const [category, setCategory] = useState<Category>("bug");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stepsToReproduce, setStepsToReproduce] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const userKey = user?.user_id || user?.id || "anon";

  const uploadFromResult = useCallback(
    async (result: ImagePicker.ImagePickerResult) => {
      if (result.canceled || !result.assets?.[0]?.uri) return;
      if (attachments.length >= MAX_ATTACHMENTS) {
        Alert.alert(
          "Limit reached",
          `You can attach up to ${MAX_ATTACHMENTS} images per report.`,
        );
        return;
      }
      setUploadingAttachment(true);
      try {
        const uri = result.assets[0].uri;
        const remotePath = `issue_reports/${userKey}/${Date.now()}.jpg`;
        const publicUrl = await StorageService.uploadFile(
          "jouleops-attachments",
          remotePath,
          uri,
        );
        if (!publicUrl) {
          Alert.alert("Upload failed", "Couldn't upload the image. Try again.");
          return;
        }
        setAttachments((prev) => [...prev, publicUrl]);
      } catch (err: any) {
        logger.error("issue report attachment upload failed", {
          module: "REPORT_ISSUE",
          error: err?.message,
        });
        Alert.alert("Upload failed", err?.message || "Couldn't upload image.");
      } finally {
        setUploadingAttachment(false);
      }
    },
    [attachments.length, userKey],
  );

  const handleAddAttachment = useCallback(() => {
    if (uploadingAttachment) return;
    if (attachments.length >= MAX_ATTACHMENTS) {
      Alert.alert(
        "Limit reached",
        `You can attach up to ${MAX_ATTACHMENTS} images per report.`,
      );
      return;
    }
    Alert.alert(
      "Add Screenshot",
      "Choose a source",
      [
        {
          text: "Take Photo",
          onPress: async () => {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) {
              Alert.alert(
                "Permission Required",
                "Camera permission is needed to attach a photo.",
              );
              return;
            }
            const res = await ImagePicker.launchCameraAsync({
              mediaTypes: "images",
              quality: 0.6,
            });
            uploadFromResult(res);
          },
        },
        {
          text: "Choose from Gallery",
          onPress: async () => {
            const res = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: "images",
              quality: 0.6,
            });
            uploadFromResult(res);
          },
        },
        { text: "Cancel", style: "cancel" },
      ],
      { cancelable: true },
    );
  }, [attachments.length, uploadingAttachment, uploadFromResult]);

  const removeAttachment = useCallback((url: string) => {
    setAttachments((prev) => prev.filter((u) => u !== url));
  }, []);

  const canSubmit = useMemo(
    () =>
      title.trim().length > 0 &&
      description.trim().length > 0 &&
      !submitting &&
      !uploadingAttachment,
    [title, description, submitting, uploadingAttachment],
  );

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    if (!token) {
      Alert.alert("Sign in required", "Please sign in again before reporting.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/mobile-app/issue-reports`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-app-version": APP_VERSION,
          "x-platform": Platform.OS,
        },
        body: JSON.stringify({
          category,
          severity,
          title: title.trim(),
          description: description.trim(),
          steps_to_reproduce: stepsToReproduce.trim() || undefined,
          attachments,
          app_version: APP_VERSION,
          platform: Platform.OS,
        }),
      });
      const result = await response.json();
      if (result?.success) {
        setSubmitted(true);
        setTitle("");
        setDescription("");
        setStepsToReproduce("");
        setAttachments([]);
        setSeverity("medium");
      } else {
        Alert.alert(
          "Couldn't submit",
          result?.error || "We couldn't send your report. Please try again.",
        );
      }
    } catch (err: any) {
      logger.error("issue report submit failed", {
        module: "REPORT_ISSUE",
        error: err?.message,
      });
      Alert.alert(
        "Network error",
        "Couldn't reach the server. Check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
    token,
    category,
    severity,
    title,
    description,
    stepsToReproduce,
    attachments,
  ]);

  if (submitted) {
    return (
      <View className="flex-1 bg-slate-50 dark:bg-slate-950">
        <SafeAreaView className="flex-1 items-center justify-center px-6">
          <LinearGradient
            colors={["#22c55e", "#16a34a"]}
            style={{
              width: 96,
              height: 96,
              borderRadius: 48,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CheckCircle size={48} color="white" />
          </LinearGradient>
          <Text className="text-slate-900 dark:text-slate-50 text-2xl font-bold mt-6 text-center">
            Report sent
          </Text>
          <Text className="text-slate-500 dark:text-slate-400 text-sm text-center mt-2">
            Thanks for the feedback. The team will look into it.
          </Text>
          <View className="flex-row gap-3 mt-8">
            <TouchableOpacity
              onPress={() => setSubmitted(false)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-5 py-3"
            >
              <Text className="text-slate-700 dark:text-slate-200 font-semibold text-sm">
                Report another
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.back()}
              className="overflow-hidden rounded-xl"
            >
              <LinearGradient
                colors={["#dc2626", "#b91c1c"]}
                style={{ paddingHorizontal: 20, paddingVertical: 12 }}
              >
                <Text className="text-white font-semibold text-sm">Done</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1">
        <View className="px-5 pt-2 pb-3 flex-row items-center">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 items-center justify-center mr-4"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.08,
              shadowRadius: 8,
              elevation: 3,
            }}
          >
            <ArrowLeft size={18} color="#64748b" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-slate-900 dark:text-slate-50 text-xl font-bold">
              Report an Issue
            </Text>
            <Text className="text-slate-500 dark:text-slate-400 text-xs">
              Help us make JouleOps better
            </Text>
          </View>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          <ScrollView
            className="flex-1 px-5"
            contentContainerStyle={{ paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Category */}
            <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide mt-4 mb-2">
              Category
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {CATEGORIES.map((c) => {
                const active = c.value === category;
                const Icon = c.icon;
                return (
                  <TouchableOpacity
                    key={c.value}
                    onPress={() => setCategory(c.value)}
                    className={`flex-row items-center px-3 py-2 rounded-xl border ${
                      active
                        ? "bg-red-50 border-red-300 dark:bg-red-950/30 dark:border-red-800"
                        : "bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-700"
                    }`}
                  >
                    <Icon size={14} color={active ? "#dc2626" : c.color} />
                    <Text
                      className={`ml-1.5 text-sm font-medium ${
                        active
                          ? "text-red-700 dark:text-red-300"
                          : "text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Severity */}
            <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide mt-5 mb-2">
              How severe is it?
            </Text>
            <View className="flex-row gap-2">
              {SEVERITIES.map((s) => {
                const active = s.value === severity;
                return (
                  <TouchableOpacity
                    key={s.value}
                    onPress={() => setSeverity(s.value)}
                    className={`flex-1 items-center py-2.5 rounded-xl border ${
                      active
                        ? "border-transparent"
                        : "bg-white border-slate-200 dark:bg-slate-900 dark:border-slate-700"
                    }`}
                    style={
                      active
                        ? { backgroundColor: s.color + "20", borderColor: s.color }
                        : undefined
                    }
                  >
                    <Text
                      className="text-sm font-semibold"
                      style={{
                        color: active ? s.color : "#64748b",
                      }}
                    >
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Title */}
            <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide mt-5 mb-2">
              Title
            </Text>
            <View className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 px-4">
              <TextInput
                className="py-3.5 text-slate-900 dark:text-slate-50"
                placeholder="Short summary (e.g., Site logs not syncing)"
                placeholderTextColor="#94a3b8"
                value={title}
                onChangeText={setTitle}
                maxLength={200}
              />
            </View>

            {/* Description */}
            <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide mt-5 mb-2">
              What happened?
            </Text>
            <View className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 px-4">
              <TextInput
                className="py-3.5 text-slate-900 dark:text-slate-50"
                placeholder="Describe the issue in your own words"
                placeholderTextColor="#94a3b8"
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={5}
                style={{ minHeight: 110, textAlignVertical: "top" }}
                maxLength={5000}
              />
            </View>

            {/* Steps to reproduce */}
            <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide mt-5 mb-2">
              Steps to reproduce (optional)
            </Text>
            <View className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 px-4">
              <TextInput
                className="py-3.5 text-slate-900 dark:text-slate-50"
                placeholder="1. Open Site Logs&#10;2. Tap on…&#10;3. App shows…"
                placeholderTextColor="#94a3b8"
                value={stepsToReproduce}
                onChangeText={setStepsToReproduce}
                multiline
                numberOfLines={4}
                style={{ minHeight: 90, textAlignVertical: "top" }}
                maxLength={5000}
              />
            </View>

            {/* Attachments */}
            <View className="flex-row items-center justify-between mt-5 mb-2">
              <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wide">
                Screenshots (optional)
              </Text>
              <Text className="text-slate-400 dark:text-slate-500 text-[11px]">
                {attachments.length}/{MAX_ATTACHMENTS}
              </Text>
            </View>
            <View className="flex-row flex-wrap gap-2">
              {attachments.map((url) => (
                <View key={url} className="relative">
                  <Image
                    source={{ uri: url }}
                    style={{
                      width: 84,
                      height: 84,
                      borderRadius: 12,
                      backgroundColor: "#e2e8f0",
                    }}
                  />
                  <TouchableOpacity
                    onPress={() => removeAttachment(url)}
                    className="absolute -top-1.5 -right-1.5 bg-red-600 rounded-full w-6 h-6 items-center justify-center"
                    style={{
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.2,
                      shadowRadius: 2,
                      elevation: 3,
                    }}
                  >
                    <X size={14} color="white" />
                  </TouchableOpacity>
                </View>
              ))}
              {attachments.length < MAX_ATTACHMENTS && (
                <TouchableOpacity
                  onPress={handleAddAttachment}
                  disabled={uploadingAttachment}
                  className="items-center justify-center bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl"
                  style={{ width: 84, height: 84 }}
                >
                  {uploadingAttachment ? (
                    <ActivityIndicator size="small" color="#64748b" />
                  ) : (
                    <>
                      <Camera size={20} color="#64748b" />
                      <Text className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-medium">
                        Add
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
            {attachments.length === 0 && !uploadingAttachment && (
              <View className="flex-row items-center mt-2">
                <ImageIcon size={12} color="#94a3b8" />
                <Text className="text-[11px] text-slate-400 dark:text-slate-500 ml-1.5">
                  Attach screenshots to help us see the issue
                </Text>
              </View>
            )}

            {/* Device info preview */}
            <View className="mt-5 p-3 rounded-xl bg-slate-100 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
              <Text className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wide mb-1">
                Sent with this report
              </Text>
              <Text className="text-[12px] text-slate-600 dark:text-slate-300">
                {Platform.OS === "ios" ? "iOS" : "Android"} · v{APP_VERSION} ·{" "}
                {user?.email ?? "you"}
              </Text>
            </View>

            {/* Submit */}
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={!canSubmit}
              className="overflow-hidden rounded-xl mt-6"
              style={{ opacity: canSubmit ? 1 : 0.5 }}
            >
              <LinearGradient
                colors={["#dc2626", "#b91c1c"]}
                style={{
                  paddingVertical: 14,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {submitting ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-white font-bold text-base">
                    Submit Report
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
