import React, { useMemo, useState } from "react";
import { Alert, Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { type SelectOption } from "./SearchableSelect";
import { type Ticket } from "@/services/TicketsService";
import { Bx, type BxName } from "@/components/jo/Bx";
import { GlossFill, Card, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import {
  BoxInput,
  ChoiceChips,
  FieldHead,
  OptionSheet,
  PhotoSlot,
  SelectBox,
  SwitchRow,
  TempBox,
} from "@/components/tickets/TicketFormParts";
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

/** `complaints.category` has a DB default of 'Complaint', so tickets raised
 *  without one (web, WhatsApp) carry it. It isn't in the category master, so
 *  it's treated as "not yet categorised" — never seeded into the picker nor
 *  allowed to satisfy the mandatory-category check. */
const PLACEHOLDER_CATEGORIES = ["complaint"];

/** The ticket's real category, or "" when it has none (or only the placeholder). */
export const ticketCategory = (ticket: Pick<Ticket, "category">): string => {
  const category = (ticket.category || "").trim();
  return PLACEHOLDER_CATEGORIES.includes(category.toLowerCase()) ? "" : category;
};

const BREAKDOWN_TYPE_OPTIONS = ["Electrical", "Mechanical"] as const;

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

/** Artboard ST_ICON, plus a glyph for Reopen. */
const STATUS_ICON: Record<string, BxName> = {
  Open: "bx-revision",
  Inprogress: "bxs-wrench",
  Hold: "bx-pause",
  Waiting: "bx-time-five",
  Resolved: "bx-check",
  Cancelled: "bx-x",
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
    !(updateCategory.trim() || ticketCategory(ticket))
  ) {
    return "Select a category before updating";
  }

  const effectiveCategory = updateCategory.trim() || ticketCategory(ticket);

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
    if (!incidentDraft.immediate_action_taken.trim()) {
      return "Describe the immediate action taken for the incident";
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
  /** Set once the operator has tried to submit — turns missing hints red. */
  attempted?: boolean;
}

/**
 * Status update — artboard ticket detail (lines 403–459): one "Status" card
 * holding the status option grid, the hint for what that status needs, then
 * only the fields it needs (area/category for In progress / Resolved,
 * temperatures, remarks, photo), followed by the "Raise an incident" switch.
 */
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
  const t = useJoTheme();
  const s = useStyles();
  const [sheet, setSheet] = useState<"area" | "category" | null>(null);

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

  // Artboard order (In progress, Resolved, Hold, Waiting, Cancelled); the
  // grid wraps, so every option stays visible without reordering.
  const statuses = [
    "Inprogress",
    "Resolved",
    "Hold",
    "Waiting",
    "Cancelled",
    "Open",
  ];

  const filteredStatuses = statuses.filter((st) => {
    if (ticket.status === "Resolved") return st === "Open";
    if (st === "Resolved" && ticket.status !== "Inprogress") return false;
    if (st === "Open") return false;
    if (st === ticket.status) return false;
    return true;
  });

  const needsRemarks = REMARKS_REQUIRED_STATUSES.includes(updateStatus);
  const showAreaAndCategory =
    updateStatus === "Inprogress" || updateStatus === "Resolved";
  // Incident/breakdown can be raised off a ticket while it's still Open or
  // already Inprogress (e.g. tech starts work, then discovers it's a breakdown).
  const canCreateIncidentFromTicket =
    ticket.status === "Open" || ticket.status === "Inprogress";
  const effectiveCategory = updateCategory.trim() || ticketCategory(ticket);
  const mandatoryTempsForCategory =
    showAreaAndCategory && isTempMandatoryCategory(effectiveCategory);
  const beforeTempMissing = mandatoryTempsForCategory && !beforeTemp.trim();
  const afterTempMissing = mandatoryTempsForCategory && !afterTemp.trim();
  const areaMissing = !(updateArea || ticket.area_asset || "").trim();
  const categoryMissing = !effectiveCategory;
  const breakdownMissing =
    isBreakdownTypeCategory(effectiveCategory) && !updateBreakdownType.trim();

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
        allowsEditing: false,
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
        allowsEditing: false,
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
        allowsEditing: false,
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

  const hint = statusHintFor(updateStatus, mandatoryTempsForCategory);

  const areaLabel = isOtherArea
    ? "Others"
    : areaOptions.find((o) => o.value === updateArea)?.label || updateArea;
  const categoryLabel =
    categoryOptions.find((o) => o.value === updateCategory)?.label || updateCategory;

  return (
    <View>
      <Card style={s.card}>
        <Text style={s.cardTitle}>Status</Text>
        <View style={s.options} accessibilityRole="radiogroup" accessibilityLabel="New status">
          {filteredStatuses.map((st) => {
            const on = updateStatus === st;
            return (
              <TouchableOpacity
                key={st}
                onPress={() => {
                  setUpdateStatus(st);
                  if (!REMARKS_REQUIRED_STATUSES.includes(st)) {
                    setAttachmentUri("");
                  } else {
                    setUpdateRemarks("");
                  }
                }}
                activeOpacity={0.8}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={[
                  s.option,
                  {
                    backgroundColor: on ? t.accent : t.raised,
                    borderColor: on ? t.accent : t.lineMid,
                  },
                ]}
              >
                {on ? <GlossFill color={t.accent} fg={t.onAccent} radius={18} bleed={1} /> : null}
                <Bx name={STATUS_ICON[st] ?? "bx-check"} size={15} color={on ? t.onAccent : t.ink2} />
                <Text style={[s.optionText, { color: on ? t.onAccent : t.ink2 }]}>
                  {statusLabel(st)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {hint ? (
          <View style={s.hint}>
            <Bx name="bx-info-circle" size={14} color={t.muted} />
            <Text style={s.hintText}>{hint}</Text>
          </View>
        ) : null}

        {/* Only the fields the chosen status actually requires. */}
        {showAreaAndCategory ? (
          <>
            <FieldHead
              label="Area"
              hint="Required"
              hintBad={attempted && areaMissing}
              style={s.headGap}
            />
            <SelectBox
              value={areaLabel}
              placeholder="Choose an area"
              onPress={() => setSheet("area")}
              loading={areasLoading && areaOptions.length === 0}
              invalid={attempted && areaMissing && !isOtherArea}
              accessibilityLabel="Area"
              style={s.fieldGap}
            />
            {isOtherArea ? (
              <BoxInput
                placeholder="Enter asset / area name"
                value={updateArea}
                onChangeText={setUpdateArea}
                autoFocus
                invalid={attempted && areaMissing}
                accessibilityLabel="Other asset or area"
                style={{ marginTop: 8 }}
              />
            ) : null}

            <FieldHead
              label="Category"
              hint="Required"
              hintBad={attempted && categoryMissing}
              style={s.headGap}
            />
            <SelectBox
              value={categoryLabel}
              placeholder="Choose a category"
              onPress={() => setSheet("category")}
              invalid={attempted && categoryMissing}
              accessibilityLabel="Category"
              style={s.fieldGap}
            />

            {isBreakdownTypeCategory(effectiveCategory) ? (
              <>
                <FieldHead
                  label="Electrical / Mechanical"
                  hint="Required"
                  hintBad={attempted && breakdownMissing}
                  style={s.headGap}
                />
                <ChoiceChips
                  label="Breakdown type"
                  options={BREAKDOWN_TYPE_OPTIONS}
                  value={updateBreakdownType}
                  onChange={setUpdateBreakdownType}
                  invalid={attempted && breakdownMissing}
                  style={s.fieldGap}
                />
              </>
            ) : null}
          </>
        ) : null}

        {showTempSection ? (
          <>
            <FieldHead
              label="Temperature"
              hint={tempHint}
              hintBad={attempted && (beforeTempMissing || afterTempMissing)}
              style={s.headGap}
            />
            <View style={s.tempGrid}>
              {showBeforeTemp ? (
                <TempBox
                  label="Before"
                  value={beforeTemp}
                  onChangeText={setBeforeTemp}
                  emphasis={beforeTempMissing}
                  invalid={attempted && beforeTempMissing}
                  style={s.tempCell}
                />
              ) : null}
              {showAfterTemp ? (
                <TempBox
                  label="After"
                  value={afterTemp}
                  onChangeText={setAfterTemp}
                  emphasis={afterTempMissing}
                  invalid={attempted && afterTempMissing}
                  style={s.tempCell}
                />
              ) : (
                <View style={s.tempCell} />
              )}
            </View>
          </>
        ) : null}

        <FieldHead
          label="Remarks"
          hint={needsRemarks ? "Required" : "Optional"}
          hintBad={attempted && remarksMissing}
          style={s.headGap}
        />
        <BoxInput
          placeholder="What did you find and do?"
          value={updateRemarks}
          onChangeText={setUpdateRemarks}
          multiline
          maxLength={300}
          invalid={attempted && remarksMissing}
          accessibilityLabel="Remarks"
          style={s.fieldGap}
        />
        <View style={s.slots}>
          <PhotoSlot
            icon="bx-camera"
            iconColor={t.accentInk}
            label={attachmentUri ? "Retake" : "Add photo"}
            active={!!attachmentUri}
            onPress={takePhoto}
          />
          <PhotoSlot icon="bx-image" label="Gallery" onPress={pickImage} />
        </View>
        {attachmentUri ? (
          <View style={s.previewWrap}>
            <Image source={{ uri: attachmentUri }} style={s.preview} accessibilityLabel="Attached photo" />
            <TouchableOpacity
              onPress={() => setAttachmentUri("")}
              style={s.previewRemove}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Remove photo"
            >
              <Bx name="bx-x" size={15} color={t.ink} />
            </TouchableOpacity>
          </View>
        ) : null}
      </Card>

      {canCreateIncidentFromTicket && setCreateIncidentFromTicket ? (
        <SwitchRow
          icon="bx-error-alt"
          title="Raise an incident"
          sub="Needs RCA follow-up"
          value={createIncidentFromTicket}
          style={{ marginTop: 10 }}
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
        <Card style={[s.card, { marginTop: 10 }]}>
          <View style={s.cardHeadRow}>
            <Text style={s.cardTitle}>Incident details</Text>
            <Text style={s.cardMeta}>Required</Text>
          </View>
          <Text style={s.note}>
            {"The incident uses this ticket's site, selected area and title."}
          </Text>

          <FieldHead
            label="Fault type"
            hint="Required"
            hintBad={attempted && !incidentDraft.fault_type}
            style={s.headGap}
          />
          <ChoiceChips
            label="Fault type"
            options={FAULT_TYPE_OPTIONS}
            value={incidentDraft.fault_type}
            onChange={(value) =>
              setIncidentDraft((prev) => ({ ...prev, fault_type: value }))
            }
            invalid={attempted && !incidentDraft.fault_type}
            style={s.fieldGap}
          />

          <FieldHead
            label="Severity"
            hint="Required"
            hintBad={attempted && !incidentDraft.severity}
            style={s.headGap}
          />
          <ChoiceChips
            label="Severity"
            options={SEVERITY_OPTIONS}
            value={incidentDraft.severity}
            onChange={(value) =>
              setIncidentDraft((prev) => ({
                ...prev,
                severity: value as TicketIncidentDraft["severity"],
              }))
            }
            invalid={attempted && !incidentDraft.severity}
            style={s.fieldGap}
          />

          <FieldHead
            label="Operating condition"
            hint="Required"
            hintBad={attempted && !incidentDraft.operating_condition}
            style={s.headGap}
          />
          <ChoiceChips
            label="Operating condition"
            options={OPERATING_CONDITION_OPTIONS}
            value={incidentDraft.operating_condition}
            onChange={(value) =>
              setIncidentDraft((prev) => ({
                ...prev,
                operating_condition: value,
              }))
            }
            invalid={attempted && !incidentDraft.operating_condition}
            style={s.fieldGap}
          />

          <FieldHead
            label="Immediate action taken"
            hint="Required"
            hintBad={attempted && !incidentDraft.immediate_action_taken.trim()}
            style={s.headGap}
          />
          <BoxInput
            placeholder="Describe the immediate action taken"
            value={incidentDraft.immediate_action_taken}
            onChangeText={(v) =>
              setIncidentDraft((prev) => ({
                ...prev,
                immediate_action_taken: v,
              }))
            }
            multiline
            minHeight={72}
            invalid={attempted && !incidentDraft.immediate_action_taken.trim()}
            accessibilityLabel="Immediate action taken"
            style={s.fieldGap}
          />

          <FieldHead label="Incident remarks" hint="Optional" style={s.headGap} />
          <BoxInput
            placeholder="Notes stored on the incident record"
            value={incidentDraft.incidentRemarks}
            onChangeText={(v) =>
              setIncidentDraft((prev) => ({ ...prev, incidentRemarks: v }))
            }
            multiline
            minHeight={56}
            accessibilityLabel="Incident remarks"
            style={s.fieldGap}
          />

          <FieldHead
            label="Attachments"
            hint={
              incidentDraft.incidentAttachments.length
                ? `${incidentDraft.incidentAttachments.length} added`
                : "Optional"
            }
            style={s.headGap}
          />
          <View style={[s.slots, s.fieldGap]}>
            <PhotoSlot
              icon="bx-camera"
              iconColor={t.accentInk}
              label="Add photo"
              onPress={captureIncidentPhoto}
            />
            <PhotoSlot
              icon="bx-image"
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
                    <Image source={{ uri }} style={s.thumb} />
                    <TouchableOpacity
                      onPress={() => removeIncidentAttachment(uri)}
                      style={s.previewRemove}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel="Remove attachment"
                    >
                      <Bx name="bx-x" size={14} color={t.ink} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </ScrollView>
          ) : null}
        </Card>
      ) : null}

      <OptionSheet
        visible={sheet === "area"}
        onClose={() => setSheet(null)}
        title="Area"
        subtitle="Asset or area this ticket is about"
        options={areaOptionsWithOther}
        value={isOtherArea ? OTHER_AREA_VALUE : updateArea}
        onPick={handleAreaChange}
        searchPlaceholder="Search areas"
        searchValue={areaSearchQuery}
        onSearchChange={setAreaSearchQuery}
        loading={areasLoading}
        onLoadMore={loadMoreAreas}
        hasMore={hasMoreAreas}
        loadingMore={loadingMoreAreas}
        emptyMessage="No areas found"
      />
      <OptionSheet
        visible={sheet === "category"}
        onClose={() => setSheet(null)}
        title="Category"
        options={categoryOptions}
        value={updateCategory}
        onPick={setUpdateCategory}
        searchPlaceholder="Search categories"
        emptyMessage="No categories found"
      />
    </View>
  );
};

const useStyles = makeJoStyles((t) => ({
  card: { padding: 16 },
  cardTitle: { ...f.t(15, 600), color: t.ink },
  cardHeadRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 10,
  },
  cardMeta: { ...f.t(11.5), color: t.muted },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 },
  option: {
    height: 36,
    paddingHorizontal: 13,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  optionText: { ...f.t(12.5, 600) },
  hint: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 11 },
  hintText: { ...f.t(12), color: t.muted, flex: 1 },
  headGap: { marginTop: 16 },
  fieldGap: { marginTop: 9 },
  tempGrid: { flexDirection: "row", gap: 8, marginTop: 9 },
  tempCell: { flex: 1, minWidth: 0 },
  slots: { flexDirection: "row", gap: 8, marginTop: 10 },
  previewWrap: { alignSelf: "flex-start", marginTop: 10 },
  preview: { width: 120, height: 120, borderRadius: 18 },
  thumb: { width: 72, height: 72, borderRadius: 14 },
  previewRemove: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: t.scrim,
    alignItems: "center",
    justifyContent: "center",
  },
  note: { ...f.t(12), lineHeight: 17, color: t.muted, marginTop: 6 },
}));

export default TicketDetailStatusUpdate;
