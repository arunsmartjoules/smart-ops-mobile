import React from "react";
import {
  View,
  ScrollView,
  ActivityIndicator,
  Modal,
  TouchableOpacity,
  Text,
  useWindowDimensions,
} from "react-native";
import { type Ticket } from "@/services/TicketsService";
import { type SelectOption } from "./SearchableSelect";
import TicketDetailHeader from "./TicketDetailHeader";
import TicketAssignee from "./TicketAssignee";
import TicketDetailInfo from "./TicketDetailInfo";
import TicketDetailStatusUpdate, {
  isTempMandatoryCategory,
} from "./TicketDetailStatusUpdate";
import TicketLineItems from "./TicketLineItems";
import { useTheme } from "@/contexts/ThemeContext";
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
    const isDirty = React.useMemo(() => {
      if (!ticket) return false;
      // Compare with original ticket values
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
        // Category now starts unselected; an empty value is "not yet chosen",
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

    const { height: windowHeight } = useWindowDimensions();
    const { isDark } = useTheme();

    if (!ticket || !visible) return null;

    const modalHeight = Math.min(windowHeight * 0.92, 780);

    return (
      <Modal visible={visible} animationType="slide" transparent={true} statusBarTranslucent={true}>
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: isDark ? "#0f172a" : "#ffffff",
              borderTopLeftRadius: 36,
              borderTopRightRadius: 36,
              paddingHorizontal: 22,
              paddingTop: 14,
              paddingBottom: 18,
              height: modalHeight,
              minHeight: 420,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -8 },
              shadowOpacity: isDark ? 0.3 : 0.1,
              shadowRadius: 16,
              elevation: 12,
            }}
          >
            <TicketDetailHeader ticket={ticket} onClose={onClose} />

            <View style={{ flex: 1 }}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 120, flexGrow: 1 }}
              >
                <View>
                  <TicketAssignee ticket={ticket} />

                  <TicketDetailInfo ticket={ticket} />

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
                    />
                  ) : null}

                  {/* Comments & Timeline */}
                  <TicketLineItems ticketId={ticket.id || ticket.ticket_no} />
                </View>
              </ScrollView>
            </View>

            {canEdit ? (
            <View
              className="border-t border-slate-100 dark:border-slate-800 pt-3"
            >
              <TouchableOpacity
                onPress={handleUpdateStatus}
                disabled={isUpdating || !isDirty}
                style={{
                  backgroundColor: isDirty ? "#dc2626" : "#cbd5e1",
                  borderRadius: 26,
                  paddingVertical: 18,
                  alignItems: "center",
                  shadowColor: isDirty ? "#dc2626" : "transparent",
                  shadowOffset: { width: 0, height: 10 },
                  shadowOpacity: isDirty ? 0.2 : 0,
                  shadowRadius: 18,
                  elevation: isDirty ? 8 : 0,
                  opacity: isDirty ? 1 : 0.8,
                }}
              >
                {isUpdating ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text
                    style={{
                      color: isDirty ? "#ffffff" : "#64748b",
                      fontWeight: "900",
                      textTransform: "uppercase",
                      letterSpacing: 1.5,
                      fontSize: 13,
                    }}
                  >
                    {updateStatus === "Open" ? "Reopen Ticket" : "Update"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
            ) : null}
          </View>
        </View>
      </Modal>
    );
  },
);

TicketDetailModal.displayName = "TicketDetailModal";

export default TicketDetailModal;
