import React from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Check, ChevronRight, Search, X } from "lucide-react-native";
import { type SelectOption } from "./SearchableSelect";

interface FullscreenPickerProps {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  loading?: boolean;
  disabled?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  searchValue?: string;
  onSearchChange?: (query: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  remoteSearch?: boolean;
}

export default function FullscreenPicker({
  label,
  value,
  options,
  onChange,
  placeholder = "Select an option",
  loading = false,
  disabled = false,
  searchPlaceholder = "Search...",
  emptyMessage = "No options found",
  searchValue,
  onSearchChange,
  onLoadMore,
  hasMore = false,
  loadingMore = false,
  remoteSearch = false,
}: FullscreenPickerProps) {
  const [visible, setVisible] = React.useState(false);
  const [internalSearchQuery, setInternalSearchQuery] = React.useState("");
  const searchQuery = searchValue ?? internalSearchQuery;

  const selectedOption = React.useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value],
  );

  const filteredOptions = React.useMemo(() => {
    if (remoteSearch || !searchQuery.trim()) return options;
    const query = searchQuery.toLowerCase();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(query) ||
        opt.description?.toLowerCase().includes(query),
    );
  }, [options, remoteSearch, searchQuery]);

  const setSearch = React.useCallback(
    (query: string) => {
      if (onSearchChange) {
        onSearchChange(query);
      } else {
        setInternalSearchQuery(query);
      }
    },
    [onSearchChange],
  );

  const handleClose = React.useCallback(() => {
    setVisible(false);
    setSearch("");
  }, [setSearch]);

  const handleSelect = React.useCallback(
    (selectedValue: string) => {
      onChange(selectedValue);
      handleClose();
    },
    [handleClose, onChange],
  );

  const handleLoadMore = React.useCallback(() => {
    if (!onLoadMore || !hasMore || loadingMore) return;
    onLoadMore();
  }, [hasMore, loadingMore, onLoadMore]);

  return (
    <>
      <View className="mb-4">
        <Text className="text-slate-700 dark:text-slate-300 font-semibold text-sm mb-2">
          {label}
        </Text>
        <TouchableOpacity
          onPress={() => {
            if (disabled || loading) return;
            setVisible(true);
          }}
          disabled={disabled || loading}
          className={`flex-row items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 ${
            disabled ? "opacity-50" : ""
          }`}
          style={{
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.03,
            shadowRadius: 4,
            elevation: 1,
          }}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#94a3b8" />
          ) : (
            <>
              <Text
                className={`flex-1 ${
                  selectedOption || value
                    ? "text-slate-900 dark:text-slate-50"
                    : "text-slate-400"
                }`}
              >
                {selectedOption?.label || value || placeholder}
              </Text>
              <ChevronRight size={18} color="#94a3b8" />
            </>
          )}
        </TouchableOpacity>
      </View>

      <Modal
        visible={visible}
        transparent={false}
        animationType="slide"
        onRequestClose={handleClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
          className="bg-white dark:bg-slate-950"
        >
          <View className="px-5 pt-14 pb-4 border-b border-slate-200 dark:border-slate-800">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-slate-900 dark:text-slate-50 font-bold text-xl">
                {label}
              </Text>
              <TouchableOpacity
                onPress={handleClose}
                className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center"
              >
                <X size={18} color="#64748b" />
              </TouchableOpacity>
            </View>
            <View className="flex-row items-center bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-2">
              <Search size={18} color="#94a3b8" />
              <TextInput
                className="flex-1 ml-3 text-slate-900 dark:text-slate-50"
                placeholder={searchPlaceholder}
                placeholderTextColor="#94a3b8"
                value={searchQuery}
                onChangeText={setSearch}
                autoFocus
                autoCorrect={false}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearch("")}>
                  <X size={16} color="#94a3b8" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {filteredOptions.length === 0 ? (
            <View className="flex-1 items-center justify-center px-8">
              {loading ? (
                <ActivityIndicator size="small" color="#94a3b8" />
              ) : (
                <Text className="text-slate-400 text-sm text-center">
                  {emptyMessage}
                </Text>
              )}
            </View>
          ) : (
            <FlatList
              data={filteredOptions}
              keyExtractor={(item) => item.value}
              keyboardShouldPersistTaps="handled"
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.25}
              contentContainerStyle={{ paddingBottom: 30 }}
              renderItem={({ item }) => {
                const isSelected = item.value === value;
                return (
                  <TouchableOpacity
                    onPress={() => handleSelect(item.value)}
                    className={`px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex-row items-center ${
                      isSelected ? "bg-red-50 dark:bg-red-900/20" : ""
                    }`}
                  >
                    <View className="flex-1">
                      <Text
                        className={`font-semibold ${
                          isSelected
                            ? "text-red-600 dark:text-red-400"
                            : "text-slate-900 dark:text-slate-50"
                        }`}
                      >
                        {item.label}
                      </Text>
                      {item.description ? (
                        <Text className="text-slate-400 text-xs mt-0.5">
                          {item.description}
                        </Text>
                      ) : null}
                    </View>
                    {isSelected ? <Check size={18} color="#dc2626" /> : null}
                  </TouchableOpacity>
                );
              }}
              ListFooterComponent={
                loadingMore ? (
                  <View className="py-4 items-center">
                    <ActivityIndicator size="small" color="#94a3b8" />
                  </View>
                ) : null
              }
            />
          )}
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
