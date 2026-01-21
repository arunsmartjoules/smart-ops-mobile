import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Modal,
  Animated,
  Alert,
} from "react-native";
import {
  X,
  MapPin,
  Calendar,
  Briefcase,
  Layers,
  Layout as LayoutIcon,
} from "lucide-react-native";
import { format } from "date-fns";
import SearchableSelect, { type SelectOption } from "./SearchableSelect";
import { type Ticket } from "@/services/TicketsService";

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
    const [holdProgress] = useState(new Animated.Value(0));
    const timerRef = useRef<any>(null);
    const [isHolding, setIsHolding] = useState(false);

    useEffect(() => {
      if (!visible) {
        resetHold();
      }
    }, [visible]);

    const resetHold = () => {
      setIsHolding(false);
      holdProgress.setValue(0);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const handleHoldStart = () => {
      if (updateStatus !== "Cancelled") return;
      if (!updateRemarks.trim()) {
        Alert.alert(
          "Remarks Required",
          "Please provide a reason for cancellation.",
        );
        return;
      }

      setIsHolding(true);
      Animated.timing(holdProgress, {
        toValue: 1,
        duration: 3000,
        useNativeDriver: false,
      }).start();

      timerRef.current = setTimeout(() => {
        handleUpdateStatus();
        resetHold();
      }, 3000);
    };

    const handleHoldEnd = () => {
      resetHold();
    };

    if (!ticket || !visible) return null;

    const progressWidth = holdProgress.interpolate({
      inputRange: [0, 1],
      outputRange: ["0%", "100%"],
    });

    return (
      <Modal visible={visible} animationType="slide" transparent={true}>
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.6)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: "#ffffff",
              borderTopLeftRadius: 40,
              borderTopRightRadius: 40,
              padding: 24,
              height: 700,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -10 },
              shadowOpacity: 0.1,
              shadowRadius: 20,
              elevation: 12,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 16,
              }}
            >
              <View
                style={{
                  backgroundColor: "#fef2f2",
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                }}
              >
                <Text
                  style={{
                    color: "#dc2626",
                    fontWeight: "900",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: 1.5,
                  }}
                >
                  {ticket.ticket_no}
                </Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                style={{
                  width: 40,
                  height: 40,
                  backgroundColor: "#f8fafc",
                  borderRadius: 20,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={20} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            <Text
              className="text-slate-900 dark:text-slate-50"
              style={{
                fontSize: 22,
                fontWeight: "900",
                lineHeight: 28,
                marginBottom: 20,
              }}
            >
              {ticket.title}
            </Text>

            <View style={{ flex: 1 }}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 100 }}
              >
                <View>
                  <View
                    className="bg-slate-50 dark:bg-slate-800"
                    style={{
                      borderRadius: 24,
                      padding: 24,
                      marginBottom: 32,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginBottom: 20,
                      }}
                    >
                      <View
                        className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 16,
                          alignItems: "center",
                          justifyContent: "center",
                          marginRight: 16,
                        }}
                      >
                        <LayoutIcon size={18} color="#ef4444" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          className="text-slate-400 dark:text-slate-500"
                          style={{
                            fontSize: 10,
                            fontWeight: "900",
                            textTransform: "uppercase",
                            letterSpacing: 1.5,
                          }}
                        >
                          Site Name
                        </Text>
                        <Text
                          className="text-slate-900 dark:text-slate-50"
                          style={{
                            fontWeight: "700",
                            fontSize: 14,
                            marginTop: 2,
                          }}
                        >
                          {ticket.site_name || "N/A"}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginBottom: 20,
                      }}
                    >
                      <View
                        className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 16,
                          alignItems: "center",
                          justifyContent: "center",
                          marginRight: 16,
                        }}
                      >
                        <MapPin size={18} color="#ef4444" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          className="text-slate-400 dark:text-slate-500"
                          style={{
                            fontSize: 10,
                            fontWeight: "900",
                            textTransform: "uppercase",
                            letterSpacing: 1.5,
                          }}
                        >
                          Location
                        </Text>
                        <Text
                          className="text-slate-900 dark:text-slate-50"
                          style={{
                            fontWeight: "700",
                            fontSize: 14,
                            marginTop: 2,
                          }}
                        >
                          {ticket.location || "General Area"}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginBottom: 20,
                      }}
                    >
                      <View
                        className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 16,
                          alignItems: "center",
                          justifyContent: "center",
                          marginRight: 16,
                        }}
                      >
                        <Briefcase size={18} color="#3b82f6" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          className="text-slate-400 dark:text-slate-500"
                          style={{
                            fontSize: 10,
                            fontWeight: "900",
                            textTransform: "uppercase",
                            letterSpacing: 1.5,
                          }}
                        >
                          Created By
                        </Text>
                        <Text
                          className="text-slate-900 dark:text-slate-50"
                          style={{
                            fontWeight: "700",
                            fontSize: 14,
                            marginTop: 2,
                          }}
                        >
                          {ticket.created_user || "N/A"}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginBottom: 20,
                      }}
                    >
                      <View
                        className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 16,
                          alignItems: "center",
                          justifyContent: "center",
                          marginRight: 16,
                        }}
                      >
                        <LayoutIcon size={18} color="#10b981" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          className="text-slate-400 dark:text-slate-500"
                          style={{
                            fontSize: 10,
                            fontWeight: "900",
                            textTransform: "uppercase",
                            letterSpacing: 1.5,
                          }}
                        >
                          Site Code
                        </Text>
                        <Text
                          className="text-slate-900 dark:text-slate-50"
                          style={{
                            fontWeight: "700",
                            fontSize: 14,
                            marginTop: 2,
                          }}
                        >
                          {ticket.site_code || "N/A"}
                        </Text>
                      </View>
                    </View>

                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginBottom: ticket.customer_inputs ? 20 : 0,
                      }}
                    >
                      <View
                        className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800"
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 16,
                          alignItems: "center",
                          justifyContent: "center",
                          marginRight: 16,
                        }}
                      >
                        <Calendar size={18} color="#8b5cf6" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          className="text-slate-400 dark:text-slate-500"
                          style={{
                            fontSize: 10,
                            fontWeight: "900",
                            textTransform: "uppercase",
                            letterSpacing: 1.5,
                          }}
                        >
                          Created Date & Time
                        </Text>
                        <Text
                          className="text-slate-900 dark:text-slate-50"
                          style={{
                            fontWeight: "700",
                            fontSize: 14,
                            marginTop: 2,
                          }}
                        >
                          {ticket.created_at
                            ? format(
                                new Date(ticket.created_at),
                                "dd MMM yyyy, HH:mm",
                              )
                            : "N/A"}
                        </Text>
                      </View>
                    </View>

                    {ticket.customer_inputs && (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          marginBottom: ticket.internal_remarks ? 20 : 0,
                        }}
                      >
                        <View
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 16,
                            backgroundColor: "#ffffff",
                            alignItems: "center",
                            justifyContent: "center",
                            marginRight: 16,
                            borderWidth: 1,
                            borderColor: "#f1f5f9",
                          }}
                        >
                          <Layers size={18} color="#f59e0b" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              color: "#94a3b8",
                              fontSize: 10,
                              fontWeight: "900",
                              textTransform: "uppercase",
                              letterSpacing: 1.5,
                            }}
                          >
                            Customer Inputs
                          </Text>
                          <Text
                            style={{
                              color: "#0f172a",
                              fontWeight: "700",
                              fontSize: 14,
                              marginTop: 2,
                            }}
                          >
                            {ticket.customer_inputs}
                          </Text>
                        </View>
                      </View>
                    )}

                    {ticket.internal_remarks && (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                        }}
                      >
                        <View
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 16,
                            backgroundColor: "#ffffff",
                            alignItems: "center",
                            justifyContent: "center",
                            marginRight: 16,
                            borderWidth: 1,
                            borderColor: "#f1f5f9",
                          }}
                        >
                          <Briefcase size={18} color="#6366f1" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              color: "#94a3b8",
                              fontSize: 10,
                              fontWeight: "900",
                              textTransform: "uppercase",
                              letterSpacing: 1.5,
                            }}
                          >
                            Internal Remarks
                          </Text>
                          <Text
                            style={{
                              color: "#0f172a",
                              fontWeight: "700",
                              fontSize: 14,
                              marginTop: 2,
                            }}
                          >
                            {ticket.internal_remarks}
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>

                  <Text
                    style={{
                      color: "#0f172a",
                      fontWeight: "900",
                      fontSize: 14,
                      textTransform: "uppercase",
                      letterSpacing: 1.5,
                      marginBottom: 16,
                      marginLeft: 4,
                    }}
                  >
                    Status Transition
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 8,
                      marginBottom: 24,
                    }}
                  >
                    {["Inprogress", "Hold", "Waiting", "Resolved", "Cancelled"]
                      .filter((s) => {
                        // Workflow rules
                        if (s === "Resolved" && ticket.status !== "Inprogress")
                          return false;
                        if (s === ticket.status) return false;
                        return true;
                      })
                      .map((s) => (
                        <TouchableOpacity
                          key={s}
                          onPress={() => {
                            setUpdateStatus(s);
                            // Clear remarks if switching to status that needs them, to force new input
                            if (
                              [
                                "Hold",
                                "Cancelled",
                                "Waiting",
                                "Resolved",
                              ].includes(s)
                            ) {
                              setUpdateRemarks("");
                            }
                          }}
                          style={{
                            paddingHorizontal: 20,
                            paddingVertical: 12,
                            borderRadius: 16,
                            borderWidth: 1,
                            backgroundColor:
                              updateStatus === s ? "#dc2626" : "#ffffff",
                            borderColor:
                              updateStatus === s ? "#dc2626" : "#e2e8f0",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: "700",
                              color: updateStatus === s ? "#ffffff" : "#475569",
                            }}
                          >
                            {s}
                          </Text>
                        </TouchableOpacity>
                      ))}
                  </View>

                  {updateStatus === "Inprogress" && (
                    <View style={{ marginBottom: 32 }}>
                      <SearchableSelect
                        label="Select Area"
                        placeholder="Choose an area..."
                        value={updateArea}
                        options={areaOptions}
                        onChange={setUpdateArea}
                        loading={areasLoading}
                        searchPlaceholder="Search areas..."
                        emptyMessage="No areas found"
                      />

                      <SearchableSelect
                        label="Select Category"
                        placeholder="Choose a category..."
                        value={updateCategory}
                        options={categoryOptions}
                        onChange={setUpdateCategory}
                        searchPlaceholder="Search categories..."
                        emptyMessage="No categories found"
                      />
                    </View>
                  )}

                  {["Hold", "Cancelled", "Waiting", "Resolved"].includes(
                    updateStatus,
                  ) && (
                    <View style={{ marginBottom: 24 }}>
                      <Text
                        className="text-slate-400 dark:text-slate-500"
                        style={{
                          fontSize: 10,
                          fontWeight: "900",
                          textTransform: "uppercase",
                          letterSpacing: 1.5,
                          marginBottom: 12,
                          marginLeft: 4,
                        }}
                      >
                        Mandatory Remarks
                      </Text>
                      <TextInput
                        style={{
                          backgroundColor: "#f8fafc",
                          borderWidth: 1,
                          borderColor: "#e2e8f0",
                          borderRadius: 24,
                          padding: 20,
                          height: 128,
                          fontWeight: "700",
                          textAlignVertical: "top",
                        }}
                        className="bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-50 border-slate-200 dark:border-slate-700"
                        placeholder={
                          updateStatus === "Resolved"
                            ? "Provide resolution details (mandatory)..."
                            : "Why is it on hold? What is the roadblock? (mandatory)"
                        }
                        multiline
                        value={updateRemarks}
                        onChangeText={setUpdateRemarks}
                      />
                    </View>
                  )}

                  {updateStatus === "Cancelled" ? (
                    <View style={{ position: "relative" }}>
                      <TouchableOpacity
                        onPressIn={handleHoldStart}
                        onPressOut={handleHoldEnd}
                        activeOpacity={0.9}
                        style={{
                          backgroundColor: "#f1f5f9",
                          borderRadius: 28,
                          paddingVertical: 20,
                          alignItems: "center",
                          overflow: "hidden",
                          borderWidth: 2,
                          borderColor: "#dc2626",
                        }}
                      >
                        <Animated.View
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 0,
                            bottom: 0,
                            backgroundColor: "#fee2e2",
                            width: progressWidth,
                          }}
                        />
                        <Text
                          style={{
                            color: "#dc2626",
                            fontWeight: "900",
                            textTransform: "uppercase",
                            letterSpacing: 1.5,
                            fontSize: 14,
                            zIndex: 1,
                          }}
                        >
                          {isHolding ? "HOLDING..." : "HOLD 3S TO CANCEL"}
                        </Text>
                      </TouchableOpacity>
                      {!isHolding && !updateRemarks.trim() && (
                        <Text
                          style={{
                            color: "#ef4444",
                            fontSize: 10,
                            textAlign: "center",
                            marginTop: 8,
                            fontWeight: "700",
                          }}
                        >
                          * REMARKS REQUIRED TO ENABLE HOLD
                        </Text>
                      )}
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={handleUpdateStatus}
                      disabled={isUpdating}
                      style={{
                        backgroundColor: "#dc2626",
                        borderRadius: 28,
                        paddingVertical: 20,
                        alignItems: "center",
                        shadowColor: "#dc2626",
                        shadowOffset: { width: 0, height: 10 },
                        shadowOpacity: 0.2,
                        shadowRadius: 20,
                        elevation: 8,
                      }}
                    >
                      {isUpdating ? (
                        <ActivityIndicator color="white" size="small" />
                      ) : (
                        <Text
                          style={{
                            color: "#ffffff",
                            fontWeight: "900",
                            textTransform: "uppercase",
                            letterSpacing: 1.5,
                            fontSize: 14,
                          }}
                        >
                          Update Information
                        </Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>
    );
  },
);

export default TicketDetailModal;
