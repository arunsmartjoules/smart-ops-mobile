/**
 * Review & edit everything read from the RCA before the incident is created.
 * Grouped like the incident detail screen: incident, timeline, RCA findings,
 * photos from the report, and the RCA document itself.
 */
import React, { useMemo } from "react";
import { Image, Linking, ScrollView, Text, TouchableOpacity, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Check, ExternalLink, FileText, ImageOff, Info, Sparkles } from "lucide-react-native";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import FullscreenPicker from "@/components/FullscreenPicker";
import RequiredMark from "@/components/RequiredMark";
import type { SelectOption } from "@/components/SearchableSelect";
import {
  CardHead,
  DetailCard,
  Field,
  StatusChip,
  soRadius,
} from "@/components/tickets/TicketDetailUI";
import {
  FAULT_TYPE_OPTIONS,
  OPERATING_CONDITION_OPTIONS,
  SEVERITY_OPTIONS,
} from "@/constants/incidentFormOptions";
import type { RcaFields, RcaImportResult } from "@/services/RcaImportService";
import { DateTimeTiles, InlineError, Notice } from "./RcaImportParts";
import { FILE_KIND_LABEL, type RcaFieldErrors } from "./rcaImportLib";

interface Props {
  result: RcaImportResult;
  fields: RcaFields;
  setField: <K extends keyof RcaFields>(field: K, value: RcaFields[K]) => void;
  errors: RcaFieldErrors;
  showErrors: boolean;
  siteOptions: SelectOption[];
  assetOptions: SelectOption[];
  assetsLoading: boolean;
  assetSearch: string;
  onAssetSearch: (q: string) => void;
  assigneeOptions: SelectOption[];
  selectedImages: string[];
  onToggleImage: (url: string) => void;
  onSetAllImages: (all: boolean) => void;
}

export default function RcaReviewStep({
  result,
  fields,
  setField,
  errors,
  showErrors,
  siteOptions,
  assetOptions,
  assetsLoading,
  assetSearch,
  onAssetSearch,
  assigneeOptions,
  selectedImages,
  onToggleImage,
  onSetAllImages,
}: Props) {
  const styles = useStyles();
  const ds = useDs();
  const err = (k: keyof RcaFields) => (showErrors ? errors[k] : undefined);
  const resolved = fields.status === "Resolved";

  // A date the report gave without a time — offered again if a time field
  // is cleared or only becomes required here (status switched to Resolved).
  const dateDefaults = useMemo(() => {
    const out: Partial<Record<keyof RcaFields, string>> = {};
    for (const q of result.questions) {
      if (q.kind === "datetime" && q.default && /^\d{4}-\d{2}-\d{2}$/.test(q.default)) {
        out[q.field] = q.default;
      }
    }
    return out;
  }, [result.questions]);

  const images = result.images;
  const keptCount = images.filter((i) => selectedImages.includes(i.url)).length;
  const doc = result.document;
  const docMeta = [
    FILE_KIND_LABEL[doc.kind] ?? "Document",
    doc.pages ? `${doc.pages} ${doc.pages === 1 ? "page" : "pages"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.intro}>
        <Sparkles size={15} color={ds.flame[100]} strokeWidth={2.2} />
        <Text style={styles.introText}>
          We filled this in from the report. Check each section and fix anything that&apos;s off.
        </Text>
      </View>

      {/* ── Incident ─────────────────────────────────────────────────── */}
      <DetailCard>
        <CardHead label="Incident" />
        <FullscreenPicker
          label="Site *"
          placeholder="Select site"
          options={siteOptions}
          value={fields.site_code}
          onChange={(v) => setField("site_code", v)}
        />
        <InlineError text={err("site_code")} style={styles.fieldError} />
        <FullscreenPicker
          label="Asset *"
          placeholder="Select the affected equipment"
          options={assetOptions}
          value={fields.asset_location ?? ""}
          onChange={(v) => setField("asset_location", v)}
          searchPlaceholder="Search assets..."
          emptyMessage={assetsLoading ? "Searching…" : "No assets found"}
          searchValue={assetSearch}
          onSearchChange={onAssetSearch}
          remoteSearch
        />
        <InlineError text={err("asset_location")} style={styles.fieldError} />

        <Field
          label="Title *"
          placeholder="e.g. AHU-3 motor tripping"
          value={fields.fault_symptom}
          onChangeText={(v) => setField("fault_symptom", v)}
          invalid={!!err("fault_symptom")}
        />
        <InlineError text={err("fault_symptom")} style={styles.fieldErrorTight} />

        <ChipGroup
          label="Fault type *"
          options={FAULT_TYPE_OPTIONS}
          value={fields.fault_type}
          onChange={(v) => setField("fault_type", v as RcaFields["fault_type"])}
        />
        <ChipGroup
          label="Severity *"
          options={SEVERITY_OPTIONS}
          value={fields.severity}
          onChange={(v) => setField("severity", v as RcaFields["severity"])}
        />
        <ChipGroup
          label="Operating condition *"
          options={OPERATING_CONDITION_OPTIONS}
          value={fields.operating_condition}
          onChange={(v) => setField("operating_condition", v as RcaFields["operating_condition"])}
        />
        <ChipGroup
          label="Status *"
          options={["Resolved", "Inprogress"]}
          labels={{ Inprogress: "In progress" }}
          value={fields.status}
          onChange={(v) => setField("status", v as RcaFields["status"])}
        />

        <View style={{ marginTop: 16 }}>
          <FullscreenPicker
            label="Assigned to *"
            placeholder="Choose who handles this incident"
            options={assigneeOptions}
            value={fields.assigned_to ?? ""}
            onChange={(v) => setField("assigned_to", v)}
            searchPlaceholder="Search people..."
            emptyMessage="No people found for this site"
          />
          <InlineError text={err("assigned_to")} style={styles.fieldError} />
        </View>
        <Field
          label="Raised by"
          placeholder="Who reported it? e.g. Sister Mary, ICU"
          value={fields.raised_by ?? ""}
          onChangeText={(v) => setField("raised_by", v)}
          maxLength={200}
        />
        <Text style={styles.createdBy}>Created by: You</Text>
      </DetailCard>

      {/* ── Timeline ─────────────────────────────────────────────────── */}
      <DetailCard>
        <CardHead label="Timeline" />
        <Label text="Happened at *" />
        <DateTimeTiles
          value={fields.incident_created_time}
          fallbackDate={dateDefaults.incident_created_time}
          onChange={(v) => setField("incident_created_time", v)}
          invalid={!!err("incident_created_time")}
        />
        <InlineError text={err("incident_created_time")} style={styles.fieldErrorTight} />

        <View style={styles.labelRow}>
          <Label text="Responded at" />
          {fields.incident_updated_time ? (
            <TouchableOpacity
              onPress={() => setField("incident_updated_time", null)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear the responded time"
            >
              <Text style={styles.clear}>Clear</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.optionalTag}>Optional</Text>
          )}
        </View>
        <DateTimeTiles
          value={fields.incident_updated_time}
          onChange={(v) => setField("incident_updated_time", v)}
          invalid={!!err("incident_updated_time")}
        />
        <InlineError text={err("incident_updated_time")} style={styles.fieldErrorTight} />

        {resolved ? (
          <>
            <View style={{ height: 14 }} />
            <Label text="Resolved at *" />
            <DateTimeTiles
              value={fields.incident_resolved_time}
              fallbackDate={dateDefaults.incident_resolved_time}
              onChange={(v) => setField("incident_resolved_time", v)}
              invalid={!!err("incident_resolved_time")}
            />
            <InlineError text={err("incident_resolved_time")} style={styles.fieldErrorTight} />
          </>
        ) : null}
      </DetailCard>

      {/* ── RCA findings ─────────────────────────────────────────────── */}
      <DetailCard>
        <CardHead label="RCA findings" />
        <TextBlock
          label="Immediate action"
          value={fields.immediate_action_taken}
          onChange={(v) => setField("immediate_action_taken", v)}
          placeholder="What was done straight away?"
        />
        <TextBlock
          label="Root cause"
          value={fields.root_cause}
          onChange={(v) => setField("root_cause", v)}
          placeholder="Why did it happen?"
        />
        <TextBlock
          label="Corrective action"
          value={fields.corrective_action}
          onChange={(v) => setField("corrective_action", v)}
          placeholder="What fixed it?"
        />
        <TextBlock
          label="Preventive action"
          value={fields.preventive_action}
          onChange={(v) => setField("preventive_action", v)}
          placeholder="What stops it happening again?"
        />
        <TextBlock
          label={resolved ? "Closing remarks *" : "Closing remarks"}
          value={fields.remarks}
          onChange={(v) => setField("remarks", v)}
          placeholder="How was it resolved?"
          error={err("remarks")}
        />
        <Field
          label="Vendor"
          placeholder="Vendor involved, if any"
          value={fields.vendor_tagged}
          onChangeText={(v) => setField("vendor_tagged", v)}
        />
      </DetailCard>

      {/* ── Photos ───────────────────────────────────────────────────── */}
      <DetailCard>
        <CardHead
          label="Photos from the report"
          hint={images.length ? `${keptCount} of ${images.length} photos will be attached` : undefined}
        />
        {images.length === 0 ? (
          <View style={styles.emptyPhotos}>
            <ImageOff size={18} color={ds.carbon[600]} strokeWidth={2} />
            <Text style={styles.emptyText}>No photos were found in the report.</Text>
          </View>
        ) : (
          <>
            <Text style={styles.photoHelp}>Tap a photo to leave it out or add it back.</Text>
            <View style={styles.grid}>
              {images.map((img, i) => {
                const on = selectedImages.includes(img.url);
                return (
                  <TouchableOpacity
                    key={img.url}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      onToggleImage(img.url);
                    }}
                    activeOpacity={0.85}
                    style={[styles.thumbWrap, on && styles.thumbOn]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`Photo ${i + 1} of ${images.length}`}
                  >
                    <Image
                      source={{ uri: img.url }}
                      style={[styles.thumb, !on && { opacity: 0.35 }]}
                      resizeMode="cover"
                    />
                    <View style={[styles.check, on ? styles.checkOn : styles.checkOff]}>
                      {on ? <Check size={13} color={ds.onControl} strokeWidth={3} /> : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              onPress={() => onSetAllImages(keptCount < images.length)}
              hitSlop={8}
              style={{ alignSelf: "flex-start", marginTop: 4 }}
              accessibilityRole="button"
            >
              <Text style={styles.clear}>
                {keptCount < images.length ? "Select all photos" : "Leave all photos out"}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </DetailCard>

      {/* ── RCA document ─────────────────────────────────────────────── */}
      <DetailCard>
        <CardHead label="RCA document" />
        <TouchableOpacity
          onPress={() => void Linking.openURL(doc.url).catch(() => {})}
          activeOpacity={0.85}
          style={styles.docChip}
          accessibilityRole="button"
          accessibilityLabel={`Open ${doc.name || "the RCA document"}`}
        >
          <View style={styles.docIcon}>
            <FileText size={18} color={ds.sky[100]} strokeWidth={2} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.docName} numberOfLines={1}>
              {doc.name || "RCA report"}
            </Text>
            <Text style={styles.docMeta}>{docMeta}</Text>
          </View>
          <ExternalLink size={15} color={ds.carbon[500]} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.docNote}>Will be saved to the incident&apos;s RCA attachments.</Text>
      </DetailCard>

      <Notice icon={Info} style={{ marginTop: 2 }}>
        {result.rca_status_on_create === "RCA Submitted"
          ? "The RCA will be filed as submitted with this incident."
          : "A manager will review the RCA after you create the incident."}
      </Notice>
    </ScrollView>
  );
}

/* ── Small pieces ────────────────────────────────────────────────────────── */

function Label({ text }: { text: string }) {
  const styles = useStyles();
  return (
    <Text style={styles.label}>
      <RequiredMark label={text} />
    </Text>
  );
}

function ChipGroup({
  label,
  options,
  labels,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  labels?: Record<string, string>;
  value: string;
  onChange: (v: string) => void;
}) {
  const styles = useStyles();
  return (
    <View style={{ marginTop: 14 }}>
      <Label text={label} />
      <View style={styles.chips} accessibilityRole="radiogroup">
        {options.map((o) => (
          <StatusChip
            key={o}
            label={labels?.[o] ?? o}
            active={value === o}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onChange(o);
            }}
          />
        ))}
      </View>
    </View>
  );
}

function TextBlock({
  label,
  value,
  onChange,
  placeholder,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  error?: string;
}) {
  const styles = useStyles();
  return (
    <View style={{ marginBottom: 14 }}>
      <Field
        label={label}
        placeholder={placeholder}
        value={value}
        onChangeText={onChange}
        multiline
        textAlignVertical="top"
        minHeight={76}
        invalid={!!error}
      />
      <InlineError text={error} style={styles.fieldErrorTight} />
    </View>
  );
}

const useStyles = makeThemedStyles((ds) => ({
  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 },
  intro: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  introText: { flex: 1, fontSize: 13, lineHeight: 19, color: ds.carbon[300] },
  label: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    color: ds.carbon[500],
    marginBottom: 7,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 14,
  },
  clear: { fontSize: 12.5, fontWeight: "600", color: ds.sky[100] },
  optionalTag: { fontSize: 10.5, color: ds.carbon[500] },
  createdBy: { fontSize: 11.5, color: ds.carbon[500], marginTop: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fieldError: { marginTop: -8, marginBottom: 12 },
  fieldErrorTight: { marginTop: 6 },

  photoHelp: { fontSize: 12, color: ds.carbon[500], marginBottom: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", gap: 8 },
  thumbWrap: {
    width: 96,
    height: 96,
    borderRadius: soRadius.sm + 2,
    borderWidth: 2,
    borderColor: "transparent",
    overflow: "hidden",
    backgroundColor: ds.carbon[1000],
    marginBottom: 2,
  },
  thumbOn: { borderColor: ds.controlOn },
  thumb: { width: "100%", height: "100%" },
  check: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: ds.controlOn },
  checkOff: {
    borderWidth: 2,
    borderColor: "#FFFFFF",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  emptyPhotos: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  emptyText: { fontSize: 13, color: ds.carbon[500] },

  docChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 11,
    borderRadius: soRadius.sm,
    borderWidth: 1,
    borderColor: ds.fieldBorder,
    backgroundColor: ds.field,
  },
  docIcon: {
    width: 38,
    height: 38,
    borderRadius: soRadius.sm,
    backgroundColor: ds.sky[1000],
    alignItems: "center",
    justifyContent: "center",
  },
  docName: { fontSize: 13.5, fontWeight: "600", color: ds.carbon[100] },
  docMeta: { fontSize: 11.5, color: ds.carbon[500], marginTop: 2 },
  docNote: { fontSize: 12, color: ds.carbon[500], marginTop: 8 },
}));
