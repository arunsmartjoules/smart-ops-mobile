import React from "react";
import { Modal, ScrollView, Text, View } from "react-native";
// Lifts the Update bar above the keyboard — RN's KAV can't on edge-to-edge Android.
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type Ticket } from "@/services/TicketsService";
import { type SelectOption } from "./SearchableSelect";
import TicketDetailStatusUpdate, {
  getTicketUpdateBlocker,
  isTempMandatoryCategory,
  ticketCategory,
} from "./TicketDetailStatusUpdate";
import TicketActivity from "@/components/tickets/TicketActivity";
import {
  ticketPriorityColors,
  ticketStatusColors,
} from "@/components/tickets/TicketsUI";
import { Bx } from "@/components/jo/Bx";
import { Card, IconButton, PrimaryButton, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import { isSlaBreached, slaDueToMs } from "@/utils/ticketSla";
import { formatIST } from "@/utils/istDate";
import type { TicketIncidentDraft } from "@/constants/incidentFormOptions";

interface TicketDetailModalProps {
  visible: boolean;
  ticket: Ticket | null;
  onClose: () => void;
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
  isUpdating: boolean;
  handleUpdateStatus: () => void;
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
  /** When false (e.g., read-only mode), all write surfaces are hidden. */
  canEdit?: boolean;
}

const CLOSED = new Set(["Resolved", "Cancelled"]);

/** "Raised 21 Oct · 08:12" (IST), or the site when the ticket has no stamp. */
const raisedLine = (ticket: Ticket) => {
  const ms = Date.parse(ticket.created_at || "");
  if (Number.isNaN(ms)) return ticket.site_name || ticket.site_code;
  const d = new Date(ms);
  return `Raised ${formatIST(d, { day: "numeric", month: "short" })} · ${formatIST(
    d,
    { hour: "2-digit", minute: "2-digit", hour12: false },
  )}`;
};

/** "30 min" / "2h 10m" / "3d 4h". */
const formatSpan = (mins: number) => {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ${String(mins % 60).padStart(2, "0")}m`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d}d ${h % 24}h` : `${d}d`;
};

/**
 * The artboard's "· escalates in 30 min" — built only from the server's SLA
 * fields (utils/ticketSla); nothing is shown when no SLA clock is running.
 */
const slaLine = (ticket: Ticket): { text: string; urgent: boolean } | null => {
  // A breach is already shown as the solid "SLA breached" pill.
  if (isSlaBreached(ticket) || CLOSED.has(ticket.status)) return null;
  const due = slaDueToMs(ticket.sla_due_at);
  if (due == null) return null;
  const mins = Math.max(0, Math.round((due - Date.now()) / 60000));
  return { text: `SLA due in ${formatSpan(mins)}`, urgent: mins <= 60 };
};

/**
 * Ticket detail — artboard "ticketDetail" (lines 403–459): back button and
 * ticket number with the raised / SLA line, status + priority pills, the
 * title in display type, an Area / Category / Assigned strip, the status
 * update card, the activity timeline and a pinned accent "Update ticket" CTA.
 * Full-screen Modal, so the floating tab bar is already covered.
 */
const TicketDetailModal = React.memo(
  ({
    visible,
    ticket,
    onClose,
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
    isUpdating,
    handleUpdateStatus,
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
    createIncidentFromTicket,
    setCreateIncidentFromTicket,
    incidentDraft,
    setIncidentDraft,
    canEdit = true,
  }: TicketDetailModalProps) => {
    const t = useJoTheme();
    const s = useStyles();
    const insets = useSafeAreaInsets();
    // Turns the hints and the sticky bar's message on only once the operator
    // has actually tried to submit.
    const [attempted, setAttempted] = React.useState(false);

    // Reset on every open / ticket switch — adjusted during render rather than
    // in an effect, so the stale "attempted" flag never paints.
    const resetKey = visible ? (ticket?.id ?? "") : null;
    const [seenKey, setSeenKey] = React.useState(resetKey);
    if (seenKey !== resetKey) {
      setSeenKey(resetKey);
      if (visible) setAttempted(false);
    }

    const isDirty = React.useMemo(() => {
      if (!ticket) return false;
      const originalRemarks = ticket.internal_remarks || "";
      const originalArea = ticket.area_asset || "";
      const originalCategory = ticketCategory(ticket);
      const effectiveCategory = updateCategory.trim() || originalCategory;
      const mandatoryTempsIncomplete =
        (updateStatus === "Inprogress" || updateStatus === "Resolved") &&
        isTempMandatoryCategory(effectiveCategory) &&
        (!beforeTemp.trim() || !afterTemp.trim());

      return (
        updateStatus !== ticket.status ||
        updateRemarks.trim() !== originalRemarks.trim() ||
        updateArea !== originalArea ||
        // An empty category is "not yet chosen" (an Open ticket carries none),
        // not a change away from the ticket's existing category.
        (updateCategory.trim() !== "" &&
          updateCategory.trim() !== originalCategory.trim()) ||
        beforeTemp.trim() !== "" ||
        afterTemp.trim() !== "" ||
        Boolean(attachmentUri) ||
        Boolean(createIncidentFromTicket) ||
        mandatoryTempsIncomplete
      );
    }, [
      ticket,
      updateStatus,
      updateRemarks,
      updateArea,
      updateCategory,
      beforeTemp,
      afterTemp,
      attachmentUri,
      createIncidentFromTicket,
    ]);

    const blocker = React.useMemo(
      () =>
        ticket
          ? getTicketUpdateBlocker({
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
            })
          : null,
      [
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
      ],
    );

    if (!ticket || !visible) return null;

    const status = ticketStatusColors(t, ticket.status);
    const priority = ticketPriorityColors(t, ticket.priority);
    const sla = slaLine(ticket);
    const ready = isDirty && !blocker;
    const bottomPad = Math.max(insets.bottom + 8, 20);

    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={onClose}
        statusBarTranslucent
        navigationBarTranslucent
      >
        <View style={s.screen}>
          <View style={[s.header, { paddingTop: insets.top + 8 }]}>
            <IconButton icon="bx-chevron-left" iconSize={24} label="Back to tickets" onPress={onClose} />
            <View style={s.headLead}>
              <Text style={s.headTitle} numberOfLines={1}>
                {ticket.ticket_no}
              </Text>
              <Text style={s.headSub} numberOfLines={1}>
                {raisedLine(ticket)}
                {sla ? (
                  <Text style={{ color: sla.urgent ? t.bad : t.muted }}>{` · ${sla.text}`}</Text>
                ) : null}
              </Text>
            </View>
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={s.body}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={s.pills}>
                <View style={[s.pill, { backgroundColor: status.bg }]}>
                  <Text style={[s.pillText, { color: status.fg }]}>{status.label}</Text>
                </View>
                {priority ? (
                  <View style={[s.pill, { backgroundColor: priority.bg }]}>
                    <Text style={[s.pillText, { color: priority.fg }]}>{priority.label}</Text>
                  </View>
                ) : null}
                {isSlaBreached(ticket) ? (
                  <View style={[s.pill, { backgroundColor: t.bad, flexDirection: "row", gap: 4 }]}>
                    <Bx name="bx-error" size={13} color={t.onAccent} />
                    <Text style={[s.pillText, { color: t.onAccent }]}>SLA breached</Text>
                  </View>
                ) : null}
              </View>

              <Text style={s.title}>{ticket.title}</Text>

              <View style={s.metaGrid}>
                <MetaCell label="Area" value={ticket.area_asset || ticket.location || "—"} />
                <MetaCell label="Category" value={ticketCategory(ticket) || "—"} />
                <MetaCell label="Assigned" value={ticket.assigned_to || "Unassigned"} />
              </View>

              {canEdit ? (
                <View style={{ marginTop: 12 }}>
                  <TicketDetailStatusUpdate
                    ticket={ticket}
                    updateStatus={updateStatus}
                    setUpdateStatus={setUpdateStatus}
                    updateRemarks={updateRemarks}
                    setUpdateRemarks={setUpdateRemarks}
                    updateArea={updateArea}
                    setUpdateArea={setUpdateArea}
                    updateCategory={updateCategory}
                    setUpdateCategory={setUpdateCategory}
                    updateBreakdownType={updateBreakdownType}
                    setUpdateBreakdownType={setUpdateBreakdownType}
                    areaOptions={areaOptions}
                    categoryOptions={categoryOptions}
                    areasLoading={areasLoading}
                    beforeTemp={beforeTemp}
                    setBeforeTemp={setBeforeTemp}
                    afterTemp={afterTemp}
                    setAfterTemp={setAfterTemp}
                    attachmentUri={attachmentUri}
                    setAttachmentUri={setAttachmentUri}
                    areaSearchQuery={areaSearchQuery}
                    setAreaSearchQuery={setAreaSearchQuery}
                    loadMoreAreas={loadMoreAreas}
                    hasMoreAreas={hasMoreAreas}
                    loadingMoreAreas={loadingMoreAreas}
                    createIncidentFromTicket={createIncidentFromTicket}
                    setCreateIncidentFromTicket={setCreateIncidentFromTicket}
                    incidentDraft={incidentDraft}
                    setIncidentDraft={setIncidentDraft}
                    attempted={attempted}
                  />
                </View>
              ) : (
                <Card style={s.readOnly} radius={22}>
                  <Bx name="bx-lock-alt" size={18} color={t.muted} />
                  <Text style={s.readOnlyText}>View only · punch in to update this ticket</Text>
                </Card>
              )}

              <TicketActivity ticket={ticket} />
            </ScrollView>

            {canEdit ? (
              <View style={[s.bar, { paddingBottom: bottomPad }]}>
                <LinearGradient
                  pointerEvents="none"
                  colors={[`${t.page}00`, t.page]}
                  style={s.barFade}
                />
                {attempted && isDirty && blocker ? (
                  <View style={s.blocked} accessibilityLiveRegion="polite">
                    <Bx name="bx-error-circle" size={15} color={t.bad} />
                    <Text style={s.blockedText}>{blocker}</Text>
                  </View>
                ) : null}
                <PrimaryButton
                  label={isDirty ? "Update ticket" : "No changes yet"}
                  icon="bx-check"
                  busy={isUpdating}
                  disabled={!isDirty}
                  style={!ready && isDirty ? { opacity: 0.85 } : undefined}
                  onPress={() => {
                    setAttempted(true);
                    // The calling screen re-validates and surfaces its own
                    // alert; this just avoids a pointless round-trip when we
                    // already know the form is incomplete.
                    if (!isDirty || blocker) return;
                    handleUpdateStatus();
                  }}
                />
              </View>
            ) : null}
          </KeyboardAvoidingView>
        </View>
      </Modal>
    );
  },
);

TicketDetailModal.displayName = "TicketDetailModal";

function MetaCell({ label, value }: { label: string; value: string }) {
  const s = useStyles();
  return (
    <View style={s.metaCell}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue} numberOfLines={3}>
        {value}
      </Text>
    </View>
  );
}

const useStyles = makeJoStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.page },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headLead: { flex: 1, minWidth: 0 },
  headTitle: { ...f.t(15, 600), color: t.ink },
  headSub: { ...f.t(11.5), color: t.muted, marginTop: 2 },
  body: { paddingTop: 4, paddingHorizontal: 16, paddingBottom: 24 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: {
    height: 24,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  pillText: { ...f.t(11.5, 600) },
  title: { ...f.d(26, -0.025, 1.12), color: t.ink, marginTop: 10 },
  metaGrid: { flexDirection: "row", gap: 6, marginTop: 14 },
  metaCell: {
    flex: 1,
    minWidth: 0,
    borderRadius: 18,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.cardBorder,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  metaLabel: { ...f.t(11), color: t.muted },
  metaValue: { ...f.t(13, 600), color: t.ink, marginTop: 4 },
  readOnly: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  readOnlyText: { ...f.t(12.5, 500), color: t.ink3, flex: 1 },
  bar: { paddingTop: 14, paddingHorizontal: 16, backgroundColor: t.page },
  barFade: { position: "absolute", left: 0, right: 0, top: -28, height: 28 },
  blocked: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10, paddingHorizontal: 4 },
  blockedText: { ...f.t(12, 600), color: t.bad, flex: 1 },
}));

export default TicketDetailModal;
