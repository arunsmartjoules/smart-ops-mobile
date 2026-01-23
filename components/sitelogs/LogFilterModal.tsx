import React from "react";
import { View, Text, TouchableOpacity, Modal, ScrollView } from "react-native";
import { X, Calendar, Check } from "lucide-react-native";
import { format } from "date-fns";

interface LogFilterModalProps {
  visible: boolean;
  onClose: () => void;
  fromDate: Date | null;
  setFromDate: (date: Date | null) => void;
  toDate: Date | null;
  setToDate: (date: Date | null) => void;
  onApply: () => void;
  availableSites: any[];
  selectedSiteId: string | null;
  onSiteSelect: (siteId: string) => void;
}

const LogFilterModal = ({
  visible,
  onClose,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  onApply,
  availableSites,
  selectedSiteId,
  onSiteSelect,
}: LogFilterModalProps) => {
  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View className="flex-1 bg-black/60 justify-end">
        <View className="bg-white dark:bg-slate-900 rounded-t-3xl p-6 max-h-[85%] border-t border-slate-100 dark:border-slate-800">
          <View className="flex-row items-center justify-between mb-6">
            <Text className="text-slate-900 dark:text-slate-50 text-xl font-bold">
              Filter Logs
            </Text>
            <TouchableOpacity
              onPress={onClose}
              className="w-10 h-10 bg-slate-50 dark:bg-slate-800 rounded-full items-center justify-center"
            >
              <X size={20} color="#94a3b8" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View className="gap-6">
              {/* Presets */}
              <View>
                <Text className="text-slate-400 dark:text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-3 ml-1">
                  Quick Presets
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {[
                    { label: "Today", days: 0 },
                    { label: "Last 7 Days", days: 7 },
                    { label: "Last 30 Days", days: 30 },
                  ].map((preset) => (
                    <TouchableOpacity
                      key={preset.label}
                      onPress={() => {
                        const from = new Date();
                        from.setDate(from.getDate() - preset.days);
                        from.setHours(0, 0, 0, 0);
                        setFromDate(from);
                        setToDate(new Date());
                      }}
                      className="px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800"
                      style={{
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.05,
                        shadowRadius: 2,
                        elevation: 1,
                      }}
                    >
                      <Text className="text-slate-600 dark:text-slate-400 text-xs font-bold">
                        {preset.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Site Selection */}
              <View>
                <Text className="text-slate-400 dark:text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-3 ml-1">
                  Select Site
                </Text>
                <View className="gap-2">
                  {availableSites.length > 0 ? (
                    availableSites.map((site) => (
                      <TouchableOpacity
                        key={site.id || site.site_code}
                        onPress={() => onSiteSelect(site.site_code)}
                        className={`p-4 rounded-xl border ${
                          selectedSiteId === site.site_code
                            ? "bg-red-50 border-red-100 dark:bg-red-900/10 dark:border-red-900/20"
                            : "bg-slate-50 border-slate-100 dark:bg-slate-800/50 dark:border-slate-800"
                        } flex-row items-center justify-between`}
                      >
                        <View className="flex-1">
                          <Text
                            className={`font-bold ${
                              selectedSiteId === site.site_code
                                ? "text-red-600"
                                : "text-slate-900 dark:text-slate-50"
                            }`}
                          >
                            {site.name}
                          </Text>
                          <Text className="text-slate-400 dark:text-slate-500 text-[10px] font-medium mt-0.5">
                            {site.city || "N/A"}, {site.state || "N/A"}
                          </Text>
                        </View>
                        {selectedSiteId === site.site_code && (
                          <View className="w-5 h-5 rounded-full bg-red-600 items-center justify-center">
                            <Check size={12} color="#fff" strokeWidth={3} />
                          </View>
                        )}
                      </TouchableOpacity>
                    ))
                  ) : (
                    <View className="p-8 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 items-center justify-center">
                      <Text className="text-slate-400 text-xs italic text-center">
                        No sites found.
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Date Range Display */}
              <View>
                <Text className="text-slate-400 dark:text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-3 ml-1">
                  Date Range
                </Text>
                <View className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-800 flex-row items-center">
                  <Calendar size={18} color="#dc2626" />
                  <Text className="text-slate-700 dark:text-slate-300 font-bold ml-3 text-sm">
                    {fromDate ? format(fromDate, "dd MMM yyyy") : "Start Date"}{" "}
                    - {toDate ? format(toDate, "dd MMM yyyy") : "End Date"}
                  </Text>
                </View>
              </View>
            </View>

            {/* Action Buttons */}
            <View className="flex-row gap-3 mt-10 mb-6">
              <TouchableOpacity
                onPress={() => {
                  setFromDate(null);
                  setToDate(null);
                }}
                className="flex-1 bg-slate-100 dark:bg-slate-800 py-4 rounded-xl items-center"
              >
                <Text className="text-slate-500 dark:text-slate-400 font-bold text-sm">
                  Reset
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onApply}
                className="flex-[2] bg-red-600 py-4 rounded-xl items-center shadow-md shadow-red-600/20"
                style={{
                  shadowColor: "#dc2626",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.2,
                  shadowRadius: 8,
                  elevation: 4,
                }}
              >
                <Text className="text-white font-bold text-sm">
                  Apply Filters
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

export default LogFilterModal;
