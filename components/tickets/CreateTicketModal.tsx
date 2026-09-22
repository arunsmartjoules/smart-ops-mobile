import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check, X } from "lucide-react-native";
import FullscreenPicker from "@/components/FullscreenPicker";
import { type SelectOption } from "@/components/SearchableSelect";
import { TicketsService } from "@/services/TicketsService";
import { useDs } from "@/hooks/useDs";

// Same vocabulary as the tickets priority filter.
const PRIORITY_OPTIONS = ["Medium", "High", "Very High"] as const;

interface Site {
  site_code?: string | null;
  site_name?: string | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
  sites: Site[];
  categoryOptions: SelectOption[];
  defaultSiteCode: string;
  isConnected: boolean;
}

/**
 * "Raise ticket" form — site, title and category, plus optional area and priority, and a per-ticket switch for the site-group WhatsApp
 * announcement (on by default, mirroring the API). Mount it only while open
 * so every draft starts fresh.
 */
export default function CreateTicketModal({
  visible,
  onClose,
  onCreated,
  sites,
  categoryOptions,
  defaultSiteCode,
  isConnected,
}: Props) {
  const ds = useDs();
  const isDark = useColorScheme() === "dark";
  const [siteCode, setSiteCode] = useState(defaultSiteCode);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [area, setArea] = useState("");
  const [areaSearch, setAreaSearch] = useState("");
  const [areaOptions, setAreaOptions] = useState<SelectOption[]>([]);
  const [areasLoading, setAreasLoading] = useState(false);
  const [priority, setPriority] = useState<string>("Medium");
  const [sendWhatsApp, setSendWhatsApp] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const siteOptions = useMemo<SelectOption[]>(
    () =>
      sites.map((s) => ({
        value: s.site_code || "",
        label: s.site_name || s.site_code || "",
        description: s.site_code || "",
      })),
    [sites],
  );

  // Areas are per-site, so reload whenever the picked site or search changes
  // (debounced so typing doesn't fire a request per keystroke).
  useEffect(() => {
    if (!siteCode) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setAreasLoading(true);
      try {
        const result = await TicketsService.getAssets(siteCode, {
          page: 1,
          limit: 200,
          search: areaSearch.trim() || undefined,
        });
        if (cancelled) return;
        setAreaOptions(
          result?.success
            ? (result.data || []).map((asset: any) => ({
                value: asset.asset_name || asset.asset_id || "",
                label: asset.asset_name || asset.asset_id || "",
                description:
                  `${asset.asset_type || ""} ${asset.location ? `- ${asset.location}` : ""}`.trim(),
              }))
            : [],
        );
      } finally {
        if (!cancelled) setAreasLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [siteCode, areaSearch]);

  const onSubmit = async () => {
    if (!siteCode) return Alert.alert("Required", "Please select site.");
    if (!title.trim()) return Alert.alert("Required", "Ticket title is required.");
    if (!category) return Alert.alert("Required", "Please select category.");
    if (!isConnected) {
      return Alert.alert("Offline", "You need to be online to raise a ticket.");
    }

    setSubmitting(true);
    const result = await TicketsService.createTicket({
      site_code: siteCode,
      title: title.trim(),
      category,
      area_asset: area || undefined,
      priority,
      sendWhatsApp,
    });
    setSubmitting(false);

    if (result?.success) {
      onClose();
      onCreated();
      const ticketNo = result?.data?.ticket_no;
      Alert.alert("Ticket raised", ticketNo ? `Ticket ${ticketNo} created.` : "Ticket created.");
      return;
    }
    Alert.alert("Error", result?.error || "Failed to create ticket");
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 bg-slate-50 dark:bg-slate-950">
        <SafeAreaView className="flex-1">
          <View className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <View className="flex-row items-center justify-between">
              <Text className="text-slate-900 dark:text-slate-50 font-black text-lg">Raise Ticket</Text>
              <TouchableOpacity
                onPress={onClose}
                className="w-8 h-8 rounded-full items-center justify-center bg-slate-100 dark:bg-slate-800"
              >
                <X size={18} color={isDark ? "#cbd5e1" : "#334155"} />
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            className="flex-1"
            contentContainerStyle={{ padding: 20, paddingBottom: 120 }}
            keyboardShouldPersistTaps="handled"
          >
            <FullscreenPicker
              label="Site *"
              placeholder="Select site"
              options={siteOptions}
              value={siteCode}
              onChange={(value) => {
                setSiteCode(value);
                setArea("");
                setAreaSearch("");
              }}
            />
            <View className="mb-4">
              <Text className="text-slate-700 dark:text-slate-300 font-semibold text-sm mb-2">
                Title *
              </Text>
              <TextInput
                placeholder="Describe the issue"
                value={title}
                onChangeText={setTitle}
                multiline
                textAlignVertical="top"
                className="border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-3 text-slate-900 dark:text-slate-50 min-h-[90px]"
                placeholderTextColor={ds.carbon[600]}
              />
            </View>
            <FullscreenPicker
              label="Category *"
              placeholder="Select category"
              options={categoryOptions}
              value={category}
              onChange={setCategory}
              searchPlaceholder="Search categories..."
              emptyMessage="No categories found"
            />
            <FullscreenPicker
              label="Area"
              placeholder="Select area / asset (optional)"
              options={areaOptions}
              value={area}
              onChange={setArea}
              loading={areasLoading}
              searchPlaceholder="Search areas..."
              emptyMessage="No areas found"
              searchValue={areaSearch}
              onSearchChange={setAreaSearch}
              remoteSearch
            />
            <View className="mb-4">
              <Text className="text-slate-700 dark:text-slate-300 font-semibold text-sm mb-2">
                Priority
              </Text>
              <View className="flex-row gap-2">
                {PRIORITY_OPTIONS.map((opt) => {
                  const active = priority === opt;
                  return (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => setPriority(opt)}
                      className={`px-4 py-2 rounded-xl border ${
                        active
                          ? ""
                          : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                      }`}
                      style={active ? { backgroundColor: ds.controlOn, borderColor: ds.controlOn } : undefined}
                    >
                      <Text
                        className={`text-xs font-bold ${
                          active ? "text-white" : "text-slate-700 dark:text-slate-200"
                        }`}
                      >
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
            <TouchableOpacity
              onPress={() => setSendWhatsApp((v) => !v)}
              className="flex-row items-center py-2"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: sendWhatsApp }}
            >
              <View
                className={`w-5 h-5 rounded-md border items-center justify-center ${
                  sendWhatsApp
                    ? ""
                    : "bg-white dark:bg-slate-900 border-slate-400 dark:border-slate-600"
                }`}
                style={sendWhatsApp ? { backgroundColor: ds.controlOn, borderColor: ds.controlOn } : undefined}
              >
                {sendWhatsApp ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
              </View>
              <Text className="ml-3 text-slate-800 dark:text-slate-100 text-sm font-semibold">
                Send WhatsApp notification
              </Text>
            </TouchableOpacity>
          </ScrollView>

          <View className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={onClose}
                className="flex-1 bg-slate-200 dark:bg-slate-700 rounded-xl py-3"
              >
                <Text className="text-center font-bold text-slate-800 dark:text-slate-100">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onSubmit}
                disabled={submitting}
                className="flex-1 rounded-xl py-3"
                style={{ backgroundColor: ds.controlOn, opacity: submitting ? 0.6 : 1 }}
              >
                <Text className="text-center font-bold text-white">
                  {submitting ? "Creating..." : "Raise Ticket"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
