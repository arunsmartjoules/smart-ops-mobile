import React from "react";
import { TouchableOpacity, View } from "react-native";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react-native";
import { SortDirection } from "../utils/sorting";

interface SortIconProps {
  direction: SortDirection;
  onPress: () => void;
  size?: number;
  activeColor?: string;
  inactiveColor?: string;
}

export const SortIcon: React.FC<SortIconProps> = ({
  direction,
  onPress,
  size = 18,
  activeColor = "#ef4444", // red-500
  inactiveColor = "#94a3b8", // slate-400
}) => {
  const getIcon = () => {
    switch (direction) {
      case "asc":
        return <ArrowUp size={size} color={activeColor} />;
      case "desc":
        return <ArrowDown size={size} color={activeColor} />;
      default:
        return <ArrowUpDown size={size} color={inactiveColor} />;
    }
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className={`w-9 h-9 rounded-lg items-center justify-center ${direction ? "bg-red-50 dark:bg-red-900/20" : "bg-slate-50 dark:bg-slate-800"}`}
    >
      {getIcon()}
    </TouchableOpacity>
  );
};
