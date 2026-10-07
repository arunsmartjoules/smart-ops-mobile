import React, { useMemo } from "react";
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
// Not React Native's KeyboardAvoidingView: the app mounts a KeyboardProvider
// (keyboard-controller) at the root, and with Android edge-to-edge the window no
// longer resizes for the keyboard, so RN's "height" mode never lifts the footer
// inside a Modal — the Complete button stayed hidden behind the keyboard.
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { CalendarClock, Clock as ClockIcon } from "lucide-react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import FullscreenPicker from "./FullscreenPicker";
import AttachmentField from "./AttachmentField";
import IncidentActivity from "./incidents/IncidentActivity";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import {
  Badge,
  CardHead,
  DetailCard,
  DetailHeader,
  Field,
  MetaBlock,
  StatusChip,
  StatusHint,
  SubmitBar,
  soRadius,
} from "@/components/tickets/TicketDetailUI";
import { getIncidentStatus } from "@/components/incidents/IncidentsUI";
import { type SelectOption } from "./SearchableSelect";
import { formatIST } from "@/utils/istDate";

const IST_PICKED_OPTS: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
};

interface IncidentDetailModalProps {
  visible: boolean;
  incident: any | null;
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
  respondedAt,
  setRespondedAt,
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
  const ds = useDs();
  const detailStyles = useDetailStyles();
  const insets = useSafeAreaInsets();
  const [pickerVisible, setPickerVisible] = React.useState(false);
  const [pickerTarget, setPickerTarget] = React.useState<
    "created" | "responded" | "resolved"
  >("responded");

  const openDateTimePicker = (target: "created" | "responded" | "resolved") => {
    const now = new Date();
    const applyDate = (next: Date) => {
      if (next.getTime() > now.getTime()) {
        Alert.alert("Invalid time", "Future date/time is not allowed.");
        return;
      }
      if (target === "created") setCreatedAt(next);
      else if (target === "responded") setRespondedAt(next);
      else setResolvedAt(next);
    };

    if (Platform.OS === "android") {
      const base =
        target === "created"
          ? createdAt || now
          : target === "responded"
            ? respondedAt || now
            : resolvedAt || now;
      DateTimePickerAndroid.open({
        value: base,
        mode: "date",
        is24Hour: true,
        maximumDate: now,
        onChange: (_evt, d1) => {
          if (!d1) return;
          DateTimePickerAndroid.open({
            value: d1,
            mode: "time",
            is24Hour: true,
            onChange: (_evt2, d2) => {
              if (!d2) return;
              applyDate(d2);
            },
          });
        },
      });
      return;
    }
    setPickerTarget(target);
    setPickerVisible(true);
  };

  // Resolved before the early return so hook order never depends on `incident`.
  const nameOf = useMemo(() => {
    const byId = new Map(assigneeOptions.map((o) => [o.value, o.label]));
    return (id: string) => byId.get(id) || id;
  }, [assigneeOptions]);

  if (!visible || !incident) return null;
  // Closed = the work is done, whether or not the RCA has been filed. Filing
  // the RCA moves the status on to "RCA Submitted", so testing for "Resolved"
  // alone would put a filed incident back into the "Tap Resolved" state.
  const isResolved =
    incident.status === "Resolved" || incident.status === "RCA Submitted";
  const restrictResolvedEdits = isResolved && !canEditRca;
  const completing = nextStatus === "Resolved";

  const statusTone = getIncidentStatus(incident.status, ds);
  // Completing needs remarks and at least one new photo (backend-enforced too).
  const completionBlocker =
    completing && !remarks.trim()
      ? "Add resolution remarks to complete the incident"
      : completing && pendingAttachments.length === 0
        ? "Add at least one photo to complete the incident"
        : null;
  const raisedMs = incident.incident_created_time
    ? typeof incident.incident_created_time === "number"
      ? incident.incident_created_time
      : Date.parse(String(incident.incident_created_time))
    : NaN;
  const raisedLine = Number.isNaN(raisedMs)
    ? incident.site_code
    : `Raised ${formatIST(raisedMs, { day: "numeric", month: "short" })} · ${formatIST(raisedMs, { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  const resolvedMs = incident.incident_resolved_time
    ? typeof incident.incident_resolved_time === "number"
      ? incident.incident_resolved_time
      : Date.parse(String(incident.incident_resolved_time))
    : NaN;
  const assigneeLabel = assignedTo ? nameOf(assignedTo) : "Unassigned";

  const metaItems: { label: string; value: string; full?: boolean }[] = [
    { label: "Asset", value: incident.asset_location || "—", full: true },
    { label: "Site", value: incident.site_code || "—" },
    { label: "Assigned", value: assigneeLabel },
    { label: "Fault type", value: incident.fault_type || "—" },
    { label: "Severity", value: incident.severity || "—" },
    { label: "Operating condition", value: incident.operating_condition || "—" },
    {
      label: "Raised by",
      value: incident.raised_by ? nameOf(String(incident.raised_by)) : "—",
    },
    ...(isResolved && !Number.isNaN(resolvedMs)
      ? [{ label: "Resolved", value: formatIST(resolvedMs, IST_PICKED_OPTS, "en-US") }]
      : []),
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: ds.pageBg }}>
        <DetailHeader
          topInset={insets.top}
          title={incident.incident_id || "Incident"}
          subtitle={raisedLine}
          onBack={onClose}
        />
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior="padding"
          keyboardVerticalOffset={0}
        >
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 16,
              paddingBottom: 20,
            }}
          >
            {/* Everything entered when the incident was raised stays visible in
                every status — an operator opening a resolved incident needs the
                original report, not just the closing fields. */}
            <DetailCard style={{ padding: 16, marginBottom: 12 }}>
              <Text style={detailStyles.title}>
                {incident.fault_symptom || "Incident"}
              </Text>
              <View style={detailStyles.badgeRow}>
                <Badge label={statusTone.label} bg={statusTone.bg} fg={statusTone.fg} />
              </View>
              {/* A fixed two-column grid: free-wrapping blocks sized to their
                  text left a ragged, uneven layout. The asset path is long, so
                  it gets the full width. */}
              <View style={detailStyles.metaGrid}>
                {metaItems.map((m) => (
                  <View
                    key={m.label}
                    style={m.full ? detailStyles.metaCellFull : detailStyles.metaCell}
                  >
                    <MetaBlock label={m.label} value={m.value} />
                  </View>
                ))}
              </View>
              {/* Always shown — it's a required field, so a blank one (older
                  incidents) should read as missing rather than vanish. */}
              <View style={{ marginTop: 12 }}>
                <Text style={detailStyles.eyebrow}>Immediate action taken</Text>
                <Text
                  style={[
                    detailStyles.bodyText,
                    !String(incident.immediate_action_taken ?? "").trim() && {
                      color: ds.carbon[600],
                      fontStyle: "italic",
                    },
                  ]}
                >
                  {String(incident.immediate_action_taken ?? "").trim() || "Not recorded"}
                </Text>
              </View>
            </DetailCard>

            {!isResolved ? (
              <>
                <View style={detailStyles.statusRow}>
                  <Text style={detailStyles.statusLabel}>Status</Text>
                  {/* Incidents start In progress (no Open step), so the
                      only move left is to Resolved. A legacy Open row
                      is treated the same. */}
                  <StatusChip
                    label="Resolved"
                    active={completing}
                    onPress={() => setNextStatus(completing ? null : "Resolved")}
                  />
                </View>
                <StatusHint icon={ClockIcon}>
                  {completing
                    ? "Needs a resolved time, resolution remarks and at least one photo"
                    : "Tap Resolved to close this incident"}
                </StatusHint>
              </>
            ) : null}

            <DetailCard>
              <CardHead label="Details" />
              <FullscreenPicker
                label="Assigned To"
                placeholder="Select site user"
                options={assigneeOptions}
                value={assignedTo}
                onChange={setAssignedTo}
                disabled={!canEditMeta || restrictResolvedEdits}
              />
              <DateField
                label="Created time"
                value={formatIST(
                  createdAt ||
                    new Date(incident.incident_created_time || Date.now()),
                  IST_PICKED_OPTS,
                  "en-US",
                )}
                onPress={() => openDateTimePicker("created")}
                disabled={!canEditMeta}
              />
              {!isResolved ? (
                <DateField
                  label="Resolved time"
                  value={formatIST(resolvedAt || new Date(), IST_PICKED_OPTS, "en-US")}
                  onPress={() => openDateTimePicker("resolved")}
                  disabled={!canEditMeta}
                  style={{ marginTop: 12 }}
                />
              ) : null}
            </DetailCard>

            <DetailCard>
              <CardHead
                label="Resolution remarks"
                hint={completing ? "Required" : "Optional"}
                hintTone={completing && !remarks.trim() ? "error" : "muted"}
              />
              <Field
                placeholder="What was found and what was done?"
                value={remarks}
                onChangeText={setRemarks}
                multiline
                textAlignVertical="top"
                minHeight={88}
                invalid={completing && !remarks.trim()}
              />
            </DetailCard>

            {/* Completion photos: photos only (the backend wants a photo to
                close), and only the NEW ones, so a photo from the original
                report can't read as meeting the requirement. */}
            {completing ? (
              <DetailCard style={detailStyles.attachCard}>
                <AttachmentField
                  title="Completion Photos *"
                  hint="At least one photo is required to mark the incident completed."
                  pending={pendingAttachments}
                  onChangePending={setPendingAttachments}
                  sources={["camera", "gallery"]}
                  addLabel="Add photo"
                  emptyText="No photo added yet"
                />
              </DetailCard>
            ) : null}

            {/* Saved attachments are previewable in EVERY status — including
                while completing, when new uploads move to the card above. */}
            <DetailCard style={detailStyles.attachCard}>
              <AttachmentField
                title="Attachments"
                hint={
                  completing
                    ? undefined
                    : "New files are saved to the same incident attachments list when you tap Update."
                }
                existing={existingAttachmentUrls}
                pending={completing ? [] : pendingAttachments}
                onChangePending={setPendingAttachments}
                readOnly={completing}
                emptyText="No attachments yet"
              />
            </DetailCard>

            {/* RCA is only relevant once the incident is Resolved. It is a
                single attachment list — filing one is what marks the RCA
                submitted. Stays visible after filing so more can be added. */}
            {isResolved && (canEditRca || existingRcaAttachmentUrls.length > 0) ? (
              <DetailCard style={detailStyles.attachCard}>
                <AttachmentField
                  title="RCA Attachment"
                  hint={
                    canEditRca
                      ? "Attach the RCA report — any file type. Adding one marks the RCA as submitted."
                      : undefined
                  }
                  existing={existingRcaAttachmentUrls}
                  pending={pendingRcaAttachments}
                  onChangePending={setPendingRcaAttachments}
                  readOnly={!canEditRca}
                  addLabel="Add RCA attachment"
                  emptyText="No RCA attachment yet"
                />
              </DetailCard>
            ) : null}

            <IncidentActivity
              incident={incident}
              attachments={existingAttachmentUrls.filter((u) => /^https?:\/\//i.test(u))}
              rcaAttachments={existingRcaAttachmentUrls.filter((u) => /^https?:\/\//i.test(u))}
              nameOf={nameOf}
            />
          </ScrollView>

          {pickerVisible && Platform.OS !== "android" ? (
            <DateTimePicker
              value={
                pickerTarget === "created"
                  ? createdAt || new Date()
                  : pickerTarget === "responded"
                    ? respondedAt || new Date()
                    : resolvedAt || new Date()
              }
              mode="datetime"
              maximumDate={new Date()}
              onChange={(_, d) => {
                setPickerVisible(false);
                if (!d) return;
                if (d.getTime() > Date.now()) {
                  Alert.alert("Invalid time", "Future date/time is not allowed.");
                  return;
                }
                if (pickerTarget === "created") setCreatedAt(d);
                else if (pickerTarget === "responded") setRespondedAt(d);
                else setResolvedAt(d);
              }}
            />
          ) : null}

          {(canEditMeta || canEditRca) && (
            <SubmitBar
              label="Update incident"
              ready={!completionBlocker}
              blocked={completionBlocker}
              busy={isUpdating}
              bottomInset={insets.bottom}
              onPress={onSubmit}
            />
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/** A tappable date/time value, drawn like the detail screen's text fields. */
function DateField({
  label,
  value,
  onPress,
  disabled,
  style,
}: {
  label: string;
  value: string;
  onPress: () => void;
  disabled?: boolean;
  style?: object;
}) {
  const ds = useDs();
  const detailStyles = useDetailStyles();
  return (
    <View style={style}>
      <Text style={detailStyles.eyebrow}>{label}</Text>
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.8}
        style={[detailStyles.dateBox, disabled && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}`}
      >
        <Text style={detailStyles.dateText}>{value}</Text>
        {!disabled ? (
          <CalendarClock size={15} color={ds.carbon[500]} strokeWidth={2} />
        ) : null}
      </TouchableOpacity>
    </View>
  );
}

const useDetailStyles = makeThemedStyles((ds) => ({
  title: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
    letterSpacing: 0.16,
    color: ds.carbon[100],
    marginBottom: 10,
  },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 14 },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderTopWidth: 1,
    borderTopColor: ds.carbon[1000],
    paddingTop: 13,
  },
  metaCell: { width: "50%", paddingRight: 8, marginBottom: 8 },
  metaCellFull: { width: "100%", marginBottom: 8 },
  // AttachmentField carries its own bottom margin.
  attachCard: { paddingBottom: 2 },
  dateBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 7,
    backgroundColor: ds.pageBg,
    borderWidth: 1,
    borderColor: ds.carbon[900],
    borderRadius: soRadius.sm,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  dateText: { fontSize: 13, color: ds.carbon[100] },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 8,
  },
  statusLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    color: ds.carbon[500],
  },
  bodyText: { fontSize: 13, lineHeight: 19, color: ds.carbon[200] },
  eyebrow: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    color: ds.carbon[500],
    marginBottom: 7,
  },
}));
