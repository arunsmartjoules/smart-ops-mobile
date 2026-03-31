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
import { useTheme } from "@/contexts/ThemeContext";
import { X, Search as SearchIcon, Calendar } from "lucide-react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  format,
  isValid,
  parseISO,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  startOfYear,
  subMonths,
} from "date-fns";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { type Site } from "@/services/AttendanceService";
import SearchableSelect, { type SelectOption } from "./SearchableSelect";

const parseLocal = (dateStr: string | null) => {
  if (!dateStr) return new Date();
  const d = parseISO(dateStr);
  return isNaN(d.getTime()) ? new Date() : d;
};

const safeFormat = (date: any, formatStr: string) => {
  if (!date) return "Pick a date";
  const d =
    date instanceof Date
      ? date
      : typeof date === "string"
        ? parseISO(date)
        : new Date(date);
  if (!isValid(d)) return "Invalid Date";
  return format(d, formatStr);
};

// Quick date range presets
const QUICK_RANGES = [
  { label: "Today", key: "today" },
  { label: "This Week", key: "this_week" },
  { label: "This Month", key: "this_month" },
  { label: "Last Month", key: "last_month" },
  { label: "Last 3 Months", key: "last_3_months" },
  { label: "Last 6 Months", key: "last_6_months" },
  { label: "This Year", key: "this_year" },
] as const;

const getQuickRangeDates = (
  key: string,
): { from: string; to: string } | null => {
  const today = new Date();
  const fmt = (d: Date) => format(d, "yyyy-MM-dd");

  switch (key) {
    case "today":
      return { from: fmt(today), to: fmt(today) };
    case "this_week":
      return { from: fmt(startOfWeek(today, { weekStartsOn: 1 })), to: fmt(endOfWeek(today, { weekStartsOn: 1 })) };
    case "this_month":
      return { from: fmt(startOfMonth(today)), to: fmt(today) };
    case "last_month": {
      const lastMonth = subMonths(today, 1);
      return {
        from: fmt(startOfMonth(lastMonth)),
        to: fmt(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
    }
    case "last_3_months":
      return { from: fmt(subMonths(today, 3)), to: fmt(today) };
    case "last_6_months":
      return { from: fmt(subMonths(today, 6)), to: fmt(today) };
    case "this_year":
      return { from: fmt(startOfYear(today)), to: fmt(today) };
    default:
      return null;
  }
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
  /** 'single-date' for PM, 'date-range' for Tickets/Logs */
  dateMode?: "single-date" | "date-range";
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
  dateMode = "date-range",
}: AdvancedFilterModalProps) => {
  const { isDark } = useTheme();

  const [showStartPicker, setShowStartPicker] = React.useState(false);
  const [showEndPicker, setShowEndPicker] = React.useState(false);
  const [selectedQuickRange, setSelectedQuickRange] = React.useState<
    string | null
  >(null);
  
  // Infer selected range from dates
  React.useEffect(() => {
    if (tempFromDate && tempToDate) {
      for (const range of QUICK_RANGES) {
        const dates = getQuickRangeDates(range.key);
        if (dates && dates.from === tempFromDate && dates.to === tempToDate) {
          setSelectedQuickRange(range.key);
          return;
        }
      }
    }
    setSelectedQuickRange(null);
  }, [tempFromDate, tempToDate]);

  // --- Colors based on theme ---
  const bg = isDark ? "#0f172a" : "#ffffff";
  const cardBg = isDark ? "#1e293b" : "#f8fafc";
  const borderColor = isDark ? "#334155" : "#f1f5f9";
  const textPrimary = isDark ? "#f1f5f9" : "#0f172a";
  const textSecondary = isDark ? "#94a3b8" : "#94a3b8";
  const textMuted = isDark ? "#64748b" : "#475569";
  const pillBg = isDark ? "#1e293b" : "#f8fafc";
  const pillActiveBg = isDark ? "#7f1d1d" : "#fef2f2";
  const pillActiveBorder = isDark ? "#dc2626" : "#fecaca";

  const onStartChange = (event: any, selectedDate?: Date) => {
    setShowStartPicker(Platform.OS === "ios");
    if (selectedDate) {
      setTempFromDate(format(selectedDate, "yyyy-MM-dd"));
      setSelectedQuickRange(null);
    }
  };

  const onEndChange = (event: any, selectedDate?: Date) => {
    setShowEndPicker(Platform.OS === "ios");
    if (selectedDate) {
      setTempToDate?.(format(selectedDate, "yyyy-MM-dd"));
      setSelectedQuickRange(null);
    }
  };

  const handleQuickRange = (key: string) => {
    const dates = getQuickRangeDates(key);
    if (dates) {
      setTempFromDate(dates.from);
      setTempToDate?.(dates.to);
      setSelectedQuickRange(key);
    }
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
            backgroundColor: bg,
            borderTopLeftRadius: 40,
            borderTopRightRadius: 40,
            padding: 32,
            maxHeight: "85%",
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 24,
            }}
          >
            <Text
              style={{
                color: textPrimary,
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
                backgroundColor: cardBg,
                borderRadius: 20,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={20} color={textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={{ gap: 24 }}>
              {/* Search */}
              <View>
                <Text
                  style={{
                    color: textSecondary,
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
                    backgroundColor: cardBg,
                    borderRadius: 16,
                    paddingHorizontal: 20,
                    paddingVertical: 16,
                    borderWidth: 1,
                    borderColor,
                  }}
                >
                  <SearchIcon size={20} color={textSecondary} />
                  <TextInput
                    placeholder="Ticket #, Title, description..."
                    placeholderTextColor={textSecondary}
                    style={{
                      flex: 1,
                      marginLeft: 12,
                      color: textPrimary,
                      fontWeight: "700",
                    }}
                    value={tempSearch}
                    onChangeText={setTempSearch}
                  />
                </View>
              </View>

              {/* Date Section */}
              <View>
                <Text
                  style={{
                    color: textSecondary,
                    fontSize: 10,
                    fontWeight: "900",
                    textTransform: "uppercase",
                    letterSpacing: 1.5,
                    marginBottom: 12,
                    marginLeft: 4,
                  }}
                >
                  {dateMode === "date-range" ? "Date Range" : "Select Date"}
                </Text>

                {/* Quick Range Presets (date-range mode only) */}
                {dateMode === "date-range" && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginBottom: 12 }}
                    contentContainerStyle={{ gap: 8 }}
                  >
                    {QUICK_RANGES.map((r) => (
                      <TouchableOpacity
                        key={r.key}
                        onPress={() => handleQuickRange(r.key)}
                        style={{
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          borderRadius: 10,
                          borderWidth: 1,
                          backgroundColor:
                            selectedQuickRange === r.key
                              ? pillActiveBg
                              : pillBg,
                          borderColor:
                            selectedQuickRange === r.key
                              ? pillActiveBorder
                              : borderColor,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: "700",
                            color:
                              selectedQuickRange === r.key
                                ? "#dc2626"
                                : textMuted,
                          }}
                        >
                          {r.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}

                {/* From Date */}
                <TouchableOpacity
                  onPress={() => setShowStartPicker(true)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: cardBg,
                    borderRadius: 16,
                    paddingHorizontal: 20,
                    paddingVertical: 16,
                    borderWidth: 1,
                    borderColor,
                    justifyContent: "space-between",
                  }}
                >
                  <View
                    style={{ flexDirection: "row", alignItems: "center" }}
                  >
                    <Calendar size={20} color="#dc2626" />
                    <Text
                      style={{
                        marginLeft: 12,
                        color: tempFromDate ? textPrimary : textSecondary,
                        fontWeight: "700",
                        fontSize: 15,
                      }}
                    >
                      {tempFromDate
                        ? safeFormat(
                            parseLocal(tempFromDate),
                            dateMode === "date-range"
                              ? "dd MMM yyyy"
                              : "eeee, dd MMMM yyyy",
                          )
                        : "Pick a date"}
                    </Text>
                  </View>
                  <Text
                    style={{
                      color: "#3b82f6",
                      fontSize: 12,
                      fontWeight: "700",
                    }}
                  >
                    {dateMode === "date-range" ? "From" : "Change"}
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

                {/* To Date (date-range mode only) */}
                {dateMode === "date-range" && setTempToDate && (
                  <>
                    <TouchableOpacity
                      onPress={() => setShowEndPicker(true)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: cardBg,
                        borderRadius: 16,
                        paddingHorizontal: 20,
                        paddingVertical: 16,
                        borderWidth: 1,
                        borderColor,
                        justifyContent: "space-between",
                        marginTop: 8,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                        }}
                      >
                        <Calendar size={20} color="#f97316" />
                        <Text
                          style={{
                            marginLeft: 12,
                            color: tempToDate ? textPrimary : textSecondary,
                            fontWeight: "700",
                            fontSize: 15,
                          }}
                        >
                          {tempToDate
                            ? safeFormat(
                                parseLocal(tempToDate),
                                "dd MMM yyyy",
                              )
                            : "Pick end date"}
                        </Text>
                      </View>
                      <Text
                        style={{
                          color: "#f97316",
                          fontSize: 12,
                          fontWeight: "700",
                        }}
                      >
                        To
                      </Text>
                    </TouchableOpacity>

                    {showEndPicker && (
                      <DateTimePicker
                        value={parseLocal(tempToDate || null)}
                        mode="date"
                        display={Platform.OS === "ios" ? "spinner" : "default"}
                        onChange={onEndChange}
                      />
                    )}
                  </>
                )}
              </View>

              {/* Site Selection */}
              <View>
                <Text
                  style={{
                    color: textSecondary,
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

              {/* Status Filter */}
              {setStatusFilter && (
                <View>
                  <Text
                    style={{
                      color: textSecondary,
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
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    {(
                      statusOptions || [
                        "All",
                        "Pending",
                        "In-progress",
                        "Completed",
                      ]
                    ).map((s) => (
                      <TouchableOpacity
                        key={s}
                        onPress={() => setStatusFilter?.(s)}
                        style={{
                          paddingHorizontal: 16,
                          paddingVertical: 10,
                          borderRadius: 14,
                          borderWidth: 1,
                          backgroundColor:
                            statusFilter === s ? pillActiveBg : pillBg,
                          borderColor:
                            statusFilter === s ? pillActiveBorder : borderColor,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color:
                              statusFilter === s ? "#dc2626" : textMuted,
                          }}
                        >
                          {s}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Priority Filter */}
              {setPriorityFilter && (
                <View>
                  <Text
                    style={{
                      color: textSecondary,
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
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
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
                            priorityFilter === p ? pillActiveBg : pillBg,
                          borderColor:
                            priorityFilter === p
                              ? pillActiveBorder
                              : borderColor,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color:
                              priorityFilter === p ? "#dc2626" : textMuted,
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
          </ScrollView>

          {/* Action Buttons */}
          <View style={{ flexDirection: "row", gap: 16, marginTop: 24 }}>
            <TouchableOpacity
              onPress={() => {
                setTempSearch("");
                setTempFromDate(format(new Date(), "yyyy-MM-dd"));
                setTempToDate?.(format(new Date(), "yyyy-MM-dd"));
                setStatusFilter?.("Open");
                setPriorityFilter?.("All");
                setSelectedQuickRange(null);
              }}
              style={{
                flex: 1,
                backgroundColor: cardBg,
                borderRadius: 24,
                paddingVertical: 16,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  color: textMuted,
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
