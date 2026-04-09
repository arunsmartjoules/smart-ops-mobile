import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { Search, X, Check, ChevronDown } from "lucide-react-native";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

interface SearchableSelectProps {
  label: string;
  placeholder?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  loading?: boolean;
  disabled?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  hideLabel?: boolean;
  compact?: boolean;
  hideSearch?: boolean;
  modalPosition?: "bottom" | "center";
  searchValue?: string;
  onSearchChange?: (query: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  remoteSearch?: boolean;
}

export default function SearchableSelect({
  label,
  placeholder = "Select an option",
  value,
  options,
  onChange,
  loading = false,
  disabled = false,
  searchPlaceholder = "Search...",
  emptyMessage = "No options found",
  hideLabel = false,
  compact = false,
  hideSearch = false,
  modalPosition = "bottom",
  searchValue,
  onSearchChange,
  onLoadMore,
  hasMore = false,
  loadingMore = false,
  remoteSearch = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [internalSearchQuery, setInternalSearchQuery] = useState("");
  const searchQuery = searchValue ?? internalSearchQuery;

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    if (remoteSearch || !searchQuery.trim()) return options;
    const query = searchQuery.toLowerCase();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(query) ||
        opt.description?.toLowerCase().includes(query)
    );
  }, [options, searchQuery, remoteSearch]);

  const handleSelect = useCallback(
    (selectedValue: string) => {
      onChange(selectedValue);
      setIsOpen(false);
      if (onSearchChange) {
        onSearchChange("");
      } else {
        setInternalSearchQuery("");
      }
    },
    [onChange, onSearchChange]
  );

  const handleClose = useCallback(() => {
    setIsOpen(false);
    if (onSearchChange) {
      onSearchChange("");
    } else {
      setInternalSearchQuery("");
    }
  }, [onSearchChange]);

  const handleSearchChange = useCallback(
    (query: string) => {
      if (onSearchChange) {
        onSearchChange(query);
      } else {
        setInternalSearchQuery(query);
      }
    },
    [onSearchChange]
  );

  const handleLoadMore = useCallback(() => {
    if (!onLoadMore || !hasMore || loadingMore) return;
    onLoadMore();
  }, [onLoadMore, hasMore, loadingMore]);

  const renderOption = useCallback(
    ({ item }: { item: SelectOption }) => {
      const isSelected = item.value === value;
      return (
        <TouchableOpacity
          onPress={() => handleSelect(item.value)}
          className={`flex-row items-center px-4 py-3 border-b border-slate-100 ${
            isSelected ? "bg-red-50" : ""
          }`}
          activeOpacity={0.7}
        >
          <View className="flex-1">
            <Text
              className={`font-medium ${
                isSelected ? "text-red-600" : "text-slate-900"
              }`}
            >
              {item.label}
            </Text>
            {item.description && (
              <Text className="text-slate-400 text-xs mt-0.5">
                {item.description}
              </Text>
            )}
          </View>
          {isSelected && <Check size={18} color="#dc2626" />}
        </TouchableOpacity>
      );
    },
    [value, handleSelect]
  );

  return (
    <>
      {/* Trigger Button */}
      <View className="mb-4">
        {!hideLabel && (
          <Text className="text-slate-700 font-semibold text-sm mb-2">
            {label}
          </Text>
        )}
        <TouchableOpacity
          onPress={() => {
            if (disabled) return;
            setIsOpen(true);
          }}
          disabled={disabled || loading}
          className={`flex-row items-center bg-white border border-slate-200 rounded-xl px-4 ${compact ? "py-2.5" : "py-3"} ${
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
                  selectedOption || value ? "text-slate-900" : "text-slate-400"
                }`}
              >
                {selectedOption?.label || value || placeholder}
              </Text>
              <ChevronDown size={18} color="#94a3b8" />
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Selection Modal */}
      <Modal
        visible={isOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={handleClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <View
            className={`flex-1 bg-black/50 ${modalPosition === "center" ? "justify-center px-6" : "justify-end"}`}
          >
            <View
              className={`bg-white ${modalPosition === "center" ? "rounded-3xl" : "rounded-t-3xl"}`}
              style={{
                maxHeight: modalPosition === "center" ? "60%" : "80%",
                minHeight: modalPosition === "bottom" ? 240 : undefined,
              }}
            >
              {/* Header */}
              <View className="flex-row items-center justify-between px-5 py-4 border-b border-slate-100">
                <Text className="text-slate-900 font-bold text-lg">{label}</Text>
                <TouchableOpacity
                  onPress={handleClose}
                  className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center"
                >
                  <X size={18} color="#64748b" />
                </TouchableOpacity>
              </View>

              {!hideSearch && (
                <View className="px-5 py-3">
                  <View className="flex-row items-center bg-slate-100 rounded-xl px-4 py-2">
                    <Search size={18} color="#94a3b8" />
                    <TextInput
                      className="flex-1 ml-3 text-slate-900"
                      placeholder={searchPlaceholder}
                      placeholderTextColor="#94a3b8"
                      value={searchQuery}
                      onChangeText={handleSearchChange}
                      autoFocus={true}
                      autoCorrect={false}
                    />
                    {searchQuery.length > 0 && (
                      <TouchableOpacity onPress={() => handleSearchChange("")}>
                        <X size={16} color="#94a3b8" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}

              {/* Options List */}
              {filteredOptions.length === 0 ? (
                <View className="py-12 items-center">
                  {loading ? (
                    <ActivityIndicator size="small" color="#94a3b8" />
                  ) : (
                    <Text className="text-slate-400 text-sm">{emptyMessage}</Text>
                  )}
                </View>
              ) : (
                <FlatList
                  data={filteredOptions}
                  keyExtractor={(item) => item.value}
                  renderItem={renderOption}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 40 }}
                  onEndReached={handleLoadMore}
                  onEndReachedThreshold={0.3}
                  ListFooterComponent={
                    loadingMore ? (
                      <View className="py-4 items-center">
                        <ActivityIndicator size="small" color="#94a3b8" />
                      </View>
                    ) : null
                  }
                />
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
