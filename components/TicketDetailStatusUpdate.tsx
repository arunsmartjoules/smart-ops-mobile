import React, { useMemo, useState } from "react";
import {
  Alert,
  Image,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  Camera,
  Check,
  Clock,
  FolderOpen,
  ImagePlus,
  Pause,
  TriangleAlert,
  Wrench,
  X,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { type SelectOption } from "./SearchableSelect";
import FullscreenPicker from "./FullscreenPicker";
import { type Ticket } from "@/services/TicketsService";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import {
  AttachButton,
  CardHead,
  DetailCard,
  Field,
  StatusChip,
  StatusHint,
  ToggleRow,
  soRadius,
} from "@/components/tickets/TicketDetailUI";
import {
  DEFAULT_TICKET_INCIDENT_DRAFT,
  FAULT_TYPE_OPTIONS,
  OPERATING_CONDITION_OPTIONS,
  SEVERITY_OPTIONS,
  type TicketIncidentDraft,
} from "@/constants/incidentFormOptions";

/** Categories where before/after temperature fields are required (Inprogress / Resolved). */
export const AREA_TEMPERATURE_COMPLAINTS_CATEGORY = "Area Temperature Complaints";
export const AREA_RH_COMPLAINTS_CATEGORY = "Area RH Complaints";

export const isTempMandatoryCategory = (category: string) =>
  [AREA_TEMPERATURE_COMPLAINTS_CATEGORY, AREA_RH_COMPLAINTS_CATEGORY].includes(
    category.trim(),
  );

/** Category that requires the operator to pick whether it's an electrical or
 *  mechanical breakdown (stored on the ticket's `breakdown_type` column). */
export const AHU_FCU_BREAKDOWN_CATEGORY = "AHU and FCU Breakdown";

export const isBreakdownTypeCategory = (category: string) =>
  category.trim().toLowerCase() === AHU_FCU_BREAKDOWN_CATEGORY.toLowerCase();

const BREAKDOWN_TYPE_OPTIONS: SelectOption[] = [
  { value: "Electrical", label: "Electrical" },
  { value: "Mechanical", label: "Mechanical" },
];

/** Sentinel value for the "Others" choice in the area picker. Selecting it
 *  reveals a free-text box so operators can record an asset/area that isn't in
 *  the assets table — the typed text is stored on the ticket's `area_asset`
 *  column only; no row is ever created in the assets table. */
const OTHER_AREA_VALUE = "__other__";

export const REMARKS_REQUIRED_STATUSES = [
  "Hold",
  "Cancelled",
  "Waiting",
  "Resolved",
];

/** Display label for a status value ("Inprogress" is stored, not shown). */
export const statusLabel = (s: string) =>
  s === "Inprogress" ? "In progress" : s === "Open" ? "Reopen" : s;

const STATUS_HINT_ICON: Record<string, LucideIcon> = {
  Open: FolderOpen,
  Inprogress: Wrench,
  Hold: Pause,
  Waiting: Clock,
  Resolved: Check,
  Cancelled: X,
};

/**
 * The mock hard-codes one hint per status; ours derives from the same rules
 * `getTicketUpdateBlocker` enforces, so it can't promise a temperature field
 * on a category that doesn't capture one.
 */
function statusHintFor(status: string, tempMandatory: boolean): string {
  switch (status) {
    case "Inprogress":
      return tempMandatory
        ? "Needs area, category and before temperature"
        : "Needs area and category";
    case "Resolved":
      return tempMandatory
        ? "Needs remarks and after temperature"
        : "Needs remarks to close";
    case "Hold":
      return "Blocked — add a reason in remarks";
    case "Waiting":
      return "Waiting on a spare or vendor";
    case "Cancelled":
      return "Closed without work — add a reason";
    case "Open":
      return "Reopens the ticket";
    default:
      return "";
  }
}

export interface TicketUpdateBlockerInput {
  ticket: Ticket;
  updateStatus: string;
  updateRemarks: string;
  updateArea: string;
  updateCategory: string;
  updateBreakdownType: string;
  beforeTemp: string;
  afterTemp: string;
  createIncidentFromTicket?: boolean;
  incidentDraft?: TicketIncidentDraft;
}

/**
 * The one reason the update can't be submitted yet, or null when it can.
 *
 * Mirrors the validation the calling screens run before `updateTicket`; it
 * drives the sticky bar's message so the operator sees the blocker before
 * tapping rather than as an alert afterwards.
 */
export function getTicketUpdateBlocker({
  ticket,
  updateStatus,
  updateRemarks,
  updateArea,
  updateCategory,
  updateBreakdownType,
  beforeTemp,
  afterTemp,
  createIncidentFromTicket,
  incidentDraft,
}: TicketUpdateBlockerInput): string | null {
  const needsRemarks = REMARKS_REQUIRED_STATUSES.includes(updateStatus);
  const needsAreaAndCategory =
    updateStatus === "Inprogress" || updateStatus === "Resolved";

  if (needsRemarks && !updateRemarks.trim()) {
    return "Remarks are required for this status";
  }
  if (needsAreaAndCategory && !(updateArea || ticket.area_asset || "").trim()) {
    return "Select an area before updating";
  }
  if (
    needsAreaAndCategory &&
    !(updateCategory || ticket.category || "").trim()
  ) {
    return "Select a category before updating";
  }

  const effectiveCategory = (
    updateCategory.trim() ||
    ticket.category ||
    ""
  ).trim();

  if (
    needsAreaAndCategory &&
    isBreakdownTypeCategory(effectiveCategory) &&
    !updateBreakdownType.trim()
  ) {
    return "Choose Electrical or Mechanical";
  }

  if (needsAreaAndCategory && isTempMandatoryCategory(effectiveCategory)) {
    // Which temps are captured tracks the *current* ticket status, matching
    // the fields actually rendered below.
    const bt = beforeTemp.trim();
    const at = afterTemp.trim();
    if (ticket.status === "Open" && !bt) {
      return "Before temperature is required";
    }
    if (ticket.status === "Inprogress" && (!bt || !at)) {
      return "Before and after temperature are required";
    }
    if (bt && Number.isNaN(parseFloat(bt))) {
      return "Before temperature must be a number";
    }
    if (ticket.status === "Inprogress" && at && Number.isNaN(parseFloat(at))) {
      return "After temperature must be a number";
    }
  }

  if (createIncidentFromTicket && incidentDraft) {
    if (!incidentDraft.fault_type) return "Select a fault type for the incident";
    if (!incidentDraft.severity) return "Select a severity for the incident";
    if (!incidentDraft.operating_condition) {
      return "Select an operating condition for the incident";
    }
  }

  return null;
}

interface TicketDetailStatusUpdateProps {
  ticket: Ticket;
  updateStatus: string;
  setUpdateStatus: (s: string) => void;
  updateRemarks: string;
  setUpdateRemarks: (s: string) => void;
  updateArea: string;
  setUpdateArea: (s: string) => void;
  updateCategory: string;
  setUpdateCategory: (s: string) => void;
  updateBreakdownType: string;
  setUpdateBreakdownType: (s: string) => void;
  areaOptions: SelectOption[];
  categoryOptions: SelectOption[];
  areasLoading?: boolean;
  beforeTemp: string;
  setBeforeTemp: (v: string) => void;
  afterTemp: string;
  setAfterTemp: (v: string) => void;
  attachmentUri?: string;
  setAttachmentUri: (uri: string) => void;
  areaSearchQuery?: string;
  setAreaSearchQuery?: (query: string) => void;
  loadMoreAreas?: () => void;
  hasMoreAreas?: boolean;
  loadingMoreAreas?: boolean;
  createIncidentFromTicket?: boolean;
  setCreateIncidentFromTicket?: (v: boolean) => void;
  incidentDraft?: TicketIncidentDraft;
  setIncidentDraft?: React.Dispatch<React.SetStateAction<TicketIncidentDraft>>;
  /** Set once the operator has tried to submit — turns hints flame. */
  attempted?: boolean;
}

const TicketDetailStatusUpdate = ({
  ticket,
  updateStatus,
  setUpdateStatus,
  updateRemarks,
  setUpdateRemarks,
  updateArea,
  setUpdateArea,
  updateCategory,
  setUpdateCategory,
  updateBreakdownType,
  setUpdateBreakdownType,
  areaOptions,
  categoryOptions,
  areasLoading,
  beforeTemp,
  setBeforeTemp,
  afterTemp,
  setAfterTemp,
  attachmentUri,
  setAttachmentUri,
  areaSearchQuery,
  setAreaSearchQuery,
  loadMoreAreas,
  hasMoreAreas,
  loadingMoreAreas,
  createIncidentFromTicket = false,
  setCreateIncidentFromTicket,
  incidentDraft = DEFAULT_TICKET_INCIDENT_DRAFT,
  setIncidentDraft,
  attempted = false,
}: TicketDetailStatusUpdateProps) => {
  const styles = useStyles();
  const ds = useDs();
  const incidentFaultTypeOptions = useMemo(
    () => FAULT_TYPE_OPTIONS.map((value) => ({ value, label: value })),
    [],
  );
  const incidentSeverityOptions = useMemo(
    () => SEVERITY_OPTIONS.map((value) => ({ value, label: value })),
    [],
  );
  const incidentOperatingOptions = useMemo(
    () => OPERATING_CONDITION_OPTIONS.map((value) => ({ value, label: value })),
    [],
  );

  // "Others" lets the operator type a free-text asset/area. While active,
  // `updateArea` holds the typed text directly (it's what gets sent as
  // `area_asset`), so the picker shows the sentinel value instead.
  const [isOtherArea, setIsOtherArea] = useState(false);

  const areaOptionsWithOther = useMemo<SelectOption[]>(
    () => [
      ...areaOptions,
      {
        value: OTHER_AREA_VALUE,
        label: "Others",
        description: "Enter a custom asset / area",
      },
    ],
    [areaOptions],
  );

  const handleAreaChange = (value: string) => {
    if (value === OTHER_AREA_VALUE) {
      setIsOtherArea(true);
      setUpdateArea("");
    } else {
      setIsOtherArea(false);
      setUpdateArea(value);
    }
  };

  const statuses = [
    "Inprogress",
    "Hold",
    "Waiting",
    "Resolved",
    "Cancelled",
    "Open",
  ];

  const filteredStatuses = statuses.filter((s) => {
    if (ticket.status === "Resolved") return s === "Open";
    if (s === "Resolved" && ticket.status !== "Inprogress") return false;
    if (s === "Open") return false;
    if (s === ticket.status) return false;
    return true;
  });

  const needsRemarks = REMARKS_REQUIRED_STATUSES.includes(updateStatus);
  const showAreaAndCategory =
    updateStatus === "Inprogress" || updateStatus === "Resolved";
  // Incident/breakdown can be raised off a ticket while it's still Open or
  // already Inprogress (e.g. tech starts work, then discovers it's a breakdown).
  const canCreateIncidentFromTicket =
    ticket.status === "Open" || ticket.status === "Inprogress";
  const effectiveCategory = (
    updateCategory.trim() ||
    ticket.category ||
    ""
  ).trim();
  const mandatoryTempsForCategory =
    showAreaAndCategory && isTempMandatoryCategory(effectiveCategory);
  const beforeTempMissing = mandatoryTempsForCategory && !beforeTemp.trim();
  const afterTempMissing = mandatoryTempsForCategory && !afterTemp.trim();

  // Temp capture follows the ticket lifecycle: Before Temp is entered while
  // the ticket is Open (tech starting work) and stays visible/editable once
  // Inprogress, alongside After Temp (tech wrapping up). Gated on the
  // *current* ticket status, not the target status being selected.
  const showBeforeTemp =
    ticket.status === "Open" || ticket.status === "Inprogress";
  const showAfterTemp = ticket.status === "Inprogress";
  const showTempSection = showBeforeTemp || showAfterTemp;

  const remarksMissing = needsRemarks && !updateRemarks.trim();

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.6,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setAttachmentUri(result.assets[0].uri);
      }
    } catch {
      Alert.alert("Error", "Unable to open the image library.");
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Camera permission is required to take photos.",
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.6,
      });

      if (!result.canceled && result.assets?.[0]?.uri) {
        setAttachmentUri(result.assets[0].uri);
      }
    } catch {
      Alert.alert("Error", "Unable to open the camera.");
    }
  };

  const pickIncidentAttachmentsFromGallery = async () => {
    if (!setIncidentDraft) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        quality: 0.7,
        selectionLimit: 8,
      });
      if (!result.canceled) {
        const uris = result.assets.map((a) => a.uri).filter(Boolean);
        setIncidentDraft((prev) => ({
          ...prev,
          incidentAttachments: [...prev.incidentAttachments, ...uris],
        }));
      }
    } catch {
      Alert.alert("Error", "Unable to open the image library.");
    }
  };

  const captureIncidentPhoto = async () => {
    if (!setIncidentDraft) return;
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Camera permission is required to take photos.",
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.[0]?.uri) {
        setIncidentDraft((prev) => ({
          ...prev,
          incidentAttachments: [
            ...prev.incidentAttachments,
            result.assets[0].uri,
          ],
        }));
      }
    } catch {
      Alert.alert("Error", "Unable to open the camera.");
    }
  };

  const removeIncidentAttachment = (uri: string) => {
    if (!setIncidentDraft) return;
    setIncidentDraft((prev) => ({
      ...prev,
      incidentAttachments: prev.incidentAttachments.filter((x) => x !== uri),
    }));
  };

  const tempHint = mandatoryTempsForCategory
    ? showAfterTemp
      ? "Before + after required"
      : "Before required"
    : "Optional";

  // Selected status leads the row so it stays visible without scrolling.
  const orderedStatuses = filteredStatuses.includes(updateStatus)
    ? [updateStatus, ...filteredStatuses.filter((s) => s !== updateStatus)]
    : filteredStatuses;

  const HintIcon = STATUS_HINT_ICON[updateStatus] ?? FolderOpen;

  return (
    <View>
      <View style={styles.statusRow}>
        <Text style={styles.statusLabel}>Status</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.statusChips}
        >
          {orderedStatuses.map((s) => (
            <StatusChip
              key={s}
              label={statusLabel(s)}
              active={updateStatus === s}
              onPress={() => {
                setUpdateStatus(s);
                if (!REMARKS_REQUIRED_STATUSES.includes(s)) {
                  setAttachmentUri("");
                } else {
                  setUpdateRemarks("");
                }
              }}
            />
          ))}
        </ScrollView>
      </View>
      <StatusHint icon={HintIcon}>
        {statusHintFor(updateStatus, mandatoryTempsForCategory)}
      </StatusHint>

      {/* Only the fields the chosen status actually requires. */}
      {showAreaAndCategory && (
        <DetailCard>
          <CardHead label="Details" hint="Required" hintTone="muted" />
          <FullscreenPicker
            label="Area *"
            placeholder="Choose an area..."
            value={isOtherArea ? OTHER_AREA_VALUE : updateArea}
            options={areaOptionsWithOther}
            onChange={handleAreaChange}
            loading={areasLoading}
            searchPlaceholder="Search areas..."
            emptyMessage="No areas found"
            searchValue={areaSearchQuery}
            onSearchChange={setAreaSearchQuery}
            onLoadMore={loadMoreAreas}
            hasMore={hasMoreAreas}
            loadingMore={loadingMoreAreas}
            remoteSearch={Boolean(setAreaSearchQuery)}
          />
          {isOtherArea && (
            <Field
              label="Other asset / area *"
              placeholder="Enter asset / area name"
              value={updateArea}
              onChangeText={setUpdateArea}
              autoFocus
              containerStyle={{ marginBottom: 12 }}
            />
          )}
          <FullscreenPicker
            label="Category *"
            placeholder="Choose a category..."
            value={updateCategory}
            options={categoryOptions}
            onChange={setUpdateCategory}
            searchPlaceholder="Search categories..."
            emptyMessage="No categories found"
          />
          {isBreakdownTypeCategory(effectiveCategory) && (
            <FullscreenPicker
              label="Electrical / Mechanical *"
              placeholder="Choose type..."
              value={updateBreakdownType}
              options={BREAKDOWN_TYPE_OPTIONS}
              onChange={setUpdateBreakdownType}
              searchPlaceholder="Search..."
              emptyMessage="No options"
            />
          )}
        </DetailCard>
      )}

      {showTempSection && (
        <DetailCard>
          <CardHead
            label="Temperature"
            hint={tempHint}
            hintTone={
              attempted && (beforeTempMissing || afterTempMissing)
                ? "error"
                : "muted"
            }
          />
          <View style={styles.tempRow}>
            {showBeforeTemp && (
              <Field
                label="Before"
                unit="°C"
                large
                placeholder="0.0"
                keyboardType="decimal-pad"
                value={beforeTemp}
                onChangeText={setBeforeTemp}
                invalid={attempted && beforeTempMissing}
                containerStyle={styles.tempCell}
              />
            )}
            {showAfterTemp && (
              <Field
                label="After"
                unit="°C"
                large
                placeholder="0.0"
                keyboardType="decimal-pad"
                value={afterTemp}
                onChangeText={setAfterTemp}
                invalid={attempted && afterTempMissing}
                containerStyle={styles.tempCell}
              />
            )}
          </View>
        </DetailCard>
      )}

      <DetailCard>
        <CardHead
          label="Remarks"
          hint={needsRemarks ? "Required" : "Optional"}
          hintTone={attempted && remarksMissing ? "error" : "muted"}
        />
        <Field
          placeholder="What did you find and do?"
          value={updateRemarks}
          onChangeText={setUpdateRemarks}
          multiline
          maxLength={300}
          textAlignVertical="top"
          minHeight={56}
          invalid={attempted && remarksMissing}
        />
        <View style={styles.attachRow}>
          <AttachButton
            icon={Camera}
            label={attachmentUri ? "1 photo" : "Camera"}
            active={!!attachmentUri}
            onPress={takePhoto}
          />
          <AttachButton icon={ImagePlus} label="Gallery" onPress={pickImage} />
        </View>
        {attachmentUri ? (
          <View style={styles.previewWrap}>
            <Image source={{ uri: attachmentUri }} style={styles.preview} />
            <TouchableOpacity
              onPress={() => setAttachmentUri("")}
              style={styles.previewRemove}
              accessibilityRole="button"
              accessibilityLabel="Remove photo"
            >
              <X size={14} color={ds.onChrome} strokeWidth={2.4} />
            </TouchableOpacity>
          </View>
        ) : null}
      </DetailCard>

      {canCreateIncidentFromTicket && setCreateIncidentFromTicket ? (
        <ToggleRow
          icon={TriangleAlert}
          title="Raise an incident"
          subtitle="Needs RCA follow-up"
          value={createIncidentFromTicket}
          onToggle={() => {
            if (createIncidentFromTicket) {
              setCreateIncidentFromTicket(false);
              return;
            }
            Alert.alert(
              "Create Incident",
              "Do you want to raise an incident/breakdown for this ticket?",
              [
                {
                  text: "No",
                  style: "cancel",
                  onPress: () => setCreateIncidentFromTicket(false),
                },
                { text: "Yes", onPress: () => setCreateIncidentFromTicket(true) },
              ],
            );
          }}
        />
      ) : null}

      {canCreateIncidentFromTicket && createIncidentFromTicket && setIncidentDraft ? (
        <DetailCard>
          <CardHead label="Incident details" hint="Required" hintTone="muted" />
          <Text style={styles.incidentNote}>
            {"The incident uses this ticket's site, selected area and title."}
          </Text>

          <FullscreenPicker
            label="Fault Type *"
            placeholder="Select fault type"
            options={incidentFaultTypeOptions}
            value={incidentDraft.fault_type}
            onChange={(value) =>
              setIncidentDraft((prev) => ({ ...prev, fault_type: value }))
            }
          />
          <FullscreenPicker
            label="Severity *"
            placeholder="Select severity"
            options={incidentSeverityOptions}
            value={incidentDraft.severity}
            onChange={(value) =>
              setIncidentDraft((prev) => ({
                ...prev,
                severity: value as TicketIncidentDraft["severity"],
              }))
            }
          />
          <FullscreenPicker
            label="Operating Condition *"
            placeholder="Select operating condition"
            options={incidentOperatingOptions}
            value={incidentDraft.operating_condition}
            onChange={(value) =>
              setIncidentDraft((prev) => ({
                ...prev,
                operating_condition: value,
              }))
            }
          />

          <Field
            label="Immediate action taken"
            placeholder="Optional if ticket remarks cover it"
            value={incidentDraft.immediate_action_taken}
            onChangeText={(v) =>
              setIncidentDraft((prev) => ({
                ...prev,
                immediate_action_taken: v,
              }))
            }
            multiline
            textAlignVertical="top"
            minHeight={72}
            containerStyle={{ marginBottom: 12 }}
          />

          <Field
            label="Incident remarks"
            placeholder="Notes stored on the incident record"
            value={incidentDraft.incidentRemarks}
            onChangeText={(v) =>
              setIncidentDraft((prev) => ({ ...prev, incidentRemarks: v }))
            }
            multiline
            textAlignVertical="top"
            minHeight={56}
            containerStyle={{ marginBottom: 12 }}
          />

          <Text style={styles.fieldLabel}>Attachments</Text>
          <View style={styles.attachRow}>
            <AttachButton
              icon={Camera}
              label="Camera"
              onPress={captureIncidentPhoto}
            />
            <AttachButton
              icon={ImagePlus}
              label="Gallery"
              onPress={pickIncidentAttachmentsFromGallery}
            />
          </View>
          {incidentDraft.incidentAttachments.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginTop: 10 }}
            >
              <View style={{ flexDirection: "row", gap: 8 }}>
                {incidentDraft.incidentAttachments.map((uri) => (
                  <View key={uri}>
                    <Image source={{ uri }} style={styles.incidentThumb} />
                    <TouchableOpacity
                      onPress={() => removeIncidentAttachment(uri)}
                      style={styles.previewRemove}
                      accessibilityRole="button"
                      accessibilityLabel="Remove attachment"
                    >
                      <X size={13} color={ds.onChrome} strokeWidth={2.4} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : null}
        </DetailCard>
      ) : null}
    </View>
  );
};

const useStyles = makeThemedStyles((ds) => ({
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
  statusChips: { gap: 6, paddingRight: 4 },
  tempRow: { flexDirection: "row", gap: 8 },
  tempCell: { flex: 1, minWidth: 0 },
  attachRow: { flexDirection: "row", gap: 7, marginTop: 10 },
  previewWrap: { alignSelf: "flex-start", marginTop: 10 },
  preview: { width: 120, height: 120, borderRadius: soRadius.sm },
  previewRemove: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(25,19,18,0.75)",
    alignItems: "center",
    justifyContent: "center",
  },
  incidentThumb: { width: 72, height: 72, borderRadius: soRadius.sm },
  incidentNote: {
    fontSize: 11.5,
    lineHeight: 17,
    color: ds.carbon[400],
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    color: ds.carbon[500],
    marginBottom: 7,
  },
}));

export default TicketDetailStatusUpdate;
