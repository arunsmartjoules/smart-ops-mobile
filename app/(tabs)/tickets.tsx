import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  Dimensions,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Ticket as TicketIcon,
  Filter,
  Search as SearchIcon,
  Calendar,
  X,
  MapPin,
  Clock,
  Briefcase,
  Layers,
  ChevronRight,
  TrendingUp,
  Layout as LayoutIcon,
  CheckCircle,
} from "lucide-react-native";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import TicketsService, { type Ticket } from "@/services/TicketsService";
import { AttendanceService, type Site } from "@/services/AttendanceService";
import { Pressable } from "react-native";
import SearchableSelect, {
  type SelectOption,
} from "@/components/SearchableSelect";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import {
  saveOfflineTicketUpdate,
  getPendingTicketUpdates,
} from "@/utils/offlineTicketStorage";
import {
  cacheTickets,
  getCachedTickets,
  cacheAreas,
  getCachedAreas,
} from "@/utils/offlineDataCache";

const { width } = Dimensions.get("window");

// Separate component for Ticket Item to stabilize the tree
const TicketItem = ({
  item,
  onPress,
}: {
  item: Ticket;
  onPress: (item: Ticket) => void;
}) => {
  return (
    <TouchableOpacity
      onPress={() => {
        onPress(item);
      }}
      activeOpacity={0.7}
      className="bg-white dark:bg-slate-900 rounded-2xl p-5 mb-4"
      style={{
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 3,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 12,
        }}
      >
        <View style={{ flex: 1, marginRight: 16 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 6,
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: "900",
                color: "#dc2626",
                textTransform: "uppercase",
                letterSpacing: 1.5,
              }}
            >
              {item.ticket_no}
            </Text>
            <View
              style={{
                marginHorizontal: 8,
                width: 4,
                height: 4,
                borderRadius: 2,
                backgroundColor: "#e2e8f0",
              }}
            />
            <Text
              style={{
                fontSize: 10,
                fontWeight: "900",
                color: "#94a3b8",
                textTransform: "uppercase",
                letterSpacing: 1.5,
              }}
            >
              {item.site_id}
            </Text>
          </View>
          <Text
            className="text-slate-900 dark:text-slate-50"
            style={{
              fontWeight: "700",
              fontSize: 18,
              lineHeight: 28,
            }}
            numberOfLines={2}
          >
            {item.title}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor:
                item.status === "Open"
                  ? "#fef2f2"
                  : item.status === "Inprogress"
                    ? "#eff6ff"
                    : "#f0fdf4",
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: "900",
                textTransform: "uppercase",
                color:
                  item.status === "Open"
                    ? "#dc2626"
                    : item.status === "Inprogress"
                      ? "#2563eb"
                      : "#16a34a",
              }}
            >
              {item.status}
            </Text>
          </View>
          <View style={{ marginLeft: 8 }}>
            <ChevronRight size={16} color="#94a3b8" />
          </View>
        </View>
      </View>

      <View
        className="border-t border-slate-100 dark:border-slate-800"
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          paddingTop: 16,
          marginTop: 8,
        }}
      >
        <View
          style={{ width: "50%", flexDirection: "row", alignItems: "center" }}
        >
          <MapPin size={12} color="#94a3b8" style={{ marginRight: 6 }} />
          <Text
            className="text-slate-600 dark:text-slate-400"
            style={{ fontSize: 11, fontWeight: "500" }}
            numberOfLines={1}
          >
            {item.area_asset || item.location || "N/A"}
          </Text>
        </View>
        <View
          style={{ width: "50%", flexDirection: "row", alignItems: "center" }}
        >
          <Clock size={12} color="#94a3b8" style={{ marginRight: 6 }} />
          <Text
            className="text-slate-600 dark:text-slate-400"
            style={{ fontSize: 11, fontWeight: "500" }}
          >
            {format(new Date(item.created_at), "dd MMM, yy")}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// Standalone Detail Modal to stabilize the tree and context
const TicketDetailModal = ({
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
}: {
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
}) => {
  if (!ticket) return null;

  console.log("[TicketDetailModal] Rendering ticket:", {
    id: ticket.ticket_id,
    no: ticket.ticket_no,
    title: ticket.title,
    site: ticket.site_name,
    status: ticket.status,
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

          {/* Title in Header Area for Guaranteed Visibility */}
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

                  {/* Site Code field */}
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

                  {/* Created Date & Time */}
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
                              "dd MMM yyyy, HH:mm"
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
                  {[
                    "Inprogress",
                    "Hold",
                    "Waiting",
                    "Resolved",
                    "Cancelled",
                  ].map((s) => (
                    <TouchableOpacity
                      key={s}
                      onPress={() => setUpdateStatus(s)}
                      style={{
                        paddingHorizontal: 20,
                        paddingVertical: 12,
                        borderRadius: 16,
                        borderWidth: 1,
                        backgroundColor:
                          updateStatus === s ? "#dc2626" : "#ffffff",
                        borderColor: updateStatus === s ? "#dc2626" : "#e2e8f0",
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

                {["Hold", "Cancelled", "Waiting"].includes(updateStatus) && (
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
                      placeholder="Why is it on hold? What is the roadblock?"
                      multiline
                      value={updateRemarks}
                      onChangeText={setUpdateRemarks}
                    />
                  </View>
                )}

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
              </View>
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// Standalone Filter Modal
const AdvancedFilterModal = ({
  visible,
  onClose,
  tempSearch,
  setTempSearch,
  tempFromDate,
  setTempFromDate,
  tempToDate,
  setTempToDate,
  sites,
  selectedSiteId,
  setSelectedSiteId,
  user,
  statusFilter,
  setStatusFilter,
  applyAdvancedFilters,
}: {
  visible: boolean;
  onClose: () => void;
  tempSearch: string;
  setTempSearch: (s: string) => void;
  tempFromDate: string | null;
  setTempFromDate: (s: string | null) => void;
  tempToDate: string | null;
  setTempToDate: (s: string | null) => void;
  sites: Site[];
  selectedSiteId: string;
  setSelectedSiteId: (s: string) => void;
  user: any;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  applyAdvancedFilters: () => void;
}) => {
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
            padding: 32,
            maxHeight: "80%",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 32,
            }}
          >
            <Text
              style={{
                color: "#0f172a",
                fontSize: 24,
                fontWeight: "900",
                letterSpacing: -0.5,
              }}
            >
              Filter Tickets
            </Text>
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

          <View style={{ gap: 24 }}>
            <View>
              <Text
                style={{
                  color: "#94a3b8",
                  fontSize: 10,
                  fontWeight: "900",
                  textTransform: "uppercase",
                  letterSpacing: 1.5,
                  marginBottom: 12,
                  marginLeft: 4,
                }}
              >
                Search Keywords
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "#f8fafc",
                  borderRadius: 16,
                  paddingHorizontal: 20,
                  paddingVertical: 16,
                  borderWidth: 1,
                  borderColor: "#f1f5f9",
                }}
              >
                <SearchIcon size={20} color="#94a3b8" />
                <TextInput
                  placeholder="Ticket #, Title, description..."
                  style={{
                    flex: 1,
                    marginLeft: 12,
                    color: "#0f172a",
                    fontWeight: "700",
                  }}
                  value={tempSearch}
                  onChangeText={setTempSearch}
                />
              </View>
            </View>

            <View>
              <Text
                style={{
                  color: "#94a3b8",
                  fontSize: 10,
                  fontWeight: "900",
                  textTransform: "uppercase",
                  letterSpacing: 1.5,
                  marginBottom: 12,
                  marginLeft: 4,
                }}
              >
                Date Range
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                {[
                  {
                    label: "Today",
                    value: format(new Date(), "yyyy-MM-dd"),
                  },
                  {
                    label: "7 Days",
                    value: format(
                      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                      "yyyy-MM-dd"
                    ),
                  },
                  {
                    label: "30 Days",
                    value: format(
                      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                      "yyyy-MM-dd"
                    ),
                  },
                ].map((preset) => (
                  <TouchableOpacity
                    key={preset.label}
                    onPress={() => {
                      setTempFromDate(preset.value);
                      setTempToDate(format(new Date(), "yyyy-MM-dd"));
                    }}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: 12,
                      borderWidth: 1,
                      backgroundColor:
                        tempFromDate === preset.value ? "#fef2f2" : "#f8fafc",
                      borderColor:
                        tempFromDate === preset.value ? "#fecaca" : "#f1f5f9",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "700",
                        color:
                          tempFromDate === preset.value ? "#dc2626" : "#64748b",
                      }}
                    >
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  onPress={() => {
                    setTempFromDate(null);
                    setTempToDate(null);
                  }}
                  style={{
                    paddingHorizontal: 16,
                    paddingVertical: 8,
                    borderRadius: 12,
                    borderWidth: 1,
                    backgroundColor: "#f8fafc",
                    borderColor: "#f1f5f9",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "700",
                      color: "#64748b",
                    }}
                  >
                    Clear
                  </Text>
                </TouchableOpacity>
              </View>

              {tempFromDate && (
                <View
                  style={{
                    backgroundColor: "#f8fafc",
                    borderRadius: 16,
                    padding: 16,
                    borderWidth: 1,
                    borderColor: "#f1f5f9",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <View
                      style={{ flexDirection: "row", alignItems: "center" }}
                    >
                      <Calendar size={16} color="#dc2626" />
                      <Text
                        style={{
                          color: "#475569",
                          fontSize: 12,
                          fontWeight: "700",
                          marginLeft: 8,
                        }}
                      >
                        {format(new Date(tempFromDate), "dd MMM")} -{" "}
                        {tempToDate
                          ? format(new Date(tempToDate), "dd MMM, yyyy")
                          : "Present"}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
            </View>

            {sites.length > 0 && (
              <View>
                <Text
                  style={{
                    color: "#94a3b8",
                    fontSize: 10,
                    fontWeight: "900",
                    textTransform: "uppercase",
                    letterSpacing: 1.5,
                    marginBottom: 12,
                    marginLeft: 4,
                  }}
                >
                  Change Site
                </Text>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                >
                  {sites.map((s) => (
                    <TouchableOpacity
                      key={s.site_id}
                      onPress={() => {
                        const siteCode = s.site_code || "";
                        setSelectedSiteId(siteCode);
                        if (user?.id) {
                          AsyncStorage.setItem(
                            `last_site_${user.id}`,
                            siteCode
                          );
                        }
                      }}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        borderRadius: 16,
                        borderWidth: 1,
                        backgroundColor:
                          selectedSiteId === s.site_code
                            ? "#fef2f2"
                            : "#ffffff",
                        borderColor:
                          selectedSiteId === s.site_code
                            ? "#fecaca"
                            : "#e2e8f0",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "700",
                          color:
                            selectedSiteId === s.site_code
                              ? "#dc2626"
                              : "#64748b",
                        }}
                      >
                        {s.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </View>

          <View style={{ flexDirection: "row", gap: 16, marginTop: 40 }}>
            <TouchableOpacity
              onPress={() => {
                setTempSearch("");
                setTempFromDate(null);
                setTempToDate(null);
                setStatusFilter("Open");
              }}
              style={{
                flex: 1,
                backgroundColor: "#f1f5f9",
                borderRadius: 24,
                paddingVertical: 16,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: "#64748b",
                  fontWeight: "900",
                  textTransform: "uppercase",
                  letterSpacing: 1.5,
                  fontSize: 12,
                }}
              >
                Reset
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={applyAdvancedFilters}
              style={{
                flex: 2,
                backgroundColor: "#dc2626",
                borderRadius: 24,
                paddingVertical: 16,
                alignItems: "center",
                shadowColor: "#dc2626",
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.2,
                shadowRadius: 16,
                elevation: 8,
              }}
            >
              <Text
                style={{
                  color: "#ffffff",
                  fontWeight: "900",
                  textTransform: "uppercase",
                  letterSpacing: 1.5,
                  fontSize: 12,
                }}
              >
                Apply Filters
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default function Tickets() {
  const { user, isLoading } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [assets, setAssets] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const PAGE_SIZE = 15;

  // Filters
  const [statusFilter, setStatusFilter] = useState("Open");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFiltersModal, setShowFiltersModal] = useState(false);
  const [tempSearch, setTempSearch] = useState("");
  const [fromDate, setFromDate] = useState<string | null>(null);
  const [toDate, setToDate] = useState<string | null>(null);
  const [tempFromDate, setTempFromDate] = useState<string | null>(null);
  const [tempToDate, setTempToDate] = useState<string | null>(null);

  // Detail Modal
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [isDetailVisible, setIsDetailVisible] = useState(false);
  const [updateStatus, setUpdateStatus] = useState("");
  const [updateRemarks, setUpdateRemarks] = useState("");
  const [updateArea, setUpdateArea] = useState("");
  const [updateCategory, setUpdateCategory] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  // Area and Category options for dropdowns
  const [areaOptions, setAreaOptions] = useState<SelectOption[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<SelectOption[]>([]);
  const [areasLoading, setAreasLoading] = useState(false);

  // Network status for offline support
  const { isConnected } = useNetworkStatus();

  // Track the last requested page to prevent duplicate requests
  const lastRequestedPageRef = React.useRef(0);

  useEffect(() => {
    console.log(
      "[Tickets] Modal Visible State:",
      isDetailVisible,
      "Selected Ticket:",
      selectedTicket?.ticket_id
    );
  }, [isDetailVisible, selectedTicket]);

  useEffect(() => {
    console.log("[Tickets] User state update:", user?.user_id || user?.id);

    // Safety timeout: ensure loading stops after 8 seconds no matter what
    const safetyTimer = setTimeout(() => {
      setLoading((prev) => {
        if (prev)
          console.log(
            "[Tickets] Safety timeout triggered - forcing loading to false"
          );
        return false;
      });
    }, 8000);

    const userId = user?.user_id || user?.id;
    if (userId) {
      loadSites(userId);
    } else if (!isLoading) {
      // Auth finished but no user?
      setLoading(false);
    }

    return () => clearTimeout(safetyTimer);
  }, [user?.user_id, user?.id, isLoading]);

  useEffect(() => {
    if (selectedSiteId) {
      console.log("[Tickets] Site ready, triggering fetch");
      resetAndFetch();
      fetchAssets();
      fetchStats();
      loadAreasAndCategories();
    }
  }, [selectedSiteId, statusFilter, searchQuery, fromDate, toDate]);

  // Load areas (from assets table) and categories for the dropdown
  const loadAreasAndCategories = useCallback(async () => {
    if (!selectedSiteId) return;

    setAreasLoading(true);
    try {
      // Try to get cached areas first
      const cachedAreas = await getCachedAreas(selectedSiteId);
      if (cachedAreas.length > 0) {
        setAreaOptions(
          cachedAreas.map((a: any) => ({
            value: a.asset_name || a.asset_id,
            label: a.asset_name,
            description:
              `${a.asset_type || ""} ${a.location ? `- ${a.location}` : ""}`.trim(),
          }))
        );
      }

      // If online, fetch fresh data from backend
      if (isConnected) {
        // Fetch assets for area dropdown (using asset_name)
        const assetsResult = await TicketsService.getAssets(selectedSiteId);
        if (assetsResult?.data && assetsResult.data.length > 0) {
          const areas = assetsResult.data.map((asset: any) => ({
            value: asset.asset_name || asset.asset_id,
            label: asset.asset_name,
            description:
              `${asset.asset_type || ""} ${asset.location ? `- ${asset.location}` : ""}`.trim(),
          }));
          setAreaOptions(areas);
          // Cache for offline use
          await cacheAreas(selectedSiteId, assetsResult.data);
        }

        // Fetch complaint categories from backend
        const categoriesResult = await TicketsService.getComplaintCategories();
        if (categoriesResult?.data && categoriesResult.data.length > 0) {
          const categories = categoriesResult.data.map((cat: any) => ({
            value: cat.category,
            label: cat.category,
            description: cat.description || "",
          }));
          setCategoryOptions(categories);
        }
      }
    } catch (error) {
      console.error("[Tickets] Error loading areas/categories:", error);
    } finally {
      setAreasLoading(false);
    }
  }, [selectedSiteId, isConnected]);

  const loadSites = async (userId: string) => {
    setLoading(true);
    try {
      // Load from cache first
      const cachedSites = await AsyncStorage.getItem(`sites_${userId}`);
      const lastSiteId = await AsyncStorage.getItem(`last_site_${userId}`);

      if (cachedSites) {
        const parsedSites = JSON.parse(cachedSites);
        setSites(parsedSites);
        if (lastSiteId) {
          setSelectedSiteId(lastSiteId);
        }
      }

      let userSites: Site[] = [];
      const isAdmin = user?.role === "admin" || user?.role === "Admin";

      if (isAdmin) {
        console.log("[Tickets] Admin user detected, fetching all sites");
        userSites = await AttendanceService.getAllSites();
      } else {
        console.log("[Tickets] Fetching sites for:", userId);
        userSites = await AttendanceService.getUserSites(userId);
      }

      console.log("[Tickets] Sites response:", userSites.length);

      let finalSites = [];

      if (isAdmin) {
        const allSitesOption: Site = {
          site_id: "all",
          site_code: "all",
          name: "All Sites",
        };
        finalSites = [allSitesOption, ...userSites];
        setSites(finalSites);
        const siteToSelect = lastSiteId || "all";
        setSelectedSiteId(siteToSelect);
      } else {
        finalSites = userSites;
        setSites(userSites);
        if (userSites.length > 0) {
          const siteToSelect = lastSiteId || userSites[0].site_code || "";
          setSelectedSiteId(siteToSelect);
        } else {
          setLoading(false);
        }
      }

      // Save to cache
      await AsyncStorage.setItem(`sites_${userId}`, JSON.stringify(finalSites));
    } catch (error) {
      console.error("[Tickets] loadSites error:", error);
      setLoading(false);
    }
  };

  const fetchStats = useCallback(async () => {
    if (!selectedSiteId) return;
    try {
      const res = await TicketsService.getStats(selectedSiteId);
      if (res.success) {
        setStats(res.data);
        await AsyncStorage.setItem(
          `stats_${selectedSiteId}`,
          JSON.stringify(res.data)
        );
      }
    } catch (e) {}
  }, [selectedSiteId]);

  const fetchAssets = useCallback(async () => {
    if (!selectedSiteId) return;
    try {
      const res = await TicketsService.getAssets(selectedSiteId);
      if (res.success) {
        setAssets(res.data);
        await AsyncStorage.setItem(
          `assets_${selectedSiteId}`,
          JSON.stringify(res.data)
        );
      }
    } catch (e) {}
  }, [selectedSiteId]);

  const fetchTickets = useCallback(
    async (p: number, reset = false) => {
      if (!selectedSiteId) {
        setLoading(false);
        return;
      }

      if (reset) {
        setLoading(true);
        // Load from cache first for reset
        const cacheKey = `tickets_${selectedSiteId}_${statusFilter}`;
        const cachedData = await AsyncStorage.getItem(cacheKey);
        if (cachedData) {
          setTickets(JSON.parse(cachedData));
        }
      } else {
        setIsFetchingMore(true);
      }

      try {
        const options: any = {
          page: p,
          limit: PAGE_SIZE,
          search: searchQuery,
          fromDate: fromDate,
          toDate: toDate,
        };
        if (statusFilter !== "All") {
          options.status = statusFilter;
        }
        const res = await TicketsService.getTickets(selectedSiteId, options);
        if (res.success) {
          const newTickets = res.data || [];
          if (reset) {
            setTickets(newTickets);
            // Save to cache
            const cacheKey = `tickets_${selectedSiteId}_${statusFilter}`;
            await AsyncStorage.setItem(cacheKey, JSON.stringify(newTickets));
          } else {
            setTickets((prev) => [...prev, ...newTickets]);
          }
          setHasMore(newTickets.length === PAGE_SIZE);
        } else {
          // API call failed, stop pagination
          console.error("[Tickets] API call failed, stopping pagination");
          setHasMore(false);
        }
      } catch (error) {
        console.error("[Tickets] fetchTickets error:", error);
        // On error, stop pagination to prevent infinite loops
        setHasMore(false);
      } finally {
        setLoading(false);
        setIsFetchingMore(false);
        setRefreshing(false);
      }
    },
    [selectedSiteId, statusFilter, searchQuery, fromDate, toDate]
  );

  const resetAndFetch = useCallback(() => {
    setPage(1);
    setTickets([]);
    setHasMore(true);
    lastRequestedPageRef.current = 0; // Reset ref when resetting pagination
    fetchTickets(1, true);
  }, [fetchTickets]);

  const handleLoadMore = useCallback(() => {
    // Only proceed if we're not already fetching and there's more data
    if (!hasMore || isFetchingMore || loading) {
      return;
    }

    const nextPage = page + 1;

    // Additional safeguard: check if we've already requested this page
    if (nextPage <= lastRequestedPageRef.current) {
      console.log("[Tickets] Skipping duplicate request for page:", nextPage);
      return;
    }

    console.log("[Tickets] handleLoadMore triggered - page:", nextPage);
    lastRequestedPageRef.current = nextPage;
    setPage(nextPage);
    fetchTickets(nextPage);
  }, [hasMore, isFetchingMore, loading, page, fetchTickets]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchStats();
    resetAndFetch();
  };

  const handleTicketPress = (ticket: Ticket) => {
    console.log(
      "[Tickets] Ticket pressed:",
      ticket.ticket_id,
      "Status:",
      ticket.status
    );
    if (ticket.status !== "Open") {
      // Don't show the update modal for non-open tickets as per user request
      return;
    }
    setSelectedTicket(ticket);
    setUpdateStatus(ticket.status);
    setUpdateRemarks(ticket.internal_remarks || "");
    setUpdateArea(ticket.area_asset || "");
    setUpdateCategory(ticket.category || "");
    setIsDetailVisible(true);
  };

  const handleUpdateStatus = async () => {
    if (!selectedTicket) return;

    const needsRemarks = ["Hold", "Cancelled", "Waiting"].includes(
      updateStatus
    );
    if (needsRemarks && !updateRemarks.trim()) {
      Alert.alert("Required", "Please provide remarks for this status update.");
      return;
    }

    const payload = {
      status: updateStatus,
      remarks: updateRemarks,
      area_asset: updateArea || selectedTicket.area_asset,
      category: updateCategory || selectedTicket.category,
    };

    setIsUpdating(true);
    try {
      if (isConnected) {
        // Online: Update directly
        const res = await TicketsService.updateTicket(
          selectedTicket.ticket_id,
          payload
        );
        if (res.success) {
          Alert.alert("Success", "Ticket updated successfully");
          setIsDetailVisible(false);
          fetchStats();
          resetAndFetch();
        } else {
          Alert.alert("Error", res.error || "Failed to update ticket");
        }
      } else {
        // Offline: Save to queue
        await saveOfflineTicketUpdate(
          selectedTicket.ticket_id,
          selectedTicket.ticket_no,
          "update_details",
          payload
        );
        Alert.alert(
          "Saved Offline",
          "Your update has been saved and will sync when you're back online.",
          [{ text: "OK" }]
        );
        setIsDetailVisible(false);

        // Update local ticket in list to reflect change
        setTickets((prev) =>
          prev.map((t) =>
            t.ticket_id === selectedTicket.ticket_id ? { ...t, ...payload } : t
          )
        );
      }
    } catch (error: any) {
      Alert.alert("Error", error.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const applyAdvancedFilters = () => {
    setSearchQuery(tempSearch);
    setFromDate(tempFromDate);
    setToDate(tempToDate);
    setShowFiltersModal(false);
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1">
        {/* Header - matching profile screen */}
        <View className="px-5 pt-2 pb-3 flex-row items-center">
          <Text className="text-slate-900 dark:text-slate-50 text-3xl font-black">
            Tickets
          </Text>
          <View className="flex-1" />
          <TouchableOpacity
            onPress={() => setShowFiltersModal(true)}
            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 items-center justify-center"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.05,
              shadowRadius: 8,
              elevation: 2,
            }}
          >
            <Filter size={20} color="#0f172a" />
            {(searchQuery || fromDate) && (
              <View className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-600 rounded-full" />
            )}
          </TouchableOpacity>
        </View>

        {/* Quick Stats - matching dashboard screen */}
        <View className="px-5 mb-3">
          <View className="flex-row gap-2">
            <TouchableOpacity
              className="flex-1 bg-white dark:bg-slate-900 rounded-xl p-3"
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 4,
                elevation: 2,
              }}
            >
              <View
                className="w-8 h-8 rounded-lg items-center justify-center mb-2"
                style={{ backgroundColor: "#ef444415" }}
              >
                <TicketIcon size={16} color="#ef4444" />
              </View>
              <Text className="text-xl font-bold text-slate-900 dark:text-slate-50">
                {stats?.byStatus?.Open || 0}
              </Text>
              <Text className="text-slate-400 dark:text-slate-500 text-xs">
                Open
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="flex-1 bg-white dark:bg-slate-900 rounded-xl p-3"
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 4,
                elevation: 2,
              }}
            >
              <View
                className="w-8 h-8 rounded-lg items-center justify-center mb-2"
                style={{ backgroundColor: "#3b82f615" }}
              >
                <TrendingUp size={16} color="#3b82f6" />
              </View>
              <Text className="text-xl font-bold text-slate-900 dark:text-slate-50">
                {stats?.byStatus?.Inprogress || 0}
              </Text>
              <Text className="text-slate-400 dark:text-slate-500 text-xs">
                In Progress
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="flex-1 bg-white dark:bg-slate-900 rounded-xl p-3"
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 4,
                elevation: 2,
              }}
            >
              <View
                className="w-8 h-8 rounded-lg items-center justify-center mb-2"
                style={{ backgroundColor: "#22c55e15" }}
              >
                <CheckCircle size={16} color="#22c55e" />
              </View>
              <Text className="text-xl font-bold text-slate-900 dark:text-slate-50">
                {stats?.byStatus?.Resolved || 0}
              </Text>
              <Text className="text-slate-400 dark:text-slate-500 text-xs">
                Resolved
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              className="flex-1 bg-white dark:bg-slate-900 rounded-xl p-3"
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 1 },
                shadowOpacity: 0.05,
                shadowRadius: 4,
                elevation: 2,
              }}
            >
              <View
                className="w-8 h-8 rounded-lg items-center justify-center mb-2"
                style={{ backgroundColor: "#64748b15" }}
              >
                <X size={16} color="#64748b" />
              </View>
              <Text className="text-xl font-bold text-slate-900 dark:text-slate-50">
                {stats?.byStatus?.Cancelled || 0}
              </Text>
              <Text className="text-slate-400 dark:text-slate-500 text-xs">
                Cancelled
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Status Filter Tabs */}
        <View className="px-5 mb-4">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {[
              "Open",
              "Inprogress",
              "Resolved",
              "Hold",
              "Waiting",
              "Cancelled",
              "All",
            ].map((item) => (
              <TouchableOpacity
                key={item}
                onPress={() => setStatusFilter(item)}
                className={`px-4 py-2 rounded-xl ${statusFilter === item ? "bg-red-600" : "bg-white border border-slate-200"}`}
                style={{
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.03,
                  shadowRadius: 4,
                  elevation: 1,
                }}
              >
                <Text
                  className={`text-xs font-semibold ${statusFilter === item ? "text-white" : "text-slate-500"}`}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Tickets List */}
        <View className="flex-1">
          <FlatList
            data={tickets}
            renderItem={({ item }) => (
              <TicketItem item={item} onPress={handleTicketPress} />
            )}
            keyExtractor={(item, index) => item.ticket_id || `ticket-${index}`}
            ListEmptyComponent={
              !loading ? (
                <View className="py-20 items-center justify-center">
                  <View className="w-20 h-20 bg-slate-100 rounded-full items-center justify-center mb-4">
                    <TicketIcon size={36} color="#cbd5e1" />
                  </View>
                  <Text className="text-slate-900 dark:text-slate-50 font-bold text-lg">
                    No tickets found
                  </Text>
                  <Text className="text-slate-400 dark:text-slate-500 text-sm mt-1 text-center px-10">
                    Try adjusting your filters or search keywords.
                  </Text>
                </View>
              ) : null
            }
            ListFooterComponent={
              isFetchingMore ? (
                <View className="py-6">
                  <ActivityIndicator color="#dc2626" />
                </View>
              ) : null
            }
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.1}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor="#dc2626"
              />
            }
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingBottom: 100,
            }}
          />
        </View>

        {loading && !refreshing && (
          <View className="absolute inset-0 bg-slate-50/80 items-center justify-center">
            <ActivityIndicator color="#dc2626" size="large" />
            <Text className="text-slate-400 dark:text-slate-500 mt-3 text-xs font-medium">
              Loading...
            </Text>
          </View>
        )}

        <AdvancedFilterModal
          visible={showFiltersModal}
          onClose={() => setShowFiltersModal(false)}
          tempSearch={tempSearch}
          setTempSearch={setTempSearch}
          tempFromDate={tempFromDate}
          setTempFromDate={setTempFromDate}
          tempToDate={tempToDate}
          setTempToDate={setTempToDate}
          sites={sites}
          selectedSiteId={selectedSiteId}
          setSelectedSiteId={setSelectedSiteId}
          user={user}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          applyAdvancedFilters={applyAdvancedFilters}
        />

        <TicketDetailModal
          visible={isDetailVisible}
          ticket={selectedTicket}
          onClose={() => setIsDetailVisible(false)}
          updateStatus={updateStatus}
          setUpdateStatus={setUpdateStatus}
          updateRemarks={updateRemarks}
          setUpdateRemarks={setUpdateRemarks}
          updateArea={updateArea}
          setUpdateArea={setUpdateArea}
          updateCategory={updateCategory}
          setUpdateCategory={setUpdateCategory}
          isUpdating={isUpdating}
          handleUpdateStatus={handleUpdateStatus}
          areaOptions={areaOptions}
          categoryOptions={categoryOptions}
          areasLoading={areasLoading}
        />
      </SafeAreaView>
    </View>
  );
}
