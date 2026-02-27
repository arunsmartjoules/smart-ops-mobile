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
import TicketDetailInfo from "./TicketDetailInfo";
import TicketDetailStatusUpdate from "./TicketDetailStatusUpdate";
import TicketLineItems from "./TicketLineItems";

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
  isUpdating: boolean;
  handleUpdateStatus: () => void;
  areaOptions: SelectOption[];
  categoryOptions: SelectOption[];
  areasLoading?: boolean;
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
    isUpdating,
    handleUpdateStatus,
    areaOptions,
    categoryOptions,
    areasLoading,
  }: TicketDetailModalProps) => {
    const isDirty = React.useMemo(() => {
      if (!ticket) return false;
      // Compare with original ticket values
      const originalRemarks = ticket.internal_remarks || "";
      const originalArea = ticket.area_asset || "";
      const originalCategory = ticket.category || "";

      return (
        updateStatus !== ticket.status ||
        updateRemarks.trim() !== originalRemarks.trim() ||
        updateArea !== originalArea ||
        updateCategory !== originalCategory
      );
    }, [ticket, updateStatus, updateRemarks, updateArea, updateCategory]);

    const { height: windowHeight } = useWindowDimensions();

    if (!ticket || !visible) return null;

    const modalHeight = Math.min(windowHeight * 0.92, 780);

    return (
      <Modal visible={visible} animationType="slide" transparent={true}>
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: "#ffffff",
              borderTopLeftRadius: 36,
              borderTopRightRadius: 36,
              paddingHorizontal: 22,
              paddingTop: 14,
              paddingBottom: 18,
              height: modalHeight,
              minHeight: 420,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -8 },
              shadowOpacity: 0.12,
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
                  <TicketDetailInfo ticket={ticket} />

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
                    areaOptions={areaOptions}
                    categoryOptions={categoryOptions}
                    areasLoading={areasLoading}
                  />

                  {/* Comments & Timeline */}
                  <TicketLineItems ticketId={ticket.id || ticket.ticket_no} />
                </View>
              </ScrollView>
            </View>

            <View
              style={{
                paddingTop: 12,
                borderTopWidth: 1,
                borderTopColor: "#f1f5f9",
              }}
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
          </View>
        </View>
      </Modal>
    );
  },
);

export default TicketDetailModal;
