import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  TextInput,
  Platform,
} from "react-native";
import { X, Search as SearchIcon, Calendar } from "lucide-react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { format } from "date-fns";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { type Site } from "@/services/AttendanceService";
import SearchableSelect, { type SelectOption } from "./SearchableSelect";

const parseLocal = (dateStr: string | null) => {
  if (!dateStr) return new Date();
  const d = new Date(dateStr.replace(/-/g, "/"));
  return isNaN(d.getTime()) ? new Date() : d;
};

const safeFormat = (date: any, formatStr: string) => {
  if (!date) return "Pick a date";
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return "Invalid Date";
  return format(d, formatStr);
};

interface AdvancedFilterModalProps {
  visible: boolean;
  onClose: () => void;
  tempSearch: string;
  setTempSearch: (s: string) => void;
  tempFromDate: string | null;
  setTempFromDate: (s: string | null) => void;
  tempToDate?: string | null;
  setTempToDate?: (s: string | null) => void;
  sites: Site[];
  selectedSiteCode: string;
  setSelectedSiteCode: (s: string) => void;
  user: any;
  statusFilter?: string;
  setStatusFilter?: (status: string) => void;
  statusOptions?: string[];
  priorityFilter?: string;
  setPriorityFilter?: (priority: string) => void;
  title?: string;
  applyAdvancedFilters: () => void;
}

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
  selectedSiteCode,
  setSelectedSiteCode,
  user,
  statusFilter,
  setStatusFilter,
  statusOptions,
  priorityFilter,
  setPriorityFilter,
  title = "Filter Tickets",
  applyAdvancedFilters,
}: AdvancedFilterModalProps) => {
  const [showStartPicker, setShowStartPicker] = React.useState(false);

  const onStartChange = (event: any, selectedDate?: Date) => {
    setShowStartPicker(Platform.OS === "ios");
    if (selectedDate) setTempFromDate(format(selectedDate, "yyyy-MM-dd"));
  };
  const siteOptions = React.useMemo(
    () =>
      sites.map((s) => ({
        value: s.site_code || "",
        label: s.site_code === "all" ? s.name : `${s.site_code} - ${s.name}`,
      })),
    [sites],
  );

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      statusBarTranslucent={true}
    >
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
              {title}
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
                {setTempToDate ? "Date Range" : "Select Date"}
              </Text>

              <TouchableOpacity
                onPress={() => setShowStartPicker(true)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "#f8fafc",
                  borderRadius: 16,
                  paddingHorizontal: 20,
                  paddingVertical: 16,
                  borderWidth: 1,
                  borderColor: "#f1f5f9",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Calendar size={20} color="#dc2626" />
                  <Text
                    style={{
                      marginLeft: 12,
                      color: tempFromDate ? "#0f172a" : "#94a3b8",
                      fontWeight: "700",
                      fontSize: 15,
                    }}
                  >
                    {tempFromDate
                      ? safeFormat(
                          parseLocal(tempFromDate),
                          "eeee, dd MMMM yyyy",
                        )
                      : "Pick a date"}
                  </Text>
                </View>
                <Text
                  style={{ color: "#3b82f6", fontSize: 12, fontWeight: "700" }}
                >
                  Change
                </Text>
              </TouchableOpacity>

              {showStartPicker && (
                <DateTimePicker
                  value={parseLocal(tempFromDate)}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={onStartChange}
                />
              )}
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
                Change Site
              </Text>
              <SearchableSelect
                label=""
                placeholder="Select a site"
                options={siteOptions}
                value={selectedSiteCode}
                onChange={(siteCode) => {
                  setSelectedSiteCode(siteCode);
                  if (user?.user_id || user?.id) {
                    AsyncStorage.setItem(
                      `last_site_${user.user_id || user.id}`,
                      siteCode,
                    );
                  }
                }}
              />
            </View>

            {setStatusFilter && (
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
                  Status
                </Text>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                >
                  {(statusOptions || ["All", "Pending", "In-progress", "Completed"]).map((s) => (
                    <TouchableOpacity
                      key={s}
                      onPress={() => setStatusFilter?.(s)}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderRadius: 14,
                        borderWidth: 1,
                        backgroundColor:
                          statusFilter === s ? "#fef2f2" : "#f8fafc",
                        borderColor: statusFilter === s ? "#fecaca" : "#f1f5f9",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "700",
                          color: statusFilter === s ? "#dc2626" : "#475569",
                        }}
                      >
                        {s}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {setPriorityFilter && (
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
                  Priority
                </Text>
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
                >
                  {["All", "Medium", "High", "Very High"].map((p) => (
                    <TouchableOpacity
                      key={p}
                      onPress={() => setPriorityFilter?.(p)}
                      style={{
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderRadius: 14,
                        borderWidth: 1,
                        backgroundColor:
                          priorityFilter === p ? "#fef2f2" : "#f8fafc",
                        borderColor:
                          priorityFilter === p ? "#fecaca" : "#f1f5f9",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: "700",
                          color: priorityFilter === p ? "#dc2626" : "#475569",
                        }}
                      >
                        {p}
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
                setTempFromDate(format(new Date(), "yyyy-MM-dd"));
                setStatusFilter?.("Open");
                setPriorityFilter?.("All");
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

export default AdvancedFilterModal;
