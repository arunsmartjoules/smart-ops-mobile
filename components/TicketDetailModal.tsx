import React from "react";
import { Modal, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type Ticket } from "@/services/TicketsService";
import { type SelectOption } from "./SearchableSelect";
import TicketDetailStatusUpdate, {
  getTicketUpdateBlocker,
  isTempMandatoryCategory,
  statusLabel,
} from "./TicketDetailStatusUpdate";
import TicketActivity from "@/components/tickets/TicketActivity";
import {
  Badge,
  DetailCard,
  DetailHeader,
  MetaBlock,
  SubmitBar,
} from "@/components/tickets/TicketDetailUI";
import {
  getTicketPriority,
  getTicketStatus,
} from "@/components/tickets/TicketsUI";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
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

const raisedLine = (ticket: Ticket) => {
  const ms = Date.parse(ticket.created_at || "");
  if (Number.isNaN(ms)) return ticket.site_name || ticket.site_code;
  const d = new Date(ms);
  return `Raised ${formatIST(d, { day: "numeric", month: "short" })} · ${formatIST(
    d,
    { hour: "2-digit", minute: "2-digit", hour12: false },
  )}`;
};

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
    const styles = useStyles();
    const ds = useDs();
    const insets = useSafeAreaInsets();
    // Turns the hints and the sticky bar's message on only once the operator
    // has actually tried to submit.
    const [attempted, setAttempted] = React.useState(false);

    React.useEffect(() => {
      if (visible) setAttempted(false);
    }, [visible, ticket?.id]);

    const isDirty = React.useMemo(() => {
      if (!ticket) return false;
      const originalRemarks = ticket.internal_remarks || "";
      const originalArea = ticket.area_asset || "";
      const originalCategory = ticket.category || "";
      const effectiveCategory = (
        updateCategory.trim() ||
        ticket.category ||
        ""
      ).trim();
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

    const status = getTicketStatus(ticket.status, ds);
    const priority = getTicketPriority(ticket.priority, ds);
    const ready = isDirty && !blocker;

    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={onClose}
      >
        <View style={styles.screen}>
          <DetailHeader
            topInset={insets.top}
            title={ticket.ticket_no}
            subtitle={raisedLine(ticket)}
            onBack={onClose}
          />

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <DetailCard style={styles.summary}>
              <Text style={styles.title}>{ticket.title}</Text>
              <View style={styles.badgeRow}>
                <Badge label={status.label} bg={status.bg} fg={status.fg} />
                {priority ? (
                  <Badge
                    label={priority.label}
                    bg={priority.bg}
                    fg={priority.fg}
                  />
                ) : null}
              </View>
              <View style={styles.metaWrap}>
                <MetaBlock
                  label="Area"
                  value={ticket.area_asset || ticket.location || "—"}
                />
                <MetaBlock label="Category" value={ticket.category || "—"} />
                <MetaBlock
                  label="Assigned"
                  value={ticket.assigned_to || "Unassigned"}
                />
              </View>
            </DetailCard>

            {canEdit ? (
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
            ) : null}

            <TicketActivity ticket={ticket} />
          </ScrollView>

          {canEdit ? (
            <SubmitBar
              label={
                isDirty
                  ? `Update to ${statusLabel(updateStatus)}`
                  : "No changes yet"
              }
              blocked={attempted && isDirty ? blocker : null}
              ready={ready}
              busy={isUpdating}
              bottomInset={insets.bottom}
              onPress={() => {
                setAttempted(true);
                // The calling screen re-validates and surfaces its own alert;
                // this just avoids a pointless round-trip when we already know
                // the form is incomplete.
                if (!isDirty || blocker) return;
                handleUpdateStatus();
              }}
            />
          ) : null}
        </View>
      </Modal>
    );
  },
);

TicketDetailModal.displayName = "TicketDetailModal";

const useStyles = makeThemedStyles((ds) => ({
  screen: { flex: 1, backgroundColor: ds.pageBg },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  summary: { padding: 16, marginBottom: 12 },
  badgeRow: { flexDirection: "row", gap: 7, marginBottom: 14 },
  title: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
    letterSpacing: 0.16,
    color: ds.carbon[100],
    marginBottom: 10,
  },
  metaWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderTopWidth: 1,
    borderTopColor: ds.carbon[1000],
    paddingTop: 13,
  },
}));

export default TicketDetailModal;
