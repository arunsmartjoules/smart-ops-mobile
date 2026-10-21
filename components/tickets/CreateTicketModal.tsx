import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { type SelectOption } from "@/components/SearchableSelect";
import { TicketsService } from "@/services/TicketsService";
import { Bx } from "@/components/jo/Bx";
import {
  IconButton,
  PrimaryButton,
  SecondaryButton,
  f,
  makeJoStyles,
  useJoTheme,
} from "@/components/jo/ui";
import {
  BoxInput,
  ChoiceChips,
  FieldHead,
  OptionSheet,
  SelectBox,
  SwitchRow,
} from "./TicketFormParts";

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
 * "Raise ticket" form — site, title and category, plus optional area and
 * priority, and a per-ticket switch for the site-group WhatsApp announcement
 * (on by default, mirroring the API). Mount it only while open so every
 * draft starts fresh. Styled as the artboard's full-height form (radius-18
 * boxes, option sheets, accent CTA).
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
  const t = useJoTheme();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState<"site" | "category" | "area" | null>(null);
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
      sites.map((site) => ({
        value: site.site_code || "",
        label: site.site_name || site.site_code || "",
        description: site.site_code || "",
      })),
    [sites],
  );

  // Areas are per-site, so reload whenever the picked site or search changes
  // (debounced so typing doesn't fire a request per keystroke).
  useEffect(() => {
    if (!siteCode) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
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
      clearTimeout(timer);
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

  const siteLabel = siteOptions.find((o) => o.value === siteCode)?.label || siteCode;
  const areaLabel = areaOptions.find((o) => o.value === area)?.label || area;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={s.screen}>
        <View style={[s.header, { paddingTop: insets.top + 8 }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.kicker} numberOfLines={1}>
              New ticket
            </Text>
            <Text style={s.title} numberOfLines={1}>
              Raise ticket
            </Text>
          </View>
          <IconButton icon="bx-x" label="Close" onPress={onClose} />
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={s.body}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {!isConnected ? (
              <View style={s.offline} accessibilityRole="alert">
                <Bx name="bx-wifi-off" size={16} color={t.warn} />
                <Text style={s.offlineText}>
                  {"You're offline — raising a ticket needs a connection."}
                </Text>
              </View>
            ) : null}

            <FieldHead label="Site" hint="Required" />
            <SelectBox
              value={siteLabel}
              placeholder="Select site"
              onPress={() => setSheet("site")}
              accessibilityLabel="Site"
              style={s.gap}
            />

            <FieldHead label="Title" hint="Required" style={s.head} />
            <BoxInput
              placeholder="Describe the issue"
              value={title}
              onChangeText={setTitle}
              multiline
              minHeight={90}
              accessibilityLabel="Title"
              style={s.gap}
            />

            <FieldHead label="Category" hint="Required" style={s.head} />
            <SelectBox
              value={category}
              placeholder="Select category"
              onPress={() => setSheet("category")}
              accessibilityLabel="Category"
              style={s.gap}
            />

            <FieldHead label="Area" hint="Optional" style={s.head} />
            <SelectBox
              value={areaLabel}
              placeholder="Select area / asset"
              onPress={() => setSheet("area")}
              accessibilityLabel="Area"
              style={s.gap}
            />

            <FieldHead label="Priority" style={s.head} />
            <ChoiceChips
              label="Priority"
              options={PRIORITY_OPTIONS}
              value={priority}
              onChange={setPriority}
              style={s.gap}
            />

            <SwitchRow
              icon="bxl-whatsapp"
              iconColor={t.ok}
              iconBg={t.okTint}
              title="Send WhatsApp notification"
              sub="Announce this ticket in the site group"
              value={sendWhatsApp}
              onToggle={() => setSendWhatsApp((v) => !v)}
              style={{ marginTop: 18 }}
            />
          </ScrollView>

          <View style={[s.bar, { paddingBottom: Math.max(insets.bottom + 8, 20) }]}>
            <SecondaryButton label="Cancel" onPress={onClose} height={54} style={{ flex: 1 }} />
            <PrimaryButton
              label="Raise ticket"
              icon="bx-plus"
              onPress={onSubmit}
              busy={submitting}
              style={{ flex: 1.4 }}
            />
          </View>
        </KeyboardAvoidingView>
      </View>

      <OptionSheet
        visible={sheet === "site"}
        onClose={() => setSheet(null)}
        title="Site"
        options={siteOptions}
        value={siteCode}
        onPick={(value) => {
          setSiteCode(value);
          setArea("");
          setAreaSearch("");
        }}
        searchPlaceholder="Search sites"
        emptyMessage="No sites available"
      />
      <OptionSheet
        visible={sheet === "category"}
        onClose={() => setSheet(null)}
        title="Category"
        options={categoryOptions}
        value={category}
        onPick={setCategory}
        searchPlaceholder="Search categories"
        emptyMessage="No categories found"
      />
      <OptionSheet
        visible={sheet === "area"}
        onClose={() => setSheet(null)}
        title="Area"
        subtitle="Optional — the asset or area affected"
        options={areaOptions}
        value={area}
        onPick={setArea}
        searchPlaceholder="Search areas"
        searchValue={areaSearch}
        onSearchChange={setAreaSearch}
        loading={areasLoading}
        emptyMessage="No areas found"
      />
    </Modal>
  );
}

const useStyles = makeJoStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.page },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: t.line,
  },
  kicker: { ...f.t(12.5), color: t.muted },
  title: { ...f.d(22, -0.02), color: t.ink, marginTop: 2 },
  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 },
  head: { marginTop: 16 },
  gap: { marginTop: 9 },
  offline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: t.warnTint,
    marginBottom: 14,
  },
  offlineText: { ...f.t(12.5, 500), color: t.warn, flex: 1 },
  bar: {
    flexDirection: "row",
    gap: 8,
    paddingTop: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: t.line,
    backgroundColor: t.page,
  },
}));
