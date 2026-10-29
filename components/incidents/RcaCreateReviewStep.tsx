/**
 * "Create RCA" last step: a compact summary of the incident details and of each
 * section. Tap any row to jump back and edit it; the answers stay as they are.
 * Problems (ours, and the server's if it refused the request) are listed on
 * top and marked on the row they belong to.
 */
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Bx } from "@/components/jo/Bx";
import { f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import type { RcaSection } from "@/services/RcaCreateService";
import type { RcaFields } from "@/services/RcaImportService";
import { Panel } from "./IncFields";
import { InlineError } from "./RcaImportParts";
import {
  firstLine,
  isSectionRequired,
  sectionAsksPhotos,
  type AnswerMap,
  type Problem,
} from "./rcaCreateLib";
import { formatLocal } from "./rcaImportLib";

interface Props {
  fields: RcaFields;
  siteLabel: string;
  assigneeLabel: string;
  sections: RcaSection[];
  answers: AnswerMap;
  problems: Problem[];
  showProblems: boolean;
  /** The server's own message when it refused the create. */
  serverError: string | null;
  /** Which details fields have a question to jump back to. */
  editableFields: ReadonlySet<keyof RcaFields>;
  onEditField: (field: keyof RcaFields) => void;
  onEditSection: (sectionId: string) => void;
}

const STATUS_LABEL: Record<string, string> = { Resolved: "Resolved", Inprogress: "In progress" };

export default function RcaCreateReviewStep({
  fields,
  siteLabel,
  assigneeLabel,
  sections,
  answers,
  problems,
  showProblems,
  serverError,
  editableFields,
  onEditField,
  onEditSection,
}: Props) {
  const s = useStyles();
  const t = useJoTheme();

  const fieldProblem = (field: keyof RcaFields) =>
    showProblems ? problems.find((p) => p.target.type === "field" && p.target.field === field)?.message : undefined;
  const sectionProblemFor = (id: string) =>
    showProblems ? problems.find((p) => p.target.type === "section" && p.target.id === id)?.message : undefined;

  const resolved = fields.status === "Resolved";
  const rows: { field: keyof RcaFields; label: string; value: string }[] = [
    { field: "fault_symptom", label: "Title", value: fields.fault_symptom },
    { field: "site_code", label: "Site", value: siteLabel },
    { field: "asset_location", label: "Asset", value: fields.asset_location ?? "" },
    { field: "fault_type", label: "Fault type", value: fields.fault_type },
    { field: "severity", label: "Severity", value: fields.severity },
    { field: "operating_condition", label: "Operating condition", value: fields.operating_condition },
    { field: "status", label: "Status", value: STATUS_LABEL[fields.status] ?? fields.status },
    { field: "incident_created_time", label: "Happened at", value: formatLocal(fields.incident_created_time) },
    { field: "incident_updated_time", label: "Responded at", value: formatLocal(fields.incident_updated_time) },
    ...(resolved
      ? [{ field: "incident_resolved_time" as const, label: "Resolved at", value: formatLocal(fields.incident_resolved_time) }]
      : []),
    { field: "assigned_to", label: "Assigned to", value: assigneeLabel },
    { field: "raised_by", label: "Raised by", value: fields.raised_by ?? "" },
    { field: "vendor_tagged", label: "Vendor", value: fields.vendor_tagged ?? "" },
  ];

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={s.body}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={s.title} accessibilityRole="header">
        Check, then create
      </Text>
      <Text style={s.help}>
        We&apos;ll build the RCA document from your answers and raise the incident. Tap any row to change it.
      </Text>

      {serverError ? (
        <View style={[s.alert, { backgroundColor: t.badTint }]} accessibilityLiveRegion="polite">
          <Bx name="bx-error-circle" size={16} color={t.bad} style={{ marginTop: 1 }} />
          <Text style={[s.alertText, { color: t.bad }]}>{serverError}</Text>
        </View>
      ) : null}
      {showProblems && problems.length > 0 ? (
        <View style={[s.alert, { backgroundColor: t.warnTint, flexDirection: "column", alignItems: "stretch" }]}>
          <Text style={[s.alertTitle, { color: t.warn }]}>
            {problems.length === 1 ? "One thing needs fixing" : `${problems.length} things need fixing`}
          </Text>
          {problems.map((p) => (
            <TouchableOpacity
              key={p.key}
              onPress={() =>
                p.target.type === "field"
                  ? editableFields.has(p.target.field) && onEditField(p.target.field)
                  : onEditSection(p.target.id)
              }
              hitSlop={4}
              style={s.problemRow}
              accessibilityRole="button"
              accessibilityLabel={`${p.message} Tap to fix`}
            >
              <Text style={[s.alertText, { color: t.ink2 }]}>• {p.message}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <Panel title="Incident details">
        {rows
          .filter((r) => r.value || r.field === "fault_symptom" || fieldProblem(r.field))
          .map((r, i) => {
            const err = fieldProblem(r.field);
            const editable = editableFields.has(r.field);
            const content = (
              <>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.rowLabel}>{r.label}</Text>
                  <Text style={[s.rowValue, !r.value && { color: t.faint }]} numberOfLines={3}>
                    {r.value || "Not set"}
                  </Text>
                  <InlineError text={err} style={{ marginTop: 4 }} />
                </View>
                {editable ? <Bx name="bx-chevron-right" size={18} color={t.faint} /> : null}
              </>
            );
            return editable ? (
              <TouchableOpacity
                key={r.field}
                onPress={() => onEditField(r.field)}
                activeOpacity={0.8}
                style={[s.row, i > 0 && s.rowDivider]}
                accessibilityRole="button"
                accessibilityLabel={`${r.label}: ${r.value || "not set"}. Tap to change`}
              >
                {content}
              </TouchableOpacity>
            ) : (
              <View key={r.field} style={[s.row, i > 0 && s.rowDivider]}>
                {content}
              </View>
            );
          })}
      </Panel>

      <Panel title="RCA sections">
        {sections.map((sec, i) => {
          const a = answers[sec.id];
          const err = sectionProblemFor(sec.id);
          const line = a ? firstLine(a.text) : "";
          const photos = a?.photos.length ?? 0;
          return (
            <TouchableOpacity
              key={sec.id}
              onPress={() => onEditSection(sec.id)}
              activeOpacity={0.8}
              style={[s.row, i > 0 && s.rowDivider]}
              accessibilityRole="button"
              accessibilityLabel={`${sec.title}. ${line || "No answer"}${photos ? `. ${photos} photos` : ""}. Tap to change`}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.rowLabel}>
                  {i + 1}. {sec.title}
                  {isSectionRequired(sec) ? "" : " · optional"}
                </Text>
                <Text style={[s.rowValue, !line && { color: t.faint }]} numberOfLines={2}>
                  {line || (sectionAsksPhotos(sec) && photos ? "Photos only" : "No answer")}
                </Text>
                {photos ? (
                  <View style={s.photoLine}>
                    <Bx name="bx-image" size={13} color={t.muted} />
                    <Text style={s.photoLineText}>
                      {photos} {photos === 1 ? "photo" : "photos"}
                    </Text>
                  </View>
                ) : null}
                <InlineError text={err} style={{ marginTop: 4 }} />
              </View>
              <Bx name="bx-chevron-right" size={18} color={t.faint} />
            </TouchableOpacity>
          );
        })}
      </Panel>
    </ScrollView>
  );
}

const useStyles = makeJoStyles((t) => ({
  body: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 28 },
  title: { ...f.d(24, -0.02, 1.18), color: t.ink, paddingHorizontal: 4 },
  help: { ...f.t(14), lineHeight: 20, color: t.muted, marginTop: 8, paddingHorizontal: 4 },

  alert: { flexDirection: "row", alignItems: "flex-start", gap: 9, marginTop: 14, padding: 14, borderRadius: 18 },
  alertTitle: { ...f.t(13, 700), marginBottom: 6 },
  alertText: { ...f.t(12.5, 500), flex: 1, lineHeight: 18 },
  problemRow: { paddingVertical: 4 },

  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  rowDivider: { borderTopWidth: 1, borderTopColor: t.line },
  rowLabel: { ...f.t(11.5), color: t.muted },
  rowValue: { ...f.t(14, 500), lineHeight: 19, color: t.ink, marginTop: 2 },
  photoLine: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  photoLineText: { ...f.t(12), color: t.muted },
}));
