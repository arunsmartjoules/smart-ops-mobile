/**
 * Incident detail — artboard "Incident detail" (app.dc.html r_incidentDetail):
 * back · INC id · raised line, a Details / Activity / RCA step switch, then
 * the step body over a fade-out action bar.
 *
 * Presentation only: every value and setter comes from the incidents tab,
 * which owns the update flow (completing needs remarks + a photo; times and
 * assignment are admin/manager-only; RCA files are admin/manager-only once
 * the incident is resolved).
 */
import React, { useMemo, useState } from "react";
import { Modal, ScrollView, Text, View } from "react-native";
// Not React Native's KeyboardAvoidingView: the app mounts a KeyboardProvider
// (keyboard-controller) at the root, and with Android edge-to-edge the window no
// longer resizes for the keyboard, so RN's "height" mode never lifts the footer
// inside a Modal — the Complete button stayed hidden behind the keyboard.
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bx } from "@/components/jo/Bx";
import { GlossFill, Segmented, f, useJoTheme } from "@/components/jo/ui";
import { toneFg } from "@/constants/jo";
import IncidentActivity from "./incidents/IncidentActivity";
import IncAttachments from "./incidents/IncAttachments";
import {
  ActionBar,
  BarPrimary,
  DateTimeField,
  IST_DT_OPTS,
  IncHeader,
  IncPicker,
  Notice,
  Panel,
  TextField,
  ToggleRow,
} from "./incidents/IncFields";
import {
  formatAge,
  getIncidentStatus,
  isIncidentOpen,
  rcaStage,
  severityTone,
  toMs,
} from "./incidents/IncidentsUI";
import { type SelectOption } from "./SearchableSelect";
import { formatIST } from "@/utils/istDate";

/** The fields this screen reads beyond the list row's own shape. */
export interface IncidentDetailRecord {
  created_by?: string | null;
  raised_by?: string | null;
  root_cause?: string | null;
  corrective_action?: string | null;
  preventive_action?: string | null;
  [key: string]: any;
}

interface IncidentDetailModalProps {
  visible: boolean;
  incident: IncidentDetailRecord | null;
  onClose: () => void;
  canEditRca: boolean;
  nextStatus: "Inprogress" | "Resolved" | null;
  setNextStatus: (value: "Inprogress" | "Resolved" | null) => void;
  remarks: string;
  setRemarks: (value: string) => void;
  isUpdating: boolean;
  onSubmit: () => void;
  canEditMeta: boolean;
  assignedTo: string;
  setAssignedTo: (value: string) => void;
  assigneeOptions: SelectOption[];
  respondedAt: Date | null;
  setRespondedAt: (value: Date | null) => void;
  createdAt: Date | null;
  setCreatedAt: (value: Date | null) => void;
  resolvedAt: Date | null;
  setResolvedAt: (value: Date | null) => void;
  existingAttachmentUrls: string[];
  pendingAttachments: string[];
  setPendingAttachments: React.Dispatch<React.SetStateAction<string[]>>;
  existingRcaAttachmentUrls: string[];
  pendingRcaAttachments: string[];
  setPendingRcaAttachments: React.Dispatch<React.SetStateAction<string[]>>;
}

type Step = "Details" | "Activity" | "RCA";

export default function IncidentDetailModal({
  visible,
  incident,
  onClose,
  canEditRca,
  nextStatus,
  setNextStatus,
  remarks,
  setRemarks,
  isUpdating,
  onSubmit,
  canEditMeta,
  assignedTo,
  setAssignedTo,
  assigneeOptions,
  createdAt,
  setCreatedAt,
  resolvedAt,
  setResolvedAt,
  existingAttachmentUrls,
  pendingAttachments,
  setPendingAttachments,
  existingRcaAttachmentUrls,
  pendingRcaAttachments,
  setPendingRcaAttachments,
}: IncidentDetailModalProps) {
  const t = useJoTheme();
  const insets = useSafeAreaInsets();
  // Step is remembered per incident id: a different incident starts on
  // Details — or on RCA when that is what this person can act on next
  // (resolved, RCA not yet filed). Live refreshes of the same incident keep
  // whatever step is showing.
  const [stepFor, setStepFor] = useState<{ id: unknown; step: Step } | null>(null);

  // Resolved before the early return so hook order never depends on `incident`.
  const nameOf = useMemo(() => {
    const byId = new Map(assigneeOptions.map((o) => [o.value, o.label]));
    return (id: string) => byId.get(id) || id;
  }, [assigneeOptions]);

  if (!visible || !incident) return null;
  const step: Step =
    stepFor && stepFor.id === incident.id
      ? stepFor.step
      : incident.status === "Resolved" && canEditRca
        ? "RCA"
        : "Details";
  const setStep = (next: Step) => setStepFor({ id: incident.id, step: next });

  // Closed = the work is done, whether or not the RCA has been filed. Filing
  // the RCA moves the status on to "RCA Submitted", so testing for "Resolved"
  // alone would put a filed incident back into the "mark resolved" state.
  const isResolved = incident.status === "Resolved" || incident.status === "RCA Submitted";
  const restrictResolvedEdits = isResolved && !canEditRca;
  const completing = nextStatus === "Resolved";
  const status = getIncidentStatus(incident.status, t);
  const stage = rcaStage({ status: incident.status, rca_status: incident.rca_status }, t);

  // Completing needs remarks and at least one new photo (backend-enforced too).
  const completionBlocker =
    completing && !remarks.trim()
      ? "Add resolution remarks to complete the incident"
      : completing && pendingAttachments.length === 0
        ? "Add at least one photo to complete the incident"
        : null;

  const raisedMs = toMs(incident.incident_created_time);
  const resolvedMs = toMs(incident.incident_resolved_time);
  const raisedLine =
    raisedMs == null
      ? incident.site_code
      : `Raised ${formatIST(raisedMs, { day: "numeric", month: "short" })} · ${formatIST(raisedMs, {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })}${!isResolved ? ` · open ${formatAge(raisedMs)}` : ""}`;

  const assigneeLabel = assignedTo ? nameOf(assignedTo) : "Unassigned";
  const sevTone = severityTone(incident.severity);
  const durationLabel = isResolved ? "Took" : "Open for";
  const durationValue =
    raisedMs == null ? "—" : formatAge(raisedMs, isResolved && resolvedMs != null ? resolvedMs : undefined);

  const reportRows: { label: string; value: string }[] = [
    { label: "Site", value: incident.site_code || "—" },
    { label: "Operating condition", value: incident.operating_condition || "—" },
    // Created by = who logged it (user_id → name). Raised by = free text of
    // who reported it; legacy rows hold a user_id, which nameOf resolves too.
    { label: "Created by", value: incident.created_by ? nameOf(String(incident.created_by)) : "—" },
    {
      label: "Raised by",
      value: String(incident.raised_by ?? "").trim() ? nameOf(String(incident.raised_by).trim()) : "—",
    },
    ...(isResolved && resolvedMs != null
      ? [{ label: "Resolved", value: formatIST(resolvedMs, IST_DT_OPTS, "en-US") }]
      : []),
  ];
  const immediate = String(incident.immediate_action_taken ?? "").trim();

  const findings = [
    { label: "Root cause", value: String(incident.root_cause ?? "").trim() },
    { label: "Corrective action", value: String(incident.corrective_action ?? "").trim() },
    { label: "Preventive action", value: String(incident.preventive_action ?? "").trim() },
  ];
  const filledFindings = findings.filter((x) => x.value).length;

  const canAct = canEditMeta || canEditRca;
  const submitLabel =
    step === "RCA" && pendingRcaAttachments.length > 0
      ? "Submit RCA"
      : completing
        ? "Complete incident"
        : "Update incident";

  /* ── Details ───────────────────────────────────────────────────────── */
  const details = (
    <>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Pill label={status.label} bg={status.bg} fg={status.fg} />
        {incident.fault_type ? <Pill label={incident.fault_type} bg={t.muteTint} fg={t.ink2} /> : null}
      </View>
      <Text style={[f.d(22, -0.02, 1.18), { color: t.ink, marginTop: 10 }]}>
        {incident.fault_symptom || "Incident"}
      </Text>

      <View style={{ flexDirection: "row", gap: 6, marginTop: 14 }}>
        <Tile label="Severity" value={incident.severity || "—"} color={incident.severity ? toneFg(t, sevTone) : undefined} />
        <Tile label={durationLabel} value={durationValue} color={isResolved ? undefined : t.warn} />
        <Tile label="Owner" value={assigneeLabel} />
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginTop: 6,
          borderRadius: 18,
          backgroundColor: t.card,
          borderWidth: 1,
          borderColor: t.cardBorder,
          paddingVertical: 12,
          paddingHorizontal: 14,
        }}
      >
        <Bx name="bx-map-pin" size={16} color={t.muted} />
        <Text style={[f.t(13), { color: t.ink, flex: 1 }]}>{incident.asset_location || "No asset recorded"}</Text>
      </View>

      {/* Everything entered when the incident was raised stays visible in
          every status — an operator opening a resolved incident needs the
          original report, not just the closing fields. */}
      <Panel title="Report" style={{ marginTop: 12 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 6 }}>
          {reportRows.map((r) => (
            <View key={r.label} style={{ width: "50%", paddingRight: 8, marginTop: 10 }}>
              <Text style={[f.t(11), { color: t.muted }]}>{r.label}</Text>
              <Text style={[f.t(13, 600), { color: t.ink, marginTop: 3 }]}>{r.value}</Text>
            </View>
          ))}
        </View>
        <Text style={[f.t(11.5), { color: t.muted, marginTop: 14 }]}>Immediate action taken</Text>
        {/* Always shown — it's a required field, so a blank one (older
            incidents) should read as missing rather than vanish. */}
        <Text style={[f.t(13), { color: immediate ? t.ink2 : t.faint, marginTop: 4, lineHeight: 19 }]}>
          {immediate || "Not recorded"}
        </Text>
      </Panel>

      {!isResolved ? (
        // Incidents start In progress (no Open step), so the only move left is
        // to Resolved. A legacy Open row is treated the same.
        <ToggleRow
          icon="bx-check-circle"
          title="Mark as resolved"
          sub={
            completing
              ? "Needs a resolved time, resolution remarks and at least one photo"
              : "Turn on to close this incident"
          }
          on={completing}
          onToggle={() => setNextStatus(completing ? null : "Resolved")}
          disabled={!canAct}
        />
      ) : null}

      <Panel title="Assignment & times">
        <IncPicker
          label="Assigned to"
          required
          placeholder="Select site user"
          options={assigneeOptions}
          value={assignedTo}
          onChange={setAssignedTo}
          disabled={!canEditMeta || restrictResolvedEdits}
          searchPlaceholder="Search people"
        />
        <DateTimeField
          label="Created time"
          value={createdAt || (incident.incident_created_time ? new Date(incident.incident_created_time) : new Date())}
          onChange={setCreatedAt}
          disabled={!canEditMeta}
          noFuture
        />
        {!isResolved ? (
          <DateTimeField
            label="Resolved time"
            value={resolvedAt || new Date()}
            onChange={setResolvedAt}
            disabled={!canEditMeta}
            noFuture
          />
        ) : null}
      </Panel>

      <Panel
        title="Resolution remarks"
        meta={completing ? "Required" : "Optional"}
        metaTone={completing && !remarks.trim() ? "bad" : "muted"}
      >
        <View style={{ marginTop: 12 }}>
          <TextField
            placeholder="What was found and what was done?"
            value={remarks}
            onChangeText={setRemarks}
            multiline
            minHeight={88}
            invalid={completing && !remarks.trim()}
            editable={canAct}
            accessibilityLabel="Resolution remarks"
          />
        </View>
      </Panel>

      {/* Completion photos: photos only (the backend wants a photo to close),
          and only the NEW ones, so a photo from the original report can't
          read as meeting the requirement. */}
      {completing ? (
        <Panel title="Completion photos" meta="At least 1 required" metaTone={pendingAttachments.length ? "muted" : "bad"}>
          <IncAttachments
            pending={pendingAttachments}
            onChangePending={setPendingAttachments}
            sources={["camera", "gallery"]}
            emptyText="No photo added yet"
          />
        </Panel>
      ) : null}

      {/* Saved attachments are previewable in EVERY status — including while
          completing, when new uploads move to the panel above. */}
      <Panel title="Attachments" meta={existingAttachmentUrls.length ? `${existingAttachmentUrls.length} saved` : undefined}>
        {!completing && canAct ? (
          <Text style={[f.t(11.5), { color: t.muted, marginTop: 6 }]}>
            New files are added to this incident when you tap Update.
          </Text>
        ) : null}
        <IncAttachments
          existing={existingAttachmentUrls}
          pending={completing ? [] : pendingAttachments}
          onChangePending={setPendingAttachments}
          readOnly={completing || !canAct}
          fileLabel="Attach log"
          emptyText="No attachments yet"
        />
      </Panel>
    </>
  );

  /* ── RCA ───────────────────────────────────────────────────────────── */
  const rca = (
    <>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          borderRadius: 18,
          backgroundColor: t.card,
          borderWidth: 1,
          borderColor: t.cardBorder,
          paddingVertical: 12,
          paddingHorizontal: 14,
        }}
      >
        <Text style={[f.t(12.5, 600), { color: stage.color }]}>{stage.label}</Text>
        <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: t.track, overflow: "hidden" }}>
          <View style={{ height: "100%", width: `${stage.pct}%`, borderRadius: 2, backgroundColor: stage.color }}>
            <GlossFill color={stage.color} radius={2} />
          </View>
        </View>
      </View>

      <Panel title="Root cause · findings" meta={`${filledFindings} of ${findings.length}`}>
        <View style={{ gap: 8, marginTop: 12 }}>
          {findings.map((x, i) => (
            <View key={x.label} style={{ flexDirection: "row", gap: 10 }}>
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  marginTop: 2,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: x.value ? t.accent : t.track,
                }}
              >
                {x.value ? <GlossFill color={t.accent} fg={t.onAccent} radius={13} /> : null}
                <Text style={[f.t(12, 700), { color: x.value ? t.onAccent : t.muted }]}>{i === 0 ? "★" : i + 1}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[f.t(11.5), { color: t.muted }]}>{x.label}</Text>
                <View
                  style={{
                    marginTop: 5,
                    minHeight: 42,
                    borderRadius: 14,
                    backgroundColor: t.raised,
                    borderWidth: 1,
                    borderColor: t.isDark ? "rgba(255,255,255,0.07)" : t.lineMid,
                    justifyContent: "center",
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                  }}
                >
                  <Text style={[f.t(13), { color: x.value ? t.ink : t.faint, lineHeight: 18 }]}>
                    {x.value || "Not recorded"}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
        <Text style={[f.t(11.5), { color: t.muted, marginTop: 12 }]}>
          Filled from the uploaded RCA report or by an admin on the web.
        </Text>
      </Panel>

      {/* RCA is only relevant once the incident is Resolved. It is a single
          attachment list — filing one is what marks the RCA submitted. Stays
          visible after filing so more can be added. */}
      {isResolved ? (
        canEditRca || existingRcaAttachmentUrls.length > 0 ? (
          <Panel title="RCA report" meta={existingRcaAttachmentUrls.length ? `${existingRcaAttachmentUrls.length} filed` : undefined}>
            {canEditRca ? (
              <Text style={[f.t(11.5), { color: t.muted, marginTop: 6 }]}>
                Attach the RCA report — any file type. Adding one marks the RCA as submitted.
              </Text>
            ) : null}
            <IncAttachments
              existing={existingRcaAttachmentUrls}
              pending={pendingRcaAttachments}
              onChangePending={setPendingRcaAttachments}
              readOnly={!canEditRca}
              fileLabel="Attach RCA"
              emptyText="No RCA attachment yet"
            />
          </Panel>
        ) : (
          <Notice icon="bx-lock-alt" tone="mute" style={{ marginTop: 10 }}>
            No RCA filed yet. An admin or manager files it.
          </Notice>
        )
      ) : (
        <Notice icon="bx-info-circle" tone="info" style={{ marginTop: 10 }}>
          The RCA opens once the incident is resolved.
        </Notice>
      )}
    </>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: t.page }}>
        <IncHeader
          title={incident.incident_id || "Incident"}
          subtitle={raisedLine}
          subtitleColor={isIncidentOpen(incident.status) ? t.badSoft : undefined}
          onBack={onClose}
        />
        <Segmented<Step>
          items={[
            { key: "Details", label: "Details" },
            { key: "Activity", label: "Activity" },
            { key: "RCA", label: "RCA" },
          ]}
          value={step}
          onChange={setStep}
          height={38}
          style={{ marginHorizontal: 16, marginBottom: 10 }}
        />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 28 }}
          >
            {step === "Details" ? details : null}
            {step === "Activity" ? (
              <IncidentActivity
                incident={incident}
                attachments={existingAttachmentUrls.filter((u) => /^https?:\/\//i.test(u))}
                rcaAttachments={existingRcaAttachmentUrls.filter((u) => /^https?:\/\//i.test(u))}
                nameOf={nameOf}
              />
            ) : null}
            {step === "RCA" ? rca : null}
            {!canAct ? (
              <Notice icon="bx-lock-alt" tone="mute" style={{ marginTop: 12 }}>
                View only — punch in to update this incident.
              </Notice>
            ) : null}
          </ScrollView>

          {canAct ? (
            <ActionBar bottomInset={insets.bottom} note={completionBlocker}>
              <BarPrimary
                label={submitLabel}
                icon={submitLabel === "Update incident" ? undefined : "bx-check"}
                onPress={onSubmit}
                busy={isUpdating}
                // Still tappable while blocked: the tab's own checks explain why.
                style={completionBlocker ? { opacity: 0.55 } : undefined}
              />
            </ActionBar>
          ) : null}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function Pill({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={{ height: 24, paddingHorizontal: 10, borderRadius: 12, justifyContent: "center", backgroundColor: bg }}>
      <Text style={[f.t(11.5, 600), { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Tile({ label, value, color }: { label: string; value: string; color?: string }) {
  const t = useJoTheme();
  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        borderRadius: 18,
        backgroundColor: t.card,
        borderWidth: 1,
        borderColor: t.cardBorder,
        paddingVertical: 11,
        paddingHorizontal: 12,
      }}
    >
      <Text style={[f.t(11), { color: t.muted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[f.t(13, 600), { color: color ?? t.ink, marginTop: 4 }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

