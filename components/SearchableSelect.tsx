import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  ActivityIndicator,
  Keyboard,
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
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const query = searchQuery.toLowerCase();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(query) ||
        opt.description?.toLowerCase().includes(query)
    );
  }, [options, searchQuery]);

  const handleSelect = useCallback(
    (selectedValue: string) => {
      onChange(selectedValue);
      setIsOpen(false);
      setSearchQuery("");
      Keyboard.dismiss();
    },
    [onChange]
  );

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSearchQuery("");
    Keyboard.dismiss();
  }, []);

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
        <Text className="text-slate-700 font-semibold text-sm mb-2">
          {label}
        </Text>
        <TouchableOpacity
          onPress={() => !disabled && setIsOpen(true)}
          disabled={disabled || loading}
          className={`flex-row items-center bg-white border border-slate-200 rounded-xl px-4 py-3 ${
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
                  selectedOption ? "text-slate-900" : "text-slate-400"
                }`}
              >
                {selectedOption?.label || placeholder}
              </Text>
              <ChevronDown size={18} color="#94a3b8" />
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Selection Modal */}
      <Modal
        visible={isOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={handleClose}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-3xl" style={{ maxHeight: "80%" }}>
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

            {/* Search */}
            <View className="px-5 py-3">
              <View className="flex-row items-center bg-slate-100 rounded-xl px-4 py-2">
                <Search size={18} color="#94a3b8" />
                <TextInput
                  className="flex-1 ml-3 text-slate-900"
                  placeholder={searchPlaceholder}
                  placeholderTextColor="#94a3b8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoFocus={true}
                  autoCorrect={false}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery("")}>
                    <X size={16} color="#94a3b8" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Options List */}
            {filteredOptions.length === 0 ? (
              <View className="py-12 items-center">
                <Text className="text-slate-400 text-sm">{emptyMessage}</Text>
              </View>
            ) : (
              <FlatList
                data={filteredOptions}
                renderItem={renderOption}
                keyExtractor={(item) => item.value}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                initialNumToRender={20}
                maxToRenderPerBatch={20}
                windowSize={5}
                contentContainerStyle={{ paddingBottom: 40 }}
              />
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}
