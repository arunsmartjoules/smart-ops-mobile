import React from "react";
import { View, Text, TouchableOpacity, TextInput, Modal } from "react-native";
import { X, Search as SearchIcon, Calendar } from "lucide-react-native";
import { format } from "date-fns";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { type Site } from "@/services/AttendanceService";
import SearchableSelect, { type SelectOption } from "./SearchableSelect";

interface AdvancedFilterModalProps {
  visible: boolean;
  onClose: () => void;
  tempSearch: string;
  setTempSearch: (s: string) => void;
  tempFromDate: string | null;
  setTempFromDate: (s: string | null) => void;
  tempToDate: string | null;
  setTempToDate: (s: string | null) => void;
  sites: Site[];
  selectedSiteCode: string;
  setSelectedSiteCode: (s: string) => void;
  user: any;
  statusFilter: string;
  setStatusFilter: (s: string) => void;
  applyAdvancedFilters: () => void;
}

const AdvancedFilterModal = React.memo(
  ({
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
    applyAdvancedFilters,
  }: AdvancedFilterModalProps) => {
    const siteOptions = React.useMemo(
      () =>
        sites.map((s) => ({
          value: s.site_code || "",
          label: s.name || s.site_code || "",
        })),
      [sites],
    );

    if (!visible) return null;

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
                <View
                  style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}
                >
                  {[
                    {
                      label: "Today",
                      value: format(new Date(), "yyyy-MM-dd"),
                    },
                    {
                      label: "7 Days",
                      value: format(
                        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                        "yyyy-MM-dd",
                      ),
                    },
                    {
                      label: "30 Days",
                      value: format(
                        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                        "yyyy-MM-dd",
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
                            tempFromDate === preset.value
                              ? "#dc2626"
                              : "#64748b",
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
  },
);

export default AdvancedFilterModal;
