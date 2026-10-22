/**
 * Review & edit everything read from the RCA before the incident is created.
 * Grouped like the incident detail screen: incident, timeline, RCA findings,
 * photos from the report, and the RCA document itself.
 */
import React, { useMemo } from "react";
import { Image, Linking, ScrollView, Text, TouchableOpacity, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Bx } from "@/components/jo/Bx";
import { GlossFill, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import type { SelectOption } from "@/components/SearchableSelect";
import {
  FAULT_TYPE_OPTIONS,
  OPERATING_CONDITION_OPTIONS,
  SEVERITY_OPTIONS,
} from "@/constants/incidentFormOptions";
import type { RcaFields, RcaImportResult } from "@/services/RcaImportService";
import { DateTimeTiles, InlineError, Notice } from "./RcaImportParts";
import { FieldBlock, FieldLabel, IncChip, IncPicker, Panel, TextField } from "./IncFields";
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

/** "Label *" → label + required flag. */
const req = (label: string) => ({ label: label.replace(/\s*\*$/, ""), required: /\*$/.test(label) });

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
  const s = useStyles();
  const t = useJoTheme();
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
      contentContainerStyle={s.body}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={s.intro}>
        <Bx name="bxs-magic-wand" size={16} color={t.accentInk} />
        <Text style={s.introText}>
          We filled this in from the report. Check each section and fix anything that&apos;s off.
        </Text>
      </View>

      {/* ── Incident ─────────────────────────────────────────────────── */}
      <Panel title="Incident">
        <IncPicker
          label="Site"
          required
          placeholder="Select site"
          options={siteOptions}
          value={fields.site_code}
          onChange={(v) => setField("site_code", v)}
          error={err("site_code")}
          searchPlaceholder="Search sites"
        />
        <IncPicker
          label="Asset"
          required
          placeholder="Select the affected equipment"
          options={assetOptions}
          value={fields.asset_location ?? ""}
          onChange={(v) => setField("asset_location", v)}
          searchPlaceholder="Search assets..."
          emptyMessage={assetsLoading ? "Searching…" : "No assets found"}
          searchValue={assetSearch}
          onSearchChange={onAssetSearch}
          remoteSearch
          error={err("asset_location")}
        />
        <FieldBlock label="Title" required error={err("fault_symptom")}>
          <TextField
            placeholder="e.g. AHU-3 motor tripping"
            value={fields.fault_symptom}
            onChangeText={(v) => setField("fault_symptom", v)}
            invalid={!!err("fault_symptom")}
            accessibilityLabel="Title"
          />
        </FieldBlock>

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

        <IncPicker
          label="Assigned to"
          required
          placeholder="Choose who handles this incident"
          options={assigneeOptions}
          value={fields.assigned_to ?? ""}
          onChange={(v) => setField("assigned_to", v)}
          searchPlaceholder="Search people..."
          emptyMessage="No people found for this site"
          error={err("assigned_to")}
        />
        <FieldBlock label="Raised by">
          <TextField
            placeholder="Who reported it? e.g. Sister Mary, ICU"
            value={fields.raised_by ?? ""}
            onChangeText={(v) => setField("raised_by", v)}
            maxLength={200}
            accessibilityLabel="Raised by"
          />
        </FieldBlock>
        <Text style={s.createdBy}>Created by: You</Text>
      </Panel>

      {/* ── Timeline ─────────────────────────────────────────────────── */}
      <Panel title="Timeline">
        <FieldLabel label="Happened at" required style={s.labelGap} />
        <DateTimeTiles
          value={fields.incident_created_time}
          fallbackDate={dateDefaults.incident_created_time}
          onChange={(v) => setField("incident_created_time", v)}
          invalid={!!err("incident_created_time")}
        />
        <InlineError text={err("incident_created_time")} style={s.fieldErrorTight} />

        <View style={s.labelRow}>
          <FieldLabel label="Responded at" />
          {fields.incident_updated_time ? (
            <TouchableOpacity
              onPress={() => setField("incident_updated_time", null)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear the responded time"
            >
              <Text style={s.link}>Clear</Text>
            </TouchableOpacity>
          ) : (
            <Text style={s.optionalTag}>Optional</Text>
          )}
        </View>
        <DateTimeTiles
          value={fields.incident_updated_time}
          onChange={(v) => setField("incident_updated_time", v)}
          invalid={!!err("incident_updated_time")}
        />
        <InlineError text={err("incident_updated_time")} style={s.fieldErrorTight} />

        {resolved ? (
          <>
            <FieldLabel label="Resolved at" required style={[s.labelGap, { marginTop: 14 }]} />
            <DateTimeTiles
              value={fields.incident_resolved_time}
              fallbackDate={dateDefaults.incident_resolved_time}
              onChange={(v) => setField("incident_resolved_time", v)}
              invalid={!!err("incident_resolved_time")}
            />
            <InlineError text={err("incident_resolved_time")} style={s.fieldErrorTight} />
          </>
        ) : null}
      </Panel>

      {/* ── RCA findings ─────────────────────────────────────────────── */}
      <Panel title="RCA findings">
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
        <FieldBlock label="Vendor">
          <TextField
            placeholder="Vendor involved, if any"
            value={fields.vendor_tagged}
            onChangeText={(v) => setField("vendor_tagged", v)}
            accessibilityLabel="Vendor"
          />
        </FieldBlock>
      </Panel>

      {/* ── Photos ───────────────────────────────────────────────────── */}
      <Panel
        title="Photos from the report"
        meta={images.length ? `${keptCount} of ${images.length} kept` : undefined}
      >
        {images.length === 0 ? (
          <View style={s.emptyPhotos}>
            <Bx name="bx-image" size={18} color={t.faint} />
            <Text style={s.emptyText}>No photos were found in the report.</Text>
          </View>
        ) : (
          <>
            <Text style={s.photoHelp}>Tap a photo to leave it out or add it back.</Text>
            <View style={s.grid}>
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
                    style={[s.thumbWrap, on && s.thumbOn]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`Photo ${i + 1} of ${images.length}`}
                  >
                    <Image source={{ uri: img.url }} style={[s.thumb, !on && { opacity: 0.35 }]} resizeMode="cover" />
                    <View style={[s.check, on ? s.checkOn : s.checkOff]}>
                      {on ? <GlossFill color={t.accent} fg={t.onAccent} radius={11} /> : null}
                      {on ? <Bx name="bx-check" size={15} color={t.onAccent} /> : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              onPress={() => onSetAllImages(keptCount < images.length)}
              hitSlop={8}
              style={{ alignSelf: "flex-start", marginTop: 6 }}
              accessibilityRole="button"
            >
              <Text style={s.link}>{keptCount < images.length ? "Select all photos" : "Leave all photos out"}</Text>
            </TouchableOpacity>
          </>
        )}
      </Panel>

      {/* ── RCA document ─────────────────────────────────────────────── */}
      <Panel title="RCA document">
        <TouchableOpacity
          onPress={() => void Linking.openURL(doc.url).catch(() => {})}
          activeOpacity={0.85}
          style={s.docChip}
          accessibilityRole="button"
          accessibilityLabel={`Open ${doc.name || "the RCA document"}`}
        >
          <View style={s.docIcon}>
            <Bx name="bx-file" size={19} color={t.info} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.docName} numberOfLines={1}>
              {doc.name || "RCA report"}
            </Text>
            <Text style={s.docMeta}>{docMeta}</Text>
          </View>
          <Bx name="bx-link-external" size={17} color={t.muted} />
        </TouchableOpacity>
        <Text style={s.docNote}>Will be saved to the incident&apos;s RCA attachments.</Text>
      </Panel>

      <Notice icon="bx-info-circle" style={{ marginTop: 10 }}>
        {result.rca_status_on_create === "RCA Submitted"
          ? "The RCA will be filed as submitted with this incident."
          : "A manager will review the RCA after you create the incident."}
      </Notice>
    </ScrollView>
  );
}

/* ── Small pieces ────────────────────────────────────────────────────────── */

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
  const s = useStyles();
  const l = req(label);
  return (
    <View style={{ marginTop: 14 }}>
      <FieldLabel label={l.label} required={l.required} style={s.labelGap} />
      <View style={s.chips} accessibilityRole="radiogroup">
        {options.map((o) => (
          <IncChip
            key={o}
            label={labels?.[o] ?? o}
            selected={value === o}
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
  const l = req(label);
  return (
    <FieldBlock label={l.label} required={l.required} error={error}>
      <TextField
        placeholder={placeholder}
        value={value}
        onChangeText={onChange}
        multiline
        minHeight={76}
        invalid={!!error}
        accessibilityLabel={l.label}
      />
    </FieldBlock>
  );
}

const useStyles = makeJoStyles((t) => ({
  body: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  intro: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 2, paddingHorizontal: 4 },
  introText: { ...f.t(13), flex: 1, lineHeight: 19, color: t.ink2 },
  labelGap: { marginBottom: 6, marginTop: 14 },
  labelRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginTop: 14,
    marginBottom: 6,
  },
  link: { ...f.t(12.5, 600), color: t.accentInk },
  optionalTag: { ...f.t(11), color: t.muted },
  createdBy: { ...f.t(11.5), color: t.muted, marginTop: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  fieldErrorTight: { marginTop: 6 },

  photoHelp: { ...f.t(12), color: t.muted, marginTop: 8, marginBottom: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  thumbWrap: {
    width: 92,
    height: 92,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "transparent",
    overflow: "hidden",
    backgroundColor: t.raised,
  },
  thumbOn: { borderColor: t.accent },
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
  checkOn: { backgroundColor: t.accent },
  checkOff: { borderWidth: 2, borderColor: t.selBg, backgroundColor: t.scrim },
  emptyPhotos: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 12 },
  emptyText: { ...f.t(13), color: t.muted },

  docChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginTop: 12,
    padding: 11,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: t.isDark ? "rgba(255,255,255,0.07)" : t.lineMid,
    backgroundColor: t.raised,
  },
  docIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: t.infoTint,
    alignItems: "center",
    justifyContent: "center",
  },
  docName: { ...f.t(13.5, 600), color: t.ink },
  docMeta: { ...f.t(11.5), color: t.muted, marginTop: 2 },
  docNote: { ...f.t(12), color: t.muted, marginTop: 8 },
}));
